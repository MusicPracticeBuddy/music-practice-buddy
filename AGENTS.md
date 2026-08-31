# AGENTS.md

## Project overview

Music Practice Buddy is a TypeScript application for tracking music practice sessions. The UI and server code use SolidJS, TanStack Solid Router/Start, and Rsbuild. PostgreSQL is the datastore; Flyway migrations and local seed data live under `db/`.

## Repository map

- `src/routes/`: file-based application routes.
- `src/router.tsx`: router construction.
- `src/routeTree.gen.ts`: generated route tree; do not edit it by hand.
- `db/migration/`: versioned Flyway schema migrations.
- `db/test_data/`: local-development seed data.
- `compose.yml`: local PostgreSQL, Flyway, and seed services.
- `rsbuild.config.ts`: application build and development-server configuration.
- `.oxlintrc.json`: Oxlint rules, environments, and generated-file exclusions.
- `.oxfmtrc.json`: Oxfmt style options and generated-file exclusions.

## Setup and commands

- Install JavaScript dependencies with `npm install` (or `npm ci` when reproducing the lockfile exactly).
- Start the application with `npm run dev`; it serves on port 3000 by default.
- Build the client and SSR bundles with `npm run build`.
- Format supported files with `npm run format`; check formatting without writing with `npm run format:check`.
- Lint the repository with `npm run lint`; apply safe automatic fixes with `npm run lint:fix`.
- Type-check the project with `npm run typecheck`.
- Start the local database stack with `docker compose up -d`.
- Inspect database service state with `docker compose ps` and logs with `docker compose logs <service>`.
- Do not run `docker compose down -v` unless the user explicitly wants to delete local database data.

Use scripts declared in `package.json` as the source of truth. Do not invent a test, lint, or type-check command that the repository does not define. When adding a new check, add a named npm script so local work and CI use the same command.

## Implementation conventions

- Keep TypeScript compatible with the strict settings in `tsconfig.json`; avoid `any` unless a boundary genuinely requires it.
- Follow SolidJS reactivity and component conventions rather than React-specific patterns.
- Add pages through TanStack's file-based routing in `src/routes/` and let the route-tree tooling regenerate `src/routeTree.gen.ts`.
- Keep Node-only modules, filesystem access, secrets, and database operations in server-only code paths.
- Follow the style of the file being edited. Prefer focused changes over unrelated formatting or refactors.
- Do not edit build output (`dist/`, `.output/`) or generated local configuration.

## Database changes

- Treat committed Flyway migrations as immutable once applied. Add a new migration named `V<next_version>__<description>.sql` for schema changes instead of rewriting migration history.
- Write PostgreSQL-compatible SQL and preserve foreign-key, uniqueness, check-constraint, index, and delete-behavior semantics deliberately.
- Update `db/test_data/test_data.sql` when a schema change affects local seed data. Keep the seed repeatable against a fresh migrated database.
- Never put credentials or environment-specific values in migrations or seed files.

## Environment and secrets

- `.env` is local-only. Do not display, commit, or replace its values.
- When new environment variables are required, document their names and purpose without committing real credentials.
- Preserve the existing `.gitignore` protections for environment files, dependencies, and build artifacts.

## Verification and handoff

- Run `npm run build` after application or build-configuration changes.
- Run `npm run lint` and `npm run typecheck` after TypeScript or JavaScript changes.
- Run `npm run format:check` after changing files supported by Oxfmt.
- Run any relevant named test scripts if they are added later.
- For migration or seed changes, validate with a fresh disposable database when practical. Do not erase an existing database volume merely to perform validation.
- Report which checks ran and any checks that could not run. Call out schema migration requirements and user-visible behavior changes.
- Preserve unrelated working-tree changes; never discard or overwrite user work to complete a task.
