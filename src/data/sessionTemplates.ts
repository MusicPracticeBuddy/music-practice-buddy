import { createServerFn } from '@tanstack/solid-start'
import type { PoolClient } from 'pg'
import { pool } from './db'

export type TemplateItemInput = {
  clientId: string
  parentClientId: string | null
  type: 'SECTION' | 'EXERCISE' | 'REPERTOIRE'
  sourceId: string | null
  name: string
  notes: string
  position: number
}

export type TemplateLibraryItem = {
  id: string
  type: 'EXERCISE' | 'REPERTOIRE'
  name: string
  detail: string
}

export type SessionTemplateSummary = {
  id: string
  name: string
  itemCount: number
  updatedAt: string
}

export type SessionTemplateDetail = {
  id: string
  name: string
  items: TemplateItemInput[]
}

export type PlannedSessionEdit = {
  id: string
  name: string
  assignedDate: string | null
  items: TemplateItemInput[]
}

type SaveTemplateInput = {
  name: string
  items: TemplateItemInput[]
}

type UpdateTemplateInput = SaveTemplateInput & { id: string }

type CreateSessionInput = {
  templateId: string | null
  assignedDate: string | null
}

async function currentMusicianId(client: PoolClient): Promise<string> {
  const result = await client.query<{ id: string }>(
    'SELECT id::text FROM musician ORDER BY is_admin DESC, id LIMIT 1',
  )
  const musician = result.rows[0]
  if (!musician) throw new Error('Create a musician before creating templates or sessions')
  return musician.id
}

function validateTemplate(input: SaveTemplateInput): SaveTemplateInput {
  const name = input.name.trim()
  if (!name) throw new Error('Template name is required')
  if (name.length > 200) throw new Error('Template name must be 200 characters or fewer')
  if (input.items.length > 200) throw new Error('A template can contain at most 200 items')

  const ids = new Set<string>()
  for (const item of input.items) {
    if (!item.clientId || ids.has(item.clientId))
      throw new Error('Template item IDs must be unique')
    ids.add(item.clientId)
    if (!['SECTION', 'EXERCISE', 'REPERTOIRE'].includes(item.type)) {
      throw new Error('Invalid template item type')
    }
    if (item.type === 'SECTION' && item.sourceId !== null) {
      throw new Error('Sections cannot reference library items')
    }
    if (item.type !== 'SECTION' && !item.sourceId?.match(/^\d+$/)) {
      throw new Error('Practice items must reference a library item')
    }
  }

  for (const item of input.items) {
    if (item.parentClientId !== null && !ids.has(item.parentClientId)) {
      throw new Error('A template item references a missing parent')
    }
    if (
      item.parentClientId !== null &&
      input.items.find((candidate) => candidate.clientId === item.parentClientId)?.type !==
        'SECTION'
    ) {
      throw new Error('Template items can only be placed inside sections')
    }
  }

  return { name, items: input.items }
}

async function insertTemplateItems(
  client: PoolClient,
  templateId: string,
  items: TemplateItemInput[],
) {
  const remaining = [...items]
  const databaseIds = new Map<string, string>()
  while (remaining.length > 0) {
    const index = remaining.findIndex(
      (item) => item.parentClientId === null || databaseIds.has(item.parentClientId),
    )
    if (index < 0) throw new Error('Template sections contain a circular reference')
    const [item] = remaining.splice(index, 1)
    if (!item) continue
    const parentId = item.parentClientId ? databaseIds.get(item.parentClientId) : null
    const result = await client.query<{ id: string }>(
      `
        INSERT INTO session_template_item
          (session_template_id, parent_id, type, position, exercise_id, repertoire_id, name, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id::text
      `,
      [
        templateId,
        parentId,
        item.type,
        item.position,
        item.type === 'EXERCISE' ? item.sourceId : null,
        item.type === 'REPERTOIRE' ? item.sourceId : null,
        item.type === 'SECTION' ? item.name.trim() || 'Untitled section' : null,
        item.notes.trim() || null,
      ],
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error('Template item could not be created')
    databaseIds.set(item.clientId, id)
  }
}

async function insertSessionItems(
  client: PoolClient,
  sessionId: string,
  items: TemplateItemInput[],
) {
  const remaining = [...items]
  const databaseIds = new Map<string, string>()
  while (remaining.length > 0) {
    const index = remaining.findIndex(
      (item) => item.parentClientId === null || databaseIds.has(item.parentClientId),
    )
    if (index < 0) throw new Error('Session sections contain a circular reference')
    const [item] = remaining.splice(index, 1)
    if (!item) continue
    const parentId = item.parentClientId ? databaseIds.get(item.parentClientId) : null
    const result = await client.query<{ id: string }>(
      `
        INSERT INTO session_item
          (session_id, parent_id, type, position, exercise_id, repertoire_id, name, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id::text
      `,
      [
        sessionId,
        parentId,
        item.type,
        item.position,
        item.type === 'EXERCISE' ? item.sourceId : null,
        item.type === 'REPERTOIRE' ? item.sourceId : null,
        item.type === 'SECTION' ? item.name.trim() || 'Untitled section' : null,
        item.notes.trim() || null,
      ],
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error('Session item could not be created')
    databaseIds.set(item.clientId, id)
  }
}

export const getSessionTemplates = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionTemplateSummary[]> => {
    const result = await pool.query<{
      id: string
      name: string
      itemCount: number
      updatedAt: Date
    }>(`
      SELECT
        template.id::text,
        template.name,
        count(item.id) FILTER (WHERE item.type <> 'SECTION')::int AS "itemCount",
        template.updated_at AS "updatedAt"
      FROM session_template template
      LEFT JOIN session_template_item item ON item.session_template_id = template.id
      GROUP BY template.id
      ORDER BY template.updated_at DESC, template.id DESC
    `)

    return result.rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }))
  },
)

