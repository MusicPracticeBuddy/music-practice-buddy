# Development container

## Prerequisites

- Docker with Compose support
- An editor or CLI that supports the [Development Container specification](https://containers.dev/)

## Start the environment

1. Open the repository in a development container.
2. Wait for `npm ci` and the database migrations/seed step to finish.
3. Run `npm run dev` in the container.

The application is forwarded on port 3000. PostgreSQL is available inside the container at
`postgres:5432` and on the host at `localhost:5432`.

The configuration uses safe local defaults for the database when `.env` is absent. Values in a
local `.env` override those defaults. The development login defaults to enabled in the container
and can be changed with `AUTH_DEV_LOGIN_ENABLED` in `.env`.

The container also has access to the host Docker daemon so the Testcontainers-based integration
suite can run with `npm run test:integration`.

## Codex

The host's `~/.codex` directory is mounted read-write at `/home/node/.codex`, and the official Codex
extension is installed in the container. This reuses the host's cached login, configuration, and
saved chats, and keeps changes made inside the container available on the host.

Treat the development container as trusted: the mount includes `auth.json`, which contains Codex
access tokens. Rebuild the container after changing this configuration. If the host uses an OS
keyring instead of file-based authentication and `~/.codex/auth.json` is absent, sign in with Codex
inside the container once or configure Codex to use file-based credential storage.
