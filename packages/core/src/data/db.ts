import { Pool } from 'pg';
import { instrumentPostgresPoolMetrics } from '@/telemetry/postgres';

export const pool = new Pool({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  options: '-c pg_trgm.strict_word_similarity_threshold=0.22',
  max: 5,
});

instrumentPostgresPoolMetrics(pool);

export function toIsoString(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}
