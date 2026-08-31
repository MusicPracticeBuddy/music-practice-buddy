import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { pool } from '@/data/db'

beforeAll(async () => {
  const migration = fileURLToPath(
    new URL('../../apps/pro-proof/migrations/V1__practice_insight_snapshots.sql', import.meta.url),
  )
  await pool.query(await readFile(migration, 'utf8'))
})

describe('Pro migration composition', () => {
  it('applies after core migrations in its own schema', async () => {
    const result = await pool.query<{ table_name: string | null }>(
      `SELECT to_regclass('mpb_pro.practice_insight_snapshot')::text AS table_name`,
    )

    expect(result.rows[0]?.table_name).toBe('mpb_pro.practice_insight_snapshot')
  })
})
