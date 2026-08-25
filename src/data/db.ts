import { Pool } from 'pg'

export const pool = new Pool({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 5,
})

export function toIsoString(value: Date | null): string | null {
  return value?.toISOString() ?? null
}