export const getTemplateLibrary = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TemplateLibraryItem[]> => {
    const [exercises, repertoire] = await Promise.all([
      pool.query<{ id: string; name: string; detail: string }>(`
        SELECT
          id::text,
          COALESCE(name, 'Untitled exercise') AS name,
          CASE WHEN notation IS NULL THEN 'Exercise' ELSE 'Exercise · with notation' END AS detail
        FROM exercise
        WHERE deleted_at IS NULL
        ORDER BY name NULLS LAST, id
      `),
      pool.query<{ id: string; name: string; detail: string }>(`
        SELECT
          repertoire.id::text,
          repertoire.title AS name,
          COALESCE(parent.title, 'Repertoire') AS detail
        FROM repertoire
        LEFT JOIN repertoire parent ON parent.id = repertoire.parent_repertoire_id
        ORDER BY repertoire.title, repertoire.id
      `),
    ])

    return [
      ...exercises.rows.map((item) => ({ ...item, type: 'EXERCISE' as const })),
      ...repertoire.rows.map((item) => ({ ...item, type: 'REPERTOIRE' as const })),
    ]
  },
)

export const getSessionTemplate = createServerFn({ method: 'GET' })
  .validator((templateId: string) => {
    if (!/^\d+$/.test(templateId)) throw new Error('Template ID must be a positive integer')
    return templateId
  })

  .handler(async ({ data: templateId }): Promise<SessionTemplateDetail | null> => {
    const [templateResult, itemResult] = await Promise.all([
      pool.query<{ id: string; name: string }>(
        `SELECT id::text, name FROM session_template WHERE id = $1`,
        [templateId],
      ),
      pool.query<TemplateItemInput>(
        `
          SELECT
            item.id::text AS "clientId",
            item.parent_id::text AS "parentClientId",
            item.type::text,
            CASE
              WHEN item.type = 'EXERCISE' THEN item.exercise_id::text
              WHEN item.type = 'REPERTOIRE' THEN item.repertoire_id::text
              ELSE NULL
            END AS "sourceId",
            COALESCE(item.name, exercise.name, repertoire.title, 'Untitled item') AS name,
            COALESCE(item.notes, '') AS notes,
            item.position::float8 AS position
          FROM session_template_item item
          LEFT JOIN exercise ON exercise.id = item.exercise_id
          LEFT JOIN repertoire ON repertoire.id = item.repertoire_id
          WHERE item.session_template_id = $1
          ORDER BY item.parent_id NULLS FIRST, item.position, item.id
        `,
        [templateId],
      ),
    ])
    const template = templateResult.rows[0]
    return template ? { ...template, items: itemResult.rows } : null
  })

