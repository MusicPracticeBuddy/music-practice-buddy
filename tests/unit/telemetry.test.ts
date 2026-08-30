import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Pool, PoolClient } from 'pg'
import { instrumentPostgresPool } from '@/telemetry/postgres'
import {
  configureTelemetry,
  recordPageView,
  resetTelemetry,
  startServerFunction,
} from '@/telemetry/provider.server'
import {
  type OperationOutcome,
  type TelemetryOperation,
  type TelemetryProvider,
} from '@/telemetry/telemetry'
import { runWithTraceId } from '@/telemetry/traceContext.server'

const TRACE_ID = '0123456789abcdef0123456789abcdef'
const originalConsoleTelemetrySetting = process.env.TELEMETRY_CONSOLE_ENABLED

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

afterEach(() => {
  if (originalConsoleTelemetrySetting === undefined) {
    delete process.env.TELEMETRY_CONSOLE_ENABLED
  } else {
    process.env.TELEMETRY_CONSOLE_ENABLED = originalConsoleTelemetrySetting
  }
  resetTelemetry()
})

describe('telemetry', () => {
  it('does nothing by default', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    delete process.env.TELEMETRY_CONSOLE_ENABLED
    resetTelemetry()

    recordPageView({ path: '/sessions', routeId: '/sessions/', traceId: TRACE_ID })

    expect(consoleInfo).not.toHaveBeenCalled()
  })

  it('prints events when console telemetry is enabled at runtime', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    process.env.TELEMETRY_CONSOLE_ENABLED = 'true'
    resetTelemetry()

    recordPageView({ path: '/sessions', routeId: '/sessions/', traceId: TRACE_ID })
    const operation = startServerFunction({
      functionName: 'getSessions',
      method: 'GET',
      traceId: TRACE_ID,
    })
    operation.run(() => undefined)
    operation.end('success')

    expect(consoleInfo).toHaveBeenNthCalledWith(1, '[telemetry]', {
      type: 'page_view',
      path: '/sessions',
      routeId: '/sessions/',
      traceId: TRACE_ID,
      serverVersion: expect.any(String),
      timestamp: expect.any(String),
    })
    expect(consoleInfo).toHaveBeenNthCalledWith(
      2,
      '[telemetry]',
      expect.objectContaining({
        type: 'server_function',
        functionName: 'getSessions',
        method: 'GET',
        traceId: TRACE_ID,
        serverVersion: expect.any(String),
        timestamp: expect.any(String),
        outcome: 'success',
        durationMs: expect.any(Number),
      }),
    )
  })

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

    const serverFunction = startServerFunction({
      functionName: 'getDashboard',
      method: 'GET',
      traceId: TRACE_ID,
    })
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

    const operation = startServerFunction({
      functionName: 'getDashboard',
      method: 'GET',
      traceId: TRACE_ID,
    })
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
          queryName: 'list-musician',
          operation: 'SELECT',
          statement: 'SELECT * FROM musician WHERE id = $1',
          traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
          serverVersion: expect.any(String),
          timestamp: expect.any(String),
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
      query: {
        queryName: 'update-session',
        operation: 'UPDATE',
        statement: 'UPDATE session SET status = $1',
        traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
        serverVersion: expect.any(String),
        timestamp: expect.any(String),
      },
      outcomes: ['error'],
    })
  })

  it('generates stable names for aggregate and transaction queries', async () => {
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
    await client.query('SELECT count(*) FROM session_template')
    await client.query('BEGIN')

    expect(sqlOperations.map(({ query }) => query.queryName)).toEqual([
      'count-session-template',
      'transaction-begin',
    ])
  })

  it('prefers an explicit PostgreSQL query-config name', async () => {
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
    await client.query({
      name: 'get-musician-details',
      text: 'SELECT * FROM musician WHERE id = $1',
      values: ['private-id'],
    })

    expect(sqlOperations[0]!.query.queryName).toBe('get-musician-details')
    expect(JSON.stringify(sqlOperations)).not.toContain('private-id')
  })

  it('propagates the active server trace ID to SQL queries', async () => {
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
    await runWithTraceId(TRACE_ID, () => client.query('SELECT * FROM session'))

    expect(sqlOperations[0]!.query.traceId).toBe(TRACE_ID)
  })
})
