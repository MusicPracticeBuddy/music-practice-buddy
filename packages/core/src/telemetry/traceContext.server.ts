import { AsyncLocalStorage } from 'node:async_hooks';
import { createTraceId } from '@/telemetry/trace';

const traceContextKey = Symbol.for('music-practice.telemetry.trace-context');
const globalRegistry = globalThis as unknown as Record<PropertyKey, unknown>;
const traceContext =
  (globalRegistry[traceContextKey] as AsyncLocalStorage<string> | undefined) ??
  new AsyncLocalStorage<string>();

globalRegistry[traceContextKey] = traceContext;

export function runWithTraceId<T>(traceId: string, operation: () => T): T {
  return traceContext.run(traceId, operation);
}

export function getOrCreateTraceId(): string {
  return traceContext.getStore() ?? createTraceId();
}
