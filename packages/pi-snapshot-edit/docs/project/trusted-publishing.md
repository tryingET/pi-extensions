---
summary: "Trusted publishing notes for monorepo package components."
read_when:
  - "Configuring npm OIDC trusted publishing for monorepo package releases."
  - "Debugging release-please or publish workflow failures in monorepo CI."
system4d:
  container: "Monorepo release automation reliability notes."
  compass: "Use OIDC safely with component-aware release behavior."
  engine: "Configure root workflows -> validate package metadata -> release -> verify."
  fog: "Most failures come from root workflow policy mismatch or component map drift."
---

# Trusted publishing runbook (monorepo package mode)

## Baseline assumptions

- Release automation lives at monorepo root.
- Package release is component-scoped (release-please component mode or equivalent).
- Publish workflow uses npm OIDC trusted publishing (no long-lived npm token in CI).

## Package-level requirements

- `package.json.repository.url` must point to monorepo git URL.
- `package.json.repository.directory` must match package workspace path.
- `x-pi-template` metadata should align with root component mapping:
  - `workspacePath`
  - `releaseComponent`
  - `releaseConfigMode` (default/root-managed baseline: `component`; `none` is an explicit opt-out only)

## Root workflow expectations

- Root `release-please` workflow must keep component map aligned with package metadata when `releaseConfigMode` is `component`.
- Publish workflow should run npm >= 11.5.1 for trusted publishing compatibility.
- Actions policy + permissions at repo level must allow release/publish workflows.

## First public release bootstrap

This package starts from an unpublished `0.1.0` release-please floor. Follow the established activity-strip/context-packer bootstrap pattern:

1. Merge the release-ready feature history without manufacturing a published `0.1.0` release.
2. Let release-please generate the first public `0.2.0` release PR, then review its version and changelog before merging it.
3. Let the normal release and OIDC publish workflow attempt to publish the immutable `0.2.0` release artifact.
4. Only if OIDC fails because the npm package does not exist yet, manually publish that exact already-produced `0.2.0` artifact with authenticated npm credentials. Do not rebuild, retag, or substitute an artifact.
5. After the package exists, configure npm trusted publishing for the repository workflow and use OIDC for subsequent releases.

### Failed-run artifact bootstrap fallback

The publish job uploads the checked tarball and its SHA-256 sidecar before attempting OIDC publish. For the one-time first-package bootstrap, set both the expected release tag and failed publish workflow run ID. The guard below refuses to download unless the run is the failed `publish` release run for that exact tag and its recorded head SHA equals the fetched tag commit.

```bash
export EXPECTED_TAG=pi-snapshot-edit-v0.2.0
export RUN_ID="<failed-publish-workflow-run-id>"

set -euo pipefail
: "${EXPECTED_TAG:?EXPECTED_TAG is required}"
: "${RUN_ID:?RUN_ID is required}"
[[ "$RUN_ID" =~ ^[0-9]+$ ]] || {
  echo "RUN_ID must be the numeric failed publish workflow run ID" >&2
  exit 1
}
repo=tryingET/pi-extensions
case "$EXPECTED_TAG" in
  pi-snapshot-edit-v*) expected_version="${EXPECTED_TAG#pi-snapshot-edit-v}" ;;
  *) echo "EXPECTED_TAG must be a pi-snapshot-edit release tag" >&2; exit 1 ;;
esac
[[ "$expected_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]] || {
  echo "Invalid snapshot-edit release version in EXPECTED_TAG: $EXPECTED_TAG" >&2
  exit 1
}

run_json="$(gh run view "$RUN_ID" --repo "$repo" \
  --json name,event,conclusion,headBranch,headSha)"
run_head_sha="$(RUN_JSON="$run_json" EXPECTED_TAG="$EXPECTED_TAG" node <<'NODE'
const run = JSON.parse(process.env.RUN_JSON);
const expected = process.env.EXPECTED_TAG;
const failures = [];
if (run.name !== "publish") failures.push(`workflow name is ${JSON.stringify(run.name)}, not "publish"`);
if (run.event !== "release") failures.push(`event is ${JSON.stringify(run.event)}, not "release"`);
if (run.conclusion !== "failure") failures.push(`conclusion is ${JSON.stringify(run.conclusion)}, not "failure"`);
if (run.headBranch !== expected) failures.push(`head branch/tag is ${JSON.stringify(run.headBranch)}, not ${JSON.stringify(expected)}`);
if (!/^[0-9a-f]{40}$/i.test(run.headSha || "")) failures.push(`invalid head SHA ${JSON.stringify(run.headSha)}`);
if (failures.length) {
  console.error(`Refusing bootstrap download: ${failures.join("; ")}`);
  process.exit(1);
}
process.stdout.write(run.headSha);
NODE
)"

workdir="$(mktemp -d /tmp/pi-snapshot-edit-bootstrap-XXXXXX)"
trap 'rm -rf "$workdir"' EXIT
git init --quiet "$workdir/tag-check"
git -C "$workdir/tag-check" remote add origin "https://github.com/$repo.git"
git -C "$workdir/tag-check" fetch --quiet --depth=1 origin \
  "refs/tags/$EXPECTED_TAG:refs/tags/$EXPECTED_TAG"
tag_commit="$(git -C "$workdir/tag-check" rev-parse "$EXPECTED_TAG^{commit}")"
[[ "$tag_commit" == "$run_head_sha" ]] || {
  echo "Run head SHA $run_head_sha does not equal tag commit $tag_commit" >&2
  exit 1
}

artifact_dir="$workdir/artifact"
mkdir -p "$artifact_dir"
gh run download "$RUN_ID" \
  --repo "$repo" \
  --name "npm-pi-snapshot-edit-$expected_version" \
  --dir "$artifact_dir"
tarball="$artifact_dir/tryinget-pi-snapshot-edit-$expected_version.tgz"
[[ -f "$tarball" && -f "$tarball.sha256" ]] || {
  echo "Expected tarball and SHA-256 sidecar were not downloaded" >&2
  exit 1
}
(cd "$artifact_dir" && sha256sum --check "$(basename "$tarball.sha256")")

npm whoami --registry https://registry.npmjs.org/
npm publish "$tarball" \
  --registry https://registry.npmjs.org/ \
  --access public \
  --tag latest
```

Manual bootstrap credentials come from the operator's authenticated npm configuration; never place a token in the repository or command history. Do **not** run `npm pack`, rebuild from the tag, rename/substitute the tarball, or publish when workflow metadata, tag-commit equality, or SHA verification fails. A missing or expired failed-run artifact requires rerunning the unchanged release workflow to produce a newly checked artifact, not a local rebuild.

The package retains its current restricted custom license. Keep the prominent README disclosure and `SEE LICENSE IN LICENSE` package metadata; this bootstrap does not authorize changing license terms.

## Common failure modes

1. Component key drift between package metadata and root release config.
2. Wrong `repository.directory` causing provenance verification failures.
3. Workflow permissions set to read-only in monorepo settings.
4. Missing npm trusted publisher binding for monorepo repository/workflow.

## Verification checklist

- Package passes `npm run release:check:quick` in workspace.
- Root release workflow can produce/update component release PR.
- Publish workflow completes with `npm publish --provenance --access public` for package.
