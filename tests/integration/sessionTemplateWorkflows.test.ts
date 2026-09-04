import { readFile } from 'node:fs/promises';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '@/data/db';
import { createDevelopmentUser } from '@/data/auth';
import {
  EMPTY_EXERCISE_CATALOG_SEARCH,
  EMPTY_EXERCISE_LIBRARY_SEARCH,
  addExerciseToLibrary,
  createExercise,
  deleteExercise,
  getExerciseLibraryPage,
  getExercises,
  getOwnedExercisePage,
  getPublicExerciseCatalogPage,
  removeExerciseFromLibrary,
  updateExercise,
} from '@/data/exercises';
import { getMusicianInstrumentIds, updateMusicianInstrumentIds } from '@/data/preferences';
import {
  EMPTY_CATALOG_SEARCH,
  EMPTY_REPERTOIRE_LIBRARY_SEARCH,
  addRepertoireToLibrary,
  createChildRepertoire,
  createRepertoire,
  deleteRepertoire,
  getInstruments,
  getPublicRepertoireCatalog,
  getPublicRepertoireCatalogPage,
  getOwnedRepertoirePage,
  getRepertoire,
  getRepertoireDetail,
  getRepertoireLibraryPage,
  removeRepertoireFromLibrary,
  searchComposerNames,
  updateRepertoireLibraryNote,
  updateRepertoire,
} from '@/data/repertoire';
import {
  addRunningSessionItem,
  completePracticeSession,
  createTemplateFromSession,
  deletePlannedSession,
  EMPTY_SESSION_SEARCH,
  duplicatePracticeSession,
  getSessionDetail,
  getSessions,
  getSessionsPage,
  removeRunningSessionItem,
  startPracticeSession,
  updateSessionName,
  updateRunningSessionItemSessionNote,
  updateSessionProgress,
} from '@/data/sessions';
import {
  createPracticeSession,
  createSessionTemplate,
  deleteSessionTemplate,
  EMPTY_SESSION_TEMPLATE_SEARCH,
  getPlannedSessionForEdit,
  getSessionTemplates,
  getSessionTemplatesPage,
  getTemplateLibrary,
  updatePlannedSession,
  updateSessionTemplate,
  type TemplateItemInput,
} from '@/data/sessionTemplates';

let exerciseId = '';
let repertoireId = '';

function section(clientId: string, name: string, position: number): TemplateItemInput {
  return {
    clientId,
    parentClientId: null,
    type: 'SECTION',
    sourceId: null,
    name,
    instruction: '',
    position,
  };
}

function practiceItem(
  clientId: string,
  parentClientId: string,
  type: 'EXERCISE' | 'REPERTOIRE',
  sourceId: string,
  name: string,
  position: number,
  instruction = '',
): TemplateItemInput {
  return {
    clientId,
    parentClientId,
    type,
    sourceId,
    name,
    instruction,
    position,
  };
}

async function resetDatabase() {
  await pool.query(`
    TRUNCATE TABLE musician, exercise, repertoire, instrument, person, session_template, session
    RESTART IDENTITY CASCADE
  `);
  const musician = await pool.query<{ id: string }>(
    `INSERT INTO musician (is_admin, display_name)
     VALUES (TRUE, 'Integration test musician') RETURNING id::text`,
  );
  const musicianId = musician.rows[0]!.id;
  const exercise = await pool.query<{ id: string }>(
    `INSERT INTO exercise (musician_id, name) VALUES ($1, 'Test exercise') RETURNING id::text`,
    [musicianId],
  );
  const repertoire = await pool.query<{ id: string }>(
    `
      INSERT INTO repertoire (title, owner_musician_id, visibility, status)
      VALUES ('Test repertoire', $1, 'PRIVATE', 'APPROVED')
      RETURNING id::text
    `,
    [musicianId],
  );
  exerciseId = exercise.rows[0]!.id;
  repertoireId = repertoire.rows[0]!.id;
}

beforeEach(async () => {
  process.env.TEST_AUTH_MUSICIAN_ID = '1';
  process.env.TEST_AUTH_IS_ADMIN = 'true';
  process.env.AUTH_DEV_LOGIN_ENABLED = 'true';
  await resetDatabase();
});
afterAll(() => pool.end());

describe('musician instrument preferences', () => {
  it('replaces the saved list atomically', async () => {
    const instruments = await pool.query<{ id: string }>(
      `INSERT INTO instrument (name, family)
       VALUES ('Preference flute', 'WOODWIND'), ('Preference piano', 'KEYBOARD')
       RETURNING id::text`,
    );
    const ids = instruments.rows.map((instrument) => instrument.id);

    await expect(
      updateMusicianInstrumentIds({ data: [ids[0]!, ids[1]!, ids[0]!] }),
    ).resolves.toEqual(ids);
    await expect(getMusicianInstrumentIds()).resolves.toEqual(ids);

    await updateMusicianInstrumentIds({ data: [ids[0]!] });
    await expect(getMusicianInstrumentIds()).resolves.toEqual([ids[0]]);
    const orderedOptions = await getInstruments();
    expect(
      orderedOptions.map((instrument) => ({
        id: instrument.id,
        isPreferred: instrument.isPreferred,
      })),
    ).toEqual([
      { id: ids[0], isPreferred: true },
      { id: ids[1], isPreferred: false },
    ]);

    await expect(updateMusicianInstrumentIds({ data: ['999999'] })).rejects.toThrow(
      'Instrument not found',
    );
    await expect(getMusicianInstrumentIds()).resolves.toEqual([ids[0]]);
  });
});

