import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../../src/data/db'
import { deletePlannedSession } from '../../src/data/sessions'
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
        assignedDate: '2030-01-15',
        items: [
          section('section', 'Session section', 1),
          practiceItem('exercise', 'section', 'EXERCISE', exerciseId, 'Test exercise', 1),
        ],
      },
    })
    const editedSession = await pool.query<{ assignedDate: string }>(
      `SELECT assigned_date::text AS "assignedDate" FROM session WHERE id = $1`,
      [created.id],
    )
    const editedItems = await pool.query<{ id: string }>(
      `SELECT id::text FROM session_item WHERE session_id = $1 ORDER BY id`,
      [created.id],
    )
    expect(editedSession.rows[0]?.assignedDate).toBe('2030-01-15')
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
})
