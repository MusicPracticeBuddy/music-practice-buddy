import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Pool, PoolClient } from 'pg'
import { instrumentPostgresPool } from '@/telemetry/postgres'
import {
  configureTelemetry,
  resetTelemetry,
  startServerFunction,
} from '@/telemetry/provider.server'
import {
  type OperationOutcome,
  type TelemetryOperation,
  type TelemetryProvider,
} from '@/telemetry/telemetry'

function createOperation() {
  const outcomes: OperationOutcome[] = []
  const operation: TelemetryOperation = {
    run: (callback) => callback(),
    end: (outcome) => outcomes.push(outcome),
  }
  return { operation, outcomes }
}

function createProvider() {
  const sqlOperations: Array<{
    query: Parameters<TelemetryProvider['startSqlQuery']>[0]
    outcomes: OperationOutcome[]
  }> = []
  const provider: TelemetryProvider = {
    recordPageView: vi.fn(),
    startServerFunction: vi.fn(() => createOperation().operation),
    startSqlQuery: vi.fn((query) => {
      const { operation, outcomes } = createOperation()
      sqlOperations.push({ query, outcomes })
      return operation
    }),
  }
  return { provider, sqlOperations }
}

afterEach(() => resetTelemetry())

describe('telemetry', () => {
  it('allows a provider to establish an active operation scope', () => {
    const run = vi.fn()
    const operation: TelemetryOperation = {
      run: (callback) => {
        run()
        return callback()
      },
      end: vi.fn(),
    }
    const { provider } = createProvider()
    provider.startServerFunction = vi.fn(() => operation)
    configureTelemetry(provider)

    const serverFunction = startServerFunction({ functionName: 'getDashboard', method: 'GET' })
    expect(serverFunction.run(() => 'result')).toBe('result')
    serverFunction.end('success')

    expect(run).toHaveBeenCalledOnce()
    expect(operation.end).toHaveBeenCalledWith('success')
  })

  it('does not let provider start or end failures escape into application code', () => {
    const { provider } = createProvider()
    provider.startServerFunction = vi.fn(() => {
      throw new Error('exporter unavailable')
    })
    configureTelemetry(provider)

    const operation = startServerFunction({ functionName: 'getDashboard', method: 'GET' })
    expect(operation.run(() => 'result')).toBe('result')
    expect(() => operation.end('success')).not.toThrow()
  })

  it('records successful PostgreSQL queries without query parameters', async () => {
    const { provider, sqlOperations } = createProvider()
    configureTelemetry(provider)

    let onConnect: ((client: PoolClient) => void) | undefined
    const pool = {
      on: (_event: string, listener: (client: PoolClient) => void) => {
        onConnect = listener
      },
    } as unknown as Pool
    const client = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    } as unknown as PoolClient

    instrumentPostgresPool(pool)
    onConnect!(client)
    await client.query('SELECT * FROM musician WHERE id = $1', ['private-id'])

    expect(sqlOperations).toEqual([
      {
        query: {
          operation: 'SELECT',
          statement: 'SELECT * FROM musician WHERE id = $1',
        },
        outcomes: ['success'],
      },
    ])
    expect(JSON.stringify(sqlOperations)).not.toContain('private-id')
  })

  it('records rejected PostgreSQL queries as errors', async () => {
    const { provider, sqlOperations } = createProvider()
    configureTelemetry(provider)

    let onConnect: ((client: PoolClient) => void) | undefined
    const pool = {
      on: (_event: string, listener: (client: PoolClient) => void) => {
        onConnect = listener
      },
    } as unknown as Pool
    const client = {
      query: vi.fn(async () => {
        throw new Error('database unavailable')
      }),
    } as unknown as PoolClient

    instrumentPostgresPool(pool)
    onConnect!(client)
    await expect(client.query('UPDATE session SET status = $1')).rejects.toThrow(
      'database unavailable',
    )

    expect(sqlOperations[0]).toEqual({
      query: { operation: 'UPDATE', statement: 'UPDATE session SET status = $1' },
      outcomes: ['error'],
    })
  })
})
