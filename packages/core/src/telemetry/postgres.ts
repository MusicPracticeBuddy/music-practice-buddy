import { metrics, type Span } from '@opentelemetry/api';
import type { PgRequestHookInformation } from '@opentelemetry/instrumentation-pg';
import type { Pool, PoolClient, QueryConfig } from 'pg';

type QueryOutcome = 'success' | 'error';
type PostgresQueryMetrics = {
  record(queryName: string, operation: string, outcome: QueryOutcome, durationMs: number): void;
};

const instrumentedClients = new WeakSet<PoolClient>();
let queryMetrics: PostgresQueryMetrics | undefined;

export function instrumentPostgresPoolMetrics(
  pool: Pool,
  recorder: PostgresQueryMetrics = getPostgresQueryMetrics(),
): void {
  pool.on('connect', (client) => instrumentPostgresClient(client, recorder));
}

export function setPostgresQueryName(span: Span, { query }: PgRequestHookInformation): void {
  const queryName = getPostgresQueryName(query);
  span.setAttribute('db.query.name', queryName);
  span.updateName(`sql ${queryName}`);
}

export function getPostgresQueryName(query: { text: string; name?: string }): string {
  if (query.name) return query.name;

  const normalized = normalizeStatement(query.text);
  const operation = getSqlOperation(normalized);
  if (operation === 'BEGIN' || operation === 'COMMIT' || operation === 'ROLLBACK') {
    return `transaction-${operation.toLowerCase()}`;
  }

  const action = getQueryAction(operation, normalized);
  const relation = getPrimaryRelation(operation, normalized);
  return relation ? `${action}-${relation}` : action;
}

function instrumentPostgresClient(client: PoolClient, recorder: PostgresQueryMetrics): void {
  if (instrumentedClients.has(client)) return;
  instrumentedClients.add(client);

  const query = client.query.bind(client);
  client.query = ((...args: Parameters<PoolClient['query']>) => {
    const queryConfig = getQueryConfig(args[0]);
    const queryName = getPostgresQueryName(queryConfig);
    const operation = getSqlOperation(normalizeStatement(queryConfig.text));
    const startedAt = performance.now();
    let ended = false;
    const finish = (outcome: QueryOutcome) => {
      if (ended) return;
      ended = true;
      try {
        recorder.record(queryName, operation, outcome, performance.now() - startedAt);
      } catch {
        // Observability must never make a database query fail.
      }
    };

    const callbackIndex = typeof args.at(-1) === 'function' ? args.length - 1 : -1;
    if (callbackIndex >= 0) {
      const callback = args[callbackIndex] as (...callbackArgs: unknown[]) => unknown;
      args[callbackIndex] = ((...callbackArgs: unknown[]) => {
        finish(callbackArgs[0] ? 'error' : 'success');
        return callback(...callbackArgs);
      }) as never;
    }

    try {
      const result = query(...args);
      if (isPromiseLike(result)) {
        void result.then(
          () => finish('success'),
          () => finish('error'),
        );
      } else if (callbackIndex < 0) {
        finish('success');
      }
      return result;
    } catch (error) {
      finish('error');
      throw error;
    }
  }) as PoolClient['query'];
}

function getPostgresQueryMetrics(): PostgresQueryMetrics {
  if (queryMetrics) return queryMetrics;

  const meter = metrics.getMeter('music-practice.telemetry');
  const calls = meter.createCounter('music_practice.sql.calls', {
    description: 'PostgreSQL query calls',
  });
  const duration = meter.createHistogram('music_practice.sql.duration', {
    description: 'PostgreSQL query duration',
    unit: 'ms',
  });
  queryMetrics = {
    record: (queryName, operation, outcome, durationMs) => {
      const attributes = {
        'db.operation.name': operation,
        'db.query.name': queryName,
        outcome,
      };
      calls.add(1, attributes);
      duration.record(durationMs, attributes);
    },
  };
  return queryMetrics;
}

function getQueryConfig(query: string | QueryConfig): { text: string; name?: string } {
  return typeof query === 'string' ? { text: query } : query;
}

function getSqlOperation(statement: string): string {
  if (/^(?:BEGIN|START\s+TRANSACTION)\b/i.test(statement)) return 'BEGIN';
  if (/^COMMIT\b/i.test(statement)) return 'COMMIT';
  if (/^ROLLBACK\b/i.test(statement)) return 'ROLLBACK';
  if (/\bINSERT\s+INTO\b/i.test(statement)) return 'INSERT';
  if (/\bUPDATE\s+[A-Za-z_"]/i.test(statement)) return 'UPDATE';
  if (/\bDELETE\s+FROM\b/i.test(statement)) return 'DELETE';
  if (/\bSELECT\b/i.test(statement)) return 'SELECT';
  return statement.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? 'UNKNOWN';
}

function getQueryAction(operation: string, statement: string): string {
  if (operation !== 'SELECT') return operation.toLowerCase();
  if (/\bSELECT\s+(?:DISTINCT\s+)?count\s*\(/i.test(statement)) return 'count';
  if (/\bSELECT\s+1\b/i.test(statement)) return 'check';
  if (/\bLIMIT\s+1\b/i.test(statement)) return 'get';
  return 'list';
}

function getPrimaryRelation(operation: string, statement: string): string | null {
  const pattern =
    operation === 'INSERT'
      ? /\bINSERT\s+INTO\s+([A-Za-z_"][\w."]*)/i
      : operation === 'UPDATE'
        ? /\bUPDATE\s+([A-Za-z_"][\w."]*)/i
        : operation === 'DELETE'
          ? /\bDELETE\s+FROM\s+([A-Za-z_"][\w."]*)/i
          : /\bFROM\s+([A-Za-z_"][\w."]*)/i;
  const relation = statement.match(pattern)?.[1];
  return relation ? relation.replaceAll('"', '').replaceAll('.', '-').replaceAll('_', '-') : null;
}

function normalizeStatement(statement: string): string {
  return statement
    .replace(/^\s*(?:(?:--[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/\s*))*/, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}
