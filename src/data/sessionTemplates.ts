import { createServerFn } from '@tanstack/solid-start'
import type { PoolClient } from 'pg'
import { resourceAccess, type ResourceAccess, type Visibility } from '@/auth/authorization'
import { authMiddleware } from '@/auth/middleware'
import type { AuthenticatedUser } from '@/auth/types'
import { pool } from '@/data/db'
import {
  LIBRARY_ITEM_TYPE,
  PRACTICE_ITEM_TYPE,
  isLibraryItemType,
  isPracticeItemType,
  type LibraryItemType,
  type PracticeItemType,
} from '@/domain/session'

export type TemplateItemInput = {
  clientId: string
  parentClientId: string | null
  type: PracticeItemType
  sourceId: string | null
  name: string
  notes: string
  position: number
}

export type TemplateLibraryItem = {
  id: string
  type: LibraryItemType
  name: string
  detail: string
}

export type SessionTemplateSummary = {
  id: string
  name: string
  visibility: Visibility
  ownerId: string
  itemCount: number
  updatedAt: string
} & ResourceAccess

export type SessionTemplateDetail = {
  id: string
  name: string
  visibility: Visibility
  ownerId: string
  items: TemplateItemInput[]
} & ResourceAccess

export type PlannedSessionEdit = {
  id: string
  name: string
  assignedDate: string | null
  items: TemplateItemInput[]
}

type SaveTemplateInput = {
  name: string
  visibility?: Visibility
  items: TemplateItemInput[]
}

type UpdateTemplateInput = SaveTemplateInput & { id: string }

type CreateSessionInput = {
  templateId: string | null
  assignedDate: string | null
}

function validateTemplate(input: SaveTemplateInput): Required<SaveTemplateInput> {
  const name = input.name.trim()
  const visibility = input.visibility ?? 'PRIVATE'
  if (!name) throw new Error('Template name is required')
  if (name.length > 200) throw new Error('Template name must be 200 characters or fewer')
  if (visibility !== 'PRIVATE' && visibility !== 'PUBLIC') {
    throw new Error('Invalid template visibility')
  }
  if (input.items.length > 200) throw new Error('A template can contain at most 200 items')

  const ids = new Set<string>()
  for (const item of input.items) {
    if (!item.clientId || ids.has(item.clientId))
      throw new Error('Template item IDs must be unique')
    ids.add(item.clientId)
    if (!isPracticeItemType(item.type)) {
      throw new Error('Invalid template item type')
    }
    if (item.type === PRACTICE_ITEM_TYPE.SECTION && item.sourceId !== null) {
      throw new Error('Sections cannot reference library items')
    }
    if (item.type !== PRACTICE_ITEM_TYPE.SECTION && !item.sourceId?.match(/^\d+$/)) {
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
        PRACTICE_ITEM_TYPE.SECTION
    ) {
      throw new Error('Template items can only be placed inside sections')
    }
  }

  return { name, visibility, items: input.items }
}

async function resolveLibrarySource(
  client: PoolClient,
  user: AuthenticatedUser,
  type: LibraryItemType,
  sourceId: string,
): Promise<{ name: string; visibility: Visibility }> {
  if (type === LIBRARY_ITEM_TYPE.EXERCISE) {
    const result = await client.query<{ name: string; visibility: Visibility }>(
      `SELECT COALESCE(name, 'Untitled exercise') AS name, visibility::text
       FROM exercise
       WHERE id = $1 AND deleted_at IS NULL
         AND (musician_id = $2 OR visibility = 'PUBLIC')`,
      [sourceId, user.musicianId],
    )
    if (result.rows[0]) return result.rows[0]
  } else {
    const result = await client.query<{ name: string; visibility: Visibility }>(
      `WITH RECURSIVE access AS (
         SELECT id, title, owner_musician_id, visibility
         FROM repertoire WHERE parent_repertoire_id IS NULL
         UNION ALL
         SELECT child.id, child.title, access.owner_musician_id, access.visibility
         FROM repertoire child JOIN access ON access.id = child.parent_repertoire_id
       )
       SELECT title AS name, visibility::text FROM access
       WHERE id = $1 AND (owner_musician_id = $2 OR visibility = 'PUBLIC')`,
      [sourceId, user.musicianId],
    )
    if (result.rows[0]) return result.rows[0]
  }
  throw new Error('Library item not found')
}

