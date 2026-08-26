import { createServerFn } from '@tanstack/solid-start'
import { pool, toIsoString } from '@/data/db'

type ExerciseRow = {
  id: string
  name: string
  notation: string | null
  notationFormat: string
  visibility: string
  owner: string
  copiedFrom: string | null
}

type ExerciseDetail = {
  id: string
  name: string
  notation: string | null
  notationFormat: string
  visibility: string
  owner: string
  createdAt: string
  copiedFrom: { id: string; name: string } | null
  adaptations: { id: string; name: string }[]
  sessions: {
    id: string
    templateName: string
    status: string
    startedAt: string | null
  }[]
}

export const getExercises = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ExerciseRow[]> => {
    const result = await pool.query<ExerciseRow>(`
      SELECT
        exercise.id::text,
        COALESCE(exercise.name, 'Untitled exercise') AS name,
        exercise.notation,
        exercise.notation_format AS "notationFormat",
        exercise.visibility::text,
        COALESCE(identity.email, 'Musician #' || exercise.musician_id) AS owner,
        source.name AS "copiedFrom"
      FROM exercise
      LEFT JOIN auth_identity identity ON identity.musician_id = exercise.musician_id
      LEFT JOIN exercise source ON source.id = exercise.copied_from_exercise_id
      WHERE exercise.deleted_at IS NULL
      ORDER BY exercise.created_at, exercise.id
    `)

    return result.rows
  },
)

export const getExerciseDetail = createServerFn({ method: 'GET' })
  .validator((exerciseId: string) => {
    if (!/^\d+$/.test(exerciseId)) {
      throw new Error('Exercise ID must be a positive integer')
    }

    return exerciseId
  })
  .handler(async ({ data: exerciseId }): Promise<ExerciseDetail | null> => {
    const [exerciseResult, adaptationsResult, sessionsResult] = await Promise.all([
      pool.query<{
        id: string
        name: string
        notation: string | null
        notationFormat: string
        visibility: string
        owner: string
        createdAt: Date
        copiedFromId: string | null
        copiedFromName: string | null
      }>(
        `
          SELECT
            exercise.id::text,
            COALESCE(exercise.name, 'Untitled exercise') AS name,
            exercise.notation,
            exercise.notation_format AS "notationFormat",
            exercise.visibility::text,
            COALESCE(identity.email, 'Musician #' || exercise.musician_id) AS owner,
            exercise.created_at AS "createdAt",
            source.id::text AS "copiedFromId",
            source.name AS "copiedFromName"
          FROM exercise
          LEFT JOIN LATERAL (
            SELECT email
            FROM auth_identity
            WHERE musician_id = exercise.musician_id
            ORDER BY id
            LIMIT 1
          ) identity ON TRUE
          LEFT JOIN exercise source ON source.id = exercise.copied_from_exercise_id
          WHERE exercise.id = $1 AND exercise.deleted_at IS NULL
        `,
        [exerciseId],
      ),
      pool.query<{ id: string; name: string }>(
        `
          SELECT id::text, COALESCE(name, 'Untitled exercise') AS name
          FROM exercise
          WHERE copied_from_exercise_id = $1 AND deleted_at IS NULL
          ORDER BY created_at, id
        `,
        [exerciseId],
      ),
      pool.query<{
        id: string
        templateName: string
        status: string
        startedAt: Date | null
      }>(
        `
          SELECT DISTINCT
            session.id::text,
            COALESCE(template.name, 'Open practice') AS "templateName",
            session.status::text,
            session.started_at AS "startedAt"
          FROM session_item item
          JOIN session ON session.id = item.session_id
          LEFT JOIN session_template template ON template.id = session.session_template_id
          WHERE item.exercise_id = $1
          ORDER BY session.started_at DESC NULLS LAST
        `,
        [exerciseId],
      ),
    ])

    const exercise = exerciseResult.rows[0]
    if (!exercise) return null

    return {
      id: exercise.id,
      name: exercise.name,
      notation: exercise.notation,
      notationFormat: exercise.notationFormat,
      visibility: exercise.visibility,
      owner: exercise.owner,
      createdAt: exercise.createdAt.toISOString(),
      copiedFrom:
        exercise.copiedFromId && exercise.copiedFromName
          ? { id: exercise.copiedFromId, name: exercise.copiedFromName }
          : null,
      adaptations: adaptationsResult.rows,
      sessions: sessionsResult.rows.map((session) => ({
        ...session,
        startedAt: toIsoString(session.startedAt),
      })),
    }
  })