export const getPlannedSessionForEdit = createServerFn({ method: 'GET' })
  .validator((sessionId: string) => {
    if (!/^\d+$/.test(sessionId)) throw new Error('Session ID must be a positive integer')
    return sessionId
  })
  .handler(async ({ data: sessionId }): Promise<PlannedSessionEdit | null> => {
    const [sessionResult, itemResult] = await Promise.all([
      pool.query<{ id: string; name: string; assignedDate: string | null }>(
        `
          SELECT session.id::text, COALESCE(template.name, 'Open practice') AS name,
            to_char(session.assigned_date, 'YYYY-MM-DD') AS "assignedDate"
          FROM session
          LEFT JOIN session_template template ON template.id = session.session_template_id
          WHERE session.id = $1 AND session.status = 'PLANNED'
        `,
        [sessionId],
      ),
      pool.query<TemplateItemInput>(
        `
          SELECT
            item.id::text AS "clientId",
            item.parent_id::text AS "parentClientId",
            item.type::text,
            CASE
              WHEN item.type = 'EXERCISE' THEN item.exercise_id::text
              WHEN item.type = 'REPERTOIRE' THEN item.repertoire_id::text
              ELSE NULL
            END AS "sourceId",
            COALESCE(item.name, exercise.name, repertoire.title, 'Untitled item') AS name,
            COALESCE(item.notes, '') AS notes,
            item.position::float8 AS position
          FROM session_item item
          LEFT JOIN exercise ON exercise.id = item.exercise_id
          LEFT JOIN repertoire ON repertoire.id = item.repertoire_id
          WHERE item.session_id = $1
          ORDER BY item.parent_id NULLS FIRST, item.position, item.id
        `,
        [sessionId],
      ),
    ])
    const session = sessionResult.rows[0]
    return session ? { ...session, items: itemResult.rows } : null
  })

export const createSessionTemplate = createServerFn({ method: 'POST' })
  .validator(validateTemplate)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const musicianId = await currentMusicianId(client)
      const templateResult = await client.query<{ id: string }>(
        `INSERT INTO session_template (musician_id, name) VALUES ($1, $2) RETURNING id::text`,
        [musicianId, data.name],
      )
      const templateId = templateResult.rows[0]?.id
      if (!templateId) throw new Error('Template could not be created')

      await insertTemplateItems(client, templateId, data.items)

      await client.query('COMMIT')
      return { id: templateId }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })

export const updateSessionTemplate = createServerFn({ method: 'POST' })
  .validator((input: UpdateTemplateInput) => {
    if (!/^\d+$/.test(input.id)) throw new Error('Invalid template')
    return { id: input.id, ...validateTemplate(input) }
  })

  .handler(async ({ data }): Promise<{ id: string }> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const musicianId = await currentMusicianId(client)
      const result = await client.query(
        `UPDATE session_template SET name = $1 WHERE id = $2 AND musician_id = $3`,
        [data.name, data.id, musicianId],
      )
      if (result.rowCount === 0) throw new Error('Template not found')
      await client.query(`DELETE FROM session_template_item WHERE session_template_id = $1`, [
        data.id,
      ])
      await insertTemplateItems(client, data.id, data.items)
      await client.query('COMMIT')
      return { id: data.id }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })

export const deleteSessionTemplate = createServerFn({ method: 'POST' })
  .validator((templateId: string) => {
    if (!/^\d+$/.test(templateId)) throw new Error('Invalid template')
    return templateId
  })
  .handler(async ({ data: templateId }): Promise<{ id: string }> => {
    const client = await pool.connect()
    try {
      const musicianId = await currentMusicianId(client)
      const result = await client.query<{ id: string }>(
        `DELETE FROM session_template
         WHERE id = $1 AND musician_id = $2
         RETURNING id::text`,
        [templateId, musicianId],
      )
      const deletedTemplate = result.rows[0]
      if (!deletedTemplate) throw new Error('Template not found')
      return deletedTemplate
    } finally {
      client.release()
    }
  })

export const updatePlannedSession = createServerFn({ method: 'POST' })
  .validator((input: { id: string; assignedDate: string | null; items: TemplateItemInput[] }) => {
    if (!/^\d+$/.test(input.id)) throw new Error('Invalid session')
    if (input.assignedDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.assignedDate)) {
      throw new Error('Invalid scheduled date')
    }
    return { ...input, items: validateTemplate({ name: 'Session', items: input.items }).items }
  })
  .handler(async ({ data }): Promise<{ id: string }> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const musicianId = await currentMusicianId(client)
      const result = await client.query(
        `
          UPDATE session
          SET assigned_date = $1, assigned_at = NULL
          WHERE id = $2 AND musician_id = $3 AND status = 'PLANNED'
        `,
        [data.assignedDate, data.id, musicianId],
      )
      if (result.rowCount === 0) throw new Error('Only planned sessions can be edited')
      await client.query(`DELETE FROM session_item WHERE session_id = $1`, [data.id])
      await insertSessionItems(client, data.id, data.items)
      await client.query('COMMIT')
      return { id: data.id }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })

