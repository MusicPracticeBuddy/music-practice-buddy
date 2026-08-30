import { createCsrfMiddleware, createStart } from '@tanstack/solid-start'
import { telemetryServerFunctionMiddleware } from '@/telemetry/serverFunctionMiddleware'

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
  functionMiddleware: [telemetryServerFunctionMiddleware],
}))
