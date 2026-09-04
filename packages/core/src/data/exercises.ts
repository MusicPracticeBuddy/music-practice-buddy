import { createServerFn } from '@tanstack/solid-start';
import { resourceAccess, type ResourceAccess, type Visibility } from '@/auth/authorization';
import { authMiddleware } from '@/auth/middleware';
import { pool, toIsoString } from '@/data/db';
import { isExerciseNotationFormat, type ExerciseNotationFormat } from '@/domain/exercise';

export type ExerciseRow = {
  id: string;
  name: string;
  notation: string | null;
  notationFormat: ExerciseNotationFormat;
  visibility: string;
  owner: string;
  ownerId: string;
  copiedFrom: string | null;
  instrumentId: string | null;
  instrumentName: string | null;
} & ResourceAccess;

export type ExerciseLibraryPage = {
  items: ExerciseRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ExerciseLibrarySearchInput = {
  query: string;
  visibility: 'ALL' | Visibility;
  hasNotation: boolean;
  instrumentIds: string[];
  page: number;
};

export type ExerciseCatalogRow = {
  id: string;
  name: string;
  notation: string | null;
  notationFormat: ExerciseNotationFormat;
  visibility: Visibility;
  owner: string;
  copiedFrom: string | null;
  instrumentId: string | null;
  instrumentName: string | null;
  inLibrary: boolean;
};

export type ExerciseCatalogSearchInput = {
  query: string;
  hasNotation: boolean;
  instrumentIds: string[];
  page: number;
};

export type ExerciseCatalogPage = {
  items: ExerciseCatalogRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type OwnedExerciseRow = {
  id: string;
  name: string;
  notation: string | null;
  notationFormat: ExerciseNotationFormat;
  visibility: Visibility;
  instrumentId: string | null;
  instrumentName: string | null;
  copiedFrom: string | null;
  inLibrary: boolean;
};

export type OwnedExercisePage = {
  items: OwnedExerciseRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const EXERCISE_LIBRARY_PAGE_SIZE = 20;
export const EXERCISE_CATALOG_PAGE_SIZE = 25;

export const EMPTY_EXERCISE_LIBRARY_SEARCH: ExerciseLibrarySearchInput = {
  query: '',
  visibility: 'ALL',
  hasNotation: false,
  instrumentIds: [],
  page: 1,
};

export const EMPTY_EXERCISE_CATALOG_SEARCH: ExerciseCatalogSearchInput = {
  query: '',
  hasNotation: false,
  instrumentIds: [],
  page: 1,
};

type ExerciseDetail = {
  id: string;
  name: string;
  notation: string | null;
  notationFormat: ExerciseNotationFormat;
  visibility: string;
  owner: string;
  ownerId: string;
  instrumentId: string | null;
  instrumentName: string | null;
  inLibrary: boolean;
  createdAt: string;
  copiedFrom: { id: string; name: string } | null;
  adaptations: { id: string; name: string }[];
  sessions: {
    id: string;
    templateName: string;
    status: string;
    startedAt: string | null;
  }[];
} & ResourceAccess;

export type ExerciseInput = {
  name: string;
  notation: string;
  notationFormat: ExerciseNotationFormat;
  visibility: Visibility;
  instrumentId?: string | null;
};

type UpdateExerciseInput = ExerciseInput & { id: string };

function validateExercise(input: ExerciseInput): ExerciseInput {
  const name = input.name.trim();
  const notation = input.notation.trim();
  const notationFormat = input.notationFormat.trim();
  if (!name) throw new Error('Exercise name is required');
  if (name.length > 200) throw new Error('Exercise name must be 200 characters or fewer');
  if (!isExerciseNotationFormat(notationFormat)) throw new Error('Invalid notation format');
  if (input.visibility !== 'PRIVATE' && input.visibility !== 'PUBLIC') {
    throw new Error('Invalid exercise visibility');
  }
  if (input.instrumentId != null && !/^\d+$/.test(input.instrumentId)) {
    throw new Error('Invalid instrument');
  }
  return {
    name,
    notation,
    notationFormat,
    visibility: input.visibility,
    instrumentId: input.instrumentId ?? null,
  };
}

function validateInstrumentIds(instrumentIds: string[]) {
  const uniqueIds = [...new Set(instrumentIds)];
  if (uniqueIds.length > 50 || uniqueIds.some((id) => !/^\d+$/.test(id))) {
    throw new Error('Invalid instrument filter');
  }
  return uniqueIds;
}

function catalogSubstringPattern(value: string) {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
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
        source.name AS "copiedFrom",
        exercise.instrument_id::text AS "instrumentId",
        instrument.name AS "instrumentName"
      FROM exercise
      JOIN musician_exercise_library library
        ON library.exercise_id = exercise.id AND library.musician_id = $1
      JOIN musician ON musician.id = exercise.musician_id
      LEFT JOIN instrument ON instrument.id = exercise.instrument_id
      LEFT JOIN exercise source ON source.id = exercise.copied_from_exercise_id
        AND (source.musician_id = $1 OR source.visibility = 'PUBLIC')
        AND source.deleted_at IS NULL
      WHERE exercise.deleted_at IS NULL
        AND (exercise.musician_id = $1 OR exercise.visibility = 'PUBLIC')
      ORDER BY exercise.created_at, exercise.id
    `,
      [context.user.musicianId],
    );

    return result.rows.map((exercise) => ({
      ...exercise,
      ...resourceAccess(context.user, exercise.ownerId, exercise.visibility),
    }));
  });

export const getExerciseLibraryPage = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((input: ExerciseLibrarySearchInput) => {
    const query = input.query.trim();
    if (query.length > 200) throw new Error('Search text is too long');
    if (
      input.visibility !== 'ALL' &&
      input.visibility !== 'PRIVATE' &&
      input.visibility !== 'PUBLIC'
    ) {
      throw new Error('Invalid visibility filter');
    }
    if (typeof input.hasNotation !== 'boolean') throw new Error('Invalid notation filter');
    if (!Number.isInteger(input.page) || input.page < 1) throw new Error('Invalid page');
    return { ...input, query, instrumentIds: validateInstrumentIds(input.instrumentIds) };
  })

  .handler(async ({ data, context }): Promise<ExerciseLibraryPage> => {
    const parameters: unknown[] = [context.user.musicianId];
    const conditions = [
      `exercise.deleted_at IS NULL`,
      `(exercise.musician_id = $1 OR exercise.visibility = 'PUBLIC')`,
    ];
    const parameter = (value: unknown) => {
      parameters.push(value);
      return `$${parameters.length}`;
    };
    if (data.query) {
      const substring = parameter(catalogSubstringPattern(data.query));
      const fuzzyValue = data.query.length >= 4 ? parameter(data.query) : null;
      conditions.push(`(
        exercise.name ILIKE ${substring} ESCAPE '\\'
        ${fuzzyValue ? `OR CAST(${fuzzyValue} AS text) <<% CAST(exercise.name AS text)` : ''}
      )`);
    }
    if (data.visibility !== 'ALL') {
      conditions.push(`exercise.visibility = ${parameter(data.visibility)}::visibility_type`);
    }
    if (data.hasNotation) conditions.push(`exercise.notation_format <> 'text'`);
    if (data.instrumentIds.length > 0) {
      conditions.push(`exercise.instrument_id = ANY(${parameter(data.instrumentIds)}::bigint[])`);
    }
    const where = conditions.join('\n           AND ');
    const countParameters = [...parameters];
    const limit = parameter(EXERCISE_LIBRARY_PAGE_SIZE);
    const offset = parameter((data.page - 1) * EXERCISE_LIBRARY_PAGE_SIZE);
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
           ,exercise.instrument_id::text AS "instrumentId"
           ,instrument.name AS "instrumentName"
         FROM exercise
         JOIN musician_exercise_library library
           ON library.exercise_id = exercise.id AND library.musician_id = $1
         JOIN musician ON musician.id = exercise.musician_id
         LEFT JOIN instrument ON instrument.id = exercise.instrument_id
         LEFT JOIN exercise source ON source.id = exercise.copied_from_exercise_id
           AND (source.musician_id = $1 OR source.visibility = 'PUBLIC')
           AND source.deleted_at IS NULL
         WHERE ${where}
         ORDER BY exercise.created_at, exercise.id
         LIMIT ${limit} OFFSET ${offset}`,
        parameters,
      ),
    ]);
    const total = countResult.rows[0]?.total ?? 0;

    return {
      items: result.rows.map((exercise) => ({
        ...exercise,
        ...resourceAccess(context.user, exercise.ownerId, exercise.visibility),
      })),
      page: data.page,
      pageSize: EXERCISE_LIBRARY_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / EXERCISE_LIBRARY_PAGE_SIZE),
    };
  });

