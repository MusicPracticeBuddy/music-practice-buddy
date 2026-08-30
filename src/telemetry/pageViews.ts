import type { AnyRouter } from '@tanstack/solid-router'
import { reportPageView } from '@/telemetry/pageViewReporter'

export function instrumentPageViews(router: AnyRouter): void {
  if (typeof window === 'undefined') return

  router.subscribe('onRendered', ({ toLocation }) => {
    const routeId = router.state.matches.at(-1)?.routeId ?? 'unknown'
    void reportPageView({ data: { path: toLocation.pathname, routeId } }).catch(() => undefined)
  })
}
