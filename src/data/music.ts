import { Pool } from 'pg'
import { createServerFn } from '@tanstack/solid-start'

const pool = new Pool({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 5,
})

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

type RepertoireRow = {
  id: string
  title: string
  parentTitle: string | null
  measureRange: string | null
  visibility: string
  status: string
  composer: string
  instrument: string | null
  resourceType: string | null
  resourceUrl: string | null
  libraryNotes: string | null
}

type ExerciseRow = {
  id: string
  name: string
  notation: string | null
  notationFormat: string
  visibility: string
  owner: string
  copiedFrom: string | null
}

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

export type SessionDetail = {
  id: string
  templateName: string
  status: string
  assignedAt: string | null
  startedAt: string | null
  endedAt: string | null
  durationMinutes: number | null
  items: SessionDetailItem[]
}

export type ExerciseDetail = {
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

export type RepertoireDetail = {
  id: string
  title: string
  visibility: string
  status: string
  startMeasure: number | null
  endMeasure: number | null
  owner: string | null
  createdAt: string
  parent: { id: string; title: string } | null
  credits: { person: string; role: string; biographyLink: string | null }[]
  instruments: { name: string; family: string; role: string; partName: string | null }[]
  resources: { id: string; type: string; url: string }[]
  libraryEntries: { acquiredOn: string | null; notes: string | null }[]
  excerpts: { id: string; title: string; startMeasure: number | null; endMeasure: number | null }[]
  sessions: {
    id: string
    templateName: string
    status: string
    startedAt: string | null
  }[]
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null
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
            assignedAt: iso(next.assigned_at),
          }
        : null,
    }
  },
)

export const getRepertoire = createServerFn({ method: 'GET' }).handler(
  async (): Promise<RepertoireRow[]> => {
    const result = await pool.query<RepertoireRow>(`
      SELECT
        r.id::text,
        r.title,
        parent.title AS "parentTitle",
        CASE
          WHEN r.start_measure IS NOT NULL THEN
            'Measures ' || r.start_measure || COALESCE('–' || r.end_measure, '')
          ELSE NULL
        END AS "measureRange",
        r.visibility::text,
        r.status::text,
        COALESCE(string_agg(DISTINCT p.name, ', '), 'Unknown composer') AS composer,
        string_agg(DISTINCT i.name, ', ') AS instrument,
        resource.type::text AS "resourceType",
        resource.url AS "resourceUrl",
        library.notes AS "libraryNotes"
      FROM repertoire r
      LEFT JOIN repertoire parent ON parent.id = r.parent_repertoire_id
      LEFT JOIN repertoire_credit credit ON credit.repertoire_id = r.id AND credit.role = 'COMPOSER'
      LEFT JOIN person p ON p.id = credit.person_id
      LEFT JOIN repertoire_instrument ri ON ri.repertoire_id = r.id
      LEFT JOIN instrument i ON i.id = ri.instrument_id
      LEFT JOIN LATERAL (
        SELECT rr.type, rr.url
        FROM repertoire_resource rr
        WHERE rr.repertoire_id = r.id
        ORDER BY rr.position NULLS LAST, rr.id
        LIMIT 1
      ) resource ON TRUE
      LEFT JOIN musician_repertoire_library library ON library.repertoire_id = r.id
      GROUP BY r.id, parent.title, resource.type, resource.url, library.notes
      ORDER BY r.parent_repertoire_id NULLS FIRST, r.title
    `)

    return result.rows
  },
)

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
      assignedAt: iso(row.assignedAt),
      startedAt: iso(row.startedAt),
      endedAt: iso(row.endedAt),
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
      assignedAt: iso(session.assignedAt),
      startedAt: iso(session.startedAt),
      endedAt: iso(session.endedAt),
      items: itemResult.rows.map((item) => ({
        ...item,
        startedAt: iso(item.startedAt),
        endedAt: iso(item.endedAt),
      })),
    }
  })

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
        startedAt: iso(session.startedAt),
      })),
    }
  })

