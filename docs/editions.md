# Application and core package boundary

The repository contains the public application and the reusable core package:

- `apps/community` builds the complete public application.
- `packages/core` owns all public features, core routes, and base database migrations.

The application uses TanStack virtual file routes to mount the routes shipped in
`@music-practice-buddy/core`. The root route receives an edition definition through router context,
so downstream applications can add navigation and dashboard contributions without adding
application-specific branches to core.

## Local commands

Run the application with `npm run dev` and build it with `npm run build`.

`npm run package:core` creates an installable source-package tarball under `artifacts/`. The package
contains core source and migrations, allowing downstream repositories to compile the same TanStack
server functions and Solid components as part of their own application builds.

## Dependency rules

Core never imports from application code. Applications consume only exports declared by
`@music-practice-buddy/core`; other core source paths are internal. Route composition points to the
installed package rather than copying core route files. Run `npm run check:boundaries` to enforce the
one-way dependency from the application to core.
