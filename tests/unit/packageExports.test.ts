import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const publicSpecifiers = [
  '@music-practice-buddy/core/app/client',
  '@music-practice-buddy/core/app/server',
  '@music-practice-buddy/core/app/start',
  '@music-practice-buddy/core/contracts',
  '@music-practice-buddy/core/domain',
  '@music-practice-buddy/core/domain/session',
  '@music-practice-buddy/core/migrations/V1__initial_schema.sql',
  '@music-practice-buddy/core/package.json',
  '@music-practice-buddy/core/routing',
  '@music-practice-buddy/core/server/auth',
  '@music-practice-buddy/core/server/database',
  '@music-practice-buddy/core/styles.css',
  '@music-practice-buddy/core/ui/ExerciseNotation',
] as const;

describe('core package exports', () => {
  it.each(publicSpecifiers)('resolves %s', (specifier) => {
    expect(require.resolve(specifier)).toBeTruthy();
  });

  it('does not expose internal data modules', () => {
    expect(() => require.resolve('@music-practice-buddy/core/data/sessions')).toThrow();
  });
});
