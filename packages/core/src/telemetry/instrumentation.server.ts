import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { configureTelemetry } from '@/telemetry/provider.server';
import { setPostgresQueryName } from '@/telemetry/postgres';
import { getServerVersion } from '@/telemetry/serverVersion.server';

const sdkKey = Symbol.for('music-practice.telemetry.open-telemetry-sdk');
const globalRegistry = globalThis as unknown as Record<PropertyKey, unknown>;

export async function initializeOpenTelemetry(): Promise<void> {
  if (process.env.OTEL_ENABLED !== 'true' || globalRegistry[sdkKey]) return;

  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME?.trim() || 'music-practice-buddy',
      [ATTR_SERVICE_VERSION]: getServerVersion(),
    }),
  );
  const sdk = new NodeSDK({
    resource,
    instrumentations: [
      new HttpInstrumentation(),
      new PgInstrumentation({
        requestHook: setPostgresQueryName,
      }),
    ],
  });

  sdk.start();
  globalRegistry[sdkKey] = sdk;
  const { openTelemetryProvider } = await import('@/telemetry/openTelemetryProvider.server');
  configureTelemetry(openTelemetryProvider);
}

export async function shutdownOpenTelemetry(): Promise<void> {
  const sdk = globalRegistry[sdkKey];
  if (!(sdk instanceof NodeSDK)) return;
  await sdk.shutdown();
  delete globalRegistry[sdkKey];
}
