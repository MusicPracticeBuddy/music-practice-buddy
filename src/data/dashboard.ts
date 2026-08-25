import { createServerFn } from '@tanstack/solid-start'
import { pool, toIsoString } from './db'

type DashboardData = {
  counts: {
    repertoire: number
    exercises: number
    sessions: number
    completedSessions: number
  }
  minutesPracticed: number
  nextSession: {
    id: string
    templateName: string
    status: string
    assignedAt: string | null
  } | null
}

export const getDashboard = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DashboardData> => {
    const [summary, nextSession] = await Promise.all([
      pool.query<{
        repertoire: number
        exercises: number
        sessions: number
        completed_sessions: number
        minutes_practiced: number
      }>(`
        SELECT
          (SELECT count(*)::int FROM repertoire) AS repertoire,
          (SELECT count(*)::int FROM exercise WHERE deleted_at IS NULL) AS exercises,
          (SELECT count(*)::int FROM session) AS sessions,
          (SELECT count(*)::int FROM session WHERE status = 'COMPLETED') AS completed_sessions,
          COALESCE((
            SELECT round(sum(extract(epoch FROM (ended_at - started_at))) / 60)::int
            FROM session
            WHERE ended_at IS NOT NULL AND started_at IS NOT NULL
          ), 0) AS minutes_practiced
      `),
      pool.query<{
        id: string
        template_name: string
        status: string
        assigned_at: Date | null
      }>(`
        SELECT s.id::text, COALESCE(st.name, 'Open practice') AS template_name,
               s.status::text, s.assigned_at
        FROM session s
        LEFT JOIN session_template st ON st.id = s.session_template_id
        WHERE s.status IN ('IN_PROGRESS', 'PLANNED')
        ORDER BY CASE WHEN s.status = 'IN_PROGRESS' THEN 0 ELSE 1 END, s.assigned_at
        LIMIT 1
      `),
    ])

    const totals = summary.rows[0]
    const next = nextSession.rows[0]

    return {
      counts: {
        repertoire: totals.repertoire,
        exercises: totals.exercises,
        sessions: totals.sessions,
        completedSessions: totals.completed_sessions,
      },
      minutesPracticed: totals.minutes_practiced,
      nextSession: next
        ? {
            id: next.id,
            templateName: next.template_name,
            status: next.status,
            assignedAt: toIsoString(next.assigned_at),
          }
        : null,
    }
  },
)
