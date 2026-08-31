import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const coreRoot = fileURLToPath(new URL('../packages/core/src/', import.meta.url));
const sourceExtensions = new Set(['.ts', '.tsx']);
const forbiddenImport = /(?:from\s+|import\s*\()['"](?:\.\.\/)*apps\//;

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : [path];
    }),
  );
  return files.flat().filter((path) => sourceExtensions.has(extname(path)));
}

const violations = [];
for (const file of await sourceFiles(coreRoot)) {
  const source = await readFile(file, 'utf8');
  if (forbiddenImport.test(source)) violations.push(relative(coreRoot, file));
}

if (violations.length > 0) {
  console.error(`Core must not import application code:\n${violations.join('\n')}`);
  process.exitCode = 1;
}
