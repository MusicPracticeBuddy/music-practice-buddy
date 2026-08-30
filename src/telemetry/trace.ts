const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/
const clientPageTraceIdKey = Symbol.for('music-practice.telemetry.client-page-trace-id')
const globalRegistry = globalThis as unknown as Record<PropertyKey, unknown>

export function createTraceId(): string {
  return crypto.randomUUID().replaceAll('-', '')
}

export function createTraceParent(traceId: string): string {
  const spanIdBytes = crypto.getRandomValues(new Uint8Array(8))
  const spanId = Array.from(spanIdBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `00-${traceId}-${spanId}-01`
}

export function isTraceId(value: unknown): value is string {
  return typeof value === 'string' && TRACE_ID_PATTERN.test(value)
}

export function beginClientPageTrace(): string {
  const traceId = createTraceId()
  globalRegistry[clientPageTraceIdKey] = traceId
  return traceId
}

export function getClientTraceId(): string | undefined {
  const traceId = globalRegistry[clientPageTraceIdKey]
  return isTraceId(traceId) ? traceId : undefined
}

export function endClientPageTrace(traceId: string): void {
  if (globalRegistry[clientPageTraceIdKey] === traceId) {
    delete globalRegistry[clientPageTraceIdKey]
  }
}
