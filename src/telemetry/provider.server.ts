import type {
  PageView,
  ServerFunctionCall,
  SqlQuery,
  TelemetryOperation,
  TelemetryProvider,
} from '@/telemetry/telemetry'

const noopOperation: TelemetryOperation = {
  run: (operation) => operation(),
  end: () => undefined,
}

const noopTelemetryProvider: TelemetryProvider = {
  recordPageView: () => undefined,
  startServerFunction: () => noopOperation,
  startSqlQuery: () => noopOperation,
}

let provider: TelemetryProvider = noopTelemetryProvider

export function configureTelemetry(telemetryProvider: TelemetryProvider): void {
  provider = telemetryProvider
}

export function resetTelemetry(): void {
  provider = noopTelemetryProvider
}

export function recordPageView(pageView: PageView): void {
  safelyRun(() => provider.recordPageView(pageView))
}

export function startServerFunction(call: ServerFunctionCall): TelemetryOperation {
  return startOperation(() => provider.startServerFunction(call))
}

export function startSqlQuery(query: SqlQuery): TelemetryOperation {
  return startOperation(() => provider.startSqlQuery(query))
}

function startOperation(start: () => TelemetryOperation): TelemetryOperation {
  let operation: TelemetryOperation
  try {
    operation = start()
  } catch {
    return noopOperation
  }

  let ended = false
  return {
    run: <T>(callback: () => T): T => operation.run(callback),
    end: (outcome) => {
      if (ended) return
      ended = true
      safelyRun(() => operation.end(outcome))
    },
  }
}

function safelyRun(callback: () => void): void {
  try {
    callback()
  } catch {
    // Observability must never make an application request fail.
  }
}