async function insertTemplateItems(
  client: PoolClient,
  user: AuthenticatedUser,
  templateId: string,
  templateVisibility: Visibility,
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
    const source =
      item.type === PRACTICE_ITEM_TYPE.SECTION
        ? null
        : await resolveLibrarySource(client, user, item.type, item.sourceId!)
    if (templateVisibility === 'PUBLIC' && source?.visibility !== 'PUBLIC') {
      throw new Error('Public templates can only reference public library items')
    }
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
        item.type === PRACTICE_ITEM_TYPE.EXERCISE ? item.sourceId : null,
        item.type === PRACTICE_ITEM_TYPE.REPERTOIRE ? item.sourceId : null,
        item.type === PRACTICE_ITEM_TYPE.SECTION
          ? item.name.trim() || 'Untitled section'
          : source!.name,
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
  user: AuthenticatedUser,
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
    const source =
      item.type === PRACTICE_ITEM_TYPE.SECTION
        ? null
        : await resolveLibrarySource(client, user, item.type, item.sourceId!)
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
        item.type === PRACTICE_ITEM_TYPE.EXERCISE ? item.sourceId : null,
        item.type === PRACTICE_ITEM_TYPE.REPERTOIRE ? item.sourceId : null,
        item.type === PRACTICE_ITEM_TYPE.SECTION
          ? item.name.trim() || 'Untitled section'
          : source!.name,
        item.notes.trim() || null,
      ],
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error('Session item could not be created')
    databaseIds.set(item.clientId, id)
  }
}

export const getSessionTemplates = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SessionTemplateSummary[]> => {
    const result = await pool.query<{
      id: string
      name: string
      visibility: Visibility
      ownerId: string
      itemCount: number
      updatedAt: Date
    }>(
      `
      SELECT
        template.id::text,
        template.name,
        template.visibility::text,
        template.musician_id::text AS "ownerId",
        count(item.id) FILTER (WHERE item.type <> 'SECTION')::int AS "itemCount",
        template.updated_at AS "updatedAt"
      FROM session_template template
      LEFT JOIN session_template_item item ON item.session_template_id = template.id
      WHERE template.musician_id = $1 OR template.visibility = 'PUBLIC'
      GROUP BY template.id
      ORDER BY template.updated_at DESC, template.id DESC
    `,
      [context.user.musicianId],
    )

    return result.rows.map((row) => ({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
      ...resourceAccess(context.user, row.ownerId, row.visibility),
    }))
  })

export const getTemplateLibrary = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<TemplateLibraryItem[]> => {
    const [exercises, repertoire] = await Promise.all([
      pool.query<{ id: string; name: string; detail: string }>(
        `
        SELECT
          id::text,
          COALESCE(name, 'Untitled exercise') AS name,
          CASE WHEN notation IS NULL THEN 'Exercise' ELSE 'Exercise · with notation' END AS detail
        FROM exercise
        WHERE deleted_at IS NULL AND (musician_id = $1 OR visibility = 'PUBLIC')
        ORDER BY name NULLS LAST, id
      `,
        [context.user.musicianId],
      ),
      pool.query<{ id: string; name: string; detail: string }>(
        `
        WITH RECURSIVE access AS (
          SELECT id, owner_musician_id, visibility
          FROM repertoire WHERE parent_repertoire_id IS NULL
          UNION ALL
          SELECT child.id, access.owner_musician_id, access.visibility
          FROM repertoire child JOIN access ON access.id = child.parent_repertoire_id
        )
        SELECT
          repertoire.id::text,
          repertoire.title AS name,
          COALESCE(parent.title, 'Repertoire') AS detail
        FROM repertoire
        JOIN access ON access.id = repertoire.id
        LEFT JOIN repertoire parent ON parent.id = repertoire.parent_repertoire_id
        WHERE access.owner_musician_id = $1 OR access.visibility = 'PUBLIC'
        ORDER BY repertoire.title, repertoire.id
      `,
        [context.user.musicianId],
      ),
    ])

    return [
      ...exercises.rows.map((item) => ({ ...item, type: LIBRARY_ITEM_TYPE.EXERCISE })),
      ...repertoire.rows.map((item) => ({ ...item, type: LIBRARY_ITEM_TYPE.REPERTOIRE })),
    ]
  })

