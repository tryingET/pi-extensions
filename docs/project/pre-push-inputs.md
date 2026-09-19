---
summary: "Commit-gate input admission, explicit build preparation, and safe shared-checkout landing."
read_when:
  - "A pre-push gate reports a toolchain mismatch or stale package install."
  - "Preparing a clean checkout or gate-required generated outputs."
---

# Pre-push inputs

## Admission, not automatic machine repair

`npm run quality:pre-push` enters `scripts/ci/full.sh`. Before tests it checks:

1. Exact Node/npm versions from the existing `policy/ci-toolchain-lock.json`.
2. Authored Pi host pins.
3. Tracked install roots' lockfiles, installed package names/versions and npm's
   installed-lock provenance metadata, then existing direct/transitive local links.

A mismatch names its owner and repair; the gate never runs `npm ci` automatically.
Coordinate explicit installs with live Pi sessions and other test runners: `npm ci`
removes the existing installation and may run a package's `prepare` script.

Install discovery covers the dependency-free root, `packages/*`, and immediate
package-group children. Generated manifests, test fixtures, and untracked roots
are not installation subjects. Dependency-bearing subjects need a tracked v3 lock.
External `file:` target snapshots in a consumer lock do not override the target's
own lock. Missing optional dependencies are allowed (including incompatible
OS/CPU binaries); present optional dependencies must match. Development
requirements are not optional merely because a production install omitted them.

This is consistency admission, **not** cryptographic verification of installed
code or complete detection of arbitrary extra files in `node_modules`. Hidden
locks do not override actual installed versions. CI's existing `PI_SKIP_PACKAGES`
split also skips the fleet-install preflight, since dedicated package jobs own
those dependencies; it does not skip toolchain admission.

## Toolchain setup

The pin is Node **22.22.2**, npm **12.0.2**. Do not change the pin merely to admit
ambient machine drift. A Node distribution may bundle an unsuitable npm.
On this workstation, where system npm is already 12.0.2, a node-only PATH shim
keeps npm separate from the older bundled npm:

```sh
shim="$(mktemp -d "${TMPDIR:?}/pi-gate-node.XXXXXX")"
ln -s "$HOME/.local/opt/node-v22.22.2-linux-x64/bin/node" "$shim/node"
export PATH="$shim:$PATH"
node scripts/check-gate-toolchain.mjs
```

If npm also differs, provision npm 12.0.2 in a separate prefix as CI does; do not
replace the active shared installation silently. Gate scratch honors
`PI_EXTENSIONS_TMPDIR`, then `TMPDIR`, before its home-directory fallback.

## Tracked file budgets

The root hard-fail audit and package push/CI audits use `--tracked`, selecting
NUL-delimited Git-index paths rather than walking untracked scratch. Existing
thresholds and owner-scoped exceptions remain enforced. Missing tracked source
files fail; symlink targets are not followed. The ordinary advisory/pre-commit
audit still walks the working tree so newly authored files receive feedback.

This selects **tracked working-tree content**, not immutable commit blobs. Other
checks also consume working-tree sources. It does not certify that a concurrent
shared checkout equals the pushed commit. Use the isolated recipe below when
that distinction matters; these changes do not claim whole-gate hermeticity.

## Generated outputs: explicit preparation

Before full validation of a fresh checkout, or after relevant source changes:

```sh
bash scripts/prepare-gate-builds.sh
npm run quality:pre-push
```

The preparation command checks toolchain/installs, then invokes only the owner
builds: ASC `build:runtime`, orchestrator and little-helpers `task-session:build`,
and telemetry `build:review-runtime`. It does not invoke `prepack`, whose manifest
rewrites are inappropriate as implicit gate preparation. Existing release checks
still validate `files[]` and `pi.extensions` outputs; their presence alone does
not establish freshness. Preparation must be rerun when its inputs change.

**Do not prepare builds under concurrent live readers.** ASC and telemetry delete
and rebuild `dist/`; use a clean detached checkout for isolated preparation.

## Isolated landing when the shared checkout is busy

Run multi-GiB install/build work through:

```sh
heavy-job run --label ak5787-gate --task 5787 -- <owned-preparation-command>
```

Inside that job, create a detached worktree of the exact commit under its
`TMPDIR`, select the pinned toolchain, run `npm ci` in every tracked install root
(the root itself remains dependency-free), then run `prepare-gate-builds.sh`.
Push with `git -c core.hooksPath=.githooks push origin HEAD:main` so the checked-in
hook actually runs: `.git/ubs-chain-hooks` does not resolve in linked worktrees.
Never disable hooks. Retain logs and the subject commit, and check main CI.

The live-fleet baseline and broker-test teardown remain separate AK5788/AK5789
work. If either blocks AK5787 landing, report the blocker instead of bypassing it.
