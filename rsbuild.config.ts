import { defineConfig } from '@rsbuild/core';
import { pluginBabel } from '@rsbuild/plugin-babel';
import { pluginSolid } from '@rsbuild/plugin-solid';
import { tanstackStart } from '@tanstack/solid-start/plugin/rsbuild';
import { fileURLToPath } from 'node:url';

const coreSource = fileURLToPath(
  new URL('./node_modules/@music-practice-buddy/core/src', import.meta.url),
);

export default defineConfig({
  environments: {
    ssr: {
      output: {
        externals: [/^@opentelemetry\//],
      },
    },
  },
  resolve: {
    alias: {
      '@': coreSource,
    },
  },
  source: {
    include: [coreSource],
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  plugins: [
    pluginBabel({
      include: /\.(?:jsx|tsx)$/,
    }),
    pluginSolid(),
    tanstackStart({
      srcDirectory: 'apps/community/src',
      router: {
        routesDirectory: '../../..',
        virtualRouteConfig: 'apps/community/routes.ts',
      },
    }),
  ],
});
