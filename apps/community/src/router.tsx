import { createRouter } from '@tanstack/solid-router';
import { communityEdition } from '@music-practice-buddy/core/contracts';
import { routeTree } from './routeTree.gen';
import { instrumentPageViews } from '@music-practice-buddy/core/app/client';

export function getRouter() {
  const router = createRouter({
    routeTree,
    context: { edition: communityEdition },
    scrollRestoration: true,
  });

  instrumentPageViews(router);

  return router;
}