export const getPublicExerciseCatalogPage = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((input: ExerciseCatalogSearchInput) => {
    const query = input.query.trim();
    if (query.length > 200) throw new Error('Search text is too long');
    if (typeof input.hasNotation !== 'boolean') throw new Error('Invalid notation filter');
    if (!Number.isInteger(input.page) || input.page < 1) throw new Error('Invalid page');
    return { ...input, query, instrumentIds: validateInstrumentIds(input.instrumentIds) };
  })
  .handler(async ({ data, context }): Promise<ExerciseCatalogPage> => {
    const parameters: unknown[] = [];
    const conditions = [`exercise.visibility = 'PUBLIC'`, `exercise.deleted_at IS NULL`];
    const parameter = (value: unknown) => {
      parameters.push(value);
      return `$${parameters.length}`;
    };
    if (data.query) {
      const substring = parameter(catalogSubstringPattern(data.query));
      const fuzzyValue = data.query.length >= 4 ? parameter(data.query) : null;
      conditions.push(`(
        exercise.name ILIKE ${substring} ESCAPE '\\'
        ${fuzzyValue ? `OR CAST(${fuzzyValue} AS text) <<% CAST(exercise.name AS text)` : ''}
      )`);
    }
    if (data.hasNotation) conditions.push(`exercise.notation_format <> 'text'`);
    if (data.instrumentIds.length > 0) {
      conditions.push(`exercise.instrument_id = ANY(${parameter(data.instrumentIds)}::bigint[])`);
    }
    const where = conditions.join('\n           AND ');
    const countParameters = [...parameters];
    const musicianId = parameter(context.user.musicianId);
    const limit = parameter(EXERCISE_CATALOG_PAGE_SIZE);
    const offset = parameter((data.page - 1) * EXERCISE_CATALOG_PAGE_SIZE);
    const [countResult, result] = await Promise.all([
      pool.query<{ total: number }>(
        `SELECT count(*)::integer AS total FROM exercise WHERE ${where}`,
        countParameters,
      ),
      pool.query<ExerciseCatalogRow>(
        `SELECT
           exercise.id::text,
           COALESCE(exercise.name, 'Untitled exercise') AS name,
           exercise.notation,
           exercise.notation_format AS "notationFormat",
           exercise.visibility::text,
           musician.display_name AS owner,
           source.name AS "copiedFrom",
           exercise.instrument_id::text AS "instrumentId",
           instrument.name AS "instrumentName",
           EXISTS (
             SELECT 1 FROM musician_exercise_library library
             WHERE library.exercise_id = exercise.id AND library.musician_id = ${musicianId}
           ) AS "inLibrary"
         FROM exercise
         JOIN musician ON musician.id = exercise.musician_id
         LEFT JOIN instrument ON instrument.id = exercise.instrument_id
         LEFT JOIN exercise source ON source.id = exercise.copied_from_exercise_id
           AND source.deleted_at IS NULL
           AND (source.visibility = 'PUBLIC' OR source.musician_id = ${musicianId})
         WHERE ${where}
         ORDER BY lower(exercise.name), exercise.id
         LIMIT ${limit} OFFSET ${offset}`,
        parameters,
      ),
    ]);
    const total = countResult.rows[0]?.total ?? 0;
    return {
      items: result.rows,
      page: data.page,
      pageSize: EXERCISE_CATALOG_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / EXERCISE_CATALOG_PAGE_SIZE),
    };
  });

