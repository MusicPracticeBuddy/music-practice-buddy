import type {
  PageViewData,
  ServerFunctionCall,
  ServerFunctionCallData,
  TelemetryOperation,
  TelemetryProvider,
} from '@/telemetry/telemetry';
import { getServerVersion } from '@/telemetry/serverVersion.server';

const noopOperation: TelemetryOperation = {
  run: (operation) => operation(),
  end: () => undefined,
};

const noopTelemetryProvider: TelemetryProvider = {
  recordPageView: () => undefined,
  startServerFunction: () => noopOperation,
};

const consoleTelemetryProvider: TelemetryProvider = {
  recordPageView: (pageView) => logTelemetry('page_view', pageView),
  startServerFunction: (call) => createConsoleOperation('server_function', call),
};

const providerKey = Symbol.for('music-practice.telemetry.provider');
const globalRegistry = globalThis as unknown as Record<PropertyKey, unknown>;

if (!globalRegistry[providerKey]) globalRegistry[providerKey] = getDefaultProvider();

export function configureTelemetry(telemetryProvider: TelemetryProvider): void {
  globalRegistry[providerKey] = telemetryProvider;
}

export function resetTelemetry(): void {
  globalRegistry[providerKey] = getDefaultProvider();
}

export function recordPageView(pageView: PageViewData): void {
  safelyRun(() => getProvider().recordPageView(withTelemetryMetadata(pageView)));
}

export function startServerFunction(call: ServerFunctionCallData): TelemetryOperation {
  return startOperation(() => getProvider().startServerFunction(withTelemetryMetadata(call)));
}

function getProvider(): TelemetryProvider {
  return globalRegistry[providerKey] as TelemetryProvider;
}

function getDefaultProvider(): TelemetryProvider {
  return process.env.TELEMETRY_CONSOLE_ENABLED === 'true'
    ? consoleTelemetryProvider
    : noopTelemetryProvider;
}

function startOperation(start: () => TelemetryOperation): TelemetryOperation {
  let operation: TelemetryOperation;
  try {
    operation = start();
  } catch {
    return noopOperation;
  }

  let ended = false;
  return {
    run: <T>(callback: () => T): T => operation.run(callback),
    end: (outcome) => {
      if (ended) return;
      ended = true;
      safelyRun(() => operation.end(outcome));
    },
  };
}

function safelyRun(callback: () => void): void {
  try {
    callback();
  } catch {
    // Observability must never make an application request fail.
  }
}

function createConsoleOperation(
  type: 'server_function',
  attributes: ServerFunctionCall,
): TelemetryOperation {
  const startedAt = performance.now();
  return {
    run: (operation) => operation(),
    end: (outcome) =>
      logTelemetry(type, {
        ...attributes,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
        outcome,
      }),
  };
}

function logTelemetry(type: string, attributes: object): void {
  console.info('[telemetry]', { type, ...attributes });
}

function withTelemetryMetadata<T extends object>(
  attributes: T,
): T & { serverVersion: string; timestamp: string } {
  return {
    ...attributes,
    serverVersion: getServerVersion(),
    timestamp: new Date().toISOString(),
  };
}
