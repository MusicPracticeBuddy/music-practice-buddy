import type { Span } from '@opentelemetry/api';
import type { Pool, PoolClient } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPostgresQueryName,
  instrumentPostgresPoolMetrics,
  setPostgresQueryName,
} from '@/telemetry/postgres';
import {
  configureTelemetry,
  recordPageView,
  resetTelemetry,
  startServerFunction,
} from '@/telemetry/provider.server';
import {
  type OperationOutcome,
  type TelemetryOperation,
  type TelemetryProvider,
} from '@/telemetry/telemetry';
import { createTraceParent } from '@/telemetry/trace';

const TRACE_ID = '0123456789abcdef0123456789abcdef';
const originalConsoleTelemetrySetting = process.env.TELEMETRY_CONSOLE_ENABLED;

function createOperation() {
  const outcomes: OperationOutcome[] = [];
  const operation: TelemetryOperation = {
    run: (callback) => callback(),
    end: (outcome) => outcomes.push(outcome),
  };
  return { operation, outcomes };
}

function createProvider(): TelemetryProvider {
  return {
    recordPageView: vi.fn(),
    startServerFunction: vi.fn(() => createOperation().operation),
  };
}

afterEach(() => {
  if (originalConsoleTelemetrySetting === undefined) {
    delete process.env.TELEMETRY_CONSOLE_ENABLED;
  } else {
    process.env.TELEMETRY_CONSOLE_ENABLED = originalConsoleTelemetrySetting;
  }
  resetTelemetry();
});

describe('telemetry', () => {
  it('creates a sampled W3C traceparent from the application trace ID', () => {
    expect(createTraceParent(TRACE_ID)).toMatch(
      /^00-0123456789abcdef0123456789abcdef-[0-9a-f]{16}-01$/,
    );
  });

  it('does nothing by default', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    delete process.env.TELEMETRY_CONSOLE_ENABLED;
    resetTelemetry();

    recordPageView({ path: '/sessions', routeId: '/sessions/', traceId: TRACE_ID });

    expect(consoleInfo).not.toHaveBeenCalled();
  });

  it('prints events when console telemetry is enabled at runtime', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    process.env.TELEMETRY_CONSOLE_ENABLED = 'true';
    resetTelemetry();

    recordPageView({ path: '/sessions', routeId: '/sessions/', traceId: TRACE_ID });
    const operation = startServerFunction({
      functionName: 'getSessions',
      method: 'GET',
      traceId: TRACE_ID,
    });
    operation.run(() => undefined);
    operation.end('success');

    expect(consoleInfo).toHaveBeenNthCalledWith(1, '[telemetry]', {
      type: 'page_view',
      path: '/sessions',
      routeId: '/sessions/',
      traceId: TRACE_ID,
      serverVersion: expect.any(String),
      timestamp: expect.any(String),
    });
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
    );
  });

  it('allows a provider to establish an active operation scope', () => {
    const run = vi.fn();
    const operation: TelemetryOperation = {
      run: (callback) => {
        run();
        return callback();
      },
      end: vi.fn(),
    };
    const provider = createProvider();
    provider.startServerFunction = vi.fn(() => operation);
    configureTelemetry(provider);

    const serverFunction = startServerFunction({
      functionName: 'getDashboard',
      method: 'GET',
      traceId: TRACE_ID,
    });
    expect(serverFunction.run(() => 'result')).toBe('result');
    serverFunction.end('success');

    expect(run).toHaveBeenCalledOnce();
    expect(operation.end).toHaveBeenCalledWith('success');
  });

  it('does not let provider start or end failures escape into application code', () => {
    const provider = createProvider();
    provider.startServerFunction = vi.fn(() => {
      throw new Error('exporter unavailable');
    });
    configureTelemetry(provider);

    const operation = startServerFunction({
      functionName: 'getDashboard',
      method: 'GET',
      traceId: TRACE_ID,
    });
    expect(operation.run(() => 'result')).toBe('result');
    expect(() => operation.end('success')).not.toThrow();
  });

  it('generates stable PostgreSQL query names', () => {
    expect(getPostgresQueryName({ text: 'SELECT * FROM musician WHERE id = $1' })).toBe(
      'list-musician',
    );
    expect(getPostgresQueryName({ text: 'SELECT count(*) FROM session_template' })).toBe(
      'count-session-template',
    );
    expect(getPostgresQueryName({ text: 'BEGIN' })).toBe('transaction-begin');
    expect(getPostgresQueryName({ text: 'UPDATE session SET status = $1' })).toBe('update-session');
  });

  it('uses the request hook to preserve PostgreSQL query names', () => {
    const span = {
      setAttribute: vi.fn(),
      updateName: vi.fn(),
    } as unknown as Span;

    setPostgresQueryName(span, {
      query: {
        name: 'get-musician-details',
        text: 'SELECT * FROM musician WHERE id = $1',
        values: ['private-id'],
      },
      connection: {},
    });

    expect(span.setAttribute).toHaveBeenCalledWith('db.query.name', 'get-musician-details');
    expect(span.updateName).toHaveBeenCalledWith('sql get-musician-details');
  });

  it('records successful named-query metrics without parameter values', async () => {
    let onConnect: ((client: PoolClient) => void) | undefined;
    const pool = {
      on: (_event: string, listener: (client: PoolClient) => void) => {
        onConnect = listener;
      },
    } as unknown as Pool;
    const client = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    } as unknown as PoolClient;
    const record = vi.fn();

    instrumentPostgresPoolMetrics(pool, { record });
    onConnect!(client);
    await client.query({
      name: 'get-musician-details',
      text: 'SELECT * FROM musician WHERE id = $1',
      values: ['private-id'],
    });

    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(
      'get-musician-details',
      'SELECT',
      'success',
      expect.any(Number),
    );
    expect(JSON.stringify(record.mock.calls)).not.toContain('private-id');
  });

  it('records failed named-query metrics without changing the query error', async () => {
    let onConnect: ((client: PoolClient) => void) | undefined;
    const pool = {
      on: (_event: string, listener: (client: PoolClient) => void) => {
        onConnect = listener;
      },
    } as unknown as Pool;
    const client = {
      query: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
    } as unknown as PoolClient;
    const record = vi.fn();

    instrumentPostgresPoolMetrics(pool, { record });
    onConnect!(client);

    await expect(client.query('UPDATE session SET status = $1')).rejects.toThrow(
      'database unavailable',
    );
    expect(record).toHaveBeenCalledWith('update-session', 'UPDATE', 'error', expect.any(Number));
  });
});
