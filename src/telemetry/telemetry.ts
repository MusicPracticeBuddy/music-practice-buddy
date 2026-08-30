export type OperationOutcome = 'success' | 'error'

export type PageViewData = {
  path: string
  routeId: string
  traceId: string
}

export type ServerFunctionCallData = {
  functionName: string
  method: string
  traceId: string
}

export type SqlQueryData = {
  queryName: string
  operation: string
  statement: string
  traceId: string
}

export type TelemetryMetadata = {
  serverVersion: string
  timestamp: string
}

export type PageView = PageViewData & TelemetryMetadata
export type ServerFunctionCall = ServerFunctionCallData & TelemetryMetadata
export type SqlQuery = SqlQueryData & TelemetryMetadata

/**
 * A provider can use run() to make a span current while the operation executes,
 * and end() to record its outcome and duration.
 */
export interface TelemetryOperation {
  run<T>(operation: () => T): T
  end(outcome: OperationOutcome): void
}

export interface TelemetryProvider {
  recordPageView(pageView: PageView): void
  startServerFunction(call: ServerFunctionCall): TelemetryOperation
  startSqlQuery(query: SqlQuery): TelemetryOperation
}
