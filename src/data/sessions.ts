import { createServerFn } from '@tanstack/solid-start'
import type { PoolClient } from 'pg'
import { pool, toIsoString } from './db'

export type SessionTimingMode = 'MANUAL' | 'AUTO'
export type SessionItemStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'SKIPPED'
export type SessionItemAction = 'START' | 'COMPLETE' | 'SKIP' | 'RESET'

export type SessionRow = {
  id: string
  templateName: string
  status: string
  assignedDate: string | null
  assignedAt: string | null
  startedAt: string | null
  endedAt: string | null
  durationMinutes: number | null
  itemCount: number
  readyToFinalize: boolean
}

export type SessionDetailItem = {
  id: string
  parentId: string | null
  type: 'SECTION' | 'EXERCISE' | 'REPERTOIRE'
  position: number
  name: string
  notes: string | null
  notation: string | null
  notationFormat: string | null
  status: SessionItemStatus
  startedAt: string | null
  endedAt: string | null
  durationMinutes: number | null
}

export type SessionDetail = {
  id: string
  templateName: string
  status: string
  timingMode: SessionTimingMode | null
  assignedDate: string | null
  assignedAt: string | null
  startedAt: string | null
  endedAt: string | null
  durationMinutes: number | null
  items: SessionDetailItem[]
}

export type SessionProgressUpdate = {
  status: string
  timingMode: SessionTimingMode | null
  startedAt: string | null
  endedAt: string | null
  durationMinutes: number | null
  items: Array<
    Pick<SessionDetailItem, 'id' | 'status' | 'startedAt' | 'endedAt' | 'durationMinutes'>
  >
}

export const getSessions = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionRow[]> => {
    const result = await pool.query<{
      id: string
      templateName: string
      status: string
      assignedDate: string | null
      assignedAt: Date | null
      startedAt: Date | null
      endedAt: Date | null
      durationMinutes: number | null
      itemCount: number
      readyToFinalize: boolean
    }>(`
      SELECT
        session.id::text,
        session.name AS "templateName",
        session.status::text,
        to_char(session.assigned_date, 'YYYY-MM-DD') AS "assignedDate",
        session.assigned_at AS "assignedAt",
        session.started_at AS "startedAt",
        session.ended_at AS "endedAt",
        CASE WHEN count(item.id) FILTER (
          WHERE item.started_at IS NOT NULL AND item.ended_at IS NOT NULL
        ) > 0 THEN round(sum(extract(epoch FROM (item.ended_at - item.started_at))) / 60)::int
        ELSE NULL END AS "durationMinutes",
        count(item.id)::int AS "itemCount",
        (
          session.status = 'IN_PROGRESS'
          AND count(item.id) FILTER (
            WHERE item.status NOT IN ('COMPLETE', 'SKIPPED')
          ) = 0
        ) AS "readyToFinalize"
      FROM session
      LEFT JOIN session_template template ON template.id = session.session_template_id
      LEFT JOIN session_item item ON item.session_id = session.id AND item.type <> 'SECTION'
      GROUP BY session.id, template.name
      ORDER BY COALESCE(
        session.started_at,
        session.assigned_date::timestamp AT TIME ZONE current_setting('TIMEZONE')
      ) DESC NULLS LAST
    `)

    return result.rows.map((row) => ({
      ...row,
      assignedAt: toIsoString(row.assignedAt),
      startedAt: toIsoString(row.startedAt),
      endedAt: toIsoString(row.endedAt),
    }))
  },
)

