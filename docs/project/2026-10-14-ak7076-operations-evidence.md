---
summary: "AK7076 operations: verified fail-closed lock repair; candidate qualification and coordinated owner handoff remain blocked."
read_when:
  - "Continuing AK7076 after PR237 candidate failures."
  - "Inspecting the bounded operations diff and its verification limits."
---

# AK7076 operations evidence — historical partial repair

**Continuation:** [candidate qualification and pre-tag coordinated handoff](2026-10-14-ak7076-candidate-qualification.md)
implements the later operator-selected repair. The bounds and unimplemented status
below describe only this earlier run, not the continuation's policy or result.

## Bounds and status

Execution was bounded to 25 minutes, no paid external jobs, and a $5 incremental
inference budget (billing is not observable/enforceable from these tools).
Only the named linked worktree and owned TMPDIR scratch were used for mutations.
No commits, pushes, GitHub effects, AK mutations, canonical installs/landing,
Pi reloads, or Ghostty actions were performed.

Worktree: `/home/tryinget/.local/state/pi-quests/tmp/ak7076-release.vfRh8l/worktree`.
Base: `043dc8797683be6cd52fd240092824ea71008c9b`.
Inspected release head: `168d2c95efcb00c960153b1071c232c2e3a5403b`.
**Status: partial infrastructure repair; candidate qualification NOT implemented.**

## Observed defect and implemented slice

The exact release-head orchestrator lock declares ASC `0.8.0` but resolves the
`0.7.0` npm tarball. Manifest/root-lock comparison alone admitted this identity.
The modified `authoredLockIssues()` rejects that exact fetched lock.

- `validate-package-installs.mjs` now checks npm tarball filename/version identity,
  including nested dependencies, aliases, scoped names, and prereleases.
- `sync-release-locks.mjs` evicts misleading artifact entries and their subtrees
  before invoking npm lock-only resolution. It never edits a URL or invents SRI.
- Missing/unpublished replacements, npm errors, or failed postchecks restore
  original lock bytes, including earlier package repairs in the same invocation.
- Each npm invocation has a 120-second timeout. No lifecycle scripts are enabled.

This is structural admission, **not registry availability, SRI authenticity,
provenance, or installed-code proof**. A coherent URL with incorrect SRI still
requires the existing registry/artifact checks. Production checks are unchanged.
A nested resolution that npm legitimately relocates is conservatively refused
when the original invalid key is not replaced; it needs inspection, not a waiver.

## Verification

Evidence logs are under `/home/tryinget/.local/state/pi-quests/tmp/`:

| Check | Observed result | Log |
| --- | --- | --- |
| Nine targeted test files on Node 22.23.3 | 91 passed, zero skipped/failed | `ak7076-operations-node22.log` |
| Authored lock admission at base worktree | 39 packages passed | terminal output |
| Exact fetched PR237 head admission | Rejected `0.8.0` / `0.7.0` URL mismatch | terminal output |
| Real npm 12 lock re-resolution in owned scratch | Replaced old ansi-regex URL/SRI with registry `6.1.0` metadata; no node_modules created | `ak7076-operations-real-npm-corrected.log` |
| `just loop-verify-fast` | Passed root smoke | `ak7076-operations-fast.log` |
| `just loop-impact-plan` | Wide scope: root scripts | terminal output |
| `just ci` | Toolchain/install admission passed; probe timed out after 180 seconds during ASC release pack; NOT a full pass | `ak7076-operations-ci.log` |

Targeted files: `sync-release-locks.test.mjs`, `package-install-health.test.mjs`,
`canonical-runtime-guards.test.mjs`, `release-artifact.test.mjs`,
`release-artifact-workflow.test.mjs`, `release-components.test.mjs`,
`release-npm-workflow.test.mjs`, `release-recovery-workflow.test.mjs`,
`release-evidence-workflow.test.mjs` (all under `scripts/`).

The first real-npm probe failed because its harness assumed npm view returned an
object rather than npm 12's singleton array. The corrected probe normalized that
shape and asserted URL/SRI presence before constructing its fixture. The initial
failure is retained in `ak7076-operations-real-npm.log`; it is not counted as proof.
The real-npm probe used ansi-regex, **not ASC 0.8.0**. Injected unit resolver results
are fixtures, not assertions that ASC 0.8.0 is published.

## Remaining concrete blockers

1. `release-artifact.mjs` discovers only authored `file:` runtime dependencies.
   ASC is intentionally registry-declared, so the existing closure fixture does
   not qualify same-head unpublished ASC for orchestrator.
2. Orchestrator `validate-asc-bridge-lifecycle.mjs` requires a satisfying published
   release and canonical registry URL/SRI, signatures, and SLSA metadata. It must
   continue rejecting unpublished ASC 0.8.0 as production registry evidence.
3. `governed-runtime-constants.ts` derives registry edges from the generated owner;
   `governed-runtime-peer-closure.ts` requires atomic manifest/root-lock/regular/
   hidden-lock agreement. `governed-runtime-graph.ts` resolves and checks one real
   physical owner for both ASC imports. A source-link binding cannot satisfy this
   contract and must not be relabeled as registry ownership.
4. `release-check.yml` installs and runs package release checks before authoritative
   artifact packing. Merely extending pack closure leaves the earlier install,
   lifecycle check, and governed canary failures unresolved.

The fail-closed stop condition is reached at the missing candidate owner proof:
this slice cannot make the unpublished candidate satisfy unchanged production
registry invariants. No assertion or workflow has been suppressed to make it pass.

## Proposed next slice — not executed or verified

Use a distinct, explicit candidate-artifact owner contract, not a permanent file
manifest dependency and not an environment flag that declares registry success.
Bind a dependency-first artifact closure to the exact candidate SHA; require source
name/version/range agreement, retained tarball SHA-256/SHA-512, and isolated real
installed content and execution seam. Keep candidate receipts separate from
registry provenance and publication-admissibility evidence. Connect that proof to
package installation, lifecycle qualification, and governed graph ownership before
routing candidate workflows to it. The production registry path remains mandatory
for publication; a candidate receipt must never authorize npm publication.

Falsifiers required before accepting that slice: wrong source SHA/version/range;
old 0.7 bytes relabeled 0.8; tampered tarball; wrong hidden-lock owner; source link
in place of a real installed artifact; duplicate physical ASC owner; missing/broken
execution export; candidate evidence passed as registry provenance; and published
bytes differing from the retained artifact. Positive closure fixtures alone are
not sufficient. Re-run full repo CI and qualification at the new exact release head.

## Historical proposed postpublication handoff (superseded; not executed)

This proposal is superseded by the continuation's **pre-tag** retained-byte owner
preparation. Do not follow it as authority to mutate frozen consumer tags.

After separately authorized ASC publication, prove the published version's bytes
match its retained artifact and inspect canonical URL/SRI, signatures, and SLSA
metadata. Then coordinate the consumer selector, regular lock entry/root selector,
and generated ASC owner from those proven bytes as one handoff. Install in isolated
scratch so its hidden lock and real installed owner agree, verify both ASC imports
and the execution seam, and run lifecycle plus governed canary checks. Retain and
check the exact final consumer tarball through publication; do not assume an earlier
candidate tarball remains identical after owner generation. Any difference requires
qualification of the final bytes. Canonical activation is a separate authorized
landing/install/reload operation. No release completion is asserted here.
