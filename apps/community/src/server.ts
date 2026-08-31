import { initializeOpenTelemetry } from '@music-practice-buddy/core/app/server';
import type { Register } from '@tanstack/solid-router';
import type { RequestHandler } from '@tanstack/solid-start/server';

await initializeOpenTelemetry();

const { createStartHandler, defaultStreamHandler } = await import('@tanstack/solid-start/server');
const fetch = createStartHandler(defaultStreamHandler);

export type ServerEntry = { fetch: RequestHandler<Register> };

export function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(...args) {
      return await entry.fetch(...args);
    },
  };
}

export default createServerEntry({ fetch });
