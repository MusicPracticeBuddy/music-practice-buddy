import { createServerFn } from '@tanstack/solid-start'
import { pool, toIsoString } from './db'

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

type RepertoireDetail = {
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
        startedAt: toIsoString(session.startedAt),
      })),
    }
  })