export const createLibraryItem = createServerFn({ method: 'POST' })
  .validator((input: { type: 'EXERCISE' | 'REPERTOIRE'; name: string; notes: string }) => {
    const name = input.name.trim()
    if (!name) throw new Error('Item name is required')
    if (!['EXERCISE', 'REPERTOIRE'].includes(input.type)) throw new Error('Invalid item type')
    return { ...input, name, notes: input.notes.trim() }
  })
  .handler(async ({ data }): Promise<TemplateLibraryItem> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const musicianId = await currentMusicianId(client)
      if (data.type === 'EXERCISE') {
        const result = await client.query<{ id: string }>(
          `INSERT INTO exercise (musician_id, name) VALUES ($1, $2) RETURNING id::text`,
          [musicianId, data.name],
        )
        await client.query('COMMIT')
        return { id: result.rows[0]!.id, type: data.type, name: data.name, detail: 'Exercise' }
      }

      const result = await client.query<{ id: string }>(
        `
          INSERT INTO repertoire (title, owner_musician_id, visibility, status)
          VALUES ($1, $2, 'PRIVATE', 'APPROVED')
          RETURNING id::text
        `,
        [data.name, musicianId],
      )
      const id = result.rows[0]!.id
      await client.query(
        `INSERT INTO musician_repertoire_library (musician_id, repertoire_id, notes) VALUES ($1, $2, $3)`,
        [musicianId, id, data.notes || null],
      )
      await client.query('COMMIT')
      return { id, type: data.type, name: data.name, detail: 'Repertoire' }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })

export const createPracticeSession = createServerFn({ method: 'POST' })
  .validator((input: CreateSessionInput) => {
    if (input.templateId !== null && !/^\d+$/.test(input.templateId)) {
      throw new Error('Invalid template')
    }
    if (input.assignedDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.assignedDate)) {
      throw new Error('Invalid scheduled date')
    }
    return input
  })
  .handler(async ({ data }): Promise<{ id: string }> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const musicianId = await currentMusicianId(client)
      if (data.templateId) {
        const template = await client.query(
          'SELECT 1 FROM session_template WHERE id = $1 AND musician_id = $2',
          [data.templateId, musicianId],
        )
        if (template.rowCount === 0) throw new Error('Template not found')
      }

      const sessionResult = await client.query<{ id: string }>(
        `
          INSERT INTO session (musician_id, session_template_id, assigned_date)
          VALUES ($1, $2, $3)
          RETURNING id::text
        `,
        [musicianId, data.templateId, data.assignedDate],
      )
      const sessionId = sessionResult.rows[0]!.id

      if (data.templateId) {
        const items = await client.query<{
          id: string
          parentId: string | null
          type: string
          position: string
          exerciseId: string | null
          repertoireId: string | null
          name: string | null
          notes: string | null
        }>(
          `
          SELECT id::text, parent_id::text AS "parentId", type::text, position::text,
            exercise_id::text AS "exerciseId", repertoire_id::text AS "repertoireId", name, notes
          FROM session_template_item
          WHERE session_template_id = ${'$'}1
          ORDER BY parent_id NULLS FIRST, position, id
        `,
          [data.templateId],
        )
        const copiedIds = new Map<string, string>()
        const remaining = [...items.rows]
        while (remaining.length > 0) {
          const index = remaining.findIndex(
            (item) => item.parentId === null || copiedIds.has(item.parentId),
          )
          if (index < 0) throw new Error('Template hierarchy could not be copied')
          const [item] = remaining.splice(index, 1)
          if (!item) continue
          const result = await client.query<{ id: string }>(
            `
              INSERT INTO session_item
                (session_id, parent_id, type, position, exercise_id, repertoire_id, name, notes)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              RETURNING id::text
            `,
            [
              sessionId,
              item.parentId ? copiedIds.get(item.parentId) : null,
              item.type,
              item.position,
              item.exerciseId,
              item.repertoireId,
              item.name,
              item.notes,
            ],
          )
          copiedIds.set(item.id, result.rows[0]!.id)
        }
      }

      await client.query('COMMIT')
      return { id: sessionId }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })
