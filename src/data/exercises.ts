import { createServerFn } from '@tanstack/solid-start'
import { resourceAccess, type ResourceAccess, type Visibility } from '@/auth/authorization'
import { authMiddleware } from '@/auth/middleware'
import { pool, toIsoString } from '@/data/db'
import { isExerciseNotationFormat, type ExerciseNotationFormat } from '@/domain/exercise'

export type ExerciseRow = {
  id: string
  name: string
  notation: string | null
  notationFormat: ExerciseNotationFormat
  visibility: string
  owner: string
  ownerId: string
  copiedFrom: string | null
} & ResourceAccess

export type ExerciseLibraryPage = {
  items: ExerciseRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type ExerciseLibrarySearchInput = {
  query: string
  visibility: 'ALL' | Visibility
  notationFormat: 'ALL' | ExerciseNotationFormat
  page: number
}

export const EXERCISE_LIBRARY_PAGE_SIZE = 20

export const EMPTY_EXERCISE_LIBRARY_SEARCH: ExerciseLibrarySearchInput = {
  query: '',
  visibility: 'ALL',
  notationFormat: 'ALL',
  page: 1,
}

type ExerciseDetail = {
  id: string
  name: string
  notation: string | null
  notationFormat: ExerciseNotationFormat
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

export type ExerciseInput = {
  name: string
  notation: string
  notationFormat: ExerciseNotationFormat
  visibility: Visibility
}

type UpdateExerciseInput = ExerciseInput & { id: string }

function validateExercise(input: ExerciseInput): ExerciseInput {
  const name = input.name.trim()
  const notation = input.notation.trim()
  const notationFormat = input.notationFormat.trim()
  if (!name) throw new Error('Exercise name is required')
  if (name.length > 200) throw new Error('Exercise name must be 200 characters or fewer')
  if (!isExerciseNotationFormat(notationFormat)) throw new Error('Invalid notation format')
  if (input.visibility !== 'PRIVATE' && input.visibility !== 'PUBLIC') {
    throw new Error('Invalid exercise visibility')
  }
  return { name, notation, notationFormat, visibility: input.visibility }
}

function catalogSubstringPattern(value: string) {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

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
      JOIN musician_exercise_library library
        ON library.exercise_id = exercise.id AND library.musician_id = $1
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

export const getExerciseLibraryPage = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((input: ExerciseLibrarySearchInput) => {
    const query = input.query.trim()
    if (query.length > 200) throw new Error('Search text is too long')
    if (
      input.visibility !== 'ALL' &&
      input.visibility !== 'PRIVATE' &&
      input.visibility !== 'PUBLIC'
    ) {
      throw new Error('Invalid visibility filter')
    }
    if (input.notationFormat !== 'ALL' && !isExerciseNotationFormat(input.notationFormat)) {
      throw new Error('Invalid notation format filter')
    }
    if (!Number.isInteger(input.page) || input.page < 1) throw new Error('Invalid page')
    return { ...input, query }
  })
  .handler(async ({ data, context }): Promise<ExerciseLibraryPage> => {
    const parameters: unknown[] = [context.user.musicianId]
    const conditions = [
      `exercise.deleted_at IS NULL`,
      `(exercise.musician_id = $1 OR exercise.visibility = 'PUBLIC')`,
    ]
    const parameter = (value: unknown) => {
      parameters.push(value)
      return `$${parameters.length}`
    }
    if (data.query) {
      const substring = parameter(catalogSubstringPattern(data.query))
      const fuzzyValue = data.query.length >= 4 ? parameter(data.query) : null
      conditions.push(`(
        exercise.name ILIKE ${substring} ESCAPE '\\'
        ${fuzzyValue ? `OR CAST(${fuzzyValue} AS text) <<% CAST(exercise.name AS text)` : ''}
      )`)
    }
    if (data.visibility !== 'ALL') {
      conditions.push(`exercise.visibility = ${parameter(data.visibility)}::visibility_type`)
    }
    if (data.notationFormat !== 'ALL') {
      conditions.push(`exercise.notation_format = ${parameter(data.notationFormat)}`)
    }
    const where = conditions.join('\n           AND ')
    const countParameters = [...parameters]
    const limit = parameter(EXERCISE_LIBRARY_PAGE_SIZE)
    const offset = parameter((data.page - 1) * EXERCISE_LIBRARY_PAGE_SIZE)
    const [countResult, result] = await Promise.all([
      pool.query<{ total: number }>(
        `SELECT count(*)::integer AS total
         FROM exercise
         JOIN musician_exercise_library library
           ON library.exercise_id = exercise.id AND library.musician_id = $1
         WHERE ${where}`,
        countParameters,
      ),
      pool.query<Omit<ExerciseRow, keyof ResourceAccess> & { visibility: Visibility }>(
        `SELECT
           exercise.id::text,
           COALESCE(exercise.name, 'Untitled exercise') AS name,
           exercise.notation,
           exercise.notation_format AS "notationFormat",
           exercise.visibility::text,
           musician.display_name AS owner,
           exercise.musician_id::text AS "ownerId",
           source.name AS "copiedFrom"
         FROM exercise
         JOIN musician_exercise_library library
           ON library.exercise_id = exercise.id AND library.musician_id = $1
         JOIN musician ON musician.id = exercise.musician_id
         LEFT JOIN exercise source ON source.id = exercise.copied_from_exercise_id
           AND (source.musician_id = $1 OR source.visibility = 'PUBLIC')
           AND source.deleted_at IS NULL
         WHERE ${where}
         ORDER BY exercise.created_at, exercise.id
         LIMIT ${limit} OFFSET ${offset}`,
        parameters,
      ),
    ])
    const total = countResult.rows[0]?.total ?? 0

    return {
      items: result.rows.map((exercise) => ({
        ...exercise,
        ...resourceAccess(context.user, exercise.ownerId, exercise.visibility),
      })),
      page: data.page,
      pageSize: EXERCISE_LIBRARY_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / EXERCISE_LIBRARY_PAGE_SIZE),
    }
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
        notationFormat: ExerciseNotationFormat
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

export const createExercise = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(validateExercise)
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<{ id: string }>(
        `INSERT INTO exercise (musician_id, name, notation, notation_format, visibility)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id::text`,
        [
          context.user.musicianId,
          data.name,
          data.notation || null,
          data.notationFormat,
          data.visibility,
        ],
      )
      const exercise = result.rows[0]
      if (!exercise) throw new Error('Exercise could not be created')
      await client.query(
        `INSERT INTO musician_exercise_library (musician_id, exercise_id)
         VALUES ($1, $2)`,
        [context.user.musicianId, exercise.id],
      )
      await client.query('COMMIT')
      return exercise
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })

export const updateExercise = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: UpdateExerciseInput) => {
    if (!/^\d+$/.test(input.id)) throw new Error('Invalid exercise')
    return { id: input.id, ...validateExercise(input) }
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const result = await pool.query<{ id: string }>(
      `UPDATE exercise
       SET name = $1, notation = $2, notation_format = $3, visibility = $4
       WHERE id = $5 AND musician_id = $6 AND deleted_at IS NULL
       RETURNING id::text`,
      [
        data.name,
        data.notation || null,
        data.notationFormat,
        data.visibility,
        data.id,
        context.user.musicianId,
      ],
    )
    const exercise = result.rows[0]
    if (!exercise) throw new Error('Exercise not found')
    return exercise
  })

export const deleteExercise = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((exerciseId: string) => {
    if (!/^\d+$/.test(exerciseId)) throw new Error('Invalid exercise')
    return exerciseId
  })
  .handler(async ({ data: exerciseId, context }): Promise<{ id: string }> => {
    const result = await pool.query<{ id: string }>(
      `UPDATE exercise SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND musician_id = $2 AND deleted_at IS NULL
       RETURNING id::text`,
      [exerciseId, context.user.musicianId],
    )
    const exercise = result.rows[0]
    if (!exercise) throw new Error('Exercise not found')
    return exercise
  })