describe('library item persistence', () => {
  it('suggests full composer names from accessible people with fuzzy matching', async () => {
    const otherMusician = await pool.query<{ id: string }>(
      `INSERT INTO musician (display_name) VALUES ('Composer owner') RETURNING id::text`,
    );
    await pool.query(
      `INSERT INTO person (name, owner_musician_id)
       VALUES
         ('Ludwig van Beethoven', NULL),
         ('Private Current Composer', 1),
         ('Private Other Composer', $1)`,
      [otherMusician.rows[0]!.id],
    );

    expect(await searchComposerNames({ data: 'Beethven' })).toEqual([
      expect.objectContaining({ name: 'Ludwig van Beethoven' }),
    ]);
    expect((await searchComposerNames({ data: 'Private' })).map((person) => person.name)).toEqual([
      'Private Current Composer',
    ]);
    expect(await searchComposerNames({ data: 'L' })).toEqual([]);
  });

  it('searches and paginates public exercises and adds them to My Library', async () => {
    const publisher = await pool.query<{ id: string }>(
      `INSERT INTO musician (display_name) VALUES ('Exercise publisher') RETURNING id::text`,
    );
    await pool.query(
      `INSERT INTO exercise (musician_id, name, notation_format, visibility)
       SELECT $1,
         CASE WHEN number = 27 THEN 'Chromatic scale study'
              ELSE 'Public exercise ' || lpad(number::text, 2, '0') END,
         CASE WHEN number % 2 = 0 THEN 'abc' ELSE 'text' END,
         'PUBLIC'
       FROM generate_series(1, 27) number`,
      [publisher.rows[0]!.id],
    );
    const privateExercise = await pool.query<{ id: string }>(
      `INSERT INTO exercise (musician_id, name, visibility)
       VALUES ($1, 'Private publisher exercise', 'PRIVATE') RETURNING id::text`,
      [publisher.rows[0]!.id],
    );

    const firstPage = await getPublicExerciseCatalogPage({
      data: EMPTY_EXERCISE_CATALOG_SEARCH,
    });
    const secondPage = await getPublicExerciseCatalogPage({
      data: { ...EMPTY_EXERCISE_CATALOG_SEARCH, page: 2 },
    });
    expect(firstPage).toMatchObject({ page: 1, pageSize: 25, total: 27, totalPages: 2 });
    expect(firstPage.items).toHaveLength(25);
    expect(secondPage.items).toHaveLength(2);
    expect(
      await getPublicExerciseCatalogPage({
        data: { ...EMPTY_EXERCISE_CATALOG_SEARCH, hasNotation: true },
      }),
    ).toMatchObject({ total: 13 });

    const fuzzyResult = await getPublicExerciseCatalogPage({
      data: { ...EMPTY_EXERCISE_CATALOG_SEARCH, query: 'chromtic' },
    });
    expect(fuzzyResult).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ name: 'Chromatic scale study', inLibrary: false })],
    });
    expect(await addExerciseToLibrary({ data: fuzzyResult.items[0]!.id })).toEqual({
      id: fuzzyResult.items[0]!.id,
    });
    expect(
      await getPublicExerciseCatalogPage({
        data: { ...EMPTY_EXERCISE_CATALOG_SEARCH, query: 'chromtic' },
      }),
    ).toMatchObject({ items: [expect.objectContaining({ inLibrary: true })] });
    await expect(addExerciseToLibrary({ data: privateExercise.rows[0]!.id })).rejects.toThrow(
      'Exercise not found',
    );
  });

  it('paginates repertoire and exercises in My Library on the server', async () => {
    await pool.query(
      `WITH inserted AS (
         INSERT INTO exercise (musician_id, name)
         SELECT 1, 'Library exercise ' || lpad(number::text, 2, '0')
         FROM generate_series(1, 21) number
         RETURNING id
       )
       INSERT INTO musician_exercise_library (musician_id, exercise_id)
       SELECT 1, id FROM inserted`,
    );
    await pool.query(
      `WITH inserted AS (
         INSERT INTO repertoire (title, owner_musician_id, visibility, status)
         SELECT 'Library repertoire ' || lpad(number::text, 2, '0'), 1, 'PRIVATE', 'APPROVED'
         FROM generate_series(1, 21) number
         RETURNING id
       )
       INSERT INTO musician_repertoire_library (musician_id, repertoire_id)
       SELECT 1, id FROM inserted`,
    );
    await pool.query(
      `UPDATE exercise
       SET name = 'Arpeggio workout', visibility = 'PUBLIC', notation_format = 'abc'
       WHERE name = 'Library exercise 21'`,
    );
    await pool.query(
      `UPDATE repertoire
       SET title = 'Piano Concerto 21', visibility = 'PUBLIC'
       WHERE title = 'Library repertoire 21'`,
    );
    const libraryComposer = await pool.query<{ id: string }>(
      `INSERT INTO person (name) VALUES ('Frédéric Chopin') RETURNING id::text`,
    );
    const libraryInstrument = await pool.query<{ id: string }>(
      `INSERT INTO instrument (name, family) VALUES ('Library piano', 'KEYBOARD') RETURNING id::text`,
    );
    await pool.query(
      `INSERT INTO repertoire_credit (repertoire_id, person_id, role, position)
       SELECT id, $1, 'COMPOSER', 1 FROM repertoire WHERE title = 'Piano Concerto 21'`,
      [libraryComposer.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO repertoire_instrument (repertoire_id, instrument_id, role, position)
       SELECT id, $1, 'SOLO', 1 FROM repertoire WHERE title = 'Piano Concerto 21'`,
      [libraryInstrument.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO repertoire (title, parent_repertoire_id, visibility, status)
       SELECT 'Larghetto movement', id, NULL, 'APPROVED'
       FROM repertoire
       WHERE title = 'Piano Concerto 21'`,
    );

    const exerciseFirstPage = await getExerciseLibraryPage({
      data: EMPTY_EXERCISE_LIBRARY_SEARCH,
    });
    const exerciseSecondPage = await getExerciseLibraryPage({
      data: { ...EMPTY_EXERCISE_LIBRARY_SEARCH, page: 2 },
    });
    expect(exerciseFirstPage).toMatchObject({ page: 1, pageSize: 20, total: 21, totalPages: 2 });
    expect(exerciseFirstPage.items).toHaveLength(20);
    expect(exerciseSecondPage.items).toHaveLength(1);

    const repertoireFirstPage = await getRepertoireLibraryPage({
      data: EMPTY_REPERTOIRE_LIBRARY_SEARCH,
    });
    const repertoireSecondPage = await getRepertoireLibraryPage({
      data: { ...EMPTY_REPERTOIRE_LIBRARY_SEARCH, page: 2 },
    });
    expect(repertoireFirstPage).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 21,
      totalPages: 2,
    });
    expect(repertoireFirstPage.items).toHaveLength(20);
    expect(repertoireSecondPage.items).toHaveLength(1);

    expect(
      await getExerciseLibraryPage({
        data: { ...EMPTY_EXERCISE_LIBRARY_SEARCH, query: 'arpegio' },
      }),
    ).toMatchObject({ total: 1, items: [expect.objectContaining({ name: 'Arpeggio workout' })] });
    expect(
      await getExerciseLibraryPage({
        data: {
          ...EMPTY_EXERCISE_LIBRARY_SEARCH,
          visibility: 'PUBLIC',
          hasNotation: true,
        },
      }),
    ).toMatchObject({ total: 1, items: [expect.objectContaining({ name: 'Arpeggio workout' })] });
    expect(
      await getRepertoireLibraryPage({
        data: { ...EMPTY_REPERTOIRE_LIBRARY_SEARCH, query: 'cncrto' },
      }),
    ).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ title: 'Piano Concerto 21' })],
    });
    expect(
      await getRepertoireLibraryPage({
        data: { ...EMPTY_REPERTOIRE_LIBRARY_SEARCH, query: 'Larghetto' },
      }),
    ).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          title: 'Piano Concerto 21',
          children: [expect.objectContaining({ title: 'Larghetto movement' })],
        }),
      ],
    });
    expect(
      await getRepertoireLibraryPage({
        data: {
          ...EMPTY_REPERTOIRE_LIBRARY_SEARCH,
          composer: 'chopn',
          instrumentIds: [libraryInstrument.rows[0]!.id],
          visibility: 'PUBLIC',
        },
      }),
    ).toMatchObject({ total: 1, items: [expect.objectContaining({ title: 'Piano Concerto 21' })] });

    const ownedExercises = await getOwnedExercisePage({ data: 1 });
    expect(ownedExercises).toMatchObject({ page: 1, pageSize: 25, total: 22, totalPages: 1 });
    const privateOwnedExercise = ownedExercises.items.find(
      (exercise) => exercise.name === 'Library exercise 01',
    )!;
    expect(privateOwnedExercise.inLibrary).toBe(true);
    expect(await removeExerciseFromLibrary({ data: privateOwnedExercise.id })).toEqual({
      id: privateOwnedExercise.id,
    });
    await expect(removeExerciseFromLibrary({ data: privateOwnedExercise.id })).rejects.toThrow(
      'Exercise is not in My Library',
    );
    expect(await getOwnedExercisePage({ data: 1 })).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: privateOwnedExercise.id, inLibrary: false }),
      ]),
    });
    expect(await addExerciseToLibrary({ data: privateOwnedExercise.id })).toEqual({
      id: privateOwnedExercise.id,
    });
  });

  it('creates, edits, and soft-deletes an exercise while preserving references', async () => {
    const created = await createExercise({
      data: {
        name: 'Created exercise',
        notation: 'Slowly, at 60 BPM',
        notationFormat: 'text',
        visibility: 'PRIVATE',
      },
    });
    await updateExercise({
      data: {
        id: created.id,
        name: 'Edited exercise',
        notation: 'Slowly, at 72 BPM',
        notationFormat: 'text',
        visibility: 'PUBLIC',
      },
    });
    const template = await createSessionTemplate({
      data: {
        name: 'Exercise reference',
        items: [
          section('section', 'Warmup', 1),
          practiceItem('exercise', 'section', 'EXERCISE', created.id, 'Edited exercise', 1),
        ],
      },
    });

    await deleteExercise({ data: created.id });

    const row = await pool.query<{ name: string; deleted: boolean }>(
      `SELECT name, deleted_at IS NOT NULL AS deleted FROM exercise WHERE id = $1`,
      [created.id],
    );
    const reference = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM session_template_item
       WHERE session_template_id = $1 AND exercise_id = $2`,
      [template.id, created.id],
    );
    expect(row.rows[0]).toEqual({ name: 'Edited exercise', deleted: true });
    expect(reference.rows[0]?.count).toBe(1);
    expect((await getExercises()).some((exercise) => exercise.id === created.id)).toBe(false);
  });

  it('creates, edits, and soft-deletes repertoire while preserving references', async () => {
    const instrument = await pool.query<{ id: string }>(
      `INSERT INTO instrument (name, family) VALUES ('Test trumpet', 'BRASS') RETURNING id::text`,
    );
    const created = await createRepertoire({
      data: {
        title: 'Created repertoire',
        visibility: 'PRIVATE',
        credits: [{ person: 'First Composer', role: 'COMPOSER' }],
        instruments: [
          { instrumentId: instrument.rows[0]!.id, role: 'SOLO', partName: 'First part' },
        ],
        resources: [{ type: 'SCORE', url: 'https://example.com/first-score' }],
      },
    });
    await updateRepertoire({
      data: {
        id: created.id,
        title: 'Edited repertoire',
        visibility: 'PUBLIC',
        credits: [
          { person: 'Edited Composer', role: 'COMPOSER' },
          { person: 'Test Arranger', role: 'ARRANGER' },
        ],
        instruments: [
          { instrumentId: instrument.rows[0]!.id, role: 'SOLO', partName: 'Edited part' },
        ],
        resources: [{ type: 'RECORDING', url: 'https://example.com/recording' }],
      },
    });
    expect(
      await updateRepertoireLibraryNote({ data: { id: created.id, note: 'First notes' } }),
    ).toEqual({ note: 'First notes' });
    expect(
      await updateRepertoireLibraryNote({ data: { id: created.id, note: 'Updated notes' } }),
    ).toEqual({ note: 'Updated notes' });
    expect(await updateRepertoireLibraryNote({ data: { id: created.id, note: '' } })).toEqual({
      note: null,
    });
    const details = await getRepertoireDetail({ data: created.id });
    expect(details).toMatchObject({
      credits: [
        { person: 'Edited Composer', role: 'COMPOSER' },
        { person: 'Test Arranger', role: 'ARRANGER' },
      ],
      instruments: [
        {
          instrumentId: instrument.rows[0]!.id,
          name: 'Test trumpet',
          role: 'SOLO',
          partName: 'Edited part',
        },
      ],
      resources: [{ type: 'RECORDING', url: 'https://example.com/recording' }],
    });
    const createdPeople = await pool.query<{ ownerId: string | null }>(
      `SELECT owner_musician_id::text AS "ownerId"
       FROM person WHERE name IN ('Edited Composer', 'Test Arranger')
       ORDER BY name`,
    );
    expect(createdPeople.rows).toEqual([{ ownerId: '1' }, { ownerId: '1' }]);
    const template = await createSessionTemplate({
      data: {
        name: 'Repertoire reference',
        visibility: 'PUBLIC',
        items: [
          section('section', 'Repertoire', 1),
          practiceItem('repertoire', 'section', 'REPERTOIRE', created.id, 'Edited repertoire', 1),
        ],
      },
    });

    await deleteRepertoire({ data: created.id });

    const row = await pool.query<{ title: string; notes: string | null; deleted: boolean }>(
      `SELECT repertoire.title, library.notes,
         repertoire.deleted_at IS NOT NULL AS deleted
       FROM repertoire
       JOIN musician_repertoire_library library ON library.repertoire_id = repertoire.id
       WHERE repertoire.id = $1`,
      [created.id],
    );
    const reference = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM session_template_item
       WHERE session_template_id = $1 AND repertoire_id = $2`,
      [template.id, created.id],
    );
    expect(row.rows[0]).toEqual({
      title: 'Edited repertoire',
      notes: null,
      deleted: true,
    });
    expect(reference.rows[0]?.count).toBe(1);
    expect((await getRepertoire()).some((repertoire) => repertoire.id === created.id)).toBe(false);
  });

  it('creates, edits, and deletes excerpt and measure-less child repertoire', async () => {
    const instruments = await pool.query<{ id: string }>(
      `INSERT INTO instrument (name, family)
       VALUES ('Parent orchestra', 'OTHER'), ('Excerpt horn', 'BRASS')
       RETURNING id::text`,
    );
    const parentInstrumentId = instruments.rows[0]!.id;
    const excerptInstrumentId = instruments.rows[1]!.id;
    const parent = await createRepertoire({
      data: {
        title: 'Multi-part work',
        visibility: 'PRIVATE',
        instruments: [{ instrumentId: parentInstrumentId, role: 'OTHER', partName: null }],
      },
    });
    const excerpt = await createChildRepertoire({
      data: {
        parentId: parent.id,
        title: 'Horn excerpt',
        visibility: 'PRIVATE',
        startMeasure: 12,
        endMeasure: 24,
        instruments: [{ instrumentId: excerptInstrumentId, role: 'SOLO', partName: 'Horn 1' }],
      },
    });
    const movement = await createChildRepertoire({
      data: {
        parentId: parent.id,
        title: 'Second movement',
        visibility: 'PRIVATE',
        startMeasure: null,
        endMeasure: null,
        instruments: [{ instrumentId: parentInstrumentId, role: 'OTHER', partName: null }],
      },
    });

    expect(await getRepertoireDetail({ data: parent.id })).toMatchObject({
      children: [
        { id: excerpt.id, title: 'Horn excerpt', startMeasure: 12, endMeasure: 24 },
        { id: movement.id, title: 'Second movement', startMeasure: null, endMeasure: null },
      ],
    });
    expect(await getRepertoireDetail({ data: excerpt.id })).toMatchObject({
      parent: { id: parent.id, title: 'Multi-part work' },
      instruments: [{ instrumentId: excerptInstrumentId, name: 'Excerpt horn' }],
    });

    const movementExcerpt = await createChildRepertoire({
      data: {
        parentId: movement.id,
        title: 'Second movement excerpt',
        visibility: 'PRIVATE',
        startMeasure: 8,
        endMeasure: 16,
      },
    });
    expect(await getRepertoireDetail({ data: movement.id })).toMatchObject({
      children: [{ id: movementExcerpt.id, title: 'Second movement excerpt' }],
    });
    await expect(
      createChildRepertoire({
        data: {
          parentId: excerpt.id,
          title: 'Nested beneath an excerpt',
          visibility: 'PRIVATE',
          startMeasure: null,
          endMeasure: null,
        },
      }),
    ).rejects.toThrow('Parent repertoire not found');

    await updateRepertoire({
      data: {
        id: excerpt.id,
        title: 'Edited horn excerpt',
        visibility: 'PRIVATE',
        startMeasure: 14,
        endMeasure: 30,
        instruments: [],
      },
    });
    expect(await getRepertoireDetail({ data: excerpt.id })).toMatchObject({
      title: 'Edited horn excerpt',
      startMeasure: 14,
      endMeasure: 30,
      instruments: [],
    });

    expect(() =>
      createChildRepertoire({
        data: {
          parentId: parent.id,
          title: 'Invalid excerpt',
          visibility: 'PRIVATE',
          startMeasure: 8,
          endMeasure: 4,
        },
      }),
    ).toThrow('ascending order');

    await deleteRepertoire({ data: movement.id });
    expect(await getRepertoireDetail({ data: movement.id })).toBeNull();
    expect(await getRepertoireDetail({ data: parent.id })).toMatchObject({
      children: [{ id: excerpt.id }],
    });
  });

  it('creates user-private children under public repertoire without exposing them to others', async () => {
    const publicParent = await pool.query<{ id: string }>(
      `INSERT INTO repertoire (external_id, title, visibility, status)
       VALUES ('SHARED-ORCHESTRAL-WORK', 'Shared orchestral work', 'PUBLIC', 'APPROVED')
       RETURNING id::text`,
    );
    const parentId = publicParent.rows[0]!.id;
    const child = await createChildRepertoire({
      data: {
        parentId,
        title: 'My audition excerpt',
        visibility: 'PRIVATE',
        startMeasure: 40,
        endMeasure: 52,
      },
    });

    expect(await getRepertoireDetail({ data: parentId })).toMatchObject({
      children: [{ id: child.id, title: 'My audition excerpt' }],
    });
    const storedChild = await pool.query<{ ownerId: string; visibility: string }>(
      `SELECT owner_musician_id::text AS "ownerId", visibility::text
       FROM repertoire WHERE id = $1`,
      [child.id],
    );
    expect(storedChild.rows[0]).toEqual({ ownerId: '1', visibility: 'PRIVATE' });
    await updateRepertoire({
      data: {
        id: child.id,
        title: 'My edited audition excerpt',
        visibility: 'PRIVATE',
        startMeasure: 41,
        endMeasure: 53,
      },
    });
    expect(await getRepertoireDetail({ data: child.id })).toMatchObject({
      title: 'My edited audition excerpt',
      startMeasure: 41,
      endMeasure: 53,
    });

    const otherMusician = await pool.query<{ id: string }>(
      `INSERT INTO musician (display_name) VALUES ('Other musician') RETURNING id::text`,
    );
    process.env.TEST_AUTH_MUSICIAN_ID = otherMusician.rows[0]!.id;
    try {
      expect(await getRepertoireDetail({ data: parentId })).toMatchObject({ children: [] });
      expect(await getRepertoireDetail({ data: child.id })).toBeNull();
      const catalogParent = (await getPublicRepertoireCatalog()).find(
        (item) => item.id === parentId,
      );
      expect(catalogParent).toMatchObject({ children: [] });
    } finally {
      process.env.TEST_AUTH_MUSICIAN_ID = '1';
    }
    await deleteRepertoire({ data: child.id });
    expect(await getRepertoireDetail({ data: child.id })).toBeNull();
  });

  it('paginates and filters the public repertoire catalog in the database', async () => {
    const instruments = await pool.query<{ id: string }>(
      `INSERT INTO instrument (name, family)
       VALUES ('Catalog piano', 'KEYBOARD'), ('Catalog violin', 'STRING')
       RETURNING id::text`,
    );
    const composer = await pool.query<{ id: string }>(
      `INSERT INTO person (name) VALUES ('Catalog Composer') RETURNING id::text`,
    );
    await pool.query(
      `INSERT INTO repertoire (title, composition_year, visibility, status)
       SELECT 'Catalog Work ' || lpad(number::text, 2, '0'), 1800 + number, 'PUBLIC', 'APPROVED'
       FROM generate_series(1, 28) number`,
    );
    const catalogChild = await pool.query<{ id: string }>(
      `INSERT INTO repertoire (title, parent_repertoire_id, visibility, status)
       SELECT 'Catalog Work 01 - First movement', id, NULL, 'APPROVED'
       FROM repertoire WHERE title = 'Catalog Work 01'
       RETURNING id::text`,
    );
    await pool.query(
      `INSERT INTO repertoire_credit (repertoire_id, person_id, role, position)
       SELECT id, $1, 'COMPOSER', 1 FROM repertoire WHERE title LIKE 'Catalog Work %'`,
      [composer.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO repertoire_instrument (repertoire_id, instrument_id, role, position)
       SELECT id, $1, 'SOLO', 1
       FROM repertoire
       WHERE title LIKE 'Catalog Work %' AND composition_year % 2 = 0`,
      [instruments.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO repertoire_instrument (repertoire_id, instrument_id, role, position)
       SELECT id, $1, 'SOLO', 2
       FROM repertoire
       WHERE title LIKE 'Catalog Work %' AND composition_year % 3 = 0`,
      [instruments.rows[1]!.id],
    );
    const chopin = await pool.query<{ id: string }>(
      `INSERT INTO person (name) VALUES ('Frédéric Chopin') RETURNING id::text`,
    );
    await pool.query(
      `INSERT INTO repertoire_credit (repertoire_id, person_id, role, position)
       SELECT id, $1, 'COMPOSER', 2
       FROM repertoire WHERE title = 'Catalog Work 02'`,
      [chopin.rows[0]!.id],
    );
    await pool.query(
      `UPDATE repertoire SET title = 'Catalog Piano Concerto 02'
       WHERE title = 'Catalog Work 02'`,
    );

    const firstPage = await getPublicRepertoireCatalogPage({ data: EMPTY_CATALOG_SEARCH });
    expect(firstPage).toMatchObject({ page: 1, pageSize: 25, total: 29, totalPages: 2 });
    expect(firstPage.items).toHaveLength(25);
    expect(
      await getPublicRepertoireCatalogPage({
        data: { ...EMPTY_CATALOG_SEARCH, query: 'Test repertoire' },
      }),
    ).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: repertoireId,
          title: 'Test repertoire',
          inLibrary: false,
          ownedByUser: true,
        }),
      ],
    });
    expect(await getOwnedRepertoirePage({ data: 1 })).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: repertoireId, inLibrary: false })],
    });
    expect(
      await getPublicRepertoireCatalogPage({
        data: { ...EMPTY_CATALOG_SEARCH, query: 'Cat' },
      }),
    ).toMatchObject({ total: 28 });
    expect(firstPage.items.find((item) => item.title === 'Catalog Work 01')?.children).toEqual([
      expect.objectContaining({ title: 'Catalog Work 01 - First movement' }),
    ]);
    expect(await addRepertoireToLibrary({ data: catalogChild.rows[0]!.id })).toEqual({
      id: catalogChild.rows[0]!.id,
    });
    const childLibraryEntry = await pool.query<{ repertoireId: string }>(
      `SELECT repertoire_id::text AS "repertoireId"
       FROM musician_repertoire_library
       WHERE musician_id = 1
         AND repertoire_id IN ($1, (SELECT parent_repertoire_id FROM repertoire WHERE id = $1))`,
      [catalogChild.rows[0]!.id],
    );
    expect(childLibraryEntry.rows).toEqual([{ repertoireId: catalogChild.rows[0]!.id }]);
    expect(await removeRepertoireFromLibrary({ data: catalogChild.rows[0]!.id })).toEqual({
      id: catalogChild.rows[0]!.id,
    });
    await expect(removeRepertoireFromLibrary({ data: catalogChild.rows[0]!.id })).rejects.toThrow(
      'Repertoire is not in My Library',
    );
    expect(await addRepertoireToLibrary({ data: repertoireId })).toEqual({ id: repertoireId });
    expect(await getOwnedRepertoirePage({ data: 1 })).toMatchObject({
      items: [expect.objectContaining({ id: repertoireId, inLibrary: true })],
    });
    expect(
      await getPublicRepertoireCatalogPage({
        data: { ...EMPTY_CATALOG_SEARCH, query: 'Test repertoire' },
      }),
    ).toMatchObject({ total: 0, items: [] });
    expect(await removeRepertoireFromLibrary({ data: repertoireId })).toEqual({ id: repertoireId });
    expect(
      await getPublicRepertoireCatalogPage({
        data: { ...EMPTY_CATALOG_SEARCH, query: 'Test repertoire' },
      }),
    ).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: repertoireId, inLibrary: false })],
    });
    expect(
      await getPublicRepertoireCatalogPage({
        data: { ...EMPTY_CATALOG_SEARCH, query: 'First movement' },
      }),
    ).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ title: 'Catalog Work 01' })],
    });
    const fuzzyDiagnostics = await pool.query<{
      score: number;
      threshold: string;
      matches: boolean;
    }>(
      `SELECT strict_word_similarity('cncrto', 'Catalog Piano Concerto 02') AS score,
         current_setting('pg_trgm.strict_word_similarity_threshold') AS threshold,
         'cncrto' <<% 'Catalog Piano Concerto 02' AS matches`,
    );
    expect(fuzzyDiagnostics.rows[0]).toMatchObject({ threshold: '0.22', matches: true });
    expect(fuzzyDiagnostics.rows[0]!.score).toBeGreaterThan(0.22);
    expect(
      await getPublicRepertoireCatalogPage({
        data: { ...EMPTY_CATALOG_SEARCH, query: 'cncrto' },
      }),
    ).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ title: 'Catalog Piano Concerto 02' })],
    });
    expect(
      await getPublicRepertoireCatalogPage({
        data: { ...EMPTY_CATALOG_SEARCH, composer: 'chopn' },
      }),
    ).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ title: 'Catalog Piano Concerto 02' })],
    });
    const secondPage = await getPublicRepertoireCatalogPage({
      data: { ...EMPTY_CATALOG_SEARCH, page: 2 },
    });
    expect(secondPage).toMatchObject({ page: 2, total: 29 });
    expect(secondPage.items).toHaveLength(4);

    const filtered = await getPublicRepertoireCatalogPage({
      data: {
        ...EMPTY_CATALOG_SEARCH,
        composer: 'catalog composer',
        yearFrom: 1810,
        yearTo: 1812,
        instrumentIds: instruments.rows.map((instrument) => instrument.id),
        instrumentMatch: 'ANY',
      },
    });
    expect(filtered.items.map((item) => item.compositionYear)).toEqual([1810, 1812]);

    const matchAll = await getPublicRepertoireCatalogPage({
      data: {
        ...EMPTY_CATALOG_SEARCH,
        instrumentIds: instruments.rows.map((instrument) => instrument.id),
        instrumentMatch: 'ALL',
      },
    });
    expect(matchAll.total).toBe(4);
  });

  it('keeps externally identified catalog entities system-owned and immutable', async () => {
    await expect(
      pool.query(
        `INSERT INTO person (external_id, name, owner_musician_id)
         VALUES ('Q-PERSON-INVALID', 'Invalid owned person', 1)`,
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO instrument (external_id, name, family, owner_musician_id)
         VALUES ('Q-INSTRUMENT-INVALID', 'Invalid owned instrument', 'OTHER', 1)`,
      ),
    ).rejects.toThrow();

    const systemRepertoire = await pool.query<{ id: string }>(
      `INSERT INTO repertoire
         (external_id, title, owner_musician_id, visibility, status,
          publication_date, publication_date_precision, publication_date_source)
       VALUES
         ('Q-WORK', 'Imported system work', NULL, 'PUBLIC', 'APPROVED',
          '1800-01-01', 'year', 'publication')
       RETURNING id::text`,
    );
    const id = systemRepertoire.rows[0]!.id;

    expect(await getRepertoireDetail({ data: id })).toMatchObject({
      id,
      title: 'Imported system work',
      compositionYear: 1800,
      systemOwned: true,
      ownerId: null,
      canEdit: false,
      canManage: false,
      canUse: true,
    });
    expect((await getPublicRepertoireCatalog()).find((item) => item.id === id)).toMatchObject({
      compositionYear: 1800,
    });

    await expect(
      updateRepertoire({
        data: {
          id,
          title: 'Attempted edit',
          visibility: 'PUBLIC',
        },
      }),
    ).rejects.toThrow('Repertoire not found');
    await expect(deleteRepertoire({ data: id })).rejects.toThrow('Repertoire not found');
  });
});

describe('template persistence', () => {
  it('tags exercises, templates, and sessions and filters each list by instrument', async () => {
    const instrument = await pool.query<{ id: string }>(
      `INSERT INTO instrument (name, family) VALUES ('Filter trumpet', 'BRASS') RETURNING id::text`,
    );
    const instrumentId = instrument.rows[0]!.id;
    const otherInstrument = await pool.query<{ id: string }>(
      `INSERT INTO instrument (name, family) VALUES ('Filter flute', 'WOODWIND') RETURNING id::text`,
    );
    const otherInstrumentId = otherInstrument.rows[0]!.id;
    const exercise = await createExercise({
      data: {
        name: 'Tagged exercise',
        notation: '',
        notationFormat: 'text',
        visibility: 'PRIVATE',
        instrumentId,
      },
    });
    await createExercise({
      data: {
        name: 'Untagged exercise',
        notation: '',
        notationFormat: 'text',
        visibility: 'PRIVATE',
      },
    });
    await createExercise({
      data: {
        name: 'Other instrument exercise',
        notation: '',
        notationFormat: 'text',
        visibility: 'PRIVATE',
        instrumentId: otherInstrumentId,
      },
    });
    await createRepertoire({
      data: {
        title: 'Tagged repertoire',
        visibility: 'PRIVATE',
        instruments: [{ instrumentId, role: 'SOLO', partName: null }],
      },
    });
    await createRepertoire({
      data: {
        title: 'Other instrument repertoire',
        visibility: 'PRIVATE',
        instruments: [{ instrumentId: otherInstrumentId, role: 'SOLO', partName: null }],
      },
    });
    const template = await createSessionTemplate({
      data: { name: 'Tagged template', instrumentId, items: [] },
    });
    const session = await createPracticeSession({
      data: { templateId: template.id, assignedDate: null, instrumentId },
    });

    const exercises = await getExerciseLibraryPage({
      data: { ...EMPTY_EXERCISE_LIBRARY_SEARCH, instrumentIds: [instrumentId] },
    });
    const templates = await getSessionTemplatesPage({
      data: { ...EMPTY_SESSION_TEMPLATE_SEARCH, instrumentIds: [instrumentId] },
    });
    const sessions = await getSessionsPage({
      data: { ...EMPTY_SESSION_SEARCH, instrumentIds: [instrumentId] },
    });

    expect(exercises.items).toEqual([
      expect.objectContaining({ id: exercise.id, instrumentId, instrumentName: 'Filter trumpet' }),
    ]);
    expect(templates.items).toEqual([
      expect.objectContaining({ id: template.id, instrumentId, instrumentName: 'Filter trumpet' }),
    ]);
    expect(sessions.items).toEqual([
      expect.objectContaining({ id: session.id, instrumentId, instrumentName: 'Filter trumpet' }),
    ]);

    const filteredPicker = await getTemplateLibrary({
      data: {
        instrumentId,
        exerciseAnyInstrument: false,
        repertoireAnyInstrument: false,
      },
    });
    expect(
      filteredPicker.filter((item) => item.type === 'EXERCISE').map((item) => item.name),
    ).toEqual(['Tagged exercise', 'Untagged exercise']);
    expect(
      filteredPicker.filter((item) => item.type === 'REPERTOIRE').map((item) => item.name),
    ).toEqual(['Tagged repertoire']);

    const anyInstrumentPicker = await getTemplateLibrary({
      data: {
        instrumentId,
        exerciseAnyInstrument: true,
        repertoireAnyInstrument: true,
      },
    });
    expect(anyInstrumentPicker.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        'Other instrument exercise',
        'Other instrument repertoire',
        'Tagged exercise',
        'Tagged repertoire',
        'Untagged exercise',
      ]),
    );

    const searchedPicker = await getTemplateLibrary({
      data: {
        instrumentId,
        exerciseAnyInstrument: true,
        repertoireAnyInstrument: true,
        query: 'Other instrument repertoire',
        type: 'REPERTOIRE',
      },
    });
    expect(searchedPicker.map((item) => item.name)).toEqual(['Other instrument repertoire']);
  });

  it('creates, edits, and deletes a template with cascading item cleanup', async () => {
    const created = await createSessionTemplate({
      data: {
        name: 'Created template',
        items: [
          section('warmup', 'Warmup', 1),
          practiceItem('exercise', 'warmup', 'EXERCISE', exerciseId, 'Test exercise', 1),
        ],
      },
    });

    const createdTemplate = await pool.query<{ name: string }>(
      `SELECT name FROM session_template WHERE id = $1`,
      [created.id],
    );
    const createdItems = await pool.query<{ id: string }>(
      `SELECT id::text FROM session_template_item WHERE session_template_id = $1 ORDER BY id`,
      [created.id],
    );
    expect(createdTemplate.rows[0]?.name).toBe('Created template');
    expect(createdItems.rows).toHaveLength(2);

    const originalItemIds = createdItems.rows.map((item) => item.id);
    await updateSessionTemplate({
      data: {
        id: created.id,
        name: 'Edited template',
        items: [
          section('repertoire', 'Repertoire', 1),
          practiceItem('piece', 'repertoire', 'REPERTOIRE', repertoireId, 'Test repertoire', 1),
        ],
      },
    });

    const editedTemplate = await pool.query<{ name: string }>(
      `SELECT name FROM session_template WHERE id = $1`,
      [created.id],
    );
    const oldItems = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM session_template_item WHERE id = ANY($1::bigint[])`,
      [originalItemIds],
    );
    const editedItems = await pool.query<{ id: string; type: string }>(
      `
        SELECT id::text, type::text
        FROM session_template_item
        WHERE session_template_id = $1
        ORDER BY position, id
      `,
      [created.id],
    );
    expect(editedTemplate.rows[0]?.name).toBe('Edited template');
    expect(oldItems.rows[0]?.count).toBe(0);
    expect(editedItems.rows.map((item) => item.type)).toEqual(['SECTION', 'REPERTOIRE']);

    const editedItemIds = editedItems.rows.map((item) => item.id);
    await deleteSessionTemplate({ data: created.id });

    const remainingTemplate = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM session_template WHERE id = $1`,
      [created.id],
    );
    const remainingChildren = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM session_template_item WHERE id = ANY($1::bigint[])`,
      [editedItemIds],
    );
    expect(remainingTemplate.rows[0]?.count).toBe(0);
    expect(remainingChildren.rows[0]?.count).toBe(0);
  });
});

