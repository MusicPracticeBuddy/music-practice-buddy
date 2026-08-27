import { createServerFn } from '@tanstack/solid-start'
import type { PoolClient } from 'pg'
import { resourceAccess, type ResourceAccess, type Visibility } from '@/auth/authorization'
import { authMiddleware } from '@/auth/middleware'
import { pool, toIsoString } from '@/data/db'

export type RepertoireRow = {
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
  credits: RepertoireCredit[]
  instruments: RepertoireInstrument[]
  resources: RepertoireResource[]
  libraryEntries: { acquiredOn: string | null; notes: string | null }[]
  excerpts: { id: string; title: string; startMeasure: number | null; endMeasure: number | null }[]
  sessions: {
    id: string
    templateName: string
    status: string
    startedAt: string | null
  }[]
} & ResourceAccess

export type RepertoireCreditRole = 'COMPOSER' | 'ARRANGER' | 'EDITOR' | 'TRANSCRIBER' | 'OTHER'
export type RepertoireInstrumentRole = 'SOLO' | 'ACCOMPANIMENT' | 'OTHER'
export type RepertoireResourceType = 'SCORE' | 'RECORDING' | 'VIDEO' | 'AUDIO' | 'LINK' | 'OTHER'

export type RepertoireCredit = {
  person: string
  role: RepertoireCreditRole
  biographyLink: string | null
}

export type RepertoireInstrument = {
  instrumentId: string
  name: string
  family: string
  role: RepertoireInstrumentRole
  partName: string | null
}

export type RepertoireResource = {
  id: string
  type: RepertoireResourceType
  url: string
}

export type InstrumentOption = {
  id: string
  name: string
  family: string
}

export type RepertoireCreditInput = Pick<RepertoireCredit, 'person' | 'role'>
export type RepertoireInstrumentInput = Pick<
  RepertoireInstrument,
  'instrumentId' | 'role' | 'partName'
>
export type RepertoireResourceInput = Pick<RepertoireResource, 'type' | 'url'>

export type RepertoireInput = {
  title: string
  visibility: Visibility
  credits?: RepertoireCreditInput[]
  instruments?: RepertoireInstrumentInput[]
  resources?: RepertoireResourceInput[]
}

type ValidatedRepertoireInput = Required<RepertoireInput>
type UpdateRepertoireInput = RepertoireInput & { id: string }

const creditRoles = new Set<RepertoireCreditRole>([
  'COMPOSER',
  'ARRANGER',
  'EDITOR',
  'TRANSCRIBER',
  'OTHER',
])
const instrumentRoles = new Set<RepertoireInstrumentRole>(['SOLO', 'ACCOMPANIMENT', 'OTHER'])
const resourceTypes = new Set<RepertoireResourceType>([
  'SCORE',
  'RECORDING',
  'VIDEO',
  'AUDIO',
  'LINK',
  'OTHER',
])

