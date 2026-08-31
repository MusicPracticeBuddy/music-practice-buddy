import { physical, rootRoute } from '@tanstack/virtual-file-routes';

const corePackage = 'node_modules/@music-practice-buddy/core/src';

export const routes = rootRoute(`${corePackage}/routes/__root.tsx`, [
  physical(`${corePackage}/routes`),
]);
