import { createServerFn } from '@tanstack/solid-start';
import type { PoolClient } from 'pg';
import { authMiddleware } from '@/auth/middleware';
import { pool, toIsoString } from '@/data/db';
import {
  LIBRARY_ITEM_TYPE,
  PRACTICE_ITEM_TYPE,
  SESSION_ITEM_ACTION,
  SESSION_ITEM_STATUS,
  SESSION_TIMING_MODE,
  isLibraryItemType,
  isIncompleteSessionItemStatus,
  isResolvedSessionItemStatus,
  isSessionItemAction,
  isSessionTimingMode,
  type LibraryItemType,
  type PracticeItemType,
  type SessionItemAction,
  type SessionItemStatus,
  type SessionStatus,
  type SessionTimingMode,
} from '@/domain/session';

export type { SessionItemAction, SessionItemStatus, SessionStatus, SessionTimingMode };

export type SessionRow = {
  id: string;
  templateName: string;
  status: SessionStatus;
  assignedDate: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  itemCount: number;
  readyToFinalize: boolean;
  instrumentId: string | null;
  instrumentName: string | null;
};

export type SessionPage = {
  items: SessionRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const SESSION_PAGE_SIZE = 20;
export type SessionSearchInput = { instrumentIds: string[]; page: number };
export const EMPTY_SESSION_SEARCH: SessionSearchInput = { instrumentIds: [], page: 1 };

function validateInstrumentIds(instrumentIds: string[]) {
  const ids = [...new Set(instrumentIds)];
  if (ids.length > 50 || ids.some((id) => !/^\d+$/.test(id))) {
    throw new Error('Invalid instrument filter');
  }
  return ids;
}

export type SessionDetailItem = {
  id: string;
  parentId: string | null;
  type: PracticeItemType;
  position: number;
  name: string;
  instruction: string | null;
  sessionNote: string | null;
  notation: string | null;
  notationFormat: string | null;
  repertoireChildren: { id: string; title: string }[];
  status: SessionItemStatus;
  addedDuringSession: boolean;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
};

export type SessionDetail = {
  id: string;
  templateName: string;
  status: SessionStatus;
  timingMode: SessionTimingMode | null;
  assignedDate: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  items: SessionDetailItem[];
};

export type SessionProgressUpdate = {
  status: SessionStatus;
  timingMode: SessionTimingMode | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  items: Array<
    Pick<SessionDetailItem, 'id' | 'status' | 'startedAt' | 'endedAt' | 'durationMinutes'>
  >;
};

export const getSessionsPage = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((input: SessionSearchInput | number) => {
    const search = typeof input === 'number' ? { instrumentIds: [], page: input } : input;
    if (!Number.isInteger(search.page) || search.page < 1) throw new Error('Invalid page');
    return { ...search, instrumentIds: validateInstrumentIds(search.instrumentIds) };
  })
  .handler(async ({ data, context }): Promise<SessionPage> => {
    const page = data.page;
    const offset = (page - 1) * SESSION_PAGE_SIZE;
    const instrumentCondition =
      data.instrumentIds.length > 0 ? ` AND session.instrument_id = ANY($2::bigint[])` : '';
    const countParameters =
      data.instrumentIds.length > 0
        ? [context.user.musicianId, data.instrumentIds]
        : [context.user.musicianId];
    const listParameters = [...countParameters, SESSION_PAGE_SIZE, offset];
    const limitParameter = `$${countParameters.length + 1}`;
    const offsetParameter = `$${countParameters.length + 2}`;
    const [countResult, result] = await Promise.all([
      pool.query<{ total: number }>(
        `SELECT count(*)::integer AS total FROM session WHERE musician_id = $1${instrumentCondition}`,
        countParameters,
      ),
      pool.query<{
        id: string;
        templateName: string;
        status: SessionStatus;
        assignedDate: string | null;
        assignedAt: Date | null;
        startedAt: Date | null;
        endedAt: Date | null;
        durationMinutes: number | null;
        itemCount: number;
        readyToFinalize: boolean;
        instrumentId: string | null;
        instrumentName: string | null;
      }>(
        `SELECT
           session.id::text,
           session.name AS "templateName",
           session.status::text,
           to_char(session.assigned_date, 'YYYY-MM-DD') AS "assignedDate",
           session.assigned_at AS "assignedAt",
           session.started_at AS "startedAt",
           session.ended_at AS "endedAt",
           CASE WHEN count(item.id) FILTER (
             WHERE item.started_at IS NOT NULL AND item.ended_at IS NOT NULL
           ) > 0 THEN round(sum(extract(epoch FROM (item.ended_at - item.started_at))) / 60)::int
           ELSE NULL END AS "durationMinutes",
           count(item.id)::int AS "itemCount",
           (
             session.status = 'IN_PROGRESS'
             AND count(item.id) FILTER (
               WHERE item.status NOT IN ('COMPLETE', 'SKIPPED')
             ) = 0
           ) AS "readyToFinalize"
           ,session.instrument_id::text AS "instrumentId"
           ,instrument.name AS "instrumentName"
         FROM session
         LEFT JOIN session_template template ON template.id = session.session_template_id
         LEFT JOIN session_item item ON item.session_id = session.id AND item.type <> 'SECTION'
         LEFT JOIN instrument ON instrument.id = session.instrument_id
         WHERE session.musician_id = $1${instrumentCondition}
         GROUP BY session.id, template.name, instrument.name
         ORDER BY COALESCE(
           session.started_at,
           session.assigned_date::timestamp AT TIME ZONE current_setting('TIMEZONE')
         ) DESC NULLS LAST, session.id DESC
         LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
        listParameters,
      ),
    ]);
    const total = countResult.rows[0]?.total ?? 0;
    return {
      items: result.rows.map((row) => ({
        ...row,
        assignedAt: toIsoString(row.assignedAt),
        startedAt: toIsoString(row.startedAt),
        endedAt: toIsoString(row.endedAt),
      })),
      page,
      pageSize: SESSION_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / SESSION_PAGE_SIZE),
    };
  });

export const getSessionDetail = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((sessionId: string) => {
    if (!/^\d+$/.test(sessionId)) {
      throw new Error('Session ID must be a positive integer');
    }

    return sessionId;
  })
  .handler(async ({ data: sessionId, context }): Promise<SessionDetail | null> => {
    const [sessionResult, itemResult] = await Promise.all([
      pool.query<{
        id: string;
        templateName: string;
        status: SessionStatus;
        timingMode: SessionTimingMode | null;
        assignedDate: string | null;
        assignedAt: Date | null;
        startedAt: Date | null;
        endedAt: Date | null;
        durationMinutes: number | null;
      }>(
        `
          SELECT
            session.id::text,
            session.name AS "templateName",
            session.status::text,
            session.timing_mode::text AS "timingMode",
            to_char(session.assigned_date, 'YYYY-MM-DD') AS "assignedDate",
            session.assigned_at AS "assignedAt",
            session.started_at AS "startedAt",
            session.ended_at AS "endedAt",
            (
              SELECT round(sum(extract(epoch FROM (timed.ended_at - timed.started_at))) / 60)::int
              FROM session_item timed
              WHERE timed.session_id = session.id
                AND timed.started_at IS NOT NULL AND timed.ended_at IS NOT NULL
            ) AS "durationMinutes"
          FROM session
          LEFT JOIN session_template template ON template.id = session.session_template_id
          WHERE session.id = $1 AND session.musician_id = $2
        `,
        [sessionId, context.user.musicianId],
      ),
      pool.query<{
        id: string;
        parentId: string | null;
        type: PracticeItemType;
        position: number;
        name: string;
        instruction: string | null;
        sessionNote: string | null;
        notation: string | null;
        notationFormat: string | null;
        repertoireChildren: { id: string; title: string }[];
        status: SessionItemStatus;
        addedDuringSession: boolean;
        startedAt: Date | null;
        endedAt: Date | null;
        durationMinutes: number | null;
      }>(
        `
          WITH RECURSIVE repertoire_access AS (
            SELECT id, owner_musician_id, visibility
            FROM repertoire
            WHERE parent_repertoire_id IS NULL AND deleted_at IS NULL
            UNION ALL
            SELECT child.id,
              COALESCE(child.owner_musician_id, access.owner_musician_id),
              COALESCE(child.visibility, access.visibility)
            FROM repertoire child
            JOIN repertoire_access access ON access.id = child.parent_repertoire_id
            WHERE child.deleted_at IS NULL
          )
          SELECT
            item.id::text,
            item.parent_id::text AS "parentId",
            item.type::text,
            item.position::float8 AS position,
            COALESCE(item.name, 'Untitled item') AS name,
            item.instruction,
            item.session_note AS "sessionNote",
            exercise.notation,
            exercise.notation_format AS "notationFormat",
            COALESCE(
              CASE WHEN item.type = 'REPERTOIRE' THEN (
                SELECT jsonb_agg(
                  jsonb_build_object('id', child.id::text, 'title', child.title)
                  ORDER BY child.title, child.id
                )
                FROM repertoire child
                JOIN repertoire_access access ON access.id = child.id
                WHERE child.parent_repertoire_id = item.repertoire_id
                  AND (access.owner_musician_id = $2 OR access.visibility = 'PUBLIC')
              ) END,
              '[]'::jsonb
            ) AS "repertoireChildren",
            item.status::text,
            item.added_during_session AS "addedDuringSession",
            item.started_at AS "startedAt",
            item.ended_at AS "endedAt",
            CASE
              WHEN item.started_at IS NOT NULL AND item.ended_at IS NOT NULL
                THEN round(extract(epoch FROM (item.ended_at - item.started_at)) / 60)::int
              ELSE NULL
            END AS "durationMinutes"
          FROM session_item item
          LEFT JOIN exercise ON exercise.id = item.exercise_id
            AND exercise.deleted_at IS NULL
            AND (exercise.musician_id = $2 OR exercise.visibility = 'PUBLIC')
          WHERE item.session_id = $1
            AND EXISTS (
              SELECT 1 FROM session
              WHERE session.id = item.session_id AND session.musician_id = $2
            )
          ORDER BY item.parent_id NULLS FIRST, item.position, item.id
        `,
        [sessionId, context.user.musicianId],
      ),
    ]);

    const session = sessionResult.rows[0];
    if (!session) return null;

    return {
      ...session,
      assignedAt: toIsoString(session.assignedAt),
      startedAt: toIsoString(session.startedAt),
      endedAt: toIsoString(session.endedAt),
      items: itemResult.rows.map((item) => ({
        ...item,
        startedAt: toIsoString(item.startedAt),
        endedAt: toIsoString(item.endedAt),
      })),
    };
  });

export const deletePlannedSession = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((sessionId: string) => {
    if (!/^\d+$/.test(sessionId)) throw new Error('Invalid session');
    return sessionId;
  })
  .handler(async ({ data: sessionId, context }): Promise<{ id: string }> => {
    const result = await pool.query<{ id: string }>(
      `
        DELETE FROM session
        WHERE id = $1
          AND status = 'PLANNED'
          AND musician_id = $2
        RETURNING id::text
      `,
      [sessionId, context.user.musicianId],
    );
    const deletedSession = result.rows[0];
    if (!deletedSession) throw new Error('Only planned sessions can be deleted');
    return deletedSession;
  });

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value);
}

type SessionOutlineRow = {
  id: string;
  parentId: string | null;
  type: PracticeItemType;
  position: string;
  exerciseId: string | null;
  repertoireId: string | null;
  name: string | null;
  instruction: string | null;
};

async function copySessionOutline(
  client: PoolClient,
  sourceSessionId: string,
  destination: { type: 'SESSION' | 'TEMPLATE'; id: string },
) {
  const itemResult = await client.query<SessionOutlineRow>(
    `
      SELECT id::text, parent_id::text AS "parentId", type::text,
        position::text, exercise_id::text AS "exerciseId",
        repertoire_id::text AS "repertoireId", name, instruction
      FROM session_item
      WHERE session_id = $1
      ORDER BY parent_id NULLS FIRST, position, id
    `,
    [sourceSessionId],
  );
  const copiedIds = new Map<string, string>();
  const remaining = [...itemResult.rows];
  while (remaining.length > 0) {
    const index = remaining.findIndex(
      (item) => item.parentId === null || copiedIds.has(item.parentId),
    );
    if (index < 0) throw new Error('Session hierarchy could not be copied');
    const [item] = remaining.splice(index, 1);
    if (!item) continue;
    const parentId = item.parentId ? copiedIds.get(item.parentId) : null;
    const result =
      destination.type === 'SESSION'
        ? await client.query<{ id: string }>(
            `
              INSERT INTO session_item
                (session_id, parent_id, type, position, exercise_id, repertoire_id, name, instruction)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              RETURNING id::text
            `,
            [
              destination.id,
              parentId,
              item.type,
              item.position,
              item.exerciseId,
              item.repertoireId,
              item.name,
              item.instruction,
            ],
          )
        : await client.query<{ id: string }>(
            `
              INSERT INTO session_template_item
                (session_template_id, parent_id, type, position, exercise_id, repertoire_id, name, instruction)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              RETURNING id::text
            `,
            [
              destination.id,
              parentId,
              item.type,
              item.position,
              item.exerciseId,
              item.repertoireId,
              item.name,
              item.instruction,
            ],
          );
    const copiedId = result.rows[0]?.id;
    if (!copiedId) throw new Error('Session outline could not be copied');
    copiedIds.set(item.id, copiedId);
  }
}

export const duplicatePracticeSession = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((sessionId: string) => {
    if (!validId(sessionId)) throw new Error('Invalid session');
    return sessionId;
  })
  .handler(async ({ data: sessionId, context }): Promise<{ id: string }> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sourceResult = await client.query<{ name: string }>(
        `
          SELECT session.name
          FROM session
          WHERE session.id = $1
            AND session.musician_id = $2
          FOR SHARE
        `,
        [sessionId, context.user.musicianId],
      );
      const source = sourceResult.rows[0];
      if (!source) throw new Error('Session not found');

      const sessionResult = await client.query<{ id: string }>(
        `
          INSERT INTO session (musician_id, name)
          VALUES ($1, $2)
          RETURNING id::text
        `,
        [context.user.musicianId, source.name],
      );
      const duplicatedId = sessionResult.rows[0]?.id;
      if (!duplicatedId) throw new Error('Session could not be duplicated');
      await copySessionOutline(client, sessionId, { type: 'SESSION', id: duplicatedId });
      await client.query('COMMIT');
      return { id: duplicatedId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

export const createTemplateFromSession = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((sessionId: string) => {
    if (!validId(sessionId)) throw new Error('Invalid session');
    return sessionId;
  })
  .handler(async ({ data: sessionId, context }): Promise<{ id: string }> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sourceResult = await client.query<{ musicianId: string; name: string }>(
        `
          SELECT session.musician_id::text AS "musicianId", session.name
          FROM session
          WHERE session.id = $1
            AND session.musician_id = $2
          FOR SHARE
        `,
        [sessionId, context.user.musicianId],
      );
      const source = sourceResult.rows[0];
      if (!source) throw new Error('Session not found');

      const templateResult = await client.query<{ id: string }>(
        `
          INSERT INTO session_template (musician_id, name)
          VALUES ($1, $2)
          RETURNING id::text
        `,
        [source.musicianId, source.name],
      );
      const templateId = templateResult.rows[0]?.id;
      if (!templateId) throw new Error('Template could not be created');
      await copySessionOutline(client, sessionId, { type: 'TEMPLATE', id: templateId });
      await client.query('COMMIT');
      return { id: templateId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

async function refreshSectionStates(client: PoolClient, sessionId: string) {
  await client.query(
    `
      WITH RECURSIVE descendants AS (
        SELECT section.id AS section_id, child.id
        FROM session_item section
        JOIN session_item child ON child.parent_id = section.id
        WHERE section.session_id = $1 AND section.type = 'SECTION'
        UNION ALL
        SELECT descendants.section_id, child.id
        FROM descendants
        JOIN session_item child ON child.parent_id = descendants.id
      ), states AS (
        SELECT section.id AS section_id,
          CASE
            WHEN count(item.id) = 0 THEN 'NOT_STARTED'::session_item_status
            WHEN bool_and(item.status = 'SKIPPED') THEN 'SKIPPED'::session_item_status
            WHEN bool_and(item.status IN ('COMPLETE', 'SKIPPED'))
              THEN 'COMPLETE'::session_item_status
            WHEN bool_or(item.status IN ('IN_PROGRESS', 'COMPLETE'))
              THEN 'IN_PROGRESS'::session_item_status
            ELSE 'NOT_STARTED'::session_item_status
          END AS status
        FROM session_item section
        LEFT JOIN descendants ON descendants.section_id = section.id
        LEFT JOIN session_item item
          ON item.id = descendants.id AND item.type <> 'SECTION'
        WHERE section.session_id = $1 AND section.type = 'SECTION'
        GROUP BY section.id
      )
      UPDATE session_item section
      SET status = states.status, started_at = NULL, ended_at = NULL
      FROM states
      WHERE section.id = states.section_id
    `,
    [sessionId],
  );
}

async function startNextAutoItem(client: PoolClient, sessionId: string) {
  const mode = await client.query<{ timingMode: SessionTimingMode | null }>(
    `SELECT timing_mode::text AS "timingMode" FROM session WHERE id = $1`,
    [sessionId],
  );
  if (mode.rows[0]?.timingMode !== SESSION_TIMING_MODE.AUTO) return;

  const active = await client.query(
    `SELECT 1 FROM session_item
     WHERE session_id = $1 AND type <> 'SECTION' AND status = 'IN_PROGRESS' LIMIT 1`,
    [sessionId],
  );
  if (active.rowCount) return;

  await client.query(
    `
      WITH RECURSIVE ordered_items AS (
        SELECT id, type, status, ARRAY[position]::numeric[] AS path
        FROM session_item
        WHERE session_id = $1 AND parent_id IS NULL
        UNION ALL
        SELECT child.id, child.type, child.status, parent.path || child.position
        FROM ordered_items parent
        JOIN session_item child ON child.parent_id = parent.id
      ), next_item AS (
        SELECT id FROM ordered_items
        WHERE type <> 'SECTION' AND status = 'NOT_STARTED'
        ORDER BY path LIMIT 1
      )
      UPDATE session_item item
      SET status = 'IN_PROGRESS', started_at = CURRENT_TIMESTAMP, ended_at = NULL
      FROM next_item
      WHERE item.id = next_item.id
    `,
    [sessionId],
  );
}

async function progressUpdate(
  client: PoolClient,
  sessionId: string,
): Promise<SessionProgressUpdate> {
  const [sessionResult, itemResult] = await Promise.all([
    client.query<{
      status: SessionStatus;
      timingMode: SessionTimingMode | null;
      startedAt: Date | null;
      endedAt: Date | null;
      durationMinutes: number | null;
    }>(
      `SELECT status::text, timing_mode::text AS "timingMode",
        started_at AS "startedAt", ended_at AS "endedAt",
        (
          SELECT round(sum(extract(epoch FROM (item.ended_at - item.started_at))) / 60)::int
          FROM session_item item
          WHERE item.session_id = session.id
            AND item.started_at IS NOT NULL AND item.ended_at IS NOT NULL
        ) AS "durationMinutes"
       FROM session WHERE id = $1`,
      [sessionId],
    ),
    client.query<{
      id: string;
      status: SessionItemStatus;
      startedAt: Date | null;
      endedAt: Date | null;
      durationMinutes: number | null;
    }>(
      `SELECT id::text, status::text, started_at AS "startedAt", ended_at AS "endedAt",
        CASE WHEN started_at IS NOT NULL AND ended_at IS NOT NULL
          THEN round(extract(epoch FROM (ended_at - started_at)) / 60)::int
          ELSE NULL END AS "durationMinutes"
       FROM session_item WHERE session_id = $1`,
      [sessionId],
    ),
  ]);
  const session = sessionResult.rows[0];
  if (!session) throw new Error('Session not found');
  return {
    ...session,
    startedAt: toIsoString(session.startedAt),
    endedAt: toIsoString(session.endedAt),
    items: itemResult.rows.map((item) => ({
      ...item,
      startedAt: toIsoString(item.startedAt),
      endedAt: toIsoString(item.endedAt),
    })),
  };
}

export const startPracticeSession = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { sessionId: string; timingMode: SessionTimingMode; localDate: string }) => {
    if (!validId(input.sessionId)) throw new Error('Invalid session');
    if (!isSessionTimingMode(input.timingMode)) {
      throw new Error('Invalid timing mode');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate)) throw new Error('Invalid local date');
    return input;
  })
  .handler(async ({ data, context }): Promise<SessionProgressUpdate> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE session
         SET status = 'IN_PROGRESS', timing_mode = $2, started_at = CURRENT_TIMESTAMP,
           ended_at = NULL
         WHERE id = $1 AND status = 'PLANNED'
           AND (assigned_date IS NULL OR assigned_date = $3::date)
           AND musician_id = $4
         RETURNING id`,
        [data.sessionId, data.timingMode, data.localDate, context.user.musicianId],
      );
      if (!result.rowCount) {
        throw new Error('This session can only be started on its assigned local date');
      }
      await startNextAutoItem(client, data.sessionId);
      await refreshSectionStates(client, data.sessionId);
      const update = await progressUpdate(client, data.sessionId);
      await client.query('COMMIT');
      return update;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

export const updateSessionProgress = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    (input: {
      sessionId: string;
      changes: Array<{ itemId: string; action: SessionItemAction }>;
    }) => {
      if (!validId(input.sessionId)) throw new Error('Invalid session');
      if (
        !Array.isArray(input.changes) ||
        input.changes.length === 0 ||
        input.changes.length > 100
      ) {
        throw new Error('Provide between 1 and 100 changes');
      }
      for (const change of input.changes) {
        if (!validId(change.itemId)) throw new Error('Invalid session item');
        if (!isSessionItemAction(change.action)) {
          throw new Error('Invalid session item action');
        }
      }
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<SessionProgressUpdate> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sessionResult = await client.query<{ timingMode: SessionTimingMode }>(
        `SELECT timing_mode::text AS "timingMode" FROM session
         WHERE id = $1 AND status = 'IN_PROGRESS'
           AND musician_id = $2
         FOR UPDATE`,
        [data.sessionId, context.user.musicianId],
      );
      const session = sessionResult.rows[0];
      if (!session) throw new Error('Only an in-progress session can be changed');

      for (const change of data.changes) {
        const itemResult = await client.query<{
          type: SessionDetailItem['type'];
          status: SessionItemStatus;
        }>(
          `SELECT type::text, status::text FROM session_item
           WHERE id = $1 AND session_id = $2 FOR UPDATE`,
          [change.itemId, data.sessionId],
        );
        const item = itemResult.rows[0];
        if (!item) throw new Error('Session item not found');

        if (item.type === PRACTICE_ITEM_TYPE.SECTION) {
          if (change.action === SESSION_ITEM_ACTION.SKIP) {
            const blocked = await client.query(
              `WITH RECURSIVE descendants AS (
                 SELECT id, type, status FROM session_item WHERE parent_id = $1
                 UNION ALL
                 SELECT child.id, child.type, child.status
                 FROM descendants parent
                 JOIN session_item child ON child.parent_id = parent.id
               )
               SELECT 1 FROM descendants
               WHERE type <> 'SECTION' AND status IN ('IN_PROGRESS', 'COMPLETE') LIMIT 1`,
              [change.itemId],
            );
            if (blocked.rowCount) throw new Error('Only an unstarted section can be skipped');
            await client.query(
              `WITH RECURSIVE descendants AS (
                 SELECT id FROM session_item WHERE parent_id = $1
                 UNION ALL
                 SELECT child.id FROM descendants parent
                 JOIN session_item child ON child.parent_id = parent.id
               )
               UPDATE session_item item
               SET status = 'SKIPPED', started_at = NULL, ended_at = NULL
               WHERE item.id IN (SELECT id FROM descendants) AND item.type <> 'SECTION'`,
              [change.itemId],
            );
          } else if (
            change.action === SESSION_ITEM_ACTION.RESET &&
            item.status === SESSION_ITEM_STATUS.SKIPPED
          ) {
            await client.query(
              `WITH RECURSIVE descendants AS (
                 SELECT id FROM session_item WHERE parent_id = $1
                 UNION ALL
                 SELECT child.id FROM descendants parent
                 JOIN session_item child ON child.parent_id = parent.id
               )
               UPDATE session_item item
               SET status = 'NOT_STARTED', started_at = NULL, ended_at = NULL
               WHERE item.id IN (SELECT id FROM descendants)
                 AND item.type <> 'SECTION' AND item.status = 'SKIPPED'`,
              [change.itemId],
            );
          } else {
            throw new Error('That section action is not available');
          }
          continue;
        }

        if (change.action === SESSION_ITEM_ACTION.START) {
          if (
            session.timingMode !== SESSION_TIMING_MODE.MANUAL ||
            item.status !== SESSION_ITEM_STATUS.NOT_STARTED
          ) {
            throw new Error('This item cannot be started manually');
          }
          const active = await client.query(
            `SELECT 1 FROM session_item
             WHERE session_id = $1 AND type <> 'SECTION' AND status = 'IN_PROGRESS' LIMIT 1`,
            [data.sessionId],
          );
          if (active.rowCount) throw new Error('Complete or skip the active item first');
          await client.query(
            `UPDATE session_item SET status = 'IN_PROGRESS', started_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [change.itemId],
          );
        } else if (change.action === SESSION_ITEM_ACTION.COMPLETE) {
          if (!isIncompleteSessionItemStatus(item.status)) {
            throw new Error('Only an incomplete item can be completed');
          }
          await client.query(
            `UPDATE session_item SET status = 'COMPLETE',
               ended_at = CASE WHEN started_at IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END
             WHERE id = $1`,
            [change.itemId],
          );
        } else if (change.action === SESSION_ITEM_ACTION.SKIP) {
          if (!isIncompleteSessionItemStatus(item.status)) {
            throw new Error('Only an incomplete item can be skipped');
          }
          await client.query(
            `UPDATE session_item SET status = 'SKIPPED', started_at = NULL, ended_at = NULL
             WHERE id = $1`,
            [change.itemId],
          );
        } else if (change.action === SESSION_ITEM_ACTION.RESET) {
          if (!isResolvedSessionItemStatus(item.status)) {
            throw new Error('Only a complete or skipped item can be reset');
          }
          await client.query(
            `UPDATE session_item SET status = 'NOT_STARTED', started_at = NULL, ended_at = NULL
             WHERE id = $1`,
            [change.itemId],
          );
        }
      }

      await startNextAutoItem(client, data.sessionId);
      await refreshSectionStates(client, data.sessionId);
      const update = await progressUpdate(client, data.sessionId);
      await client.query('COMMIT');
      return update;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

export const completePracticeSession = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((sessionId: string) => {
    if (!validId(sessionId)) throw new Error('Invalid session');
    return sessionId;
  })

  .handler(async ({ data: sessionId, context }): Promise<SessionProgressUpdate> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE session
         SET status = 'COMPLETED', ended_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'IN_PROGRESS'
           AND musician_id = $2
           AND NOT EXISTS (
             SELECT 1 FROM session_item
             WHERE session_id = session.id AND type <> 'SECTION'
               AND status NOT IN ('COMPLETE', 'SKIPPED')
           )
         RETURNING id`,
        [sessionId, context.user.musicianId],
      );
      if (!result.rowCount) {
        throw new Error('Resolve every practice item before completing the session');
      }
      const update = await progressUpdate(client, sessionId);
      await client.query('COMMIT');
      return update;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

export const updateSessionName = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { sessionId: string; name: string }) => {
    if (!validId(input.sessionId)) throw new Error('Invalid session');
    const name = input.name.trim();
    if (!name) throw new Error('Session name is required');
    if (name.length > 200) throw new Error('Session name must be 200 characters or fewer');
    return { sessionId: input.sessionId, name };
  })
  .handler(async ({ data, context }): Promise<{ name: string }> => {
    const result = await pool.query<{ name: string }>(
      `UPDATE session SET name = $2
       WHERE id = $1 AND status IN ('PLANNED', 'IN_PROGRESS')
         AND musician_id = $3
       RETURNING name`,
      [data.sessionId, data.name, context.user.musicianId],
    );
    const session = result.rows[0];
    if (!session) throw new Error('Completed sessions cannot be renamed');
    return session;
  });

export const updateRunningSessionItemSessionNote = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { sessionId: string; itemId: string; sessionNote: string }) => {
    if (!validId(input.sessionId) || !validId(input.itemId)) {
      throw new Error('Invalid session item');
    }
    const sessionNote = input.sessionNote.trim();
    if (sessionNote.length > 2000) {
      throw new Error('Session notes must be 2000 characters or fewer');
    }
    return { ...input, sessionNote };
  })
  .handler(async ({ data, context }): Promise<{ sessionNote: string | null }> => {
    const result = await pool.query<{ sessionNote: string | null }>(
      `UPDATE session_item item
       SET session_note = NULLIF($3, '')
       FROM session
       WHERE item.id = $2 AND item.session_id = $1 AND item.type <> 'SECTION'
         AND session.id = item.session_id AND session.status = 'IN_PROGRESS'
         AND session.musician_id = $4
       RETURNING item.session_note AS "sessionNote"`,
      [data.sessionId, data.itemId, data.sessionNote, context.user.musicianId],
    );
    const item = result.rows[0];
    if (!item) throw new Error('Notes can only be changed during an in-progress session');
    return item;
  });

export const addRunningSessionItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    (input: {
      sessionId: string;
      parentId: string | null;
      type: LibraryItemType;
      sourceId: string;
      instruction: string;
    }) => {
      if (!validId(input.sessionId)) throw new Error('Invalid session');
      if (input.parentId !== null && !validId(input.parentId)) throw new Error('Invalid section');
      if (!validId(input.sourceId)) throw new Error('Invalid practice item');
      if (!isLibraryItemType(input.type)) {
        throw new Error('Invalid practice item type');
      }
      if (input.instruction.length > 2000) {
        throw new Error('Instructions must be 2000 characters or fewer');
      }
      return { ...input, instruction: input.instruction.trim() };
    },
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const session = await client.query(
        `SELECT 1 FROM session
         WHERE id = $1 AND status = 'IN_PROGRESS'
           AND musician_id = $2
         FOR UPDATE`,
        [data.sessionId, context.user.musicianId],
      );
      if (!session.rowCount) throw new Error('Items can only be added to an in-progress session');

      if (data.parentId) {
        const parent = await client.query(
          `SELECT 1 FROM session_item
           WHERE id = $1 AND session_id = $2 AND type = 'SECTION'`,
          [data.parentId, data.sessionId],
        );
        if (!parent.rowCount) throw new Error('Destination section not found');
      }

      const source =
        data.type === LIBRARY_ITEM_TYPE.EXERCISE
          ? await client.query<{ name: string }>(
              `SELECT COALESCE(name, 'Untitled exercise') AS name
               FROM exercise WHERE id = $1 AND deleted_at IS NULL
                 AND (musician_id = $2 OR visibility = 'PUBLIC')`,
              [data.sourceId, context.user.musicianId],
            )
          : await client.query<{ name: string }>(
              `WITH RECURSIVE access AS (
                 SELECT id, title, owner_musician_id, visibility
                 FROM repertoire WHERE parent_repertoire_id IS NULL AND deleted_at IS NULL
                 UNION ALL
                 SELECT child.id, child.title,
                   COALESCE(child.owner_musician_id, access.owner_musician_id),
                   COALESCE(child.visibility, access.visibility)
                 FROM repertoire child JOIN access ON access.id = child.parent_repertoire_id
                 WHERE child.deleted_at IS NULL
               )
               SELECT title AS name FROM access
               WHERE id = $1 AND (owner_musician_id = $2 OR visibility = 'PUBLIC')`,
              [data.sourceId, context.user.musicianId],
            );
      const sourceName = source.rows[0]?.name;
      if (!sourceName) throw new Error('Practice item not found');

      const result = await client.query<{ id: string }>(
        `INSERT INTO session_item
          (session_id, parent_id, type, position, exercise_id, repertoire_id, name, instruction,
           added_during_session)
         VALUES (
           $1, $2, $3,
           COALESCE((
             SELECT max(position) + 1 FROM session_item
             WHERE session_id = $1 AND parent_id IS NOT DISTINCT FROM $2::bigint
           ), 1),
           $4, $5, $6, $7, TRUE
         )
         RETURNING id::text`,
        [
          data.sessionId,
          data.parentId,
          data.type,
          data.type === LIBRARY_ITEM_TYPE.EXERCISE ? data.sourceId : null,
          data.type === LIBRARY_ITEM_TYPE.REPERTOIRE ? data.sourceId : null,
          sourceName,
          data.instruction || null,
        ],
      );
      await startNextAutoItem(client, data.sessionId);
      await refreshSectionStates(client, data.sessionId);
      await client.query('COMMIT');
      return { id: result.rows[0]!.id };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

export const removeRunningSessionItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { sessionId: string; itemId: string }) => {
    if (!validId(input.sessionId) || !validId(input.itemId))
      throw new Error('Invalid session item');
    return input;
  })
  .handler(
    async ({ data, context }): Promise<SessionProgressUpdate & { removedItemId: string }> => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query<{ id: string }>(
          `DELETE FROM session_item item
           USING session
           WHERE item.id = $1 AND item.session_id = $2
             AND item.added_during_session = TRUE
             AND session.id = item.session_id AND session.status = 'IN_PROGRESS'
             AND session.musician_id = $3
           RETURNING item.id::text`,
          [data.itemId, data.sessionId, context.user.musicianId],
        );
        if (!result.rowCount) {
          throw new Error('Only items added during an in-progress session can be removed');
        }
        await startNextAutoItem(client, data.sessionId);
        await refreshSectionStates(client, data.sessionId);
        const update = await progressUpdate(client, data.sessionId);
        await client.query('COMMIT');
        return { ...update, removedItemId: data.itemId };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  );
