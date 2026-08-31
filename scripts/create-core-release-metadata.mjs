import { createHash } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

function requiredEnvironmentVariable(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

const artifactPath = resolve(requiredEnvironmentVariable('CORE_RELEASE_ARTIFACT'));
const tag = requiredEnvironmentVariable('CORE_RELEASE_TAG');
const commit = requiredEnvironmentVariable('CORE_RELEASE_COMMIT');
const packageManifestPath = resolve('packages/core/package.json');

const [artifact, packageManifestSource] = await Promise.all([
  readFile(artifactPath),
  readFile(packageManifestPath, 'utf8'),
]);
const packageManifest = JSON.parse(packageManifestSource);
const sha256 = createHash('sha256').update(artifact).digest('hex');
const artifactName = basename(artifactPath);
const outputDirectory = dirname(artifactPath);
const expectedVersion = tag.replace(/^core-v/, '');

if (packageManifest.name !== '@music-practice-buddy/core') {
  throw new Error(`Unexpected package name: ${packageManifest.name}`);
}

if (packageManifest.version !== expectedVersion) {
  throw new Error(`Package version ${packageManifest.version} does not match tag ${tag}`);
}

if (!artifactName.endsWith(`-${expectedVersion}.tgz`)) {
  throw new Error(`Artifact name ${artifactName} does not contain its version`);
}

const metadata = {
  schemaVersion: 1,
  package: {
    name: packageManifest.name,
    version: packageManifest.version,
  },
  release: {
    tag,
    commit,
  },
  artifact: {
    name: artifactName,
    bytes: artifact.byteLength,
    sha256,
  },
  build: {
    node: process.version,
  },
};

await Promise.all([
  writeFile(`${artifactPath}.sha256`, `${sha256}  ${artifactName}\n`, 'utf8'),
  writeFile(
    resolve(outputDirectory, 'core-release.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  ),
]);