describe('session persistence', () => {
  it('paginates template and session index views on the server', async () => {
    await pool.query(
      `INSERT INTO session_template (musician_id, name)
       SELECT 1, 'Paginated template ' || lpad(number::text, 2, '0')
       FROM generate_series(1, 21) number`,
    );
    await pool.query(
      `INSERT INTO session (musician_id, name, assigned_date)
       SELECT 1, 'Paginated session ' || lpad(number::text, 2, '0'),
         DATE '2030-01-01' + number
       FROM generate_series(1, 21) number`,
    );

    const templateFirstPage = await getSessionTemplatesPage({ data: 1 });
    const templateSecondPage = await getSessionTemplatesPage({ data: 2 });
    expect(templateFirstPage).toMatchObject({ page: 1, pageSize: 20, total: 21, totalPages: 2 });
    expect(templateFirstPage.items).toHaveLength(20);
    expect(templateSecondPage.items).toHaveLength(1);

    const sessionFirstPage = await getSessionsPage({ data: 1 });
    const sessionSecondPage = await getSessionsPage({ data: 2 });
    expect(sessionFirstPage).toMatchObject({ page: 1, pageSize: 20, total: 21, totalPages: 2 });
    expect(sessionFirstPage.items).toHaveLength(20);
    expect(sessionSecondPage.items).toHaveLength(1);
  });

  it('creates a blank session, edits its plan, and deletes it with cascading item cleanup', async () => {
    const created = await createPracticeSession({
      data: { templateId: null, assignedDate: null },
    });
    const initialItems = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM session_item WHERE session_id = $1`,
      [created.id],
    );
    expect(initialItems.rows[0]?.count).toBe(0);

    await updatePlannedSession({
      data: {
        id: created.id,
        name: 'Edited session',
        assignedDate: '2030-01-15',
        items: [
          section('section', 'Session section', 1),
          practiceItem(
            'exercise',
            'section',
            'EXERCISE',
            exerciseId,
            'Test exercise',
            1,
            'Keep the air moving',
          ),
        ],
      },
    });
    const editedSession = await pool.query<{ name: string; assignedDate: string }>(
      `SELECT name, assigned_date::text AS "assignedDate" FROM session WHERE id = $1`,
      [created.id],
    );
    const editedItems = await pool.query<{ id: string }>(
      `SELECT id::text FROM session_item WHERE session_id = $1 ORDER BY id`,
      [created.id],
    );
    expect(editedSession.rows[0]?.assignedDate).toBe('2030-01-15');
    expect(editedSession.rows[0]?.name).toBe('Edited session');
    expect(editedItems.rows).toHaveLength(2);

    const childIds = editedItems.rows.map((item) => item.id);
    await deletePlannedSession({ data: created.id });

    const remainingSession = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM session WHERE id = $1`,
      [created.id],
    );
    const remainingChildren = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM session_item WHERE id = ANY($1::bigint[])`,
      [childIds],
    );
    expect(remainingSession.rows[0]?.count).toBe(0);
    expect(remainingChildren.rows[0]?.count).toBe(0);
  });

  it('creates a session from a template with an independent copy of every item', async () => {
    const template = await createSessionTemplate({
      data: {
        name: 'Source template',
        items: [
          section('section', 'Main section', 1),
          practiceItem(
            'exercise',
            'section',
            'EXERCISE',
            exerciseId,
            'Test exercise',
            1,
            'Keep the air moving',
          ),
          practiceItem('repertoire', 'section', 'REPERTOIRE', repertoireId, 'Test repertoire', 2),
        ],
      },
    });
    const created = await createPracticeSession({
      data: { templateId: template.id, assignedDate: '2030-02-20' },
    });

    const copiedItems = await pool.query<{
      type: string;
      exerciseId: string | null;
      repertoireId: string | null;
      instruction: string | null;
      sessionNote: string | null;
    }>(
      `
        SELECT type::text, exercise_id::text AS "exerciseId",
          repertoire_id::text AS "repertoireId", instruction,
          session_note AS "sessionNote"
        FROM session_item
        WHERE session_id = $1
        ORDER BY position, id
      `,
      [created.id],
    );
    expect(copiedItems.rows).toHaveLength(3);
    expect(copiedItems.rows.map((item) => item.type)).toEqual([
      'SECTION',
      'EXERCISE',
      'REPERTOIRE',
    ]);
    expect(copiedItems.rows.some((item) => item.exerciseId === exerciseId)).toBe(true);
    expect(copiedItems.rows.some((item) => item.repertoireId === repertoireId)).toBe(true);
    expect(copiedItems.rows.find((item) => item.exerciseId === exerciseId)).toMatchObject({
      instruction: 'Keep the air moving',
      sessionNote: null,
    });
  });

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
    });
    const source = await createPracticeSession({
      data: { templateId: sourceTemplate.id, assignedDate: '2030-02-20' },
    });
    await pool.query(
      `UPDATE session
       SET status = 'COMPLETED', timing_mode = 'MANUAL',
         started_at = '2030-02-20T18:00:00Z', ended_at = '2030-02-20T19:00:00Z'
       WHERE id = $1`,
      [source.id],
    );
    await pool.query(
      `UPDATE session_item
       SET status = 'COMPLETE',
         started_at = CASE WHEN type = 'SECTION' THEN NULL
           ELSE '2030-02-20T18:00:00Z'::timestamptz END,
         ended_at = CASE WHEN type = 'SECTION' THEN NULL
           ELSE '2030-02-20T18:20:00Z'::timestamptz END,
         added_during_session = TRUE,
         session_note = CASE WHEN type = 'SECTION' THEN NULL
           ELSE 'Session-only observation' END
       WHERE session_id = $1`,
      [source.id],
    );

    const duplicated = await duplicatePracticeSession({ data: source.id });
    const duplicateSession = await pool.query<{
      name: string;
      status: string;
      templateId: string | null;
      assignedDate: string | null;
      timingMode: string | null;
      startedAt: Date | null;
      endedAt: Date | null;
    }>(
      `SELECT name, status::text, session_template_id::text AS "templateId",
         assigned_date::text AS "assignedDate", timing_mode::text AS "timingMode",
         started_at AS "startedAt", ended_at AS "endedAt"
       FROM session WHERE id = $1`,
      [duplicated.id],
    );
    expect(duplicateSession.rows[0]).toMatchObject({
      name: 'Evening practice',
      status: 'PLANNED',
      templateId: null,
      assignedDate: null,
      timingMode: null,
      startedAt: null,
      endedAt: null,
    });

    const duplicateItems = await pool.query<{
      status: string;
      startedAt: Date | null;
      endedAt: Date | null;
      addedDuringSession: boolean;
      parentId: string | null;
      sessionNote: string | null;
    }>(
      `SELECT status::text, started_at AS "startedAt", ended_at AS "endedAt",
         added_during_session AS "addedDuringSession", parent_id::text AS "parentId",
         session_note AS "sessionNote"
       FROM session_item WHERE session_id = $1 ORDER BY position, id`,
      [duplicated.id],
    );
    expect(duplicateItems.rows).toHaveLength(3);
    expect(duplicateItems.rows.every((item) => item.status === 'NOT_STARTED')).toBe(true);
    expect(
      duplicateItems.rows.every((item) => item.startedAt === null && item.endedAt === null),
    ).toBe(true);
    expect(duplicateItems.rows.every((item) => !item.addedDuringSession)).toBe(true);
    expect(duplicateItems.rows.every((item) => item.sessionNote === null)).toBe(true);
    expect(duplicateItems.rows.filter((item) => item.parentId !== null)).toHaveLength(2);

    const createdTemplate = await createTemplateFromSession({ data: source.id });
    const template = await pool.query<{ name: string }>(
      `SELECT name FROM session_template WHERE id = $1`,
      [createdTemplate.id],
    );
    const templateItems = await pool.query<{ parentId: string | null }>(
      `SELECT parent_id::text AS "parentId"
       FROM session_template_item WHERE session_template_id = $1 ORDER BY position, id`,
      [createdTemplate.id],
    );
    expect(template.rows[0]?.name).toBe('Evening practice');
    expect(templateItems.rows).toHaveLength(3);
    expect(templateItems.rows.filter((item) => item.parentId !== null)).toHaveLength(2);

    const original = await pool.query<{ status: string; itemCount: number }>(
      `SELECT session.status::text AS status, count(item.id)::int AS "itemCount"
       FROM session LEFT JOIN session_item item ON item.session_id = session.id
       WHERE session.id = $1 GROUP BY session.id`,
      [source.id],
    );
    expect(original.rows[0]).toEqual({ status: 'COMPLETED', itemCount: 3 });
  });

  it('refuses to delete a session after it is no longer planned', async () => {
    const created = await createPracticeSession({
      data: { templateId: null, assignedDate: null },
    });
    await pool.query(`UPDATE session SET status = 'IN_PROGRESS' WHERE id = $1`, [created.id]);

    await expect(deletePlannedSession({ data: created.id })).rejects.toThrow(
      'Only planned sessions can be deleted',
    );
    const remaining = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM session WHERE id = $1`,
      [created.id],
    );
    expect(remaining.rows[0]?.count).toBe(1);
  });

  it('enforces the assigned local date when starting a session', async () => {
    const created = await createPracticeSession({
      data: { templateId: null, assignedDate: '2030-03-15' },
    });

    await expect(
      startPracticeSession({
        data: { sessionId: created.id, timingMode: 'MANUAL', localDate: '2030-03-14' },
      }),
    ).rejects.toThrow('assigned local date');

    const started = await startPracticeSession({
      data: { sessionId: created.id, timingMode: 'MANUAL', localDate: '2030-03-15' },
    });
    expect(started.status).toBe('IN_PROGRESS');
    expect(started.timingMode).toBe('MANUAL');
  });

  it('supports checklist completion, optional timers, skips, and reset in manual mode', async () => {
    const created = await createPracticeSession({
      data: { templateId: null, assignedDate: null },
    });
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
    });
    const itemRows = await pool.query<{ id: string; name: string }>(
      `SELECT id::text, COALESCE(name, '') AS name FROM session_item
       WHERE session_id = $1 AND type <> 'SECTION' ORDER BY position`,
      [created.id],
    );
    const firstId = itemRows.rows[0]!.id;
    const secondId = itemRows.rows[1]!.id;

    const started = await startPracticeSession({
      data: { sessionId: created.id, timingMode: 'MANUAL', localDate: '2030-01-01' },
    });
    expect(started.items.filter((item) => item.status === 'IN_PROGRESS')).toHaveLength(0);
    expect(
      (await updateSessionName({ data: { sessionId: created.id, name: 'Renamed live' } })).name,
    ).toBe('Renamed live');

    const checked = await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: firstId, action: 'COMPLETE' }] },
    });
    const checkedItem = checked.items.find((item) => item.id === firstId);
    expect(checkedItem?.status).toBe('COMPLETE');
    expect(checkedItem?.startedAt).toBeNull();
    expect(checkedItem?.endedAt).toBeNull();

    await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: secondId, action: 'START' }] },
    });
    const skipped = await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: secondId, action: 'SKIP' }] },
    });
    const skippedItem = skipped.items.find((item) => item.id === secondId);
    expect(skippedItem?.status).toBe('SKIPPED');
    expect(skippedItem?.startedAt).toBeNull();
    expect(skipped.status).toBe('IN_PROGRESS');
    expect(
      (await getSessions()).find((session) => session.id === created.id)?.readyToFinalize,
    ).toBe(true);

    const reset = await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: secondId, action: 'RESET' }] },
    });
    expect(reset.status).toBe('IN_PROGRESS');
    expect(reset.items.find((item) => item.id === secondId)?.status).toBe('NOT_STARTED');

    await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: secondId, action: 'SKIP' }] },
    });
    const completed = await completePracticeSession({ data: created.id });
    expect(completed.status).toBe('COMPLETED');
    expect(completed.endedAt).not.toBeNull();
    expect(
      (await getSessions()).find((session) => session.id === created.id)?.readyToFinalize,
    ).toBe(false);
    await expect(
      updateSessionProgress({
        data: { sessionId: created.id, changes: [{ itemId: secondId, action: 'RESET' }] },
      }),
    ).rejects.toThrow('Only an in-progress session can be changed');
    await expect(
      updateSessionName({ data: { sessionId: created.id, name: 'Too late' } }),
    ).rejects.toThrow('Completed sessions cannot be renamed');
  });

  it('auto-times the next item and propagates section skips', async () => {
    const created = await createPracticeSession({
      data: { templateId: null, assignedDate: null },
    });
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
    });
    const rows = await pool.query<{
      id: string;
      parentId: string | null;
      type: string;
      position: number;
    }>(
      `SELECT id::text, parent_id::text AS "parentId", type::text, position::int
       FROM session_item WHERE session_id = $1 ORDER BY id`,
      [created.id],
    );
    const firstSection = rows.rows.find((item) => item.type === 'SECTION' && item.position === 1)!;
    const secondSection = rows.rows.find((item) => item.type === 'SECTION' && item.position === 2)!;
    const firstItem = rows.rows.find((item) => item.parentId === firstSection.id)!;
    const secondItem = rows.rows.find((item) => item.parentId === secondSection.id)!;

    const started = await startPracticeSession({
      data: { sessionId: created.id, timingMode: 'AUTO', localDate: '2030-01-01' },
    });
    expect(started.items.find((item) => item.id === firstItem.id)?.status).toBe('IN_PROGRESS');

    const skipped = await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: secondSection.id, action: 'SKIP' }] },
    });
    expect(skipped.items.find((item) => item.id === secondItem.id)?.status).toBe('SKIPPED');
    expect(skipped.items.find((item) => item.id === secondSection.id)?.status).toBe('SKIPPED');

    const completed = await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: firstItem.id, action: 'COMPLETE' }] },
    });
    expect(completed.items.find((item) => item.id === firstItem.id)?.endedAt).not.toBeNull();
    expect(completed.status).toBe('IN_PROGRESS');

    const reset = await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: secondSection.id, action: 'RESET' }] },
    });
    expect(reset.status).toBe('IN_PROGRESS');
    expect(reset.items.find((item) => item.id === secondItem.id)?.status).toBe('IN_PROGRESS');

    await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId: secondItem.id, action: 'SKIP' }] },
    });
    expect((await completePracticeSession({ data: created.id })).status).toBe('COMPLETED');
  });

  it('only removes practice items that were added while the session was in progress', async () => {
    const created = await createPracticeSession({
      data: { templateId: null, assignedDate: null },
    });
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
    });
    await startPracticeSession({
      data: { sessionId: created.id, timingMode: 'MANUAL', localDate: '2030-01-01' },
    });
    const initial = await getSessionDetail({ data: created.id });
    const sectionId = initial!.items.find((item) => item.type === 'SECTION')!.id;
    const originalId = initial!.items.find((item) => item.type !== 'SECTION')!.id;

    const added = await addRunningSessionItem({
      data: {
        sessionId: created.id,
        parentId: sectionId,
        type: 'REPERTOIRE',
        sourceId: repertoireId,
        instruction: 'Added on the fly',
      },
    });
    const expanded = await getSessionDetail({ data: created.id });
    expect(expanded?.items.find((item) => item.id === originalId)?.addedDuringSession).toBe(false);
    expect(expanded?.items.find((item) => item.id === added.id)).toMatchObject({
      parentId: sectionId,
      addedDuringSession: true,
      instruction: 'Added on the fly',
    });

    await expect(
      removeRunningSessionItem({ data: { sessionId: created.id, itemId: originalId } }),
    ).rejects.toThrow('Only items added during an in-progress session can be removed');
    await removeRunningSessionItem({ data: { sessionId: created.id, itemId: added.id } });
    expect(
      (await getSessionDetail({ data: created.id }))?.items.some((item) => item.id === added.id),
    ).toBe(false);

    const finalAdded = await addRunningSessionItem({
      data: {
        sessionId: created.id,
        parentId: null,
        type: 'REPERTOIRE',
        sourceId: repertoireId,
        instruction: '',
      },
    });
    await updateSessionProgress({
      data: {
        sessionId: created.id,
        changes: [
          { itemId: originalId, action: 'COMPLETE' },
          { itemId: finalAdded.id, action: 'SKIP' },
        ],
      },
    });
    await completePracticeSession({ data: created.id });
    await expect(
      addRunningSessionItem({
        data: {
          sessionId: created.id,
          parentId: null,
          type: 'EXERCISE',
          sourceId: exerciseId,
          instruction: '',
        },
      }),
    ).rejects.toThrow('Items can only be added to an in-progress session');
    await expect(
      removeRunningSessionItem({ data: { sessionId: created.id, itemId: finalAdded.id } }),
    ).rejects.toThrow('Only items added during an in-progress session can be removed');
  });

  it('adds, edits, and removes session notes while a session is in progress', async () => {
    const created = await createPracticeSession({
      data: { templateId: null, assignedDate: null },
    });
    await updatePlannedSession({
      data: {
        id: created.id,
        name: 'Session note test',
        assignedDate: null,
        items: [
          section('section', 'Main section', 1),
          practiceItem('exercise', 'section', 'EXERCISE', exerciseId, 'Exercise', 1),
        ],
      },
    });
    await startPracticeSession({
      data: { sessionId: created.id, timingMode: 'MANUAL', localDate: '2030-01-01' },
    });
    const started = await getSessionDetail({ data: created.id });
    const itemId = started!.items.find((item) => item.type === 'EXERCISE')!.id;

    await expect(
      updateRunningSessionItemSessionNote({
        data: { sessionId: created.id, itemId, sessionNote: '  Begin slowly  ' },
      }),
    ).resolves.toEqual({ sessionNote: 'Begin slowly' });
    expect(
      (await getSessionDetail({ data: created.id }))?.items.find((item) => item.id === itemId),
    ).toMatchObject({ instruction: null, sessionNote: 'Begin slowly' });

    await expect(
      updateRunningSessionItemSessionNote({
        data: { sessionId: created.id, itemId, sessionNote: 'Increase the tempo' },
      }),
    ).resolves.toEqual({ sessionNote: 'Increase the tempo' });

    await expect(
      updateRunningSessionItemSessionNote({
        data: { sessionId: created.id, itemId, sessionNote: '' },
      }),
    ).resolves.toEqual({ sessionNote: null });

    await updateSessionProgress({
      data: { sessionId: created.id, changes: [{ itemId, action: 'COMPLETE' }] },
    });
    await completePracticeSession({ data: created.id });
    await expect(
      updateRunningSessionItemSessionNote({
        data: { sessionId: created.id, itemId, sessionNote: 'Too late' },
      }),
    ).rejects.toThrow('Notes can only be changed during an in-progress session');
  });

  it('includes current repertoire children for random selection during a session', async () => {
    await pool.query(
      `INSERT INTO repertoire
         (title, parent_repertoire_id, owner_musician_id, visibility, status, deleted_at)
       VALUES
         ('Etude No. 2', $1, NULL, NULL, 'APPROVED', NULL),
         ('Etude No. 1', $1, NULL, NULL, 'APPROVED', NULL),
         ('Retired etude', $1, NULL, NULL, 'APPROVED', CURRENT_TIMESTAMP)`,
      [repertoireId],
    );
    const created = await createPracticeSession({
      data: { templateId: null, assignedDate: null },
    });
    await updatePlannedSession({
      data: {
        id: created.id,
        name: 'Random etude session',
        assignedDate: null,
        items: [
          section('section', 'Etudes', 1),
          practiceItem(
            'repertoire',
            'section',
            'REPERTOIRE',
            repertoireId,
            'Ignored',
            1,
            'Play through one etude',
          ),
        ],
      },
    });
    await startPracticeSession({
      data: { sessionId: created.id, timingMode: 'MANUAL', localDate: '2030-01-01' },
    });

    const started = await getSessionDetail({ data: created.id });
    expect(started?.items.find((item) => item.type === 'REPERTOIRE')).toMatchObject({
      repertoireChildren: [{ title: 'Etude No. 1' }, { title: 'Etude No. 2' }],
    });
  });
});

