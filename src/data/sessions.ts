import { createServerFn } from '@tanstack/solid-start'
import { pool, toIsoString } from './db'

type SessionRow = {
  id: string
  templateName: string
  status: string
  assignedAt: string | null
  startedAt: string | null
  endedAt: string | null
  durationMinutes: number | null
  itemCount: number
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
  startedAt: string | null
  endedAt: string | null
  durationMinutes: number | null
}

type SessionDetail = {
  id: string
  templateName: string
  status: string
  assignedAt: string | null
  startedAt: string | null
  endedAt: string | null
  durationMinutes: number | null
  items: SessionDetailItem[]
}

export const getSessions = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionRow[]> => {
    const result = await pool.query<{
      id: string
      templateName: string
      status: string
      assignedAt: Date | null
      startedAt: Date | null
      endedAt: Date | null
      durationMinutes: number | null
      itemCount: number
    }>(`
      SELECT
        session.id::text,
        COALESCE(template.name, 'Open practice') AS "templateName",
        session.status::text,
        session.assigned_at AS "assignedAt",
        session.started_at AS "startedAt",
        session.ended_at AS "endedAt",
        CASE
          WHEN session.started_at IS NOT NULL AND session.ended_at IS NOT NULL
            THEN round(extract(epoch FROM (session.ended_at - session.started_at)) / 60)::int
          ELSE NULL
        END AS "durationMinutes",
        count(item.id)::int AS "itemCount"
      FROM session
      LEFT JOIN session_template template ON template.id = session.session_template_id
      LEFT JOIN session_item item ON item.session_id = session.id AND item.type <> 'SECTION'
      GROUP BY session.id, template.name
      ORDER BY COALESCE(session.started_at, session.assigned_at) DESC NULLS LAST
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
        assignedAt: Date | null
        startedAt: Date | null
        endedAt: Date | null
        durationMinutes: number | null
      }>(
        `
          SELECT
            session.id::text,
            COALESCE(template.name, 'Open practice') AS "templateName",
            session.status::text,
            session.assigned_at AS "assignedAt",
            session.started_at AS "startedAt",
            session.ended_at AS "endedAt",
            CASE
              WHEN session.started_at IS NOT NULL AND session.ended_at IS NOT NULL
                THEN round(extract(epoch FROM (session.ended_at - session.started_at)) / 60)::int
              ELSE NULL
            END AS "durationMinutes"
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
