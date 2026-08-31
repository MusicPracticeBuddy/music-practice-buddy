# Core releases

`@music-practice-buddy/core` is distributed as an npm-compatible tarball attached
to a GitHub Release. It is not published to the npm registry.

## Creating a release

Core releases use tags of the form `core-v<semver>`:

```text
core-v1.2.3
core-v1.2.3-beta.1
```

After the intended commit is on `main`, create and push the tag:

```sh
git tag -a core-v1.2.3 -m "Release core 1.2.3"
git push origin core-v1.2.3
```

The `Release core package` workflow then:

1. validates the tag and runs formatting, lint, boundary, type, test, and build
   checks;
2. stamps `packages/core/package.json` with the tag version inside the runner;
3. creates `music-practice-buddy-core-1.2.3.tgz`, a SHA-256 checksum, and a
   JSON metadata file;
4. attests the tarball when the repository is public; and
5. uploads the files to a draft GitHub Release before publishing it.

The checked-in package version remains `0.0.0`. Release tags are the source of
truth for published versions, which avoids version-only commits and keeps local
workspace dependencies stable.

Pre-release tags containing a suffix, such as `core-v1.2.3-beta.1`, produce a
GitHub pre-release. A published release is never overwritten by a workflow
rerun. A failed run can resume an existing draft release.

Enable immutable releases in the GitHub repository settings as an additional
safeguard. Once a draft is published, GitHub will then prevent its tag and
assets from being changed or deleted.

## Consuming core from `mpb-pro`

Pin the dependency to the versioned release asset in `mpb-pro/package.json`:

```json
{
  "dependencies": {
    "@music-practice-buddy/core": "https://github.com/MusicPracticeBuddy/music-practice-buddy/releases/download/core-v1.2.3/music-practice-buddy-core-1.2.3.tgz"
  }
}
```

Then run `npm install` and commit both `package.json` and `package-lock.json` in
`mpb-pro`. Subsequent `npm ci` runs download the pinned release asset and verify
it against the integrity value in the lockfile. Updating core is an explicit
change to the version in the URL followed by another `npm install`.

The GitHub Release also contains:

- `music-practice-buddy-core-1.2.3.tgz.sha256`, for an independent checksum;
- `core-release.json`, which records the package version, source commit, artifact
  size, checksum, and build-time Node version.

For a public repository, the workflow also creates a GitHub artifact
attestation. It can be checked after downloading the tarball:

```sh
gh attestation verify music-practice-buddy-core-1.2.3.tgz \
  --repo MusicPracticeBuddy/music-practice-buddy
```

The tarball contains the TypeScript source exposed by the core package export
map. `mpb-pro` therefore consumes it through its normal application build rather
than expecting a separately compiled JavaScript package.
