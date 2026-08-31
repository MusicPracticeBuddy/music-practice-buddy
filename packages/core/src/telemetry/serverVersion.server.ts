import { execFileSync } from 'node:child_process';

const serverVersionKey = Symbol.for('music-practice.telemetry.server-version');
const globalRegistry = globalThis as unknown as Record<PropertyKey, unknown>;

export function getServerVersion(): string {
  const cachedVersion = globalRegistry[serverVersionKey];
  if (typeof cachedVersion === 'string') return cachedVersion;

  const serverVersion = process.env.SERVER_VERSION?.trim() || readGitHash() || 'unknown';
  globalRegistry[serverVersionKey] = serverVersion;
  return serverVersion;
}

function readGitHash(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
