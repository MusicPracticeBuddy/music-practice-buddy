import { readFile } from 'node:fs/promises'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../../src/data/db'
import {
  addRunningSessionItem,
  completePracticeSession,
  createTemplateFromSession,
  deletePlannedSession,
  duplicatePracticeSession,
  getSessionDetail,
  getSessions,
  removeRunningSessionItem,
  startPracticeSession,
  updateSessionName,
  updateSessionProgress,
} from '../../src/data/sessions'
import {
  createPracticeSession,
  createSessionTemplate,
  deleteSessionTemplate,
  updatePlannedSession,
  updateSessionTemplate,
  type TemplateItemInput,
} from '../../src/data/sessionTemplates'

let exerciseId = ''
let repertoireId = ''

function section(clientId: string, name: string, position: number): TemplateItemInput {
  return {
    clientId,
    parentClientId: null,
    type: 'SECTION',
    sourceId: null,
    name,
    notes: '',
    position,
  }
}

function practiceItem(
  clientId: string,
  parentClientId: string,
  type: 'EXERCISE' | 'REPERTOIRE',
  sourceId: string,
  name: string,
  position: number,
): TemplateItemInput {
  return {
    clientId,
    parentClientId,
    type,
    sourceId,
    name,
    notes: '',
    position,
  }
}

async function resetDatabase() {
  await pool.query(`
    TRUNCATE TABLE musician, exercise, repertoire, session_template, session
    RESTART IDENTITY CASCADE
  `)
  const musician = await pool.query<{ id: string }>(
    `INSERT INTO musician (is_admin) VALUES (TRUE) RETURNING id::text`,
  )
  const musicianId = musician.rows[0]!.id
  const exercise = await pool.query<{ id: string }>(
    `INSERT INTO exercise (musician_id, name) VALUES ($1, 'Test exercise') RETURNING id::text`,
    [musicianId],
  )
  const repertoire = await pool.query<{ id: string }>(
    `
      INSERT INTO repertoire (title, owner_musician_id, visibility, status)
      VALUES ('Test repertoire', $1, 'PRIVATE', 'APPROVED')
      RETURNING id::text
    `,
    [musicianId],
  )
  exerciseId = exercise.rows[0]!.id
  repertoireId = repertoire.rows[0]!.id
}

beforeEach(resetDatabase)
afterAll(() => pool.end())

