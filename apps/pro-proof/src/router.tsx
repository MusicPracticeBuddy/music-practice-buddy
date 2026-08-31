import { createRouter } from '@tanstack/solid-router'
import { instrumentPageViews } from '@music-practice-buddy/core/app/client'
import { proProofEdition } from './app-definition'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createRouter({
    routeTree,
    context: { edition: proProofEdition },
    scrollRestoration: true,
  })

  instrumentPageViews(router)
  return router
}
