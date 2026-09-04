import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureTelemetry,
  recordPageView,
  resetTelemetry,
  startServerFunction,
} from '@/telemetry/provider.server';
import {
  type OperationOutcome,
  type TelemetryOperation,
  type TelemetryProvider,
} from '@/telemetry/telemetry';
import { createTraceId, createTraceParent } from '@/telemetry/trace';

const TRACE_ID = '0123456789abcdef0123456789abcdef';
const originalConsoleTelemetrySetting = process.env.TELEMETRY_CONSOLE_ENABLED;

function createOperation() {
  const outcomes: OperationOutcome[] = [];
  const operation: TelemetryOperation = {
    run: (callback) => callback(),
    end: (outcome) => outcomes.push(outcome),
  };
  return { operation, outcomes };
}

function createProvider(): TelemetryProvider {
  return {
    recordPageView: vi.fn(),
    startServerFunction: vi.fn(() => createOperation().operation),
  };
}

afterEach(() => {
  if (originalConsoleTelemetrySetting === undefined) {
    delete process.env.TELEMETRY_CONSOLE_ENABLED;
  } else {
    process.env.TELEMETRY_CONSOLE_ENABLED = originalConsoleTelemetrySetting;
  }
  resetTelemetry();
});

describe('telemetry', () => {
  it('creates a W3C trace ID without requiring crypto.randomUUID', () => {
    const randomUuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('randomUUID is unavailable');
    });

    expect(createTraceId()).toMatch(/^[0-9a-f]{32}$/);
    expect(randomUuid).not.toHaveBeenCalled();
  });

  it('creates a sampled W3C traceparent from the application trace ID', () => {
    expect(createTraceParent(TRACE_ID)).toMatch(
      /^00-0123456789abcdef0123456789abcdef-[0-9a-f]{16}-01$/,
    );
  });

  it('does nothing by default', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    delete process.env.TELEMETRY_CONSOLE_ENABLED;
    resetTelemetry();

    recordPageView({ path: '/sessions', routeId: '/sessions/', traceId: TRACE_ID });

    expect(consoleInfo).not.toHaveBeenCalled();
  });

  it('prints events when console telemetry is enabled at runtime', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    process.env.TELEMETRY_CONSOLE_ENABLED = 'true';
    resetTelemetry();

    recordPageView({ path: '/sessions', routeId: '/sessions/', traceId: TRACE_ID });
    const operation = startServerFunction({
      functionName: 'getSessions',
      method: 'GET',
      traceId: TRACE_ID,
    });
    operation.run(() => undefined);
    operation.end('success');

    expect(consoleInfo).toHaveBeenNthCalledWith(1, '[telemetry]', {
      type: 'page_view',
      path: '/sessions',
      routeId: '/sessions/',
      traceId: TRACE_ID,
      serverVersion: expect.any(String),
      timestamp: expect.any(String),
    });
    expect(consoleInfo).toHaveBeenNthCalledWith(
      2,
      '[telemetry]',
      expect.objectContaining({
        type: 'server_function',
        functionName: 'getSessions',
        method: 'GET',
        traceId: TRACE_ID,
        serverVersion: expect.any(String),
        timestamp: expect.any(String),
        outcome: 'success',
        durationMs: expect.any(Number),
      }),
    );
  });

  it('allows a provider to establish an active operation scope', () => {
    const run = vi.fn();
    const operation: TelemetryOperation = {
      run: (callback) => {
        run();
        return callback();
      },
      end: vi.fn(),
    };
    const provider = createProvider();
    provider.startServerFunction = vi.fn(() => operation);
    configureTelemetry(provider);

    const serverFunction = startServerFunction({
      functionName: 'getSessionsPage',
      method: 'GET',
      traceId: TRACE_ID,
    });
    expect(serverFunction.run(() => 'result')).toBe('result');
    serverFunction.end('success');

    expect(run).toHaveBeenCalledOnce();
    expect(operation.end).toHaveBeenCalledWith('success');
  });

  it('does not let provider start or end failures escape into application code', () => {
    const provider = createProvider();
    provider.startServerFunction = vi.fn(() => {
      throw new Error('exporter unavailable');
    });
    configureTelemetry(provider);

    const operation = startServerFunction({
      functionName: 'getSessionsPage',
      method: 'GET',
      traceId: TRACE_ID,
    });
    expect(operation.run(() => 'result')).toBe('result');
    expect(() => operation.end('success')).not.toThrow();
  });
});
