# Telemetry extension points

The application collects telemetry through the vendor-neutral `TelemetryProvider` interface in
`src/telemetry/telemetry.ts`. The provider registry lives in `src/telemetry/provider.server.ts`, and
its default implementation is a no-op. This repository has no exporter, collector, or monitoring
infrastructure dependency.

The built-in hooks report:

- a page view after each completed client-side router render, reported to a server function with the
  URL path and stable route ID;
- every TanStack server-function call, with its function name, HTTP method, duration, and outcome;
- every PostgreSQL query made through the shared pool, including transaction clients, with its SQL
  query name, operation, parameterized statement, duration, outcome, and trace ID.

Every event has a server-generated UTC ISO 8601 `timestamp`. For a page view it marks when the
server accepted the report. For server-function and SQL events it marks when the operation began;
`durationMs` records the elapsed time until completion.

Every event also has a `serverVersion`. Set `SERVER_VERSION` in the deployed server environment to
the release identifier, normally the Git commit hash supplied by CI/CD. If it is unset or blank, the
application runs `git rev-parse HEAD` once and caches the result for the process lifetime. If Git or
repository metadata is unavailable, the value is `unknown`. Production distributions therefore do
not need Git when `SERVER_VERSION` is supplied.

Each browser API call receives a W3C-style 32-character trace ID. Navigations establish a client
trace before route loading begins, so the page-view report, route-loader server functions, and their
SQL queries share one ID. Other API calls receive one trace ID per call. Server-side async context
propagates the ID to nested SQL queries without adding it to application function arguments.
The async context and provider registry use process-global symbols because TanStack can include the
same telemetry modules in multiple server-function chunks; all chunks therefore share one active
trace and provider instance.

Query parameter values, authenticated-user details, headers, and response bodies are not reported.
The SQL statement is useful as trace span data, but it should not be used directly as a Prometheus
label. Use `operation` or a bounded statement fingerprint for metric labels to avoid high
cardinality.

## Supplying an implementation

A downstream application can implement `TelemetryProvider` and install it with
`configureTelemetry(provider)` during server startup. The provider registry is a server-only module.
No provider, OpenTelemetry SDK, exporter, metric, or span is created in the browser; browser code
only reports completed navigations to the `reportPageView` server function.

To inspect telemetry without installing a provider, set `TELEMETRY_CONSOLE_ENABLED=true` in the
server runtime environment and restart the application. Events then appear in the server output with
a `[telemetry]` prefix. The option defaults to disabled; any value other than the exact string `true`
uses the no-op provider.

Timed events include `durationMs` and `outcome`; SQL events include a stable, kebab-case `queryName`
such as `count-session-template`, plus parameterized statements but never their bound parameter
values. Query-config names take precedence over generated names, so individual queries can opt into
more domain-specific labels without changing the telemetry provider.

Trace IDs are appropriate for logs, traces, and Prometheus exemplars. Do not use them as ordinary
Prometheus metric labels: their unbounded cardinality would make the metric expensive. Use an
exemplar or jump from the trace ID to Tempo when investigating one user action.

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
