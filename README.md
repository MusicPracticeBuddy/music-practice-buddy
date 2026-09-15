# Music Practice Buddy

Music Practice Buddy is a TypeScript and SolidJS application for tracking music practice sessions.

## System requirements

- [Node.js 24](https://nodejs.org/) and npm
- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2 (`docker compose`)
- Native build tools and PostgreSQL client headers, required by the `pg-native` dependency:
  - Debian/Ubuntu: `build-essential`, `python3`, and `libpq-dev`
  - macOS with Homebrew: Xcode Command Line Tools and `libpq`

You do not need to install or run PostgreSQL directly; Docker Compose provides PostgreSQL 17 and
runs the Flyway database migrations.

## Run locally

1. Copy the example environment file:

   ```sh
   cp .env.example .env
   ```

2. Set `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` in `.env`. For example, local-only
   values could be:

   ```dotenv
   POSTGRES_USER=music_practice
   POSTGRES_PASSWORD=music_practice
   POSTGRES_DB=music_practice
   ```

   To enable the development-only login, also set `AUTH_DEV_LOGIN_ENABLED=true`. It is always
   ignored when `NODE_ENV=production`.

3. Install the JavaScript dependencies:

   ```sh
   npm install
   ```

4. Start PostgreSQL and apply all database migrations:

   ```sh
   docker compose up -d
   ```

   To also load the optional local development data from `db/test_data/test_data.sql`, use:

   ```sh
   docker compose --profile seed up -d
   ```

5. Start the development server:

   ```sh
   npm run dev
   ```

6. Open <http://localhost:3000>.

To inspect the database containers, run `docker compose ps` or `docker compose logs <service>`.
Stop them without deleting the database volume with `docker compose down`.

## Development container

As an alternative to installing Node.js and the native PostgreSQL build dependencies locally,
open the repository in an editor or CLI that supports the Development Container specification.
The container installs npm dependencies, starts PostgreSQL, applies migrations, and loads the seed
data. Once setup finishes, run:

```sh
npm run dev
```

See [`.devcontainer/README.md`](.devcontainer/README.md) for details.

## Useful commands

| Command                    | Purpose                                      |
| -------------------------- | -------------------------------------------- |
| `npm run build`            | Build the client and server bundles          |
| `npm run test`             | Run unit and component tests                 |
| `npm run test:integration` | Run PostgreSQL integration tests with Docker |
| `npm run lint`             | Lint the repository                          |
| `npm run typecheck`        | Type-check the TypeScript project            |
| `npm run format:check`     | Check formatting                             |
