import { createMiddleware } from '@tanstack/solid-start';
import { startServerFunction } from '@/telemetry/provider.server';
import { createTraceId, createTraceParent, getClientTraceId, isTraceId } from '@/telemetry/trace';
import { runWithTraceId } from '@/telemetry/traceContext.server';

export const telemetryServerFunctionMiddleware = createMiddleware({ type: 'function' })
  .client(async ({ data, next }) => {
    const dataTraceId = getDataTraceId(data);
    const traceId = dataTraceId ?? getClientTraceId() ?? createTraceId();
    return next({
      headers: { traceparent: createTraceParent(traceId) },
      sendContext: { telemetryTraceId: traceId },
    });
  })
  .server(async ({ context, method, next, serverFnMeta }) => {
    const traceId = isTraceId(context.telemetryTraceId)
      ? context.telemetryTraceId
      : createTraceId();

    return runWithTraceId(traceId, async () => {
      const operation = startServerFunction({
        functionName: serverFnMeta.name,
        method,
        traceId,
      });

      try {
        const result = await operation.run(next);
        operation.end('success');
        return result;
      } catch (error) {
        operation.end('error');
        throw error;
      }
    });
  });

function getDataTraceId(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || !('traceId' in data)) return undefined;
  return isTraceId(data.traceId) ? data.traceId : undefined;
}
