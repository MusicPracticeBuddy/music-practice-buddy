import { createServerFn } from '@tanstack/solid-start'
import { resourceAccess, type ResourceAccess, type Visibility } from '@/auth/authorization'
import { authMiddleware } from '@/auth/middleware'
import { pool, toIsoString } from '@/data/db'

type RepertoireRow = {
  id: string
  title: string
  parentTitle: string | null
  measureRange: string | null
  visibility: Visibility
  status: string
  owner: string | null
  ownerId: string | null
  composer: string
  instrument: string | null
  resourceType: string | null
  resourceUrl: string | null
  libraryNotes: string | null
} & ResourceAccess

type RepertoireDetail = {
  id: string
  title: string
  visibility: Visibility
  status: string
  startMeasure: number | null
  endMeasure: number | null
  owner: string | null
  ownerId: string | null
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
} & ResourceAccess

const ACCESS_CTE = `
  WITH RECURSIVE repertoire_access AS (
    SELECT id, owner_musician_id, visibility
    FROM repertoire
    WHERE parent_repertoire_id IS NULL
    UNION ALL
    SELECT child.id, access.owner_musician_id, access.visibility
    FROM repertoire child
    JOIN repertoire_access access ON access.id = child.parent_repertoire_id
  )
`

export const getRepertoire = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<RepertoireRow[]> => {
    const result = await pool.query<Omit<RepertoireRow, keyof ResourceAccess>>(
      `
        ${ACCESS_CTE}
        SELECT
          r.id::text,
          r.title,
          parent.title AS "parentTitle",
          CASE
            WHEN r.start_measure IS NOT NULL THEN
              'Measures ' || r.start_measure || COALESCE('–' || r.end_measure, '')
            ELSE NULL
          END AS "measureRange",
          access.visibility::text,
          r.status::text,
          owner.display_name AS owner,
          access.owner_musician_id::text AS "ownerId",
          COALESCE(string_agg(DISTINCT person.name, ', '), 'Unknown composer') AS composer,
          string_agg(DISTINCT instrument.name, ', ') AS instrument,
          resource.type::text AS "resourceType",
          resource.url AS "resourceUrl",
          library.notes AS "libraryNotes"
        FROM repertoire r
        JOIN repertoire_access access ON access.id = r.id
        LEFT JOIN musician owner ON owner.id = access.owner_musician_id
        LEFT JOIN repertoire parent ON parent.id = r.parent_repertoire_id
        LEFT JOIN repertoire_credit credit
          ON credit.repertoire_id = r.id AND credit.role = 'COMPOSER'
        LEFT JOIN person ON person.id = credit.person_id
        LEFT JOIN repertoire_instrument part ON part.repertoire_id = r.id
        LEFT JOIN instrument ON instrument.id = part.instrument_id
        LEFT JOIN LATERAL (
          SELECT child.type, child.url
          FROM repertoire_resource child
          WHERE child.repertoire_id = r.id
          ORDER BY child.position NULLS LAST, child.id
          LIMIT 1
        ) resource ON TRUE
        LEFT JOIN musician_repertoire_library library
          ON library.repertoire_id = r.id AND library.musician_id = $1
        WHERE access.owner_musician_id = $1 OR access.visibility = 'PUBLIC'
        GROUP BY r.id, parent.title, access.visibility, access.owner_musician_id,
          owner.display_name, resource.type, resource.url, library.notes
        ORDER BY r.parent_repertoire_id NULLS FIRST, r.title
      `,
      [context.user.musicianId],
    )

    return result.rows.map((repertoire) => ({
      ...repertoire,
      ...resourceAccess(context.user, repertoire.ownerId, repertoire.visibility),
    }))
  })