export const getSessionTemplate = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((templateId: string) => {
    if (!/^\d+$/.test(templateId)) throw new Error('Template ID must be a positive integer')
    return templateId
  })

  .handler(async ({ data: templateId, context }): Promise<SessionTemplateDetail | null> => {
    const [templateResult, itemResult] = await Promise.all([
      pool.query<{ id: string; name: string; visibility: Visibility; ownerId: string }>(
        `SELECT id::text, name, visibility::text, musician_id::text AS "ownerId"
         FROM session_template
         WHERE id = $1 AND (musician_id = $2 OR visibility = 'PUBLIC')`,
        [templateId, context.user.musicianId],
      ),
      pool.query<TemplateItemInput>(
        `
          WITH RECURSIVE repertoire_access AS (
            SELECT id, owner_musician_id, visibility
            FROM repertoire WHERE parent_repertoire_id IS NULL
            UNION ALL
            SELECT child.id, access.owner_musician_id, access.visibility
            FROM repertoire child
            JOIN repertoire_access access ON access.id = child.parent_repertoire_id
          )
          SELECT
            item.id::text AS "clientId",
            item.parent_id::text AS "parentClientId",
            item.type::text,
            CASE
              WHEN item.type = 'EXERCISE' THEN exercise.id::text
              WHEN item.type = 'REPERTOIRE' THEN repertoire_access.id::text
              ELSE NULL
            END AS "sourceId",
            COALESCE(item.name, 'Untitled item') AS name,
            COALESCE(item.notes, '') AS notes,
            item.position::float8 AS position
          FROM session_template_item item
          LEFT JOIN exercise ON exercise.id = item.exercise_id
            AND exercise.deleted_at IS NULL
            AND (exercise.musician_id = $2 OR exercise.visibility = 'PUBLIC')
          LEFT JOIN repertoire_access ON repertoire_access.id = item.repertoire_id
            AND (repertoire_access.owner_musician_id = $2
              OR repertoire_access.visibility = 'PUBLIC')
          WHERE item.session_template_id = $1
            AND EXISTS (
              SELECT 1 FROM session_template template
              WHERE template.id = item.session_template_id
                AND (template.musician_id = $2 OR template.visibility = 'PUBLIC')
            )
          ORDER BY item.parent_id NULLS FIRST, item.position, item.id
        `,
        [templateId, context.user.musicianId],
      ),
    ])
    const template = templateResult.rows[0]
    return template
      ? {
          ...template,
          items: itemResult.rows,
          ...resourceAccess(context.user, template.ownerId, template.visibility),
        }
      : null
  })

export const getPlannedSessionForEdit = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((sessionId: string) => {
    if (!/^\d+$/.test(sessionId)) throw new Error('Session ID must be a positive integer')
    return sessionId
  })
  .handler(async ({ data: sessionId, context }): Promise<PlannedSessionEdit | null> => {
    const [sessionResult, itemResult] = await Promise.all([
      pool.query<{ id: string; name: string; assignedDate: string | null }>(
        `
          SELECT session.id::text, session.name,
            to_char(session.assigned_date, 'YYYY-MM-DD') AS "assignedDate"
          FROM session
          LEFT JOIN session_template template ON template.id = session.session_template_id
          WHERE session.id = $1 AND session.status = 'PLANNED'
            AND session.musician_id = $2
        `,
        [sessionId, context.user.musicianId],
      ),
      pool.query<TemplateItemInput>(
        `
          WITH RECURSIVE repertoire_access AS (
            SELECT id, owner_musician_id, visibility
            FROM repertoire WHERE parent_repertoire_id IS NULL
            UNION ALL
            SELECT child.id, access.owner_musician_id, access.visibility
            FROM repertoire child
            JOIN repertoire_access access ON access.id = child.parent_repertoire_id
          )
          SELECT
            item.id::text AS "clientId",
            item.parent_id::text AS "parentClientId",
            item.type::text,
            CASE
              WHEN item.type = 'EXERCISE' THEN exercise.id::text
              WHEN item.type = 'REPERTOIRE' THEN repertoire_access.id::text
              ELSE NULL
            END AS "sourceId",
            COALESCE(item.name, 'Untitled item') AS name,
            COALESCE(item.notes, '') AS notes,
            item.position::float8 AS position
          FROM session_item item
          LEFT JOIN exercise ON exercise.id = item.exercise_id
            AND exercise.deleted_at IS NULL
            AND (exercise.musician_id = $2 OR exercise.visibility = 'PUBLIC')
          LEFT JOIN repertoire_access ON repertoire_access.id = item.repertoire_id
            AND (repertoire_access.owner_musician_id = $2
              OR repertoire_access.visibility = 'PUBLIC')
          WHERE item.session_id = $1
            AND EXISTS (
              SELECT 1 FROM session
              WHERE session.id = item.session_id AND session.musician_id = $2
            )
          ORDER BY item.parent_id NULLS FIRST, item.position, item.id
        `,
        [sessionId, context.user.musicianId],
      ),
    ])
    const session = sessionResult.rows[0]
    return session ? { ...session, items: itemResult.rows } : null
  })