describe('template persistence', () => {
  it('creates, edits, and deletes a template with cascading item cleanup', async () => {
    const created = await createSessionTemplate({
      data: {
        name: 'Created template',
        items: [
          section('warmup', 'Warmup', 1),
          practiceItem('exercise', 'warmup', 'EXERCISE', exerciseId, 'Test exercise', 1),
        ],
      },
    })

    const createdTemplate = await pool.query<{ name: string }>(
      `SELECT name FROM session_template WHERE id = $1`,
      [created.id],
    )
    const createdItems = await pool.query<{ id: string }>(
      `SELECT id::text FROM session_template_item WHERE session_template_id = $1 ORDER BY id`,
      [created.id],
    )
    expect(createdTemplate.rows[0]?.name).toBe('Created template')
    expect(createdItems.rows).toHaveLength(2)

    const originalItemIds = createdItems.rows.map((item) => item.id)
    await updateSessionTemplate({
      data: {
        id: created.id,
        name: 'Edited template',
        items: [
          section('repertoire', 'Repertoire', 1),
          practiceItem('piece', 'repertoire', 'REPERTOIRE', repertoireId, 'Test repertoire', 1),
        ],
      },
    })

    const editedTemplate = await pool.query<{ name: string }>(
      `SELECT name FROM session_template WHERE id = $1`,
      [created.id],
    )
    const oldItems = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM session_template_item WHERE id = ANY($1::bigint[])`,
      [originalItemIds],
    )
    const editedItems = await pool.query<{ id: string; type: string }>(
      `
        SELECT id::text, type::text
        FROM session_template_item
        WHERE session_template_id = $1
        ORDER BY position, id
      `,
      [created.id],
    )
    expect(editedTemplate.rows[0]?.name).toBe('Edited template')
    expect(oldItems.rows[0]?.count).toBe(0)
    expect(editedItems.rows.map((item) => item.type)).toEqual(['SECTION', 'REPERTOIRE'])

    const editedItemIds = editedItems.rows.map((item) => item.id)
    await deleteSessionTemplate({ data: created.id })

    const remainingTemplate = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM session_template WHERE id = $1`,
      [created.id],
    )
    const remainingChildren = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM session_template_item WHERE id = ANY($1::bigint[])`,
      [editedItemIds],
    )
    expect(remainingTemplate.rows[0]?.count).toBe(0)
    expect(remainingChildren.rows[0]?.count).toBe(0)
  })
})

describe('session persistence', () => {
  it('creates a blank session, edits its plan, and deletes it with cascading item cleanup', async () => {
    const created = await createPracticeSession({
      data: { templateId: null, assignedDate: null },
    })
    const initialItems = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM session_item WHERE session_id = $1`,
      [created.id],
    )
    expect(initialItems.rows[0]?.count).toBe(0)

    await updatePlannedSession({
      data: {
        id: created.id,
        name: 'Edited session',
        assignedDate: '2030-01-15',
        items: [
          section('section', 'Session section', 1),
          practiceItem('exercise', 'section', 'EXERCISE', exerciseId, 'Test exercise', 1),
        ],
      },
    })
    const editedSession = await pool.query<{ name: string; assignedDate: string }>(
      `SELECT name, assigned_date::text AS "assignedDate" FROM session WHERE id = $1`,
      [created.id],
    )
    const editedItems = await pool.query<{ id: string }>(
      `SELECT id::text FROM session_item WHERE session_id = $1 ORDER BY id`,
      [created.id],
    )
    expect(editedSession.rows[0]?.assignedDate).toBe('2030-01-15')
    expect(editedSession.rows[0]?.name).toBe('Edited session')
    expect(editedItems.rows).toHaveLength(2)

    const childIds = editedItems.rows.map((item) => item.id)
    await deletePlannedSession({ data: created.id })

    const remainingSession = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM session WHERE id = $1`,
      [created.id],
    )
    const remainingChildren = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM session_item WHERE id = ANY($1::bigint[])`,
      [childIds],
    )
    expect(remainingSession.rows[0]?.count).toBe(0)
    expect(remainingChildren.rows[0]?.count).toBe(0)
  })

  it('creates a session from a template with an independent copy of every item', async () => {
    const template = await createSessionTemplate({
      data: {
        name: 'Source template',
        items: [
          section('section', 'Main section', 1),
          practiceItem('exercise', 'section', 'EXERCISE', exerciseId, 'Test exercise', 1),
          practiceItem('repertoire', 'section', 'REPERTOIRE', repertoireId, 'Test repertoire', 2),
        ],
      },
    })
    const created = await createPracticeSession({
      data: { templateId: template.id, assignedDate: '2030-02-20' },
    })

    const copiedItems = await pool.query<{
      type: string
      exerciseId: string | null
      repertoireId: string | null
    }>(
      `
        SELECT type::text, exercise_id::text AS "exerciseId",
          repertoire_id::text AS "repertoireId"
        FROM session_item
        WHERE session_id = $1
        ORDER BY position, id
      `,
      [created.id],
    )
    expect(copiedItems.rows).toHaveLength(3)
    expect(copiedItems.rows.map((item) => item.type)).toEqual(['SECTION', 'EXERCISE', 'REPERTOIRE'])
    expect(copiedItems.rows.some((item) => item.exerciseId === exerciseId)).toBe(true)
    expect(copiedItems.rows.some((item) => item.repertoireId === repertoireId)).toBe(true)
  })

  it('duplicates a session without progress and creates an independent template from it', async () => {
    const sourceTemplate = await createSessionTemplate({
      data: {
        name: 'Evening practice',
        items: [
          section('section', 'Main section', 1),
          practiceItem('exercise', 'section', 'EXERCISE', exerciseId, 'Test exercise', 1),
          practiceItem('repertoire', 'section', 'REPERTOIRE', repertoireId, 'Test repertoire', 2),
        ],
      },
    })
    const source = await createPracticeSession({
      data: { templateId: sourceTemplate.id, assignedDate: '2030-02-20' },
    })
    await pool.query(
      `UPDATE session
       SET status = 'COMPLETED', timing_mode = 'MANUAL',
         started_at = '2030-02-20T18:00:00Z', ended_at = '2030-02-20T19:00:00Z'
       WHERE id = $1`,
      [source.id],
    )
    await pool.query(
      `UPDATE session_item
       SET status = 'COMPLETE',
         started_at = CASE WHEN type = 'SECTION' THEN NULL
           ELSE '2030-02-20T18:00:00Z'::timestamptz END,
         ended_at = CASE WHEN type = 'SECTION' THEN NULL
           ELSE '2030-02-20T18:20:00Z'::timestamptz END,
         added_during_session = TRUE
       WHERE session_id = $1`,
      [source.id],
    )

    const duplicated = await duplicatePracticeSession({ data: source.id })
    const duplicateSession = await pool.query<{
      name: string
      status: string
      templateId: string | null
      assignedDate: string | null
      timingMode: string | null
      startedAt: Date | null
      endedAt: Date | null
    }>(
      `SELECT name, status::text, session_template_id::text AS "templateId",
         assigned_date::text AS "assignedDate", timing_mode::text AS "timingMode",
         started_at AS "startedAt", ended_at AS "endedAt"
       FROM session WHERE id = $1`,
      [duplicated.id],
    )
    expect(duplicateSession.rows[0]).toMatchObject({
      name: 'Evening practice',
      status: 'PLANNED',
      templateId: null,
      assignedDate: null,
      timingMode: null,
      startedAt: null,
      endedAt: null,
    })

    const duplicateItems = await pool.query<{
      status: string
      startedAt: Date | null
      endedAt: Date | null
      addedDuringSession: boolean
      parentId: string | null
    }>(
      `SELECT status::text, started_at AS "startedAt", ended_at AS "endedAt",
         added_during_session AS "addedDuringSession", parent_id::text AS "parentId"
       FROM session_item WHERE session_id = $1 ORDER BY position, id`,
      [duplicated.id],
    )
    expect(duplicateItems.rows).toHaveLength(3)
    expect(duplicateItems.rows.every((item) => item.status === 'NOT_STARTED')).toBe(true)
    expect(
      duplicateItems.rows.every((item) => item.startedAt === null && item.endedAt === null),
    ).toBe(true)
    expect(duplicateItems.rows.every((item) => !item.addedDuringSession)).toBe(true)
    expect(duplicateItems.rows.filter((item) => item.parentId !== null)).toHaveLength(2)

    const createdTemplate = await createTemplateFromSession({ data: source.id })
    const template = await pool.query<{ name: string }>(
      `SELECT name FROM session_template WHERE id = $1`,
      [createdTemplate.id],
    )
    const templateItems = await pool.query<{ parentId: string | null }>(
      `SELECT parent_id::text AS "parentId"
       FROM session_template_item WHERE session_template_id = $1 ORDER BY position, id`,
      [createdTemplate.id],
    )
    expect(template.rows[0]?.name).toBe('Evening practice')
    expect(templateItems.rows).toHaveLength(3)
    expect(templateItems.rows.filter((item) => item.parentId !== null)).toHaveLength(2)

    const original = await pool.query<{ status: string; itemCount: number }>(
      `SELECT session.status::text AS status, count(item.id)::int AS "itemCount"
       FROM session LEFT JOIN session_item item ON item.session_id = session.id
       WHERE session.id = $1 GROUP BY session.id`,
      [source.id],
    )
    expect(original.rows[0]).toEqual({ status: 'COMPLETED', itemCount: 3 })
  })

  it('refuses to delete a session after it is no longer planned', async () => {
    const created = await createPracticeSession({
      data: { templateId: null, assignedDate: null },
    })
    await pool.query(`UPDATE session SET status = 'IN_PROGRESS' WHERE id = $1`, [created.id])

    await expect(deletePlannedSession({ data: created.id })).rejects.toThrow(
      'Only planned sessions can be deleted',
    )
    const remaining = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM session WHERE id = $1`,
      [created.id],
    )
    expect(remaining.rows[0]?.count).toBe(1)
  })

  it('enforces the assigned local date when starting a session', async () => {
    const created = await createPracticeSession({
      data: { templateId: null, assignedDate: '2030-03-15' },
    })

    await expect(
      startPracticeSession({
        data: { sessionId: created.id, timingMode: 'MANUAL', localDate: '2030-03-14' },
      }),
    ).rejects.toThrow('assigned local date')

    const started = await startPracticeSession({
      data: { sessionId: created.id, timingMode: 'MANUAL', localDate: '2030-03-15' },
    })
    expect(started.status).toBe('IN_PROGRESS')
    expect(started.timingMode).toBe('MANUAL')
  })

  it('supports checklist completion, optional timers, skips, and reset in manual mode', async () => {
    const created = await createPracticeSession({
      data: { templateId: null, assignedDate: null },
    })
    await updatePlannedSession({
      data: {
        id: created.id,
        name: 'Manual session',
        assignedDate: null,
        items: [
          section('section', 'Session section', 1),
          practiceItem('first', 'section', 'EXERCISE', exerciseId, 'First item', 1),
          practiceItem('second', 'section', 'REPERTOIRE', repertoireId, 'Second item', 2),
        ],
      },
    })
    const itemRows = await pool.query<{ id: string; name: string }>(
      `SELECT id::text, COALESCE(name, '') AS name FROM session_item
       WHERE session_id = $1 AND type <> 'SECTION' ORDER BY position`,
      [created.id],
    )
    const firstId = itemRows.rows[0]!.id
    const secondId = itemRows.rows[1]!.id

    const started = await startPracticeSession({
      data: { sessionId: created.id, timingMode: 'MANUAL', localDate: '2030-01-01' },
    })
    expect(started.items.filter((item) => item.status === 'IN_PROGRESS')).toHaveLength(0)
    expect(
      (await updateSessionName({ data: { sessionId: created.id, name: 'Renamed live' } })).name,
    ).toBe('Renamed live')

    const checked = await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: firstId, action: 'COMPLETE' }] },
    })
    const checkedItem = checked.items.find((item) => item.id === firstId)
    expect(checkedItem?.status).toBe('COMPLETE')
    expect(checkedItem?.startedAt).toBeNull()
    expect(checkedItem?.endedAt).toBeNull()

    await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: secondId, action: 'START' }] },
    })
    const skipped = await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: secondId, action: 'SKIP' }] },
    })
    const skippedItem = skipped.items.find((item) => item.id === secondId)
    expect(skippedItem?.status).toBe('SKIPPED')
    expect(skippedItem?.startedAt).toBeNull()
    expect(skipped.status).toBe('IN_PROGRESS')
    expect(
      (await getSessions()).find((session) => session.id === created.id)?.readyToFinalize,
    ).toBe(true)

    const reset = await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: secondId, action: 'RESET' }] },
    })
    expect(reset.status).toBe('IN_PROGRESS')
    expect(reset.items.find((item) => item.id === secondId)?.status).toBe('NOT_STARTED')

    await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: secondId, action: 'SKIP' }] },
    })
    const completed = await completePracticeSession({ data: created.id })
    expect(completed.status).toBe('COMPLETED')
    expect(completed.endedAt).not.toBeNull()
    expect(
      (await getSessions()).find((session) => session.id === created.id)?.readyToFinalize,
    ).toBe(false)
    await expect(
      updateSessionProgress({
        data: { sessionId: created.id, changes: [{ itemId: secondId, action: 'RESET' }] },
      }),
    ).rejects.toThrow('Only an in-progress session can be changed')
    await expect(
      updateSessionName({ data: { sessionId: created.id, name: 'Too late' } }),
    ).rejects.toThrow('Completed sessions cannot be renamed')
  })

  it('auto-times the next item and propagates section skips', async () => {
    const created = await createPracticeSession({
      data: { templateId: null, assignedDate: null },
    })
    await updatePlannedSession({
      data: {
        id: created.id,
        name: 'Auto session',
        assignedDate: null,
        items: [
          section('first-section', 'First section', 1),
          practiceItem('first', 'first-section', 'EXERCISE', exerciseId, 'First item', 1),
          section('second-section', 'Second section', 2),
          practiceItem('second', 'second-section', 'REPERTOIRE', repertoireId, 'Second item', 1),
        ],
      },
    })
    const rows = await pool.query<{
      id: string
      parentId: string | null
      type: string
      position: number
    }>(
      `SELECT id::text, parent_id::text AS "parentId", type::text, position::int
       FROM session_item WHERE session_id = $1 ORDER BY id`,
      [created.id],
    )
    const firstSection = rows.rows.find((item) => item.type === 'SECTION' && item.position === 1)!
    const secondSection = rows.rows.find((item) => item.type === 'SECTION' && item.position === 2)!
    const firstItem = rows.rows.find((item) => item.parentId === firstSection.id)!
    const secondItem = rows.rows.find((item) => item.parentId === secondSection.id)!

    const started = await startPracticeSession({
      data: { sessionId: created.id, timingMode: 'AUTO', localDate: '2030-01-01' },
    })
    expect(started.items.find((item) => item.id === firstItem.id)?.status).toBe('IN_PROGRESS')

    const skipped = await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: secondSection.id, action: 'SKIP' }] },
    })
    expect(skipped.items.find((item) => item.id === secondItem.id)?.status).toBe('SKIPPED')
    expect(skipped.items.find((item) => item.id === secondSection.id)?.status).toBe('SKIPPED')

    const completed = await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: firstItem.id, action: 'COMPLETE' }] },
    })
    expect(completed.items.find((item) => item.id === firstItem.id)?.endedAt).not.toBeNull()
    expect(completed.status).toBe('IN_PROGRESS')

    const reset = await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: secondSection.id, action: 'RESET' }] },
    })
    expect(reset.status).toBe('IN_PROGRESS')
    expect(reset.items.find((item) => item.id === secondItem.id)?.status).toBe('IN_PROGRESS')

    await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: secondItem.id, action: 'SKIP' }] },
    })
    expect((await completePracticeSession({ data: created.id })).status).toBe('COMPLETED')
  })

  it('only removes practice items that were added while the session was in progress', async () => {
    const created = await createPracticeSession({
      data: { templateId: null, assignedDate: null },
    })
    await updatePlannedSession({
      data: {
        id: created.id,
        name: 'Expandable session',
        assignedDate: null,
        items: [
          section('section', 'Main section', 1),
          practiceItem('original', 'section', 'EXERCISE', exerciseId, 'Original item', 1),
        ],
      },
    })
    await startPracticeSession({
      data: { sessionId: created.id, timingMode: 'MANUAL', localDate: '2030-01-01' },
    })
    const initial = await getSessionDetail({ data: created.id })
    const sectionId = initial!.items.find((item) => item.type === 'SECTION')!.id
    const originalId = initial!.items.find((item) => item.type !== 'SECTION')!.id

    const added = await addRunningSessionItem({
      data: {
        sessionId: created.id,
        parentId: sectionId,
        type: 'REPERTOIRE',
        sourceId: repertoireId,
        notes: 'Added on the fly',
      },
    })
    const expanded = await getSessionDetail({ data: created.id })
    expect(expanded?.items.find((item) => item.id === originalId)?.addedDuringSession).toBe(false)
    expect(expanded?.items.find((item) => item.id === added.id)).toMatchObject({
      parentId: sectionId,
      addedDuringSession: true,
      notes: 'Added on the fly',
    })

    await expect(
      removeRunningSessionItem({ data: { sessionId: created.id, itemId: originalId } }),
    ).rejects.toThrow('Only items added during an in-progress session can be removed')
    await removeRunningSessionItem({ data: { sessionId: created.id, itemId: added.id } })
    expect(
      (await getSessionDetail({ data: created.id }))?.items.some((item) => item.id === added.id),
    ).toBe(false)

    const finalAdded = await addRunningSessionItem({
      data: {
        sessionId: created.id,
        parentId: null,
        type: 'REPERTOIRE',
        sourceId: repertoireId,
        notes: '',
      },
    })
    await updateSessionProgress({
      data: {
        sessionId: created.id,
        changes: [
          { itemId: originalId, action: 'COMPLETE' },
          { itemId: finalAdded.id, action: 'SKIP' },
        ],
      },
    })
    await completePracticeSession({ data: created.id })
    await expect(
      addRunningSessionItem({
        data: {
          sessionId: created.id,
          parentId: null,
          type: 'EXERCISE',
          sourceId: exerciseId,
          notes: '',
        },
      }),
    ).rejects.toThrow('Items can only be added to an in-progress session')
    await expect(
      removeRunningSessionItem({ data: { sessionId: created.id, itemId: finalAdded.id } }),
    ).rejects.toThrow('Only items added during an in-progress session can be removed')
  })
})

describe('local development seed data', () => {
  it('loads completely after all migrations', async () => {
    await pool.query(`
      TRUNCATE TABLE musician, instrument, person, repertoire, session_template, session
      RESTART IDENTITY CASCADE
    `)
    const seedSql = await readFile(
      new URL('../../db/test_data/test_data.sql', import.meta.url),
      'utf8',
    )

    await pool.query(seedSql)

    const counts = await pool.query<{
      musicians: number
      exercises: number
      repertoire: number
      templates: number
      sessions: number
      sessionItems: number
    }>(`
      SELECT
        (SELECT count(*)::int FROM musician) AS musicians,
        (SELECT count(*)::int FROM exercise) AS exercises,
        (SELECT count(*)::int FROM repertoire) AS repertoire,
        (SELECT count(*)::int FROM session_template) AS templates,
        (SELECT count(*)::int FROM session) AS sessions,
        (SELECT count(*)::int FROM session_item) AS "sessionItems"
    `)
    expect(counts.rows[0]).toEqual({
      musicians: 3,
      exercises: 5,
      repertoire: 5,
      templates: 2,
      sessions: 3,
      sessionItems: 18,
    })
  })
})
