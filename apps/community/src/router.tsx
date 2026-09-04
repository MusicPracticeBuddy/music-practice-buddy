import { createRouter } from '@tanstack/solid-router';
import { QueryClient } from '@tanstack/solid-query';
import { communityEdition } from '@music-practice-buddy/core/contracts';
import { routeTree } from './routeTree.gen';
import { instrumentPageViews } from '@music-practice-buddy/core/app/client';

export function getRouter() {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { edition: communityEdition, queryClient },
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });

  instrumentPageViews(router);

  return router;
}