export const createSessionTemplate = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(validateTemplate)
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const templateResult = await client.query<{ id: string }>(
        `INSERT INTO session_template (musician_id, name, visibility)
         VALUES ($1, $2, $3) RETURNING id::text`,
        [context.user.musicianId, data.name, data.visibility],
      )
      const templateId = templateResult.rows[0]?.id
      if (!templateId) throw new Error('Template could not be created')

      await insertTemplateItems(client, context.user, templateId, data.visibility, data.items)

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
  .middleware([authMiddleware])
  .validator((input: UpdateTemplateInput) => {
    if (!/^\d+$/.test(input.id)) throw new Error('Invalid template')
    return { id: input.id, ...validateTemplate(input) }
  })

  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const currentResult = await client.query<{
        ownerId: string
        visibility: Visibility
      }>(
        `SELECT musician_id::text AS "ownerId", visibility::text
         FROM session_template WHERE id = $1 FOR UPDATE`,
        [data.id],
      )
      const current = currentResult.rows[0]
      if (
        !current ||
        (current.ownerId !== context.user.musicianId &&
          !(context.user.isAdmin && current.visibility === 'PUBLIC'))
      ) {
        throw new Error('Template not found')
      }
      const visibility =
        current.ownerId === context.user.musicianId ? data.visibility : current.visibility
      await client.query(`UPDATE session_template SET name = $1, visibility = $2 WHERE id = $3`, [
        data.name,
        visibility,
        data.id,
      ])
      await client.query(`DELETE FROM session_template_item WHERE session_template_id = $1`, [
        data.id,
      ])
      await insertTemplateItems(client, context.user, data.id, visibility, data.items)
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
  .middleware([authMiddleware])
  .validator((templateId: string) => {
    if (!/^\d+$/.test(templateId)) throw new Error('Invalid template')
    return templateId
  })
  .handler(async ({ data: templateId, context }): Promise<{ id: string }> => {
    const client = await pool.connect()
    try {
      const result = await client.query<{ id: string }>(
        `DELETE FROM session_template
         WHERE id = $1 AND musician_id = $2
         RETURNING id::text`,
        [templateId, context.user.musicianId],
      )
      const deletedTemplate = result.rows[0]
      if (!deletedTemplate) throw new Error('Template not found')
      return deletedTemplate
    } finally {
      client.release()
    }
  })

export const updatePlannedSession = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    (input: {
      id: string
      name: string
      assignedDate: string | null
      items: TemplateItemInput[]
    }) => {
      const name = input.name.trim()
      if (!/^\d+$/.test(input.id)) throw new Error('Invalid session')
      if (!name) throw new Error('Session name is required')
      if (name.length > 200) throw new Error('Session name must be 200 characters or fewer')
      if (input.assignedDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.assignedDate)) {
        throw new Error('Invalid scheduled date')
      }
      return {
        ...input,
        name,
        items: validateTemplate({ name: 'Session', items: input.items }).items,
      }
    },
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(
        `
          UPDATE session
          SET name = $1, assigned_date = $2, assigned_at = NULL
          WHERE id = $3 AND musician_id = $4 AND status = 'PLANNED'
        `,
        [data.name, data.assignedDate, data.id, context.user.musicianId],
      )
      if (result.rowCount === 0) throw new Error('Only planned sessions can be edited')
      await client.query(`DELETE FROM session_item WHERE session_id = $1`, [data.id])
      await insertSessionItems(client, context.user, data.id, data.items)
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
  .middleware([authMiddleware])
  .validator((input: { type: LibraryItemType; name: string; notes: string }) => {
    const name = input.name.trim()
    if (!name) throw new Error('Item name is required')
    if (!isLibraryItemType(input.type)) throw new Error('Invalid item type')
    return { ...input, name, notes: input.notes.trim() }
  })
  .handler(async ({ data, context }): Promise<TemplateLibraryItem> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const musicianId = context.user.musicianId
      if (data.type === LIBRARY_ITEM_TYPE.EXERCISE) {
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
  .middleware([authMiddleware])
  .validator((input: CreateSessionInput) => {
    if (input.templateId !== null && !/^\d+$/.test(input.templateId)) {
      throw new Error('Invalid template')
    }
    if (input.assignedDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.assignedDate)) {
      throw new Error('Invalid scheduled date')
    }
    return input
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const musicianId = context.user.musicianId
      let sessionName = 'Open practice'
      if (data.templateId) {
        const template = await client.query<{ name: string }>(
          `SELECT name FROM session_template
           WHERE id = $1 AND (musician_id = $2 OR visibility = 'PUBLIC')`,
          [data.templateId, musicianId],
        )
        if (template.rowCount === 0) throw new Error('Template not found')
        sessionName = template.rows[0]!.name
      }

      const sessionResult = await client.query<{ id: string }>(
        `
          INSERT INTO session (musician_id, session_template_id, name, assigned_date)
          VALUES ($1, $2, $3, $4)
          RETURNING id::text
        `,
        [musicianId, data.templateId, sessionName, data.assignedDate],
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