describe('local development seed data', () => {
  it('loads completely after all migrations', async () => {
    await pool.query(`
      TRUNCATE TABLE musician, instrument, person, repertoire, session_template, session
      RESTART IDENTITY CASCADE
    `);
    const seedSql = await readFile(
      new URL('../../db/test_data/test_data.sql', import.meta.url),
      'utf8',
    );

    await pool.query(seedSql);

    const counts = await pool.query<{
      musicians: number;
      exercises: number;
      repertoire: number;
      templates: number;
      sessions: number;
      sessionItems: number;
    }>(`
      SELECT
        (SELECT count(*)::int FROM musician) AS musicians,
        (SELECT count(*)::int FROM exercise) AS exercises,
        (SELECT count(*)::int FROM repertoire) AS repertoire,
        (SELECT count(*)::int FROM session_template) AS templates,
        (SELECT count(*)::int FROM session) AS sessions,
        (SELECT count(*)::int FROM session_item) AS "sessionItems"
    `);
    expect(counts.rows[0]).toEqual({
      musicians: 3,
      exercises: 5,
      repertoire: 9,
      templates: 2,
      sessions: 3,
      sessionItems: 18,
    });

    const etudes = await pool.query<{ title: string }>(
      `SELECT child.title
       FROM repertoire child
       JOIN repertoire book ON book.id = child.parent_repertoire_id
       WHERE book.title = 'Thirty Progressive Etudes'
       ORDER BY child.title`,
    );
    expect(etudes.rows.map((row) => row.title)).toEqual([
      'Etude No. 1 — Singing Tone',
      'Etude No. 2 — Even Articulation',
      'Etude No. 3 — Flexible Intervals',
    ]);

    const library = await getTemplateLibrary();
    expect(library.find((item) => item.name === 'Thirty Progressive Etudes')).toMatchObject({
      type: 'REPERTOIRE',
      children: [
        { name: 'Etude No. 1 — Singing Tone' },
        { name: 'Etude No. 2 — Even Articulation' },
        { name: 'Etude No. 3 — Flexible Intervals' },
      ],
    });
  });
});