export const getRepertoireDetail = createServerFn({ method: 'GET' })
  .validator((repertoireId: string) => {
    if (!/^\d+$/.test(repertoireId)) {
      throw new Error('Repertoire ID must be a positive integer')
    }

    return repertoireId
  })
  .handler(async ({ data: repertoireId }): Promise<RepertoireDetail | null> => {
    const [
      repertoireResult,
      creditsResult,
      instrumentsResult,
      resourcesResult,
      libraryResult,
      excerptsResult,
      sessionsResult,
    ] = await Promise.all([
      pool.query<{
        id: string
        title: string
        visibility: string
        status: string
        startMeasure: number | null
        endMeasure: number | null
        owner: string | null
        createdAt: Date
        parentId: string | null
        parentTitle: string | null
      }>(
        `
          SELECT
            repertoire.id::text,
            repertoire.title,
            repertoire.visibility::text,
            repertoire.status::text,
            repertoire.start_measure AS "startMeasure",
            repertoire.end_measure AS "endMeasure",
            identity.email AS owner,
            repertoire.created_at AS "createdAt",
            parent.id::text AS "parentId",
            parent.title AS "parentTitle"
          FROM repertoire
          LEFT JOIN repertoire parent ON parent.id = repertoire.parent_repertoire_id
          LEFT JOIN LATERAL (
            SELECT email
            FROM auth_identity
            WHERE musician_id = repertoire.owner_musician_id
            ORDER BY id
            LIMIT 1
          ) identity ON TRUE
          WHERE repertoire.id = $1
        `,
        [repertoireId],
      ),
      pool.query<{ person: string; role: string; biographyLink: string | null }>(
        `
          SELECT person.name AS person, credit.role::text, person.biography_link AS "biographyLink"
          FROM repertoire_credit credit
          JOIN person ON person.id = credit.person_id
          WHERE credit.repertoire_id = $1
          ORDER BY credit.position NULLS LAST, person.name
        `,
        [repertoireId],
      ),
      pool.query<{ name: string; family: string; role: string; partName: string | null }>(
        `
          SELECT instrument.name, instrument.family::text, part.role::text, part.part_name AS "partName"
          FROM repertoire_instrument part
          JOIN instrument ON instrument.id = part.instrument_id
          WHERE part.repertoire_id = $1
          ORDER BY part.position NULLS LAST, instrument.name
        `,
        [repertoireId],
      ),
      pool.query<{ id: string; type: string; url: string }>(
        `
          SELECT id::text, type::text, url
          FROM repertoire_resource
          WHERE repertoire_id = $1
          ORDER BY position NULLS LAST, id
        `,
        [repertoireId],
      ),
      pool.query<{ acquiredOn: Date | null; notes: string | null }>(
        `
          SELECT acquired_on AS "acquiredOn", notes
          FROM musician_repertoire_library
          WHERE repertoire_id = $1
          ORDER BY acquired_on DESC NULLS LAST
        `,
        [repertoireId],
      ),
      pool.query<{
        id: string
        title: string
        startMeasure: number | null
        endMeasure: number | null
      }>(
        `
          SELECT id::text, title, start_measure AS "startMeasure", end_measure AS "endMeasure"
          FROM repertoire
          WHERE parent_repertoire_id = $1
          ORDER BY start_measure NULLS LAST, title
        `,
        [repertoireId],
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
          WHERE item.repertoire_id = $1
          ORDER BY session.started_at DESC NULLS LAST
        `,
        [repertoireId],
      ),
    ])

    const repertoire = repertoireResult.rows[0]
    if (!repertoire) return null

    return {
      id: repertoire.id,
      title: repertoire.title,
      visibility: repertoire.visibility,
      status: repertoire.status,
      startMeasure: repertoire.startMeasure,
      endMeasure: repertoire.endMeasure,
      owner: repertoire.owner,
      createdAt: repertoire.createdAt.toISOString(),
      parent:
        repertoire.parentId && repertoire.parentTitle
          ? { id: repertoire.parentId, title: repertoire.parentTitle }
          : null,
      credits: creditsResult.rows,
      instruments: instrumentsResult.rows,
      resources: resourcesResult.rows,
      libraryEntries: libraryResult.rows.map((entry) => ({
        notes: entry.notes,
        acquiredOn: entry.acquiredOn?.toISOString().slice(0, 10) ?? null,
      })),
      excerpts: excerptsResult.rows,
      sessions: sessionsResult.rows.map((session) => ({
        ...session,
        startedAt: iso(session.startedAt),
      })),
    }
  })
