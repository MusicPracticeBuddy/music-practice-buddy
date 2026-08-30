import { createMiddleware } from '@tanstack/solid-start'
import { startServerFunction } from '@/telemetry/provider.server'

export const telemetryServerFunctionMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ method, next, serverFnMeta }) => {
    const operation = startServerFunction({
      functionName: serverFnMeta.name,
      method,
    })

    try {
      const result = await operation.run(next)
      operation.end('success')
      return result
    } catch (error) {
      operation.end('error')
      throw error
    }
  },
)
