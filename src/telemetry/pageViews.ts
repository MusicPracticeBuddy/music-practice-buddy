import type { AnyRouter } from '@tanstack/solid-router'
import { reportPageView } from '@/telemetry/pageViewReporter'
import {
  beginClientPageTrace,
  createTraceId,
  endClientPageTrace,
  getClientTraceId,
} from '@/telemetry/trace'

export function instrumentPageViews(router: AnyRouter): void {
  if (typeof window === 'undefined') return

  router.subscribe('onBeforeLoad', () => beginClientPageTrace())
  router.subscribe('onRendered', ({ toLocation }) => {
    const traceId = getClientTraceId() ?? createTraceId()
    const routeId = router.state.matches.at(-1)?.routeId ?? 'unknown'
    void reportPageView({ data: { path: toLocation.pathname, routeId, traceId } }).catch(
      () => undefined,
    )
    endClientPageTrace(traceId)
  })
}