function validateRepertoire(input: RepertoireInput): ValidatedRepertoireInput {
  const title = input.title.trim()
  if (!title) throw new Error('Repertoire title is required')
  if (title.length > 300) throw new Error('Repertoire title must be 300 characters or fewer')
  if (input.visibility !== 'PRIVATE' && input.visibility !== 'PUBLIC') {
    throw new Error('Invalid repertoire visibility')
  }
  const credits = (input.credits ?? []).map((credit) => ({
    person: credit.person.trim(),
    role: credit.role,
  }))
  const instruments = (input.instruments ?? []).map((instrument) => ({
    instrumentId: instrument.instrumentId,
    role: instrument.role,
    partName: instrument.partName?.trim() || null,
  }))
  const resources = (input.resources ?? []).map((resource) => ({
    type: resource.type,
    url: resource.url.trim(),
  }))
  if (credits.length > 50 || instruments.length > 50 || resources.length > 50) {
    throw new Error('Repertoire can contain at most 50 entries in each detail section')
  }
  for (const credit of credits) {
    if (!credit.person) throw new Error('Credit names are required')
    if (credit.person.length > 200) throw new Error('Credit names must be 200 characters or fewer')
    if (!creditRoles.has(credit.role)) throw new Error('Invalid credit role')
  }
  const uniqueCredits = new Set(
    credits.map((credit) => `${credit.person.toLocaleLowerCase()}\u0000${credit.role}`),
  )
  if (uniqueCredits.size !== credits.length) throw new Error('Duplicate credits are not allowed')
  for (const instrument of instruments) {
    if (!/^\d+$/.test(instrument.instrumentId)) throw new Error('Invalid instrument')
    if (!instrumentRoles.has(instrument.role)) throw new Error('Invalid instrument role')
    if (instrument.partName && instrument.partName.length > 200) {
      throw new Error('Part names must be 200 characters or fewer')
    }
  }
  for (const resource of resources) {
    if (!resourceTypes.has(resource.type)) throw new Error('Invalid resource type')
    let url: URL
    try {
      url = new URL(resource.url)
    } catch {
      throw new Error('Resource URLs must be valid URLs')
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Resource URLs must use HTTP or HTTPS')
    }
  }
  return {
    title,
    visibility: input.visibility,
    credits,
    instruments,
    resources,
  }
}

async function replaceRepertoireDetails(
  client: PoolClient,
  repertoireId: string,
  data: ValidatedRepertoireInput,
) {
  await client.query(`DELETE FROM repertoire_credit WHERE repertoire_id = $1`, [repertoireId])
  await client.query(`DELETE FROM repertoire_instrument WHERE repertoire_id = $1`, [repertoireId])
  await client.query(`DELETE FROM repertoire_resource WHERE repertoire_id = $1`, [repertoireId])

  for (const [index, credit] of data.credits.entries()) {
    let person = await client.query<{ id: string }>(
      `SELECT id::text FROM person WHERE lower(name) = lower($1) ORDER BY id LIMIT 1`,
      [credit.person],
    )
    if (!person.rows[0]) {
      person = await client.query<{ id: string }>(
        `INSERT INTO person (name) VALUES ($1) RETURNING id::text`,
        [credit.person],
      )
    }
    await client.query(
      `INSERT INTO repertoire_credit (repertoire_id, person_id, role, position)
       VALUES ($1, $2, $3, $4)`,
      [repertoireId, person.rows[0]!.id, credit.role, index + 1],
    )
  }

  for (const [index, instrument] of data.instruments.entries()) {
    const result = await client.query(
      `INSERT INTO repertoire_instrument
         (repertoire_id, instrument_id, role, position, part_name)
       SELECT $1, id, $2, $3, $4 FROM instrument WHERE id = $5`,
      [repertoireId, instrument.role, index + 1, instrument.partName, instrument.instrumentId],
    )
    if (result.rowCount === 0) throw new Error('Instrument not found')
  }

  for (const [index, resource] of data.resources.entries()) {
    await client.query(
      `INSERT INTO repertoire_resource (repertoire_id, type, url, position)
       VALUES ($1, $2, $3, $4)`,
      [repertoireId, resource.type, resource.url, index + 1],
    )
  }
}

export const getInstruments = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async (): Promise<InstrumentOption[]> => {
    const result = await pool.query<InstrumentOption>(
      `SELECT id::text, name, family::text FROM instrument ORDER BY family, name`,
    )
    return result.rows
  })

