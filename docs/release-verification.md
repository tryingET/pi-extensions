# Verify a retained npm release

Each managed release retains one evidence directory containing the exact npm tarball, any exact local tarball closure, SHA-256 sidecars, `pi.release-artifact.v1`, an SPDX 2.3 document, `pi.release-evidence.v1`, and GitHub attestation bundles.

## Evidence boundary

`tagged-package-lock` means resolved non-development, non-peer dependencies were derived from the tracked package lock in the tagged source. `packed-manifest-declarations` means external dependency names and ranges were copied from the packed `package.json`; those entries are not asserted to be resolved installed versions.

The evidence binds source identity, package identity, retained bytes, checksums, and the declared dependency evidence mode. It does not prove vulnerability absence, semantic correctness, benign runtime behavior, or peer compatibility in a particular Pi host.

## Linux, Arch Linux, and Termux

From the downloaded evidence directory:

```sh
sha256sum --check -- *.sha256
```

Verify GitHub provenance for the exact npm tarball:

```sh
gh attestation verify ./tryinget-*.tgz --repo tryingET/pi-extensions
```

Verify the retained evidence manifests separately:

```sh
gh attestation verify ./*.evidence.json --repo tryingET/pi-extensions
```

From a checkout of the corresponding tag, verify the repository-owned contracts:

```sh
node ./scripts/release-artifact.mjs verify \
  --manifest /path/to/evidence/*.manifest.json

node ./scripts/release-sbom.mjs verify \
  --evidence /path/to/evidence/*.evidence.json
```

The structural artifact verifier installs the exact tarball closure with lifecycle scripts and bin-link creation disabled, then checks package identities and concrete package entry-point files. It does not execute package code.

After npm publication, compare registry metadata independently:

```sh
npm view '@tryinget/<package>@<version>' dist.integrity dist.shasum --json
```

The npm integrity and shasum should match `pi.release-artifact.v1`. npm provenance and GitHub attestations are separate evidence surfaces and should be checked independently during release review or incident response.
