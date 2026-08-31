import { createCsrfMiddleware, createStart } from '@tanstack/solid-start';
import { telemetryServerFunctionMiddleware } from '@/telemetry/serverFunctionMiddleware';

export function createMpbStart() {
  const csrfMiddleware = createCsrfMiddleware({
    filter: (context) => context.handlerType === 'serverFn',
  });

  return createStart(() => ({
    requestMiddleware: [csrfMiddleware],
    functionMiddleware: [telemetryServerFunctionMiddleware],
  }));
}
