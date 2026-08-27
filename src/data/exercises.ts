import { createServerFn } from '@tanstack/solid-start'
import { resourceAccess, type ResourceAccess, type Visibility } from '@/auth/authorization'
import { authMiddleware } from '@/auth/middleware'
import { pool, toIsoString } from '@/data/db'

type ExerciseRow = {
  id: string
  name: string
  notation: string | null
  notationFormat: string
  visibility: string
  owner: string
  ownerId: string
  copiedFrom: string | null
} & ResourceAccess

type ExerciseDetail = {
  id: string
  name: string
  notation: string | null
  notationFormat: string
  visibility: string
  owner: string
  ownerId: string
  createdAt: string
  copiedFrom: { id: string; name: string } | null
  adaptations: { id: string; name: string }[]
  sessions: {
    id: string
    templateName: string
    status: string
    startedAt: string | null
  }[]
} & ResourceAccess

export const getExercises = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ExerciseRow[]> => {
    const result = await pool.query<
      Omit<ExerciseRow, keyof ResourceAccess> & { visibility: Visibility }
    >(
      `
      SELECT
        exercise.id::text,
        COALESCE(exercise.name, 'Untitled exercise') AS name,
        exercise.notation,
        exercise.notation_format AS "notationFormat",
        exercise.visibility::text,
        musician.display_name AS owner,
        exercise.musician_id::text AS "ownerId",
        source.name AS "copiedFrom"
      FROM exercise
      JOIN musician ON musician.id = exercise.musician_id
      LEFT JOIN exercise source ON source.id = exercise.copied_from_exercise_id
        AND (source.musician_id = $1 OR source.visibility = 'PUBLIC')
        AND source.deleted_at IS NULL
      WHERE exercise.deleted_at IS NULL
        AND (exercise.musician_id = $1 OR exercise.visibility = 'PUBLIC')
      ORDER BY exercise.created_at, exercise.id
    `,
      [context.user.musicianId],
    )

    return result.rows.map((exercise) => ({
      ...exercise,
      ...resourceAccess(context.user, exercise.ownerId, exercise.visibility),
    }))
  })

export const getExerciseDetail = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((exerciseId: string) => {
    if (!/^\d+$/.test(exerciseId)) {
      throw new Error('Exercise ID must be a positive integer')
    }

    return exerciseId
  })
  .handler(async ({ data: exerciseId, context }): Promise<ExerciseDetail | null> => {
    const [exerciseResult, adaptationsResult, sessionsResult] = await Promise.all([
      pool.query<{
        id: string
        name: string
        notation: string | null
        notationFormat: string
        visibility: string
        owner: string
        ownerId: string
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
            musician.display_name AS owner,
            exercise.musician_id::text AS "ownerId",
            exercise.created_at AS "createdAt",
            source.id::text AS "copiedFromId",
            source.name AS "copiedFromName"
          FROM exercise
          JOIN musician ON musician.id = exercise.musician_id
          LEFT JOIN exercise source ON source.id = exercise.copied_from_exercise_id
            AND (source.musician_id = $2 OR source.visibility = 'PUBLIC')
            AND source.deleted_at IS NULL
          WHERE exercise.id = $1 AND exercise.deleted_at IS NULL
            AND (exercise.musician_id = $2 OR exercise.visibility = 'PUBLIC')
        `,
        [exerciseId, context.user.musicianId],
      ),
      pool.query<{ id: string; name: string }>(
        `
          SELECT id::text, COALESCE(name, 'Untitled exercise') AS name
          FROM exercise
          WHERE copied_from_exercise_id = $1 AND deleted_at IS NULL
            AND (musician_id = $2 OR visibility = 'PUBLIC')
          ORDER BY created_at, id
        `,
        [exerciseId, context.user.musicianId],
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
          WHERE item.exercise_id = $1 AND session.musician_id = $2
          ORDER BY session.started_at DESC NULLS LAST
        `,
        [exerciseId, context.user.musicianId],
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
      ownerId: exercise.ownerId,
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
      ...resourceAccess(context.user, exercise.ownerId, exercise.visibility as Visibility),
    }
  })
