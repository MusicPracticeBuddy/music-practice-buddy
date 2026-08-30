import type { Pool, PoolClient, QueryConfig } from 'pg'
import { startSqlQuery } from '@/telemetry/provider.server'
import { getOrCreateTraceId } from '@/telemetry/traceContext.server'

const instrumentedClients = new WeakSet<PoolClient>()

export function instrumentPostgresPool(pool: Pool): void {
  pool.on('connect', instrumentPostgresClient)
}

function instrumentPostgresClient(client: PoolClient): void {
  if (instrumentedClients.has(client)) return
  instrumentedClients.add(client)

  const query = client.query.bind(client)
  client.query = ((...args: Parameters<PoolClient['query']>) => {
    const statement = getStatement(args[0])
    const operation = startSqlQuery({
      queryName: getQueryName(args[0], statement),
      operation: getSqlOperation(statement),
      statement,
      traceId: getOrCreateTraceId(),
    })

    const queryArguments = args as unknown[]
    const callbackIndex =
      typeof queryArguments.at(-1) === 'function' ? queryArguments.length - 1 : -1
    if (callbackIndex >= 0) {
      const callback = queryArguments[callbackIndex] as (...callbackArgs: unknown[]) => unknown
      queryArguments[callbackIndex] = (...callbackArgs: unknown[]) => {
        operation.end(callbackArgs[0] ? 'error' : 'success')
        return callback(...callbackArgs)
      }
    }

    try {
      const result = operation.run(() => query(...args))
      if (isPromiseLike(result)) {
        void result.then(
          () => operation.end('success'),
          () => operation.end('error'),
        )
      } else if (callbackIndex < 0) {
        operation.end('success')
      }
      return result
    } catch (error) {
      operation.end('error')
      throw error
    }
  }) as PoolClient['query']
}

function getStatement(query: string | QueryConfig): string {
  return typeof query === 'string' ? query : query.text
}

function getSqlOperation(statement: string): string {
  const normalized = normalizeStatement(statement)
  if (/^(?:BEGIN|START\s+TRANSACTION)\b/i.test(normalized)) return 'BEGIN'
  if (/^COMMIT\b/i.test(normalized)) return 'COMMIT'
  if (/^ROLLBACK\b/i.test(normalized)) return 'ROLLBACK'
  if (/\bINSERT\s+INTO\b/i.test(normalized)) return 'INSERT'
  if (/\bUPDATE\s+[A-Za-z_"]/i.test(normalized)) return 'UPDATE'
  if (/\bDELETE\s+FROM\b/i.test(normalized)) return 'DELETE'
  if (/\bSELECT\b/i.test(normalized)) return 'SELECT'
  return normalized.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? 'UNKNOWN'
}

function getQueryName(query: string | QueryConfig, statement: string): string {
  if (typeof query !== 'string' && query.name) return query.name

  const normalized = normalizeStatement(statement)
  const operation = getSqlOperation(normalized)
  if (operation === 'BEGIN' || operation === 'COMMIT' || operation === 'ROLLBACK') {
    return `transaction-${operation.toLowerCase()}`
  }

  const action = getQueryAction(operation, normalized)
  const relation = getPrimaryRelation(operation, normalized)
  return relation ? `${action}-${relation}` : action
}

function getQueryAction(operation: string, statement: string): string {
  if (operation !== 'SELECT') return operation.toLowerCase()
  if (/\bSELECT\s+(?:DISTINCT\s+)?count\s*\(/i.test(statement)) return 'count'
  if (/\bSELECT\s+1\b/i.test(statement)) return 'check'
  if (/\bLIMIT\s+1\b/i.test(statement)) return 'get'
  return 'list'
}

function getPrimaryRelation(operation: string, statement: string): string | null {
  const pattern =
    operation === 'INSERT'
      ? /\bINSERT\s+INTO\s+([A-Za-z_"][\w."]*)/i
      : operation === 'UPDATE'
        ? /\bUPDATE\s+([A-Za-z_"][\w."]*)/i
        : operation === 'DELETE'
          ? /\bDELETE\s+FROM\s+([A-Za-z_"][\w."]*)/i
          : /\bFROM\s+([A-Za-z_"][\w."]*)/i
  const relation = statement.match(pattern)?.[1]
  return relation ? relation.replaceAll('"', '').replaceAll('.', '-').replaceAll('_', '-') : null
}

function normalizeStatement(statement: string): string {
  return statement
    .replace(/^\s*(?:(?:--[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/\s*))*/, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}
