---
summary: "AK7076 independent inspection follow-up: TMPDIR prerequisite, production installed-artifact proof, and historical-plan scope repairs with real registry evidence."
read_when:
  - "Inspecting the fixes for dispatch-1792007316992."
  - "Continuing AK7076 after the production handoff inspection."
---

# AK7076 — three inspection blockers

Source changes remain only in the named worktree. No commit/push, GitHub effect,
canonical setting/install, Pi reload, Ghostty action, AK lifecycle write or ontology
mutation was performed. AK7083 settings, including multi-pass, were not touched.
Existing unrelated ontology projections remain outside this change.

## Repairs

1. Release Please's lock/owner preparation step now creates a unique owned directory
   under `RUNNER_TEMP` and exports `TMPDIR` before preparation. The workflow regression
   checks creation → export → `prepare-plan` ordering in that same shell step.
2. Production handoff retains the downloaded, registry-SRI-checked tarball. After
   isolated registry installation and `npm audit signatures`, it compares every
   installed package byte with that download, rejects links and duplicate physical
   owners, checks both public imports resolve to that physical owner, and requires
   the installation manifest plus regular/hidden locks to agree with the registry
   identity. Shared artifact/owner conformance functions accept no candidate authority;
   registry admission and signature/provenance checks remain mandatory. Installed
   execution is performed only after these checks.
3. Retained equality now applies to a coordinated ASC wave or the exact planned
   consumer name/version. A persistent old plan does not constrain a later independent
   consumer, but registry/physical/lock checks still run. Coordinated waves still
   require their pre-tag plan. Publication and registry handoff use the same scope
   predicate.

Changed implementation: `.github/workflows/release-please.yml`,
`scripts/asc-candidate-artifact.mjs`, new `scripts/asc-registry-handoff.mjs`.
Regression wiring: `scripts/asc-candidate-workflow.test.mjs`,
`scripts/asc-registry-handoff.test.mjs`, `scripts/ci/full.sh`.

## Observed evidence

Logs below reside in `/home/tryinget/.local/state/pi-quests/tmp/`.

| Check | Observed result | Log |
| --- | --- | --- |
| Seven focused test files, Node 22.23.3/npm 12.0.2 | 42 passed, zero skipped/failed | `ak7076-review-blockers-regressions.log` |
| Real production-boundary probe, Node 22.23.3/npm 12.0.2 | Passed; real CLI also executed | `ak7076-review-blockers-production-pinned.log` |
| `prepare-gate-builds.sh` + `just ci` | Exit 0, full package fan-out; ROCS explicitly excluded | `ak7076-review-blockers-full-contract.log` |

The real probe queried npm and downloaded **published ASC 0.7.0** from its canonical
URL. npm verified one registry signature and one attestation. The installed bytes,
both imports, unique physical owner, regular/hidden lock agreement and actual
installed dispatch/observation execution passed. Deliberate installed-content,
regular-lock, hidden-lock, duplicate-owner and source-link mutations were rejected;
restoring the installation restored a passing check. Execution used an injected
spawner, not a Pi/LLM launch.

The real CLI then checked a source fixture for independent consumer `0.13.4`, using
that genuinely published ASC `0.7.0`, despite a persistent historical ASC `0.8.0` /
consumer `0.13.3` plan. It still performed registry admission, signature/attestation
audit, physical content/lock checks and installed execution. No publication occurred.

Retained real evidence:
`/home/tryinget/.local/state/pi-quests/tmp/ak7076-release.vfRh8l/review-blockers-production-proof/`
(download, registry metadata, regular and hidden locks).

The requested `0.13.4` / latest eligible `0.8.1` scenario is separately covered by
an explicit **fixture** regression with canonical URL/SRI and metadata-shaped
signature/SLSA fields. It is not evidence that `0.8.1` is published or cryptographically
verified. Actual observed registry versions ended at `0.7.0`. The first real probe
used npm 10.9.9; it remains in `ak7076-review-blockers-production.log`, and the separate
pinned rerun above supplies npm 12.0.2 evidence.

## Limits and next steps

The workflow prerequisite has source/ordering proof, not an executed GitHub job.
No positive receipt at the final committed release head, remote check result,
publication, or live activation is claimed. ROCS remains excluded by the dispatch's
ontology-write boundary; optional real-Pi generation concurrency remains unset.

Parent: independently inspect these narrow fixes, then perform only its separately
authorized guarded source commit/push. Refresh the single combined Release Please
candidate and run all required checks at its new exact head, including the actual
preparation job, candidate qualification and production predecessor checks after
ASC publication. Do not mutate consumer tags or split/bootstrap the wave. Canonical
settings and activation remain separate owner actions.