describe('authorization boundaries', () => {
  it('creates and signs in a development user from a username', async () => {
    const created = await createDevelopmentUser({ data: 'New-Musician' });
    expect(created).toMatchObject({
      displayName: 'new-musician',
      isAdmin: false,
    });

    const identity = await pool.query<{ username: string }>(
      `SELECT provider_user_id AS username FROM auth_identity
       WHERE musician_id = $1 AND provider = 'development'`,
      [created.musicianId],
    );
    const sessions = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM auth_session WHERE musician_id = $1`,
      [created.musicianId],
    );
    expect(identity.rows[0]?.username).toBe('new-musician');
    expect(sessions.rows[0]?.count).toBe(1);
    await expect(createDevelopmentUser({ data: 'new-musician' })).rejects.toThrow(
      'That username is already in use',
    );
  });

  it('rejects publishing a template that references a private library item', async () => {
    await expect(
      createSessionTemplate({
        data: {
          name: 'Invalid public template',
          visibility: 'PUBLIC',
          items: [
            section('section', 'Section', 1),
            practiceItem('item', 'section', 'EXERCISE', exerciseId, 'Private item', 1),
          ],
        },
      }),
    ).rejects.toThrow('Public templates can only reference public library items');
  });

  it('only exposes accessible resources added to the musician library', async () => {
    const other = await pool.query<{ id: string }>(
      `INSERT INTO musician (display_name) VALUES ('Other musician') RETURNING id::text`,
    );
    const otherId = other.rows[0]!.id;
    const privateExercise = await pool.query<{ id: string }>(
      `INSERT INTO exercise (musician_id, name) VALUES ($1, 'Hidden exercise') RETURNING id::text`,
      [otherId],
    );
    const publicExercise = await pool.query<{ id: string }>(
      `INSERT INTO exercise (musician_id, name, visibility)
       VALUES ($1, 'Shared exercise', 'PUBLIC') RETURNING id::text`,
      [otherId],
    );
    await pool.query(
      `INSERT INTO session_template (musician_id, name, visibility)
       VALUES ($1, 'Hidden template', 'PRIVATE'), ($1, 'Shared template', 'PUBLIC')`,
      [otherId],
    );
    const otherSession = await pool.query<{ id: string }>(
      `INSERT INTO session (musician_id, name) VALUES ($1, 'Hidden session') RETURNING id::text`,
      [otherId],
    );

    expect((await getTemplateLibrary()).map((item) => item.id)).not.toContain(
      privateExercise.rows[0]!.id,
    );
    expect((await getTemplateLibrary()).map((item) => item.id)).not.toContain(
      publicExercise.rows[0]!.id,
    );
    expect((await getExercises()).map((item) => item.id)).not.toContain(publicExercise.rows[0]!.id);
    await pool.query(
      `INSERT INTO musician_exercise_library (musician_id, exercise_id) VALUES ($1, $2)`,
      [process.env.TEST_AUTH_MUSICIAN_ID, publicExercise.rows[0]!.id],
    );
    expect((await getTemplateLibrary()).map((item) => item.id)).toContain(
      publicExercise.rows[0]!.id,
    );
    expect((await getExercises()).map((item) => item.id)).toContain(publicExercise.rows[0]!.id);
    expect((await getSessionTemplates()).map((template) => template.name)).toEqual([
      'Shared template',
    ]);
    expect(await getSessionDetail({ data: otherSession.rows[0]!.id })).toBeNull();
    await expect(deletePlannedSession({ data: otherSession.rows[0]!.id })).rejects.toThrow(
      'Only planned sessions can be deleted',
    );

    process.env.TEST_AUTH_MUSICIAN_ID = otherId;
    process.env.TEST_AUTH_IS_ADMIN = 'false';
    expect((await getSessions()).map((session) => session.templateName)).toEqual([
      'Hidden session',
    ]);
  });

  it('keeps a session item snapshot after its public source becomes private', async () => {
    const other = await pool.query<{ id: string }>(
      `INSERT INTO musician (display_name) VALUES ('Publisher') RETURNING id::text`,
    );
    const source = await pool.query<{ id: string }>(
      `INSERT INTO exercise (musician_id, name, notation, visibility)
       VALUES ($1, 'Published label', 'Private detail', 'PUBLIC') RETURNING id::text`,
      [other.rows[0]!.id],
    );
    const created = await createPracticeSession({
      data: { templateId: null, assignedDate: null },
    });
    await updatePlannedSession({
      data: {
        id: created.id,
        name: 'Snapshot test',
        assignedDate: null,
        items: [
          section('section', 'Section', 1),
          practiceItem('item', 'section', 'EXERCISE', source.rows[0]!.id, 'Ignored', 1),
        ],
      },
    });

    await pool.query(
      `UPDATE exercise SET name = 'Private label', visibility = 'PRIVATE' WHERE id = $1`,
      [source.rows[0]!.id],
    );
    const editable = await getPlannedSessionForEdit({ data: created.id });
    const existingItem = editable?.items.find((item) => item.type === 'EXERCISE');
    expect(existingItem?.sourceId).toBe(source.rows[0]!.id);

    await updatePlannedSession({
      data: {
        id: created.id,
        name: editable!.name,
        assignedDate: editable!.assignedDate,
        items: editable!.items,
      },
    });

    const detail = await getSessionDetail({ data: created.id });
    expect(detail?.items.find((item) => item.type === 'EXERCISE')).toMatchObject({
      name: 'Published label',
      notation: null,
    });
  });

  it('rejects a parent item from a different session container', async () => {
    const first = await createPracticeSession({ data: { templateId: null, assignedDate: null } });
    const second = await createPracticeSession({ data: { templateId: null, assignedDate: null } });
    const parent = await pool.query<{ id: string }>(
      `INSERT INTO session_item (session_id, type, position, name)
       VALUES ($1, 'SECTION', 1, 'Parent') RETURNING id::text`,
      [first.id],
    );
    await expect(
      pool.query(
        `INSERT INTO session_item
           (session_id, parent_id, type, position, exercise_id, name)
         VALUES ($1, $2, 'EXERCISE', 1, $3, 'Child')`,
        [second.id, parent.rows[0]!.id, exerciseId],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
