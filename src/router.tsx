import { createRouter } from '@tanstack/solid-router'
import { routeTree } from '@/routeTree.gen'
import { instrumentPageViews } from '@/telemetry/pageViews'

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
  })

  instrumentPageViews(router)

  return router
}
