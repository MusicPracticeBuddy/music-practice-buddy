# Telemetry extension points

The application collects telemetry through the vendor-neutral `TelemetryProvider` interface in
`src/telemetry/telemetry.ts`. The provider registry lives in `src/telemetry/provider.server.ts`, and
its default implementation is a no-op, so this repository has no exporter, collector, or monitoring
infrastructure dependency.

The built-in hooks report:

- a page view after each completed client-side router render, reported to a server function with the
  URL path and stable route ID;
- every TanStack server-function call, with its function name, HTTP method, duration, and outcome;
- every PostgreSQL query made through the shared pool, including transaction clients, with its SQL
  operation, parameterized statement, duration, and outcome.

Query parameter values, authenticated-user details, headers, and response bodies are not reported.
The SQL statement is useful as trace span data, but it should not be used directly as a Prometheus
label. Use `operation` or a bounded statement fingerprint for metric labels to avoid high
cardinality.

## Supplying an implementation

A downstream application can implement `TelemetryProvider` and install it with
`configureTelemetry(provider)` during server startup. The provider registry is a server-only module.
No provider, OpenTelemetry SDK, exporter, metric, or span is created in the browser; browser code
only reports completed navigations to the `reportPageView` server function.

An OpenTelemetry implementation can translate the callbacks as follows:

- `recordPageView` increments a page-view counter using `routeId` as a bounded attribute;
- `startServerFunction` starts a server-function span and timer;
- `startSqlQuery` starts a database span and timer;
- each operation's `run` method makes its span current while the callback runs, allowing SQL spans to
  inherit the active server-function span;
- each operation's `end` method records its duration and success/error status, then ends its span.

Provider methods should only create in-memory metric/span data. Exporting should happen in the
background. Exceptions thrown while starting or ending telemetry operations are intentionally
swallowed so monitoring outages cannot break application requests. The `run` method must preserve
the callback's return value and errors. Call `resetTelemetry()` in tests that replace the provider.

Prometheus, Grafana, Tempo, an OpenTelemetry SDK, and an OpenTelemetry Collector belong in the
downstream deployment project rather than this repository.
