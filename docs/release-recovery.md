# Release recovery and compromise response

This runbook applies after a package version, tag, GitHub Release, npm publication, or durable evidence asset may exist. Published npm versions and release tags are immutable facts. Recovery resumes missing operations from exact source and exact retained bytes; it never rewrites history to make an incident disappear.

## First response

1. Stop automated retries when the observed state is uncertain or mismatched.
2. Preserve the tag, workflow run IDs, logs, GitHub Release assets, npm metadata, attestations, and local evidence before cleanup.
3. Record a `pi.release-state-observation.v1` document and classify it:

```sh
node ./scripts/release-state.mjs classify --input /path/to/observation.json
```

4. Follow only the returned `allowedActions`. The classifier never mutates GitHub or npm.

Every decision prohibits:

- overwriting an existing npm version;
- moving or reusing a release tag;
- clobbering a different GitHub Release asset;
- rewriting tagged source to make a release pass;
- deleting evidence before preservation.

## Read-only diagnostics from Linux, Arch Linux, or Termux

```sh
repo=tryingET/pi-extensions
tag='pi-telemetry-v0.3.0'
package='@tryinget/pi-telemetry'
version='0.3.0'

git fetch origin main --tags
git rev-parse "$tag^{commit}"
git merge-base --is-ancestor "$tag^{commit}" origin/main

gh release view "$tag" --repo "$repo" --json tagName,isDraft,isPrerelease,assets,url
npm view "$package@$version" version dist.integrity dist.shasum --json
gh attestation verify /path/to/exact.tgz --repo "$repo"
```

Download durable evidence without overwriting local files:

```sh
mkdir -m 700 -p evidence-download
gh release download "$tag" --repo "$repo" \
  --pattern '*.release-evidence.tar.gz' \
  --pattern '*.release-evidence.tar.gz.sha256' \
  --dir evidence-download
cd evidence-download
sha256sum --check -- *.sha256
```

## State-specific recovery

### Candidate without tag

No immutable publication boundary has been crossed. Complete local release proof, correct source normally, and create a new exact tag only after all version and release surfaces agree.

### Exact tag without a published GitHub Release

Create or publish the GitHub Release from that exact tag. Do not move the tag to a later commit. If the tag points to the wrong source, treat it as `source-tag-mismatch` instead.

### GitHub Release exists, npm version absent

Resume the publish workflow from the exact tag. The workflow rebuilds and verifies one exact tarball, checks source restoration, creates deterministic evidence, and publishes that tarball. Do not publish from `main` or a reconstructed working tree.

### npm version exact, durable evidence absent or partial

The npm version cannot be replaced. Reconstruct evidence only from the exact tag and verify npm integrity/shasum against `pi.release-artifact.v1`. Retain only missing GitHub Release assets. Existing assets must be downloaded and compared byte-for-byte; a differing asset freezes recovery.

A pair containing only the archive or only the checksum is recoverable only when the existing member exactly matches the locally reconstructed member. Upload the missing counterpart without `--clobber`, then download and compare the complete pair.

### Component complete, multi-component wave partial

Leave published component versions immutable. Continue only components that are still unpublished. Record the wave as partial; do not create compensating rewrites of already published components merely to make the wave appear atomic.

### Source or tag mismatch

Freeze release automation. Preserve the conflicting tag and evidence. Do not move the tag. Prepare a corrective version with explicit release notes and migration guidance. If the incorrect tag has no public release or npm publication, document and supersede it rather than silently deleting it.

### npm artifact mismatch

Freeze publication and trusted-publisher access. Preserve npm metadata, provenance, exact local evidence, and workflow logs. Deprecate the affected npm version with a precise replacement message when appropriate, then publish a corrective new version. Avoid `npm unpublish` except when legal/security response requires it and registry policy permits it.

### Evidence or attestation mismatch

Freeze automated retention and publication. Determine whether the subject tarball differs or only an evidence/storage surface differs. If subject bytes are exact, repair only a missing asset; never replace a different asset. If subject bytes differ, treat the release as an npm artifact incident and publish a corrective version.

### Suspected or confirmed compromise

Immediately:

- disable or narrow the npm trusted publisher and affected GitHub environment;
- revoke affected tokens, deploy keys, GitHub Apps, and OIDC trust;
- preserve logs, attestations, release assets, npm metadata, and account audit records;
- prevent workflow retries until source, identity, and builder boundaries are understood;
- deprecate affected versions and publish corrective versions from restored trust;
- communicate affected package names, versions, time range, known impact, and verification steps.

An artifact attestation establishes builder/source binding, not safety. A valid attestation does not override evidence of a compromised source, workflow, dependency, or account.

## Durable evidence retention contract

After npm publication succeeds, a separate least-privilege job downloads the exact workflow artifact and attaches two assets to the existing GitHub Release:

```text
<component>-v<version>.release-evidence.tar.gz
<component>-v<version>.release-evidence.tar.gz.sha256
```

The archive is deterministic for a fixed evidence directory and source timestamp. Retention is idempotent:

- neither asset exists: upload both;
- both exist and match: no-op;
- one exists and matches: upload only the missing counterpart;
- any existing member differs: fail and freeze; never clobber.

The durable archive supplements GitHub attestations and npm provenance. It does not replace either trust surface.

## Incident distinctions

Keep these cases separate because remediation differs:

| Failure | Primary repair |
|---|---|
| Bad source or implementation | Corrective source change and new version |
| Bad generated release metadata before publication | Correct normally before tagging |
| Wrong tag source | Freeze; preserve; new corrective version/tag |
| Bad packed artifact or npm byte mismatch | Deprecate; new version; investigate publisher |
| GitHub Release/npm partial publication | Resume only missing exact operation |
| Durable evidence upload failure | Reconstruct from exact tag; compare; retain missing asset |
| Compromised workflow/account/OIDC trust | Revoke, preserve, investigate, restore trust, corrective release |
| Bad doctrine or content guidance | Deprecate/replace guidance through its content lifecycle |
| Bad telemetry or KES interpretation | Correct evidence classification; do not rewrite underlying observation |

## Completion evidence

A recovered release is complete only when:

- the tag resolves to expected source contained in `main`;
- the GitHub Release is published;
- npm metadata matches the exact retained tarball;
- the durable archive and checksum exist and match;
- provenance, SBOM, and evidence-manifest attestations verify;
- any multi-component wave has an explicit final disposition;
- incident notes preserve what happened and why the chosen action was allowed.
