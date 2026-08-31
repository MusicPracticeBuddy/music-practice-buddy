# Community and Pro edition boundary

The repository contains two composition roots while the extraction boundary is being proven:

- `apps/community` builds the complete public application.
- `apps/pro-proof` consumes the core source package and adds a private-style route, navigation item,
  dashboard panel, and authenticated server function.
- `packages/core` owns all public features, core routes, and base database migrations.

Both applications use TanStack virtual file routes to mount the routes shipped in
`@music-practice-buddy/core`. Pro adds its own physical route directory to the same generated tree.
The root route receives an edition definition through router context, so additive UI contributions do
not require Pro-specific branches in core.

The Pro proof also owns a migration under its own `mpb_pro` PostgreSQL schema. Production migration
orchestration should apply core migrations first and Pro migrations second with separate Flyway
history tables.

## Local commands

Run the Community application with `npm run dev` and build it with `npm run build`. Run the proof
edition with `npm run dev:pro-proof` and build it with `npm run build:pro-proof`.

`npm run package:core` creates an installable source-package tarball under `artifacts/`. The package
contains core source and migrations, allowing a future external Pro repository to compile the same
TanStack server functions and Solid components as part of its own application build.

## Dependency rules

Core never imports from either application. Applications consume only exports declared by
`@music-practice-buddy/core`; other core source paths are internal. Route composition points to the
installed package rather than copying core route files. Run `npm run check:boundaries` to enforce the
one-way dependency from applications to core.
