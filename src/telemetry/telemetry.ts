export type OperationOutcome = 'success' | 'error'

export type PageView = {
  path: string
  routeId: string
}

export type ServerFunctionCall = {
  functionName: string
  method: string
}

export type SqlQuery = {
  operation: string
  statement: string
}

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
