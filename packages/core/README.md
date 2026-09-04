# Music Practice Buddy core package

This source package contains the reusable Music Practice Buddy routes, UI, domain logic, server
functions, and core Flyway migrations. Applications compile the source package as part of their
TanStack Start builds.

## Public exports

- `@music-practice-buddy/core/contracts` — edition and contribution contracts.
- `@music-practice-buddy/core/routing` — core virtual-route composition.
- `@music-practice-buddy/core/app/client` — client application instrumentation.
- `@music-practice-buddy/core/app/start` — shared TanStack Start setup.
- `@music-practice-buddy/core/app/server` — server telemetry provider registration and metadata.
- `@music-practice-buddy/core/domain` and `/domain/*` — framework-independent domain APIs.
- `@music-practice-buddy/core/ui/*` — individually importable shared Solid components.
- `@music-practice-buddy/core/server/auth` — authentication middleware and user types.
- `@music-practice-buddy/core/server/database` — shared PostgreSQL pool for downstream server
  extensions.
- `@music-practice-buddy/core/styles.css` — shared application stylesheet.
- `@music-practice-buddy/core/migrations/*` — core Flyway migration assets.
- `@music-practice-buddy/core/package.json` — package version and metadata.

Paths not listed in the package export map are internal and may change without notice.
