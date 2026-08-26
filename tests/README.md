# Tests

Run the focused editor tests with:

```sh
npm test
```

Run the PostgreSQL workflow tests with:

```sh
npm run test:integration
```

The integration command uses Testcontainers to start a temporary PostgreSQL container on a random
host port and applies the SQL files from `db/migration/` in version order. The container is stopped
and removed after the suite, so the tests do not use or modify the Compose development database.

Run both suites with:

```sh
npm run test:all
```
