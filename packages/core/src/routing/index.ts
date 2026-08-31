import { relative, resolve } from 'node:path';
import { physical, rootRoute } from '@tanstack/virtual-file-routes';

const installedCoreSourceDirectory = 'node_modules/@music-practice-buddy/core/src';

function relativeToWorkingDirectory(path: string) {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

export function createCoreRouteConfig(additionalRouteDirectories: readonly string[] = []) {
  const coreSource = relativeToWorkingDirectory(
    resolve(process.cwd(), installedCoreSourceDirectory),
  );
  return rootRoute(`${coreSource}/routes/__root.tsx`, [
    physical(`${coreSource}/routes`),
    ...additionalRouteDirectories.map((directory) => physical(directory)),
  ]);
}