export const addExerciseToLibrary = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((exerciseId: string) => {
    if (!/^\d+$/.test(exerciseId)) throw new Error('Invalid exercise');
    return exerciseId;
  })
  .handler(async ({ data: exerciseId, context }): Promise<{ id: string }> => {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO musician_exercise_library (musician_id, exercise_id)
       SELECT $1, exercise.id
       FROM exercise
       WHERE exercise.id = $2
         AND (exercise.musician_id = $1 OR exercise.visibility = 'PUBLIC')
         AND exercise.deleted_at IS NULL
       ON CONFLICT (musician_id, exercise_id) DO UPDATE
         SET musician_id = EXCLUDED.musician_id
       RETURNING exercise_id::text AS id`,
      [context.user.musicianId, exerciseId],
    );
    const exercise = result.rows[0];
    if (!exercise) throw new Error('Exercise not found');
    return exercise;
  });

export const removeExerciseFromLibrary = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((exerciseId: string) => {
    if (!/^\d+$/.test(exerciseId)) throw new Error('Invalid exercise');
    return exerciseId;
  })
  .handler(async ({ data: exerciseId, context }): Promise<{ id: string }> => {
    const result = await pool.query<{ id: string }>(
      `DELETE FROM musician_exercise_library
       WHERE musician_id = $1 AND exercise_id = $2
       RETURNING exercise_id::text AS id`,
      [context.user.musicianId, exerciseId],
    );
    const exercise = result.rows[0];
    if (!exercise) throw new Error('Exercise is not in My Library');
    return exercise;
  });

export const getOwnedExercisePage = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((page: number) => {
    if (!Number.isInteger(page) || page < 1) throw new Error('Invalid page');
    return page;
  })
  .handler(async ({ data: page, context }): Promise<OwnedExercisePage> => {
    const offset = (page - 1) * EXERCISE_CATALOG_PAGE_SIZE;
    const [countResult, result] = await Promise.all([
      pool.query<{ total: number }>(
        `SELECT count(*)::integer AS total
         FROM exercise
         WHERE musician_id = $1 AND deleted_at IS NULL`,
        [context.user.musicianId],
      ),
      pool.query<OwnedExerciseRow>(
        `SELECT
           exercise.id::text,
           COALESCE(exercise.name, 'Untitled exercise') AS name,
           exercise.notation,
           exercise.notation_format AS "notationFormat",
           exercise.visibility::text,
           exercise.instrument_id::text AS "instrumentId",
           instrument.name AS "instrumentName",
           source.name AS "copiedFrom",
           EXISTS (
             SELECT 1 FROM musician_exercise_library library
             WHERE library.exercise_id = exercise.id AND library.musician_id = $1
           ) AS "inLibrary"
         FROM exercise
         LEFT JOIN instrument ON instrument.id = exercise.instrument_id
         LEFT JOIN exercise source ON source.id = exercise.copied_from_exercise_id
           AND source.deleted_at IS NULL
           AND (source.musician_id = $1 OR source.visibility = 'PUBLIC')
         WHERE exercise.musician_id = $1 AND exercise.deleted_at IS NULL
         ORDER BY lower(exercise.name), exercise.id
         LIMIT $2 OFFSET $3`,
        [context.user.musicianId, EXERCISE_CATALOG_PAGE_SIZE, offset],
      ),
    ]);
    const total = countResult.rows[0]?.total ?? 0;
    return {
      items: result.rows,
      page,
      pageSize: EXERCISE_CATALOG_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / EXERCISE_CATALOG_PAGE_SIZE),
    };
  });

export const getExerciseDetail = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((exerciseId: string) => {
    if (!/^\d+$/.test(exerciseId)) {
      throw new Error('Exercise ID must be a positive integer');
    }

    return exerciseId;
  })
  .handler(async ({ data: exerciseId, context }): Promise<ExerciseDetail | null> => {
    const [exerciseResult, adaptationsResult, sessionsResult] = await Promise.all([
      pool.query<{
        id: string;
        name: string;
        notation: string | null;
        notationFormat: ExerciseNotationFormat;
        visibility: string;
        owner: string;
        ownerId: string;
        createdAt: Date;
        copiedFromId: string | null;
        copiedFromName: string | null;
        instrumentId: string | null;
        instrumentName: string | null;
        inLibrary: boolean;
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
            ,exercise.instrument_id::text AS "instrumentId"
            ,instrument.name AS "instrumentName"
            ,EXISTS (
              SELECT 1 FROM musician_exercise_library library
              WHERE library.exercise_id = exercise.id AND library.musician_id = $2
            ) AS "inLibrary"
          FROM exercise
          JOIN musician ON musician.id = exercise.musician_id
          LEFT JOIN instrument ON instrument.id = exercise.instrument_id
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
        id: string;
        templateName: string;
        status: string;
        startedAt: Date | null;
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
    ]);

    const exercise = exerciseResult.rows[0];
    if (!exercise) return null;

    return {
      id: exercise.id,
      name: exercise.name,
      notation: exercise.notation,
      notationFormat: exercise.notationFormat,
      visibility: exercise.visibility,
      owner: exercise.owner,
      ownerId: exercise.ownerId,
      instrumentId: exercise.instrumentId,
      instrumentName: exercise.instrumentName,
      inLibrary: exercise.inLibrary,
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
    };
  });

export const createExercise = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(validateExercise)
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string }>(
        `INSERT INTO exercise (musician_id, name, notation, notation_format, visibility, instrument_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id::text`,
        [
          context.user.musicianId,
          data.name,
          data.notation || null,
          data.notationFormat,
          data.visibility,
          data.instrumentId,
        ],
      );
      const exercise = result.rows[0];
      if (!exercise) throw new Error('Exercise could not be created');
      await client.query(
        `INSERT INTO musician_exercise_library (musician_id, exercise_id)
         VALUES ($1, $2)`,
        [context.user.musicianId, exercise.id],
      );
      await client.query('COMMIT');
      return exercise;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

export const updateExercise = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: UpdateExerciseInput) => {
    if (!/^\d+$/.test(input.id)) throw new Error('Invalid exercise');
    return { id: input.id, ...validateExercise(input) };
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const result = await pool.query<{ id: string }>(
      `UPDATE exercise
       SET name = $1, notation = $2, notation_format = $3, visibility = $4, instrument_id = $5
       WHERE id = $6 AND musician_id = $7 AND deleted_at IS NULL
       RETURNING id::text`,
      [
        data.name,
        data.notation || null,
        data.notationFormat,
        data.visibility,
        data.instrumentId,
        data.id,
        context.user.musicianId,
      ],
    );
    const exercise = result.rows[0];
    if (!exercise) throw new Error('Exercise not found');
    return exercise;
  });

export const deleteExercise = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((exerciseId: string) => {
    if (!/^\d+$/.test(exerciseId)) throw new Error('Invalid exercise');
    return exerciseId;
  })
  .handler(async ({ data: exerciseId, context }): Promise<{ id: string }> => {
    const result = await pool.query<{ id: string }>(
      `UPDATE exercise SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND musician_id = $2 AND deleted_at IS NULL
       RETURNING id::text`,
      [exerciseId, context.user.musicianId],
    );
    const exercise = result.rows[0];
    if (!exercise) throw new Error('Exercise not found');
    return exercise;
  });
