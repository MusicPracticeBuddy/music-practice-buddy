import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUri: string
  }
}

async function applyMigrations(connectionUri: string) {
  const migrationDirectory = fileURLToPath(new URL('../../db/migration/', import.meta.url))
  const migrationFiles = (await readdir(migrationDirectory))
    .map((name) => ({ name, version: Number(name.match(/^V(\d+)__/)?.[1]) }))
    .filter((file) => Number.isInteger(file.version))
    .sort((left, right) => left.version - right.version)

  const client = new Client({ connectionString: connectionUri })
  await client.connect()
  try {
    for (const migration of migrationFiles) {
      const sql = await readFile(`${migrationDirectory}/${migration.name}`, 'utf8')
      await client.query(sql)
    }
  } finally {
    await client.end()
  }
}

export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:17')
    .withDatabase('music_practice_test')
    .withUsername('music_practice_test')
    .withPassword('music_practice_test')
    .start()

  try {
    await applyMigrations(container.getConnectionUri())
  } catch (error) {
    await container.stop()
    throw error
  }

  project.provide('testDatabaseUri', container.getConnectionUri())
  return async () => container.stop()
}
