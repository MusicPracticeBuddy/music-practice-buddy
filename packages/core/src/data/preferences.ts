import { createServerFn } from '@tanstack/solid-start';
import type { PoolClient } from 'pg';
import { authMiddleware } from '@/auth/middleware';
import { pool } from '@/data/db';

function validateInstrumentIds(input: string[]) {
  const instrumentIds = [...new Set(input)];
  if (instrumentIds.length > 50 || instrumentIds.some((id) => !/^\d+$/.test(id))) {
    throw new Error('Invalid instrument selection');
  }
  return instrumentIds;
}

export const getMusicianInstrumentIds = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<string[]> => {
    const result = await pool.query<{ id: string }>(
      `SELECT preference.instrument_id::text AS id
       FROM musician_instrument preference
       JOIN instrument ON instrument.id = preference.instrument_id
       WHERE preference.musician_id = $1
       ORDER BY instrument.family, instrument.name`,
      [context.user.musicianId],
    );
    return result.rows.map((row) => row.id);
  });

export const updateMusicianInstrumentIds = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(validateInstrumentIds)
  .handler(async ({ data, context }): Promise<string[]> => {
    const client = await pool.connect();
    try {
      await replaceMusicianInstruments(client, context.user.musicianId, data);
      return data;
    } finally {
      client.release();
    }
  });

async function replaceMusicianInstruments(
  client: PoolClient,
  musicianId: string,
  instrumentIds: string[],
) {
  await client.query('BEGIN');
  try {
    await client.query(`DELETE FROM musician_instrument WHERE musician_id = $1`, [musicianId]);
    if (instrumentIds.length > 0) {
      const result = await client.query(
        `INSERT INTO musician_instrument (musician_id, instrument_id)
         SELECT $1, instrument.id
         FROM instrument
         WHERE instrument.id = ANY($2::bigint[])`,
        [musicianId, instrumentIds],
      );
      if (result.rowCount !== instrumentIds.length) throw new Error('Instrument not found');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
