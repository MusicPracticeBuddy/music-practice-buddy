import { createStart } from '@tanstack/solid-start'
import { telemetryServerFunctionMiddleware } from '@/telemetry/serverFunctionMiddleware'

export const startInstance = createStart(() => ({
  functionMiddleware: [telemetryServerFunctionMiddleware],
}))
