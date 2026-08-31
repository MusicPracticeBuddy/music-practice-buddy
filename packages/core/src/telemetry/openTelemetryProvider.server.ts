import {
  SpanKind,
  SpanStatusCode,
  context,
  metrics,
  trace,
  type Attributes,
  type Span,
} from '@opentelemetry/api';
import type {
  OperationOutcome,
  PageView,
  ServerFunctionCall,
  SqlQuery,
  TelemetryOperation,
  TelemetryProvider,
} from '@/telemetry/telemetry';

const tracer = trace.getTracer('music-practice.telemetry');
const meter = metrics.getMeter('music-practice.telemetry');
const pageViewCounter = meter.createCounter('music_practice.page_views', {
  description: 'Completed client-side page views',
});
const serverFunctionCounter = meter.createCounter('music_practice.server_function.calls', {
  description: 'TanStack Start server-function calls',
});
const serverFunctionDuration = meter.createHistogram('music_practice.server_function.duration', {
  description: 'TanStack Start server-function duration',
  unit: 'ms',
});
const sqlQueryCounter = meter.createCounter('music_practice.sql.calls', {
  description: 'PostgreSQL query calls',
});
const sqlQueryDuration = meter.createHistogram('music_practice.sql.duration', {
  description: 'PostgreSQL query duration',
  unit: 'ms',
});

export const openTelemetryProvider: TelemetryProvider = {
  recordPageView: (pageView) => {
    const attributes = pageViewAttributes(pageView);
    pageViewCounter.add(1, { 'page.route_id': pageView.routeId });
    const span = tracer.startSpan(
      `page_view ${pageView.routeId}`,
      { attributes, startTime: new Date(pageView.timestamp) },
      context.active(),
    );
    span.end();
  },
  startServerFunction: (call) =>
    createTimedOperation({
      span: tracer.startSpan(
        `server_function ${call.functionName}`,
        {
          kind: SpanKind.INTERNAL,
          attributes: serverFunctionAttributes(call),
          startTime: new Date(call.timestamp),
        },
        context.active(),
      ),
      metricAttributes: {
        'server.function.name': call.functionName,
        'server.function.method': call.method,
      },
      recordMetrics: (durationMs, attributes) => {
        serverFunctionCounter.add(1, attributes);
        serverFunctionDuration.record(durationMs, attributes);
      },
    }),
  startSqlQuery: (query) =>
    createTimedOperation({
      span: tracer.startSpan(
        `sql ${query.queryName}`,
        {
          kind: SpanKind.CLIENT,
          attributes: sqlQueryAttributes(query),
          startTime: new Date(query.timestamp),
        },
        context.active(),
      ),
      metricAttributes: {
        'db.operation.name': query.operation,
        'db.query.name': query.queryName,
      },
      recordMetrics: (durationMs, attributes) => {
        sqlQueryCounter.add(1, attributes);
        sqlQueryDuration.record(durationMs, attributes);
      },
    }),
};

function createTimedOperation({
  span,
  metricAttributes,
  recordMetrics,
}: {
  span: Span;
  metricAttributes: Attributes;
  recordMetrics: (durationMs: number, attributes: Attributes) => void;
}): TelemetryOperation {
  const activeContext = trace.setSpan(context.active(), span);
  const startedAt = performance.now();

  return {
    run: (operation) => context.with(activeContext, operation),
    end: (outcome) => {
      const durationMs = performance.now() - startedAt;
      const attributes = { ...metricAttributes, outcome };
      context.with(activeContext, () => recordMetrics(durationMs, attributes));
      setSpanOutcome(span, outcome);
      span.end();
    },
  };
}

function setSpanOutcome(span: Span, outcome: OperationOutcome): void {
  span.setAttribute('operation.outcome', outcome);
  span.setStatus({
    code: outcome === 'success' ? SpanStatusCode.OK : SpanStatusCode.ERROR,
  });
}

function pageViewAttributes(pageView: PageView): Attributes {
  return {
    'app.trace_id': pageView.traceId,
    'page.path': pageView.path,
    'page.route_id': pageView.routeId,
    'service.version': pageView.serverVersion,
  };
}

function serverFunctionAttributes(call: ServerFunctionCall): Attributes {
  return {
    'app.trace_id': call.traceId,
    'server.function.name': call.functionName,
    'server.function.method': call.method,
    'service.version': call.serverVersion,
  };
}

function sqlQueryAttributes(query: SqlQuery): Attributes {
  return {
    'app.trace_id': query.traceId,
    'db.operation.name': query.operation,
    'db.query.name': query.queryName,
    'db.query.text': query.statement,
    'db.system.name': 'postgresql',
    'service.version': query.serverVersion,
  };
}
