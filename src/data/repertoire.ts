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
  systemOwned: boolean
} & ResourceAccess

export type RepertoireLibraryPage = {
  items: RepertoireRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type RepertoireLibrarySearchInput = {
  query: string
  composer: string
  instrumentId: string
  visibility: 'ALL' | Visibility
  page: number
}

type RepertoireDetail = {
  id: string
  title: string
  compositionYear: number | null
  systemOwned: boolean
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

export type CatalogComposerOption = {
  id: string
  name: string
}

export type CatalogRepertoireRow = {
  id: string
  title: string
  compositionYear: number | null
  composers: { id: string; name: string }[]
  instruments: { id: string; name: string }[]
  inLibrary: boolean
  ownedByUser?: boolean
  children: CatalogRepertoireRow[]
}

export type OwnedRepertoireRow = {
  id: string
  title: string
  visibility: Visibility
  status: string
  composer: string
  inLibrary: boolean
}

export type OwnedRepertoirePage = {
  items: OwnedRepertoireRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type CatalogInstrumentMatch = 'ANY' | 'ALL'

export type CatalogSearchInput = {
  query: string
  composer: string
  instrumentIds: string[]
  instrumentMatch: CatalogInstrumentMatch
  yearFrom: number | null
  yearTo: number | null
  page: number
}

export type CatalogSearchPage = {
  items: CatalogRepertoireRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export const CATALOG_PAGE_SIZE = 25
export const REPERTOIRE_LIBRARY_PAGE_SIZE = 20

export const EMPTY_REPERTOIRE_LIBRARY_SEARCH: RepertoireLibrarySearchInput = {
  query: '',
  composer: '',
  instrumentId: '',
  visibility: 'ALL',
  page: 1,
}

export const EMPTY_CATALOG_SEARCH: CatalogSearchInput = {
  query: '',
  composer: '',
  instrumentIds: [],
  instrumentMatch: 'ANY',
  yearFrom: null,
  yearTo: null,
  page: 1,
}

export type RepertoireCreditInput = Pick<RepertoireCredit, 'person' | 'role'>
export type RepertoireInstrumentInput = Pick<
  RepertoireInstrument,
  'instrumentId' | 'role' | 'partName'
>
export type RepertoireResourceInput = Pick<RepertoireResource, 'type' | 'url'>

export type RepertoireInput = {
  title: string
  compositionYear?: number | null
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
  const compositionYear = input.compositionYear ?? null
  if (
    compositionYear !== null &&
    (!Number.isInteger(compositionYear) || compositionYear < -9999 || compositionYear > 9999)
  ) {
    throw new Error('Composition year must be a whole number between -9999 and 9999')
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
    compositionYear,
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
  ownerMusicianId: string,
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
        `INSERT INTO person (name, owner_musician_id) VALUES ($1, $2) RETURNING id::text`,
        [credit.person, ownerMusicianId],
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

export const getCatalogComposers = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CatalogComposerOption[]> => {
    const result = await pool.query<CatalogComposerOption>(
      `SELECT DISTINCT person.id::text, person.name
       FROM person
       JOIN repertoire_credit credit ON credit.person_id = person.id
       JOIN repertoire ON repertoire.id = credit.repertoire_id
       WHERE credit.role = 'COMPOSER'
         AND repertoire.parent_repertoire_id IS NULL
         AND repertoire.status = 'APPROVED'
         AND repertoire.deleted_at IS NULL
         AND (
           repertoire.visibility = 'PUBLIC'
           OR (
             repertoire.owner_musician_id = $1
             AND NOT EXISTS (
               SELECT 1 FROM musician_repertoire_library library
               WHERE library.repertoire_id = repertoire.id AND library.musician_id = $1
             )
           )
         )
       ORDER BY person.name`,
      [context.user.musicianId],
    )
    return result.rows
  })

function validCatalogYear(year: number | null) {
  return year === null || Number.isInteger(year)
}

function catalogSubstringPattern(value: string) {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

function validateCatalogSearch(input: CatalogSearchInput): CatalogSearchInput {
  const query = input.query.trim()
  const composer = input.composer.trim()
  const instrumentIds = [...new Set(input.instrumentIds)]
  if (query.length > 300 || composer.length > 300) throw new Error('Search text is too long')
  if (instrumentIds.length > 50 || instrumentIds.some((id) => !/^\d+$/.test(id))) {
    throw new Error('Invalid instrument filter')
  }
  if (input.instrumentMatch !== 'ANY' && input.instrumentMatch !== 'ALL') {
    throw new Error('Invalid instrument match')
  }
  if (!validCatalogYear(input.yearFrom) || !validCatalogYear(input.yearTo)) {
    throw new Error('Invalid year filter')
  }
  if (input.yearFrom !== null && input.yearTo !== null && input.yearFrom > input.yearTo) {
    throw new Error('The starting year must not be after the ending year')
  }
  if (!Number.isInteger(input.page) || input.page < 1) throw new Error('Invalid page')

  return { ...input, query, composer, instrumentIds }
}

export const getPublicRepertoireCatalogPage = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(validateCatalogSearch)
  .handler(async ({ data, context }): Promise<CatalogSearchPage> => {
    const parameters: unknown[] = [context.user.musicianId]
    const conditions = [
      `repertoire.parent_repertoire_id IS NULL`,
      `repertoire.status = 'APPROVED'`,
      `repertoire.deleted_at IS NULL`,
      `(
        repertoire.visibility = 'PUBLIC'
        OR (
          repertoire.owner_musician_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM musician_repertoire_library owned_library
            WHERE owned_library.repertoire_id = repertoire.id
              AND owned_library.musician_id = $1
          )
        )
      )`,
    ]
    const parameter = (value: unknown) => {
      parameters.push(value)
      return `$${parameters.length}`
    }

    if (data.query) {
      const substring = parameter(catalogSubstringPattern(data.query))
      const fuzzyValue = data.query.length >= 4 ? parameter(data.query) : null
      const fuzzyTitleMatch = (column: string) =>
        fuzzyValue ? `OR CAST(${fuzzyValue} AS text) <<% CAST(${column} AS text)` : ''
      conditions.push(`repertoire.id IN (
        WITH RECURSIVE direct_matches AS (
          SELECT candidate.id, candidate.parent_repertoire_id
          FROM repertoire candidate
          WHERE candidate.status = 'APPROVED'
            AND candidate.deleted_at IS NULL
            AND (
              candidate.title ILIKE ${substring} ESCAPE '\\'
              ${fuzzyTitleMatch('candidate.title')}
            )
          UNION
          SELECT candidate.id, candidate.parent_repertoire_id
          FROM repertoire candidate
          JOIN repertoire_credit search_credit ON search_credit.repertoire_id = candidate.id
          JOIN person search_person ON search_person.id = search_credit.person_id
          WHERE candidate.status = 'APPROVED'
            AND candidate.deleted_at IS NULL
            AND search_credit.role = 'COMPOSER'
            AND (
              search_person.name ILIKE ${substring} ESCAPE '\\'
              ${fuzzyTitleMatch('search_person.name')}
            )
        ), matching_ancestors AS (
          SELECT id, parent_repertoire_id
          FROM direct_matches
          UNION
          SELECT parent.id, parent.parent_repertoire_id
          FROM repertoire parent
          JOIN matching_ancestors child ON parent.id = child.parent_repertoire_id
          WHERE parent.status = 'APPROVED'
            AND parent.deleted_at IS NULL
        )
        SELECT id
        FROM matching_ancestors
        WHERE parent_repertoire_id IS NULL
      )`)
    }
    if (data.composer) {
      const substring = parameter(catalogSubstringPattern(data.composer))
      const fuzzyValue = data.composer.length >= 4 ? parameter(data.composer) : null
      const fuzzyComposerMatch =
        fuzzyValue !== null ? `OR CAST(${fuzzyValue} AS text) <<% CAST(composer.name AS text)` : ''
      conditions.push(`repertoire.id IN (
        SELECT composer_credit.repertoire_id
        FROM repertoire_credit composer_credit
        JOIN person composer ON composer.id = composer_credit.person_id
        WHERE composer_credit.role = 'COMPOSER'
          AND (
            composer.name ILIKE ${substring} ESCAPE '\\'
            ${fuzzyComposerMatch}
          )
      )`)
    }
    if (data.yearFrom !== null) {
      conditions.push(
        `COALESCE(repertoire.composition_year, EXTRACT(YEAR FROM repertoire.publication_date)::integer) >= ${parameter(data.yearFrom)}`,
      )
    }
    if (data.yearTo !== null) {
      conditions.push(
        `COALESCE(repertoire.composition_year, EXTRACT(YEAR FROM repertoire.publication_date)::integer) <= ${parameter(data.yearTo)}`,
      )
    }
    if (data.instrumentIds.length > 0) {
      const ids = parameter(data.instrumentIds)
      if (data.instrumentMatch === 'ALL') {
        const count = parameter(data.instrumentIds.length)
        conditions.push(`(
          SELECT count(DISTINCT matching_part.instrument_id)::integer
          FROM repertoire_instrument matching_part
          WHERE matching_part.repertoire_id = repertoire.id
            AND matching_part.instrument_id = ANY(${ids}::bigint[])
        ) = ${count}`)
      } else {
        conditions.push(`EXISTS (
          SELECT 1
          FROM repertoire_instrument matching_part
          WHERE matching_part.repertoire_id = repertoire.id
            AND matching_part.instrument_id = ANY(${ids}::bigint[])
        )`)
      }
    }

    const where = conditions.join('\n          AND ')
    const countParameters = [...parameters]
    const limit = parameter(CATALOG_PAGE_SIZE)
    const offset = parameter((data.page - 1) * CATALOG_PAGE_SIZE)
    const [countResult, result] = await Promise.all([
      pool.query<{ total: number }>(
        `SELECT count(*)::integer AS total
         FROM repertoire
         WHERE $1::bigint IS NOT NULL AND ${where}`,
        countParameters,
      ),
      pool.query<Omit<CatalogRepertoireRow, 'children'> & { parentId: string | null }>(
        `WITH RECURSIVE matching_roots AS (
           SELECT repertoire.id
           FROM repertoire
           WHERE ${where}
           ORDER BY lower(repertoire.title), repertoire.id
           LIMIT ${limit} OFFSET ${offset}
         ), page_catalog AS (
           SELECT repertoire.id, repertoire.parent_repertoire_id, repertoire.id AS root_id
           FROM repertoire
           JOIN matching_roots ON matching_roots.id = repertoire.id
           UNION ALL
           SELECT child.id, child.parent_repertoire_id, parent.root_id
           FROM repertoire child
           JOIN page_catalog parent ON parent.id = child.parent_repertoire_id
           WHERE child.status = 'APPROVED' AND child.deleted_at IS NULL
         )
         SELECT
           repertoire.id::text,
           repertoire.title,
           repertoire.parent_repertoire_id::text AS "parentId",
           COALESCE(
             repertoire.composition_year,
             EXTRACT(YEAR FROM repertoire.publication_date)::integer
           ) AS "compositionYear",
           COALESCE((
             SELECT jsonb_agg(
               jsonb_build_object('id', composer.id::text, 'name', composer.name)
               ORDER BY credit.position NULLS LAST, composer.name
             )
             FROM repertoire_credit credit
             JOIN person composer ON composer.id = credit.person_id
             WHERE credit.repertoire_id = repertoire.id AND credit.role = 'COMPOSER'
           ), '[]'::jsonb) AS composers,
           COALESCE((
             SELECT jsonb_agg(
               jsonb_build_object('id', instrument.id::text, 'name', instrument.name)
               ORDER BY part.position NULLS LAST, instrument.name
             )
             FROM repertoire_instrument part
             JOIN instrument ON instrument.id = part.instrument_id
             WHERE part.repertoire_id = repertoire.id
           ), '[]'::jsonb) AS instruments,
           EXISTS (
             SELECT 1 FROM musician_repertoire_library library
             WHERE library.repertoire_id = repertoire.id AND library.musician_id = $1
           ) AS "inLibrary",
           root.owner_musician_id = $1 AS "ownedByUser"
         FROM repertoire
         JOIN page_catalog ON page_catalog.id = repertoire.id
         JOIN repertoire root ON root.id = page_catalog.root_id
         ORDER BY lower(root.title), root.id, repertoire.parent_repertoire_id NULLS FIRST,
           lower(repertoire.title), repertoire.id`,
        parameters,
      ),
    ])
    const total = countResult.rows[0]?.total ?? 0

    const items = new Map(
      result.rows.map((row) => [row.id, { ...row, children: [] as CatalogRepertoireRow[] }]),
    )
    const roots: CatalogRepertoireRow[] = []
    for (const row of result.rows) {
      const item = items.get(row.id)!
      const parent = row.parentId ? items.get(row.parentId) : undefined
      if (parent) parent.children.push(item)
      else roots.push(item)
    }

    return {
      items: roots,
      page: data.page,
      pageSize: CATALOG_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / CATALOG_PAGE_SIZE),
    }
  })

export const getPublicRepertoireCatalog = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CatalogRepertoireRow[]> => {
    const result = await pool.query<{
      id: string
      title: string
      compositionYear: number | null
      composers: CatalogRepertoireRow['composers']
      instruments: CatalogRepertoireRow['instruments']
      inLibrary: boolean
      parentId: string | null
    }>(
      `WITH RECURSIVE public_catalog AS (
         SELECT id
         FROM repertoire
         WHERE parent_repertoire_id IS NULL
           AND visibility = 'PUBLIC'
           AND status = 'APPROVED'
           AND deleted_at IS NULL
         UNION ALL
         SELECT child.id
         FROM repertoire child
         JOIN public_catalog parent ON parent.id = child.parent_repertoire_id
         WHERE child.status = 'APPROVED' AND child.deleted_at IS NULL
       )
       SELECT
         repertoire.id::text,
         repertoire.title,
         repertoire.parent_repertoire_id::text AS "parentId",
         COALESCE(
           repertoire.composition_year,
           EXTRACT(YEAR FROM repertoire.publication_date)::integer
         ) AS "compositionYear",
         COALESCE(
           (
             SELECT jsonb_agg(
               jsonb_build_object('id', composer.id::text, 'name', composer.name)
               ORDER BY credit.position NULLS LAST, composer.name
             )
             FROM repertoire_credit credit
             JOIN person composer ON composer.id = credit.person_id
             WHERE credit.repertoire_id = repertoire.id AND credit.role = 'COMPOSER'
           ),
           '[]'::jsonb
         ) AS composers,
         COALESCE(
           (
             SELECT jsonb_agg(
               jsonb_build_object('id', instrument.id::text, 'name', instrument.name)
               ORDER BY part.position NULLS LAST, instrument.name
             )
             FROM repertoire_instrument part
             JOIN instrument ON instrument.id = part.instrument_id
             WHERE part.repertoire_id = repertoire.id
           ),
           '[]'::jsonb
         ) AS instruments,
         EXISTS (
           SELECT 1 FROM musician_repertoire_library library
           WHERE library.repertoire_id = repertoire.id AND library.musician_id = $1
         ) AS "inLibrary"
       FROM repertoire
       JOIN public_catalog ON public_catalog.id = repertoire.id
       WHERE repertoire.status = 'APPROVED'
         AND repertoire.deleted_at IS NULL
       ORDER BY repertoire.title, repertoire.id`,
      [context.user.musicianId],
    )
    const items = new Map(
      result.rows.map((row) => [row.id, { ...row, children: [] as CatalogRepertoireRow[] }]),
    )
    const roots: CatalogRepertoireRow[] = []
    for (const row of result.rows) {
      const item = items.get(row.id)!
      const parent = row.parentId ? items.get(row.parentId) : undefined
      if (parent) parent.children.push(item)
      else roots.push(item)
    }
    return roots
  })

export const addRepertoireToLibrary = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((repertoireId: string) => {
    if (!/^\d+$/.test(repertoireId)) throw new Error('Invalid repertoire')
    return repertoireId
  })
  .handler(async ({ data: repertoireId, context }): Promise<{ id: string }> => {
    const result = await pool.query<{ id: string }>(
      `WITH RECURSIVE accessible_repertoire AS (
         SELECT id, owner_musician_id
         FROM repertoire
         WHERE parent_repertoire_id IS NULL
           AND deleted_at IS NULL
           AND (
             owner_musician_id = $1
             OR (visibility = 'PUBLIC' AND status = 'APPROVED')
           )
         UNION ALL
         SELECT child.id, parent.owner_musician_id
         FROM repertoire child
         JOIN accessible_repertoire parent ON parent.id = child.parent_repertoire_id
         WHERE child.deleted_at IS NULL
           AND (parent.owner_musician_id = $1 OR child.status = 'APPROVED')
       )
       INSERT INTO musician_repertoire_library (musician_id, repertoire_id)
       SELECT $1, repertoire.id
       FROM repertoire
       JOIN accessible_repertoire ON accessible_repertoire.id = repertoire.id
       WHERE repertoire.id = $2
       ON CONFLICT (musician_id, repertoire_id) DO UPDATE
         SET musician_id = EXCLUDED.musician_id
       RETURNING repertoire_id::text AS id`,
      [context.user.musicianId, repertoireId],
    )
    const repertoire = result.rows[0]
    if (!repertoire) throw new Error('Repertoire item not found')
    return repertoire
  })

export const removeRepertoireFromLibrary = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((repertoireId: string) => {
    if (!/^\d+$/.test(repertoireId)) throw new Error('Invalid repertoire')
    return repertoireId
  })
  .handler(async ({ data: repertoireId, context }): Promise<{ id: string }> => {
    const result = await pool.query<{ id: string }>(
      `DELETE FROM musician_repertoire_library
       WHERE musician_id = $1 AND repertoire_id = $2
       RETURNING repertoire_id::text AS id`,
      [context.user.musicianId, repertoireId],
    )
    const repertoire = result.rows[0]
    if (!repertoire) throw new Error('Repertoire is not in My Library')
    return repertoire
  })

export const getOwnedRepertoirePage = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((page: number) => {
    if (!Number.isInteger(page) || page < 1) throw new Error('Invalid page')
    return page
  })
  .handler(async ({ data: page, context }): Promise<OwnedRepertoirePage> => {
    const offset = (page - 1) * CATALOG_PAGE_SIZE
    const [countResult, result] = await Promise.all([
      pool.query<{ total: number }>(
        `SELECT count(*)::integer AS total
         FROM repertoire
         WHERE parent_repertoire_id IS NULL
           AND owner_musician_id = $1
           AND external_id IS NULL
           AND deleted_at IS NULL`,
        [context.user.musicianId],
      ),
      pool.query<OwnedRepertoireRow>(
        `SELECT
           repertoire.id::text,
           repertoire.title,
           repertoire.visibility::text,
           repertoire.status::text,
           COALESCE((
             SELECT string_agg(person.name, ', ' ORDER BY credit.position NULLS LAST, person.name)
             FROM repertoire_credit credit
             JOIN person ON person.id = credit.person_id
             WHERE credit.repertoire_id = repertoire.id AND credit.role = 'COMPOSER'
           ), 'Unknown composer') AS composer,
           EXISTS (
             SELECT 1 FROM musician_repertoire_library library
             WHERE library.repertoire_id = repertoire.id AND library.musician_id = $1
           ) AS "inLibrary"
         FROM repertoire
         WHERE repertoire.parent_repertoire_id IS NULL
           AND repertoire.owner_musician_id = $1
           AND repertoire.external_id IS NULL
           AND repertoire.deleted_at IS NULL
         ORDER BY lower(repertoire.title), repertoire.id
         LIMIT $2 OFFSET $3`,
        [context.user.musicianId, CATALOG_PAGE_SIZE, offset],
      ),
    ])
    const total = countResult.rows[0]?.total ?? 0
    return {
      items: result.rows,
      page,
      pageSize: CATALOG_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / CATALOG_PAGE_SIZE),
    }
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
    const result = await pool.query<
      Omit<RepertoireRow, keyof ResourceAccess | 'systemOwned'> & { externalId: string | null }
    >(
      `
        ${ACCESS_CTE}
        SELECT
          r.id::text,
          r.title,
          r.external_id AS "externalId",
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
        GROUP BY r.id, r.external_id, parent.title, access.visibility, access.owner_musician_id,
          owner.display_name, resource.type, resource.url, library.notes
        ORDER BY r.parent_repertoire_id NULLS FIRST, r.title
      `,
      [context.user.musicianId],
    )

    return result.rows.map((repertoire) => {
      const access = resourceAccess(context.user, repertoire.ownerId, repertoire.visibility)
      const systemOwned = repertoire.externalId !== null
      return {
        ...repertoire,
        systemOwned,
        ...access,
        canEdit: systemOwned ? false : access.canEdit,
        canManage: systemOwned ? false : access.canManage,
      }
    })
  })

export const getRepertoireLibraryPage = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((input: RepertoireLibrarySearchInput) => {
    const query = input.query.trim()
    const composer = input.composer.trim()
    if (query.length > 300 || composer.length > 300) throw new Error('Search text is too long')
    if (input.instrumentId && !/^\d+$/.test(input.instrumentId)) {
      throw new Error('Invalid instrument filter')
    }
    if (
      input.visibility !== 'ALL' &&
      input.visibility !== 'PRIVATE' &&
      input.visibility !== 'PUBLIC'
    ) {
      throw new Error('Invalid visibility filter')
    }
    if (!Number.isInteger(input.page) || input.page < 1) throw new Error('Invalid page')
    return { ...input, query, composer }
  })
  .handler(async ({ data, context }): Promise<RepertoireLibraryPage> => {
    const parameters: unknown[] = [context.user.musicianId]
    const conditions = [`access.owner_musician_id = $1 OR access.visibility = 'PUBLIC'`]
    const parameter = (value: unknown) => {
      parameters.push(value)
      return `$${parameters.length}`
    }
    if (data.query) {
      const substring = parameter(catalogSubstringPattern(data.query))
      const fuzzyValue = data.query.length >= 4 ? parameter(data.query) : null
      const fuzzyMatch = (column: string) =>
        fuzzyValue ? `OR CAST(${fuzzyValue} AS text) <<% CAST(${column} AS text)` : ''
      conditions.push(`(
        r.title ILIKE ${substring} ESCAPE '\\'
        ${fuzzyMatch('r.title')}
        OR EXISTS (
          SELECT 1
          FROM repertoire_credit search_credit
          JOIN person search_person ON search_person.id = search_credit.person_id
          WHERE search_credit.repertoire_id = r.id
            AND search_credit.role = 'COMPOSER'
            AND (
              search_person.name ILIKE ${substring} ESCAPE '\\'
              ${fuzzyMatch('search_person.name')}
            )
        )
      )`)
    }
    if (data.composer) {
      const substring = parameter(catalogSubstringPattern(data.composer))
      const fuzzyValue = data.composer.length >= 4 ? parameter(data.composer) : null
      conditions.push(`EXISTS (
        SELECT 1
        FROM repertoire_credit filter_credit
        JOIN person filter_person ON filter_person.id = filter_credit.person_id
        WHERE filter_credit.repertoire_id = r.id
          AND filter_credit.role = 'COMPOSER'
          AND (
            filter_person.name ILIKE ${substring} ESCAPE '\\'
            ${fuzzyValue ? `OR CAST(${fuzzyValue} AS text) <<% CAST(filter_person.name AS text)` : ''}
          )
      )`)
    }
    if (data.instrumentId) {
      conditions.push(`EXISTS (
        SELECT 1 FROM repertoire_instrument filter_part
        WHERE filter_part.repertoire_id = r.id
          AND filter_part.instrument_id = ${parameter(data.instrumentId)}::bigint
      )`)
    }
    if (data.visibility !== 'ALL') {
      conditions.push(`access.visibility = ${parameter(data.visibility)}::visibility_type`)
    }
    const where = conditions.map((condition) => `(${condition})`).join('\n           AND ')
    const countParameters = [...parameters]
    const limit = parameter(REPERTOIRE_LIBRARY_PAGE_SIZE)
    const offset = parameter((data.page - 1) * REPERTOIRE_LIBRARY_PAGE_SIZE)
    const [countResult, result] = await Promise.all([
      pool.query<{ total: number }>(
        `${ACCESS_CTE}
         SELECT count(*)::integer AS total
         FROM repertoire r
         JOIN repertoire_access access ON access.id = r.id
         JOIN musician_repertoire_library library
           ON library.repertoire_id = r.id AND library.musician_id = $1
         WHERE ${where}`,
        countParameters,
      ),
      pool.query<
        Omit<RepertoireRow, keyof ResourceAccess | 'systemOwned'> & { externalId: string | null }
      >(
        `${ACCESS_CTE},
         page_repertoire AS (
           SELECT r.id
           FROM repertoire r
           JOIN repertoire_access access ON access.id = r.id
           JOIN musician_repertoire_library library
             ON library.repertoire_id = r.id AND library.musician_id = $1
           WHERE ${where}
           ORDER BY r.parent_repertoire_id NULLS FIRST, lower(r.title), r.id
           LIMIT ${limit} OFFSET ${offset}
         )
         SELECT
           r.id::text,
           r.title,
           r.external_id AS "externalId",
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
         FROM page_repertoire page
         JOIN repertoire r ON r.id = page.id
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
         GROUP BY r.id, r.external_id, parent.title, access.visibility, access.owner_musician_id,
           owner.display_name, resource.type, resource.url, library.notes
         ORDER BY r.parent_repertoire_id NULLS FIRST, lower(r.title), r.id`,
        parameters,
      ),
    ])
    const total = countResult.rows[0]?.total ?? 0

    return {
      items: result.rows.map((repertoire) => {
        const access = resourceAccess(context.user, repertoire.ownerId, repertoire.visibility)
        const systemOwned = repertoire.externalId !== null
        return {
          ...repertoire,
          systemOwned,
          ...access,
          canEdit: systemOwned ? false : access.canEdit,
          canManage: systemOwned ? false : access.canManage,
        }
      }),
      page: data.page,
      pageSize: REPERTOIRE_LIBRARY_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / REPERTOIRE_LIBRARY_PAGE_SIZE),
    }
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
      compositionYear: number | null
      externalId: string | null
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
          COALESCE(
            repertoire.composition_year,
            EXTRACT(YEAR FROM repertoire.publication_date)::integer
          ) AS "compositionYear",
          repertoire.external_id AS "externalId",
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

    const access = resourceAccess(context.user, repertoire.ownerId, repertoire.visibility)
    const systemOwned = repertoire.externalId !== null
    return {
      id: repertoire.id,
      title: repertoire.title,
      compositionYear: repertoire.compositionYear,
      systemOwned,
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
      ...access,
      canEdit: systemOwned ? false : access.canEdit,
      canManage: systemOwned ? false : access.canManage,
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
        `INSERT INTO repertoire
           (title, composition_year, owner_musician_id, visibility, status)
         VALUES ($1, $2, $3, $4, 'APPROVED')
         RETURNING id::text`,
        [data.title, data.compositionYear, context.user.musicianId, data.visibility],
      )
      const repertoire = result.rows[0]
      if (!repertoire) throw new Error('Repertoire could not be created')
      await client.query(
        `INSERT INTO musician_repertoire_library (musician_id, repertoire_id)
         VALUES ($1, $2)`,
        [context.user.musicianId, repertoire.id],
      )
      await replaceRepertoireDetails(client, repertoire.id, data, context.user.musicianId)
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
         SET title = $1, composition_year = $2, visibility = $3
         WHERE id = $4 AND owner_musician_id = $5
           AND parent_repertoire_id IS NULL AND deleted_at IS NULL
           AND external_id IS NULL
         RETURNING id::text`,
        [data.title, data.compositionYear, data.visibility, data.id, context.user.musicianId],
      )
      const repertoire = result.rows[0]
      if (!repertoire) throw new Error('Repertoire not found')
      await replaceRepertoireDetails(client, data.id, data, context.user.musicianId)
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
         AND external_id IS NULL
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
