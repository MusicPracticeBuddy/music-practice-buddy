import { defineConfig, type RsbuildConfig } from '@rsbuild/core'
import { pluginBabel } from '@rsbuild/plugin-babel'
import { pluginSolid } from '@rsbuild/plugin-solid'
import { tanstackStart } from '@tanstack/solid-start/plugin/rsbuild'
import { fileURLToPath } from 'node:url'

type EditionBuild = 'community' | 'pro-proof'

export function createRsbuildConfig(edition: EditionBuild): RsbuildConfig {
  const appSource = `apps/${edition}/src`
  const coreSource = fileURLToPath(
    new URL('../node_modules/@music-practice-buddy/core/src', import.meta.url),
  )

  return defineConfig({
    ...(edition === 'pro-proof'
      ? {
          output: {
            distPath: { root: 'dist/pro-proof' },
          },
        }
      : {}),
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
      port: edition === 'community' ? 3000 : 3001,
    },
    plugins: [
      pluginBabel({
        include: /\.(?:jsx|tsx)$/,
      }),
      pluginSolid(),
      tanstackStart({
        srcDirectory: appSource,
        router: {
          routesDirectory: '../../..',
          virtualRouteConfig: `apps/${edition}/routes.ts`,
        },
      }),
    ],
  })
}
