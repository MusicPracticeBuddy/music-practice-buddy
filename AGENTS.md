# AGENTS.md

## Project overview

Music Practice Buddy is an npm-workspace TypeScript application for tracking music practice sessions. The public community application consumes a reusable core package. The UI and server code use SolidJS, TanStack Solid Router/Start, and Rsbuild. PostgreSQL is the datastore; core Flyway migrations live with the core package and local seed data lives under `db/`.

## Repository map

- `apps/community/`: thin public application shell. `routes.ts` mounts the core route configuration; `src/` contains the router, server/client entry points, and generated route tree.
- `packages/core/`: reusable `@music-practice-buddy/core` source package. `src/` owns public routes, features, UI components, domain logic, data access, authentication, telemetry, and extension contracts; `package.json` defines its supported export map.
- `packages/core/migrations/`: versioned Flyway schema migrations shipped with the core package.
- `db/test_data/`: optional local-development seed data used by the Compose `seed` profile.
- `tests/unit/`: Vitest unit and component tests, including package-export coverage.
- `tests/integration/`: PostgreSQL integration tests backed by Testcontainers.
- `scripts/`: repository boundary checks and GitHub Release metadata generation.
- `docs/`: architecture, edition-extension, telemetry, and core-release documentation.
- `.github/workflows/release-core.yml`: tag-triggered validation and GitHub Release packaging for core.
- `.devcontainer/`: development image and Compose override; it runs migrations and seed data before starting the app container.
- `compose.yml`: local PostgreSQL, Flyway, and optional profiled seed services.
- `rsbuild.config.ts`: community application build, core-source aliasing, and development-server configuration.
- `tsconfig.base.json` and `tsconfig.json`: shared strict TypeScript settings and workspace source inclusion.
- `.oxlintrc.json`: Oxlint rules, environments, and generated-file exclusions.
- `.oxfmtrc.json`: Oxfmt style options and generated-file exclusions.

## Setup and commands

- Install JavaScript dependencies with `npm install` (or `npm ci` when reproducing the lockfile exactly).
- Start the application with `npm run dev`; it serves on port 3000 by default.
- Build the client and SSR bundles with `npm run build`.
- Format supported files with `npm run format`; check formatting without writing with `npm run format:check`.
- Lint the repository with `npm run lint`; apply safe automatic fixes with `npm run lint:fix`.
- Type-check the project with `npm run typecheck`.
- Start PostgreSQL and apply migrations with `docker compose up -d`. Add `--profile seed` to include local seed data; the development container enables it automatically.
- Inspect database service state with `docker compose ps` and logs with `docker compose logs <service>`.
- Do not run `docker compose down -v` unless the user explicitly wants to delete local database data.

Use scripts declared in `package.json` as the source of truth. Do not invent a test, lint, or type-check command that the repository does not define. When adding a new check, add a named npm script so local work and CI use the same command.

## Implementation conventions

- Keep TypeScript compatible with the strict settings in `tsconfig.json`; avoid `any` unless a boundary genuinely requires it.
- Follow SolidJS reactivity and component conventions rather than React-specific patterns.
- Add public core pages under `packages/core/src/routes/` and compose them through `apps/community/routes.ts`. Let the route-tree tooling regenerate `apps/community/src/routeTree.gen.ts`; do not edit it by hand.
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
- Run the relevant unit and integration test scripts for the code being changed.
- For migration or seed changes, validate with a fresh disposable database when practical. Do not erase an existing database volume merely to perform validation.
- Report which checks ran and any checks that could not run. Call out schema migration requirements and user-visible behavior changes.
- Preserve unrelated working-tree changes; never discard or overwrite user work to complete a task.