export const getSessionDetail = createServerFn({ method: 'GET' })
  .validator((sessionId: string) => {
    if (!/^\d+$/.test(sessionId)) {
      throw new Error('Session ID must be a positive integer')
    }

    return sessionId
  })
  .handler(async ({ data: sessionId }): Promise<SessionDetail | null> => {
    const [sessionResult, itemResult] = await Promise.all([
      pool.query<{
        id: string
        templateName: string
        status: string
        timingMode: SessionTimingMode | null
        assignedDate: string | null
        assignedAt: Date | null
        startedAt: Date | null
        endedAt: Date | null
        durationMinutes: number | null
      }>(
        `
          SELECT
            session.id::text,
            session.name AS "templateName",
            session.status::text,
            session.timing_mode::text AS "timingMode",
            to_char(session.assigned_date, 'YYYY-MM-DD') AS "assignedDate",
            session.assigned_at AS "assignedAt",
            session.started_at AS "startedAt",
            session.ended_at AS "endedAt",
            (
              SELECT round(sum(extract(epoch FROM (timed.ended_at - timed.started_at))) / 60)::int
              FROM session_item timed
              WHERE timed.session_id = session.id
                AND timed.started_at IS NOT NULL AND timed.ended_at IS NOT NULL
            ) AS "durationMinutes"
          FROM session
          LEFT JOIN session_template template ON template.id = session.session_template_id
          WHERE session.id = $1
        `,
        [sessionId],
      ),
      pool.query<{
        id: string
        parentId: string | null
        type: 'SECTION' | 'EXERCISE' | 'REPERTOIRE'
        position: number
        name: string
        notes: string | null
        notation: string | null
        notationFormat: string | null
        status: SessionItemStatus
        startedAt: Date | null
        endedAt: Date | null
        durationMinutes: number | null
      }>(
        `
          SELECT
            item.id::text,
            item.parent_id::text AS "parentId",
            item.type::text,
            item.position::float8 AS position,
            COALESCE(item.name, exercise.name, repertoire.title, 'Untitled item') AS name,
            item.notes,
            exercise.notation,
            exercise.notation_format AS "notationFormat",
            item.status::text,
            item.started_at AS "startedAt",
            item.ended_at AS "endedAt",
            CASE
              WHEN item.started_at IS NOT NULL AND item.ended_at IS NOT NULL
                THEN round(extract(epoch FROM (item.ended_at - item.started_at)) / 60)::int
              ELSE NULL
            END AS "durationMinutes"
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
    if (!session) return null

    return {
      ...session,
      assignedAt: toIsoString(session.assignedAt),
      startedAt: toIsoString(session.startedAt),
      endedAt: toIsoString(session.endedAt),
      items: itemResult.rows.map((item) => ({
        ...item,
        startedAt: toIsoString(item.startedAt),
        endedAt: toIsoString(item.endedAt),
      })),
    }
  })

export const deletePlannedSession = createServerFn({ method: 'POST' })
  .validator((sessionId: string) => {
    if (!/^\d+$/.test(sessionId)) throw new Error('Invalid session')
    return sessionId
  })
  .handler(async ({ data: sessionId }): Promise<{ id: string }> => {
    const result = await pool.query<{ id: string }>(
      `
        DELETE FROM session
        WHERE id = $1
          AND status = 'PLANNED'
          AND musician_id = (
            SELECT id FROM musician ORDER BY is_admin DESC, id LIMIT 1
          )
        RETURNING id::text
      `,
      [sessionId],
    )
    const deletedSession = result.rows[0]
    if (!deletedSession) throw new Error('Only planned sessions can be deleted')
    return deletedSession
  })

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value)
}

async function refreshSectionStates(client: PoolClient, sessionId: string) {
  await client.query(
    `
      WITH RECURSIVE descendants AS (
        SELECT section.id AS section_id, child.id
        FROM session_item section
        JOIN session_item child ON child.parent_id = section.id
        WHERE section.session_id = $1 AND section.type = 'SECTION'
        UNION ALL
        SELECT descendants.section_id, child.id
        FROM descendants
        JOIN session_item child ON child.parent_id = descendants.id
      ), states AS (
        SELECT section.id AS section_id,
          CASE
            WHEN count(item.id) = 0 THEN 'NOT_STARTED'::session_item_status
            WHEN bool_and(item.status = 'SKIPPED') THEN 'SKIPPED'::session_item_status
            WHEN bool_and(item.status IN ('COMPLETE', 'SKIPPED'))
              THEN 'COMPLETE'::session_item_status
            WHEN bool_or(item.status IN ('IN_PROGRESS', 'COMPLETE'))
              THEN 'IN_PROGRESS'::session_item_status
            ELSE 'NOT_STARTED'::session_item_status
          END AS status
        FROM session_item section
        LEFT JOIN descendants ON descendants.section_id = section.id
        LEFT JOIN session_item item
          ON item.id = descendants.id AND item.type <> 'SECTION'
        WHERE section.session_id = $1 AND section.type = 'SECTION'
        GROUP BY section.id
      )
      UPDATE session_item section
      SET status = states.status, started_at = NULL, ended_at = NULL
      FROM states
      WHERE section.id = states.section_id
    `,
    [sessionId],
  )
}

async function startNextAutoItem(client: PoolClient, sessionId: string) {
  const mode = await client.query<{ timingMode: SessionTimingMode | null }>(
    `SELECT timing_mode::text AS "timingMode" FROM session WHERE id = $1`,
    [sessionId],
  )
  if (mode.rows[0]?.timingMode !== 'AUTO') return

  const active = await client.query(
    `SELECT 1 FROM session_item
     WHERE session_id = $1 AND type <> 'SECTION' AND status = 'IN_PROGRESS' LIMIT 1`,
    [sessionId],
  )
  if (active.rowCount) return

  await client.query(
    `
      WITH RECURSIVE ordered_items AS (
        SELECT id, type, status, ARRAY[position]::numeric[] AS path
        FROM session_item
        WHERE session_id = $1 AND parent_id IS NULL
        UNION ALL
        SELECT child.id, child.type, child.status, parent.path || child.position
        FROM ordered_items parent
        JOIN session_item child ON child.parent_id = parent.id
      ), next_item AS (
        SELECT id FROM ordered_items
        WHERE type <> 'SECTION' AND status = 'NOT_STARTED'
        ORDER BY path LIMIT 1
      )
      UPDATE session_item item
      SET status = 'IN_PROGRESS', started_at = CURRENT_TIMESTAMP, ended_at = NULL
      FROM next_item
      WHERE item.id = next_item.id
    `,
    [sessionId],
  )
}

async function progressUpdate(
  client: PoolClient,
  sessionId: string,
): Promise<SessionProgressUpdate> {
  const [sessionResult, itemResult] = await Promise.all([
    client.query<{
      status: string
      timingMode: SessionTimingMode | null
      startedAt: Date | null
      endedAt: Date | null
      durationMinutes: number | null
    }>(
      `SELECT status::text, timing_mode::text AS "timingMode",
        started_at AS "startedAt", ended_at AS "endedAt",
        (
          SELECT round(sum(extract(epoch FROM (item.ended_at - item.started_at))) / 60)::int
          FROM session_item item
          WHERE item.session_id = session.id
            AND item.started_at IS NOT NULL AND item.ended_at IS NOT NULL
        ) AS "durationMinutes"
       FROM session WHERE id = $1`,
      [sessionId],
    ),
    client.query<{
      id: string
      status: SessionItemStatus
      startedAt: Date | null
      endedAt: Date | null
      durationMinutes: number | null
    }>(
      `SELECT id::text, status::text, started_at AS "startedAt", ended_at AS "endedAt",
        CASE WHEN started_at IS NOT NULL AND ended_at IS NOT NULL
          THEN round(extract(epoch FROM (ended_at - started_at)) / 60)::int
          ELSE NULL END AS "durationMinutes"
       FROM session_item WHERE session_id = $1`,
      [sessionId],
    ),
  ])
  const session = sessionResult.rows[0]
  if (!session) throw new Error('Session not found')
  return {
    ...session,
    startedAt: toIsoString(session.startedAt),
    endedAt: toIsoString(session.endedAt),
    items: itemResult.rows.map((item) => ({
      ...item,
      startedAt: toIsoString(item.startedAt),
      endedAt: toIsoString(item.endedAt),
    })),
  }
}

export const startPracticeSession = createServerFn({ method: 'POST' })
  .validator((input: { sessionId: string; timingMode: SessionTimingMode; localDate: string }) => {
    if (!validId(input.sessionId)) throw new Error('Invalid session')
    if (input.timingMode !== 'MANUAL' && input.timingMode !== 'AUTO') {
      throw new Error('Invalid timing mode')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate)) throw new Error('Invalid local date')
    return input
  })
  .handler(async ({ data }): Promise<SessionProgressUpdate> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(
        `UPDATE session
         SET status = 'IN_PROGRESS', timing_mode = $2, started_at = CURRENT_TIMESTAMP,
           ended_at = NULL
         WHERE id = $1 AND status = 'PLANNED'
           AND (assigned_date IS NULL OR assigned_date = $3::date)
           AND musician_id = (
             SELECT id FROM musician ORDER BY is_admin DESC, id LIMIT 1
           )
         RETURNING id`,
        [data.sessionId, data.timingMode, data.localDate],
      )
      if (!result.rowCount) {
        throw new Error('This session can only be started on its assigned local date')
      }
      await startNextAutoItem(client, data.sessionId)
      await refreshSectionStates(client, data.sessionId)
      const update = await progressUpdate(client, data.sessionId)
      await client.query('COMMIT')
      return update
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })

export const updateSessionProgress = createServerFn({ method: 'POST' })
  .validator(
    (input: {
      sessionId: string
      changes: Array<{ itemId: string; action: SessionItemAction }>
    }) => {
      if (!validId(input.sessionId)) throw new Error('Invalid session')
      if (
        !Array.isArray(input.changes) ||
        input.changes.length === 0 ||
        input.changes.length > 100
      ) {
        throw new Error('Provide between 1 and 100 changes')
      }
      for (const change of input.changes) {
        if (!validId(change.itemId)) throw new Error('Invalid session item')
        if (!['START', 'COMPLETE', 'SKIP', 'RESET'].includes(change.action)) {
          throw new Error('Invalid session item action')
        }
      }
      return input
    },
  )
  .handler(async ({ data }): Promise<SessionProgressUpdate> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const sessionResult = await client.query<{ timingMode: SessionTimingMode }>(
        `SELECT timing_mode::text AS "timingMode" FROM session
         WHERE id = $1 AND status = 'IN_PROGRESS'
           AND musician_id = (
             SELECT id FROM musician ORDER BY is_admin DESC, id LIMIT 1
           )
         FOR UPDATE`,
        [data.sessionId],
      )
      const session = sessionResult.rows[0]
      if (!session) throw new Error('Only an in-progress session can be changed')

      for (const change of data.changes) {
        const itemResult = await client.query<{
          type: SessionDetailItem['type']
          status: SessionItemStatus
        }>(
          `SELECT type::text, status::text FROM session_item
           WHERE id = $1 AND session_id = $2 FOR UPDATE`,
          [change.itemId, data.sessionId],
        )
        const item = itemResult.rows[0]
        if (!item) throw new Error('Session item not found')

        if (item.type === 'SECTION') {
          if (change.action === 'SKIP') {
            const blocked = await client.query(
              `WITH RECURSIVE descendants AS (
                 SELECT id, type, status FROM session_item WHERE parent_id = $1
                 UNION ALL
                 SELECT child.id, child.type, child.status
                 FROM descendants parent
                 JOIN session_item child ON child.parent_id = parent.id
               )
               SELECT 1 FROM descendants
               WHERE type <> 'SECTION' AND status IN ('IN_PROGRESS', 'COMPLETE') LIMIT 1`,
              [change.itemId],
            )
            if (blocked.rowCount) throw new Error('Only an unstarted section can be skipped')
            await client.query(
              `WITH RECURSIVE descendants AS (
                 SELECT id FROM session_item WHERE parent_id = $1
                 UNION ALL
                 SELECT child.id FROM descendants parent
                 JOIN session_item child ON child.parent_id = parent.id
               )
               UPDATE session_item item
               SET status = 'SKIPPED', started_at = NULL, ended_at = NULL
               WHERE item.id IN (SELECT id FROM descendants) AND item.type <> 'SECTION'`,
              [change.itemId],
            )
          } else if (change.action === 'RESET' && item.status === 'SKIPPED') {
            await client.query(
              `WITH RECURSIVE descendants AS (
                 SELECT id FROM session_item WHERE parent_id = $1
                 UNION ALL
                 SELECT child.id FROM descendants parent
                 JOIN session_item child ON child.parent_id = parent.id
               )
               UPDATE session_item item
               SET status = 'NOT_STARTED', started_at = NULL, ended_at = NULL
               WHERE item.id IN (SELECT id FROM descendants)
                 AND item.type <> 'SECTION' AND item.status = 'SKIPPED'`,
              [change.itemId],
            )
          } else {
            throw new Error('That section action is not available')
          }
          continue
        }

        if (change.action === 'START') {
          if (session.timingMode !== 'MANUAL' || item.status !== 'NOT_STARTED') {
            throw new Error('This item cannot be started manually')
          }
          const active = await client.query(
            `SELECT 1 FROM session_item
             WHERE session_id = $1 AND type <> 'SECTION' AND status = 'IN_PROGRESS' LIMIT 1`,
            [data.sessionId],
          )
          if (active.rowCount) throw new Error('Complete or skip the active item first')
          await client.query(
            `UPDATE session_item SET status = 'IN_PROGRESS', started_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [change.itemId],
          )
        } else if (change.action === 'COMPLETE') {
          if (!['NOT_STARTED', 'IN_PROGRESS'].includes(item.status)) {
            throw new Error('Only an incomplete item can be completed')
          }
          await client.query(
            `UPDATE session_item SET status = 'COMPLETE',
               ended_at = CASE WHEN started_at IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END
             WHERE id = $1`,
            [change.itemId],
          )
        } else if (change.action === 'SKIP') {
          if (!['NOT_STARTED', 'IN_PROGRESS'].includes(item.status)) {
            throw new Error('Only an incomplete item can be skipped')
          }
          await client.query(
            `UPDATE session_item SET status = 'SKIPPED', started_at = NULL, ended_at = NULL
             WHERE id = $1`,
            [change.itemId],
          )
        } else if (change.action === 'RESET') {
          if (!['COMPLETE', 'SKIPPED'].includes(item.status)) {
            throw new Error('Only a complete or skipped item can be reset')
          }
          await client.query(
            `UPDATE session_item SET status = 'NOT_STARTED', started_at = NULL, ended_at = NULL
             WHERE id = $1`,
            [change.itemId],
          )
        }
      }

      await startNextAutoItem(client, data.sessionId)
      await refreshSectionStates(client, data.sessionId)
      const update = await progressUpdate(client, data.sessionId)
      await client.query('COMMIT')
      return update
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })

export const completePracticeSession = createServerFn({ method: 'POST' })
  .validator((sessionId: string) => {
    if (!validId(sessionId)) throw new Error('Invalid session')
    return sessionId
  })

  .handler(async ({ data: sessionId }): Promise<SessionProgressUpdate> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(
        `UPDATE session
         SET status = 'COMPLETED', ended_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'IN_PROGRESS'
           AND musician_id = (
             SELECT id FROM musician ORDER BY is_admin DESC, id LIMIT 1
           )
           AND NOT EXISTS (
             SELECT 1 FROM session_item
             WHERE session_id = session.id AND type <> 'SECTION'
               AND status NOT IN ('COMPLETE', 'SKIPPED')
           )
         RETURNING id`,
        [sessionId],
      )
      if (!result.rowCount) {
        throw new Error('Resolve every practice item before completing the session')
      }
      const update = await progressUpdate(client, sessionId)
      await client.query('COMMIT')
      return update
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })

export const updateSessionName = createServerFn({ method: 'POST' })
  .validator((input: { sessionId: string; name: string }) => {
    if (!validId(input.sessionId)) throw new Error('Invalid session')
    const name = input.name.trim()
    if (!name) throw new Error('Session name is required')
    if (name.length > 200) throw new Error('Session name must be 200 characters or fewer')
    return { sessionId: input.sessionId, name }
  })
  .handler(async ({ data }): Promise<{ name: string }> => {
    const result = await pool.query<{ name: string }>(
      `UPDATE session SET name = $2
       WHERE id = $1 AND status IN ('PLANNED', 'IN_PROGRESS')
         AND musician_id = (
           SELECT id FROM musician ORDER BY is_admin DESC, id LIMIT 1
         )
       RETURNING name`,
      [data.sessionId, data.name],
    )
    const session = result.rows[0]
    if (!session) throw new Error('Completed sessions cannot be renamed')
    return session
  })
