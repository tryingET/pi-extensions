# Exact npm publication recovery

An npm package version is immutable. A release retry must classify the registry state against the retained `pi.release-artifact.v1` record before attempting publication.

```sh
node ./scripts/release-npm-state.mjs inspect \
  --manifest /path/to/exact-artifact.manifest.json
```

The command returns one of three states:

- `absent`: npm returned a confirmed `E404`; publication of the exact retained tarball may proceed.
- `exact`: package name, version, `dist.integrity`, and `dist.shasum` equal the retained artifact; publication is already complete and retry is a no-op.
- `mismatch`: an immutable npm version exists with different identity or bytes; stop automation and treat the release as a critical integrity incident.

Authentication, network, rate-limit, and malformed-response failures are not absence. The inspector fails closed rather than permitting publication.

The publish workflow verifies artifact and SBOM evidence before inspection, publishes only in the `absent` state, and then requires an `exact` observation. This makes the following partial failure resumable:

```text
npm publication succeeds
  → workflow loses confirmation or evidence retention fails
    → retry observes exact immutable bytes
      → npm publish becomes a verified no-op
        → durable GitHub Release evidence retention resumes
```

Never change the tag, source, package version, or tarball to make a retry pass. Never use `npm unpublish` or a new tarball under the same version as routine recovery. Preserve registry output and workflow evidence before escalating a mismatch.
