# Music Practice Buddy core package

This source package contains the reusable Music Practice Buddy routes, UI, domain logic, server
functions, and core Flyway migrations. The Community and Pro-proof applications compile this source
package as part of their TanStack Start builds.

Consumers may import the stable edition API from `@music-practice-buddy/core/contracts`. Other source
paths are intentionally internal. Route composition is performed with TanStack virtual file routes.
