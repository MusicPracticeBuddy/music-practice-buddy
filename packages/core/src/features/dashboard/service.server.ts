import type { Pool } from 'pg'

export type DashboardData = {
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
    assignedDate: string | null
  } | null
}

export async function getDashboardForMusician(
  database: Pool,
  musicianId: string,
): Promise<DashboardData> {
  const [summary, nextSession] = await Promise.all([
    database.query<{
      repertoire: number
      exercises: number
      sessions: number
      completed_sessions: number
      minutes_practiced: number
    }>(
      `
        WITH RECURSIVE repertoire_access AS (
          SELECT id, owner_musician_id, visibility
          FROM repertoire
          WHERE parent_repertoire_id IS NULL AND deleted_at IS NULL
          UNION ALL
          SELECT child.id,
            COALESCE(child.owner_musician_id, access.owner_musician_id),
            COALESCE(child.visibility, access.visibility)
          FROM repertoire child
          JOIN repertoire_access access ON access.id = child.parent_repertoire_id
          WHERE child.deleted_at IS NULL
        )
        SELECT
          (SELECT count(*)::int
           FROM repertoire_access access
           JOIN musician_repertoire_library library
             ON library.repertoire_id = access.id AND library.musician_id = $1
           WHERE access.owner_musician_id = $1 OR access.visibility = 'PUBLIC') AS repertoire,
          (SELECT count(*)::int
           FROM exercise
           JOIN musician_exercise_library library
             ON library.exercise_id = exercise.id AND library.musician_id = $1
           WHERE exercise.deleted_at IS NULL
             AND (exercise.musician_id = $1 OR exercise.visibility = 'PUBLIC')) AS exercises,
          (SELECT count(*)::int FROM session WHERE musician_id = $1) AS sessions,
          (SELECT count(*)::int FROM session
           WHERE musician_id = $1 AND status = 'COMPLETED') AS completed_sessions,
          COALESCE((
            SELECT round(sum(extract(epoch FROM (ended_at - started_at))) / 60)::int
            FROM session
            WHERE musician_id = $1 AND ended_at IS NOT NULL AND started_at IS NOT NULL
          ), 0) AS minutes_practiced
      `,
      [musicianId],
    ),
    database.query<{
      id: string
      template_name: string
      status: string
      assigned_date: string | null
    }>(
      `
        SELECT s.id::text, COALESCE(st.name, 'Open practice') AS template_name,
               s.status::text, to_char(s.assigned_date, 'YYYY-MM-DD') AS assigned_date
        FROM session s
        LEFT JOIN session_template st ON st.id = s.session_template_id
        WHERE s.musician_id = $1 AND s.status IN ('IN_PROGRESS', 'PLANNED')
        ORDER BY CASE WHEN s.status = 'IN_PROGRESS' THEN 0 ELSE 1 END,
          s.assigned_date NULLS LAST
        LIMIT 1
      `,
      [musicianId],
    ),
  ])

  const totals = summary.rows[0]!
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
          assignedDate: next.assigned_date,
        }
      : null,
  }
}
