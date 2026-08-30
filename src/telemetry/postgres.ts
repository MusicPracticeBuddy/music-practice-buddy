import type { Pool, PoolClient, QueryConfig } from 'pg'
import { startSqlQuery } from '@/telemetry/provider.server'

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
      operation: getSqlOperation(statement),
      statement,
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
  const withoutComments = statement.replace(/^\s*(?:(?:--[^\n]*\n)|(?:\/\*[\s\S]*?\*\/\s*))*/, '')
  return withoutComments.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? 'UNKNOWN'
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}