export const getRepertoireDetail = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((repertoireId: string) => {
    if (!/^\d+$/.test(repertoireId)) {
      throw new Error('Repertoire ID must be a positive integer')
    }
    return repertoireId
  })
  .handler(async ({ data: repertoireId, context }): Promise<RepertoireDetail | null> => {
    const repertoireResult = await pool.query<{
      id: string
      title: string
      visibility: Visibility
      status: string
      startMeasure: number | null
      endMeasure: number | null
      owner: string | null
      ownerId: string | null
      createdAt: Date
      parentId: string | null
      parentTitle: string | null
    }>(
      `
        ${ACCESS_CTE}
        SELECT
          repertoire.id::text,
          repertoire.title,
          access.visibility::text,
          repertoire.status::text,
          repertoire.start_measure AS "startMeasure",
          repertoire.end_measure AS "endMeasure",
          owner.display_name AS owner,
          access.owner_musician_id::text AS "ownerId",
          repertoire.created_at AS "createdAt",
          parent.id::text AS "parentId",
          parent.title AS "parentTitle"
        FROM repertoire
        JOIN repertoire_access access ON access.id = repertoire.id
        LEFT JOIN musician owner ON owner.id = access.owner_musician_id
        LEFT JOIN repertoire parent ON parent.id = repertoire.parent_repertoire_id
        WHERE repertoire.id = $1
          AND (access.owner_musician_id = $2 OR access.visibility = 'PUBLIC')
      `,
      [repertoireId, context.user.musicianId],
    )
    const repertoire = repertoireResult.rows[0]
    if (!repertoire) return null

    const [
      creditsResult,
      instrumentsResult,
      resourcesResult,
      libraryResult,
      excerptsResult,
      sessionsResult,
    ] = await Promise.all([
      pool.query<{ person: string; role: string; biographyLink: string | null }>(
        `SELECT person.name AS person, credit.role::text,
           person.biography_link AS "biographyLink"
         FROM repertoire_credit credit
         JOIN person ON person.id = credit.person_id
         WHERE credit.repertoire_id = $1
         ORDER BY credit.position NULLS LAST, person.name`,
        [repertoireId],
      ),
      pool.query<{ name: string; family: string; role: string; partName: string | null }>(
        `SELECT instrument.name, instrument.family::text, part.role::text,
           part.part_name AS "partName"
         FROM repertoire_instrument part
         JOIN instrument ON instrument.id = part.instrument_id
         WHERE part.repertoire_id = $1
         ORDER BY part.position NULLS LAST, instrument.name`,
        [repertoireId],
      ),
      pool.query<{ id: string; type: string; url: string }>(
        `SELECT id::text, type::text, url FROM repertoire_resource
         WHERE repertoire_id = $1 ORDER BY position NULLS LAST, id`,
        [repertoireId],
      ),
      pool.query<{ acquiredOn: Date | null; notes: string | null }>(
        `SELECT acquired_on AS "acquiredOn", notes
         FROM musician_repertoire_library
         WHERE repertoire_id = $1 AND musician_id = $2
         ORDER BY acquired_on DESC NULLS LAST`,
        [repertoireId, context.user.musicianId],
      ),
      pool.query<{
        id: string
        title: string
        startMeasure: number | null
        endMeasure: number | null
      }>(
        `SELECT id::text, title, start_measure AS "startMeasure",
           end_measure AS "endMeasure"
         FROM repertoire WHERE parent_repertoire_id = $1
         ORDER BY start_measure NULLS LAST, title`,
        [repertoireId],
      ),
      pool.query<{ id: string; templateName: string; status: string; startedAt: Date | null }>(
        `SELECT DISTINCT session.id::text,
           COALESCE(template.name, 'Open practice') AS "templateName",
           session.status::text, session.started_at AS "startedAt"
         FROM session_item item
         JOIN session ON session.id = item.session_id
         LEFT JOIN session_template template ON template.id = session.session_template_id
         WHERE item.repertoire_id = $1 AND session.musician_id = $2
         ORDER BY session.started_at DESC NULLS LAST`,
        [repertoireId, context.user.musicianId],
      ),
    ])

    return {
      id: repertoire.id,
      title: repertoire.title,
      visibility: repertoire.visibility,
      status: repertoire.status,
      startMeasure: repertoire.startMeasure,
      endMeasure: repertoire.endMeasure,
      owner: repertoire.owner,
      ownerId: repertoire.ownerId,
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
      ...resourceAccess(context.user, repertoire.ownerId, repertoire.visibility),
    }
  })