const ACCESS_CTE = `
  WITH RECURSIVE repertoire_access AS (
    SELECT id, owner_musician_id, visibility
    FROM repertoire
    WHERE parent_repertoire_id IS NULL AND deleted_at IS NULL
    UNION ALL
    SELECT child.id, access.owner_musician_id, access.visibility
    FROM repertoire child
    JOIN repertoire_access access ON access.id = child.parent_repertoire_id
    WHERE child.deleted_at IS NULL
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
        JOIN musician_repertoire_library library
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
      pool.query<RepertoireCredit>(
        `SELECT person.name AS person, credit.role::text,
           person.biography_link AS "biographyLink"
         FROM repertoire_credit credit
         JOIN person ON person.id = credit.person_id
         WHERE credit.repertoire_id = $1
         ORDER BY credit.position NULLS LAST, person.name`,
        [repertoireId],
      ),
      pool.query<RepertoireInstrument>(
        `SELECT instrument.id::text AS "instrumentId", instrument.name,
           instrument.family::text, part.role::text,
           part.part_name AS "partName"
         FROM repertoire_instrument part
         JOIN instrument ON instrument.id = part.instrument_id
         WHERE part.repertoire_id = $1
         ORDER BY part.position NULLS LAST, instrument.name`,
        [repertoireId],
      ),
      pool.query<RepertoireResource>(
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
         FROM repertoire WHERE parent_repertoire_id = $1 AND deleted_at IS NULL
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

export const createRepertoire = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(validateRepertoire)
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<{ id: string }>(
        `INSERT INTO repertoire (title, owner_musician_id, visibility, status)
         VALUES ($1, $2, $3, 'APPROVED')
         RETURNING id::text`,
        [data.title, context.user.musicianId, data.visibility],
      )
      const repertoire = result.rows[0]
      if (!repertoire) throw new Error('Repertoire could not be created')
      await client.query(
        `INSERT INTO musician_repertoire_library (musician_id, repertoire_id)
         VALUES ($1, $2)`,
        [context.user.musicianId, repertoire.id],
      )
      await replaceRepertoireDetails(client, repertoire.id, data)
      await client.query('COMMIT')
      return repertoire
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })

export const updateRepertoire = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: UpdateRepertoireInput) => {
    if (!/^\d+$/.test(input.id)) throw new Error('Invalid repertoire')
    return { id: input.id, ...validateRepertoire(input) }
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<{ id: string }>(
        `UPDATE repertoire
         SET title = $1, visibility = $2
         WHERE id = $3 AND owner_musician_id = $4
           AND parent_repertoire_id IS NULL AND deleted_at IS NULL
         RETURNING id::text`,
        [data.title, data.visibility, data.id, context.user.musicianId],
      )
      const repertoire = result.rows[0]
      if (!repertoire) throw new Error('Repertoire not found')
      await replaceRepertoireDetails(client, data.id, data)
      await client.query('COMMIT')
      return repertoire
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })

export const deleteRepertoire = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((repertoireId: string) => {
    if (!/^\d+$/.test(repertoireId)) throw new Error('Invalid repertoire')
    return repertoireId
  })
  .handler(async ({ data: repertoireId, context }): Promise<{ id: string }> => {
    const result = await pool.query<{ id: string }>(
      `UPDATE repertoire SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND owner_musician_id = $2
         AND parent_repertoire_id IS NULL AND deleted_at IS NULL
       RETURNING id::text`,
      [repertoireId, context.user.musicianId],
    )
    const repertoire = result.rows[0]
    if (!repertoire) throw new Error('Repertoire not found')
    return repertoire
  })

export const updateRepertoireLibraryNote = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { id: string; note: string }) => {
    if (!/^\d+$/.test(input.id)) throw new Error('Invalid repertoire')
    const note = input.note.trim()
    if (note.length > 5000) throw new Error('Library notes must be 5,000 characters or fewer')
    return { id: input.id, note }
  })
  .handler(async ({ data, context }): Promise<{ note: string | null }> => {
    const result = await pool.query<{ note: string | null }>(
      `UPDATE musician_repertoire_library library
       SET notes = $1
       FROM repertoire
       WHERE library.repertoire_id = repertoire.id
         AND library.repertoire_id = $2
         AND library.musician_id = $3
         AND repertoire.deleted_at IS NULL
       RETURNING library.notes AS note`,
      [data.note || null, data.id, context.user.musicianId],
    )
    const libraryEntry = result.rows[0]
    if (!libraryEntry) throw new Error('Repertoire is not in your library')
    return libraryEntry
  })
