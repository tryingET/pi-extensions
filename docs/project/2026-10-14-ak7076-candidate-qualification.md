---
summary: "AK7076 retained candidate qualification and pre-tag ASC owner handoff: implementation, observed evidence, and remaining exact-head release checks."
read_when:
  - "Inspecting or continuing the AK7076 implementation."
  - "Preparing the combined release wave with an unpublished numerical ASC dependency."
---

# AK7076 — candidate artifacts and coordinated ASC owner handoff

Inspection follow-up and newer production evidence:
[three blocker repairs](2026-10-14-ak7076-review-blockers.md).

## Scope and status

Implementation is in the named worktree, based on `043dc8797683be6cd52fd240092824ea71008c9b`:
`/home/tryinget/.local/state/pi-quests/tmp/ak7076-release.vfRh8l/worktree`.
No repository commit/push, GitHub mutation, AK lifecycle write, ontology mutation,
canonical install/landing, Pi reload, or Ghostty action was performed. Existing
`ontology/dist/` changes were present at dispatch and are not this implementation.
The previous lock-identity repair is retained; its arbitrary npm timeout is removed.

This is an implemented qualification/handoff path, **not release completion or
publication authorization**. Final positive same-head candidate qualification,
remote checks, and production publication remain unverified: they require the
parent's separately authorized commit and release steps. The real scratch probe
correctly refused an uncommitted planned handoff instead of certifying its old SHA.

## Contracts and execution paths

1. `scripts/asc-candidate-artifact.mjs prepare-plan --artifact-dir <empty-owned-dir>`
   synchronizes the ASC source lock first, builds its actual tracked inputs in owned
   scratch, retains its exact tarball, and derives SHA-256 and SHA-512 SRI from bytes.
   It prepares the consumer's canonical **planned** URL/SRI and regular/root lock,
   generates the exact ASC owner, and builds/retains the consumer tarball with that
   owner **before tagging**. The plan binds both source-input sets and both exact
   artifact identities. Consumer lock/owner/plan changes roll back if that phase fails.
2. `release-please.yml` does this on the single combined release PR when ASC advances,
   then performs the existing strict root lock sync and commits the plan/owner/locks
   together. It retains the real prepared artifact closure. No split wave, bootstrap
   publish, local permanent ASC dependency, bundle revival, or post-tag edit is added.
3. `qualify-if-needed` queries the exact locked version. A published version uses
   unchanged production checks. Only a definite E404 can select the candidate path;
   indeterminate registry state fails. Candidate qualification rebuilds ASC once,
   requires equality with retained planned bytes, binds a receipt to full HEAD and
   immutable tracked ASC/consumer inputs, and checks the planned regular/root lock
   and exact generated owner. It installs the retained SRI through a fresh isolated
   numerical/canonical lock, checks hidden-lock ownership and every installed byte,
   rejects links/duplicate owners/broken exports, and executes the real installed
   dispatch/observation seam with a deterministic injected spawner (no Pi/LLM launch).
   Only successful proof sets `qualification: isolated_installed_execution` and
   exports `PI_ASC_CANDIDATE_RECEIPT`; pending receipts cannot be consumed as completed
   qualification and failed pending receipts are removed. The receipt explicitly
   denies registry provenance and publication authority.
4. CI, compatibility canary, release-check and release-evidence route candidate
   installs to this explicit proof, including the post-merge/prepublication interval
   when a committed plan is present but the exact ASC release is still absent. npm's content-addressed cache is populated from
   retained bytes, not fake registry responses. The authored ASC dependency stays
   numerical, and regular/hidden locks keep the canonical planned URL and real SRI.
   Candidate compatibility does not source-link ASC. Governed graph proof retains
   atomic lock and physical-owner checks but labels candidate ownership
   `candidate_artifact`, never `registry_external`.
5. `release-artifact.mjs` includes the numerical ASC candidate in the retained
   dependency closure and reuses its exact tarball for authored file edges too.
   Candidate ASC and consumer packing must match the pre-tag retained identities;
   isolated exact-artifact verification checks installed content and execution exports.
6. Publication does **not** qualify candidates or accept their receipts. It rejects
   candidate context, compares ASC and coordinated consumer tarballs with their
   retained pre-tag identities (including immediately before npm publish), and retains
   the existing production artifact/npm-state checks. Before consumer effects,
   `registry-handoff-check` requires the unchanged latest eligible release policy,
   canonical URL/SRI, signatures and SLSA metadata; downloads and hashes the published
   ASC bytes; requires retained equality only for the coordinated wave or exact
   planned consumer; then performs isolated registry installation, cryptographic
   `npm audit signatures`, complete installed-byte/physical-owner/both-import checks,
   regular/hidden-lock agreement and installed dispatch/observation execution. A later independent consumer release
   with an already-published ASC is not relabeled as this candidate wave. Current
   release tooling reads the explicitly selected frozen tag root; legacy tags keep
   their original mandatory production checks rather than requiring nonexistent new
   scripts. Adopted coordinated waves cannot omit the pre-tag plan.

The numerical candidate adapter is deliberately ASC-specific. ASC currently has no
runtime dependencies; if it acquires any, preparation refuses until the retained
numerical closure contract is extended. Existing authored file dependency closure
and normal production registry checks remain in place.

## Observed proof

Logs are under `/home/tryinget/.local/state/pi-quests/tmp/` unless stated otherwise.

| Check | Observed result | Log |
| --- | --- | --- |
| Final focused artifact/candidate/workflow tests, pinned Node 22.23.3 | 26 passed, zero skipped/failed | `ak7076-final-focused.log` |
| Final orchestrator TypeScript check | Passed | `ak7076-final-typecheck.log` |
| Final real coordinated artifact probe, pinned Node 22.23.3/npm 12.0.2 | Passed; expected final immutable-head refusal retained | `ak7076-coordinated-candidate-artifact-final.log` |
| Final `prepare-gate-builds.sh` + `just ci`, pinned Node 22.23.3/npm 12.0.2 | Exit 0; full package fan-out completed; ROCS explicitly excluded | `ak7076-full-repo-contract-v6.log` |

The real probe used fetched release head
`168d2c95efcb00c960153b1071c232c2e3a5403b`, not a claim that the new implementation
is already committed in that head. Two real source builds produced byte-identical
ASC `0.8.0` tarballs. Two pre-tag builds produced byte-identical orchestrator
`0.13.3` tarballs containing the generated ASC `0.8.0` owner. ASC's real retained
bytes were installed through a fresh offline canonical planned lock; regular and
hidden locks, physical content, exports and dispatch/observation behavior passed.
The subsequent full receipt check refused because the new plan/owner were not in
that immutable HEAD. No final candidate receipt survived that refusal.

Retained scratch evidence (not production evidence):
`/home/tryinget/.local/state/pi-quests/tmp/ak7076-release.vfRh8l/real-candidate-proof-final/`.

- ASC SHA-256: `c60ef70799c31edf0bcfe583b0476c6497fbe36f5655c86f1469e0445a9bdbd0`
- Prepared consumer SHA-256: `f84fe53f4bb51d2ca28c37148c9a905f52f10be629a5b94276b1b47f2128d2be`

These are the inspected head's real bytes, **not pins to reuse after source changes**.
The automated preparation must recompute them for the final release candidate.

Tests falsify wrong SHA/input/version/range, predecessor bytes relabeled as the new
version, tampered tarball/installed bytes, wrong hidden-lock owner, source links,
duplicate lock/physical owners, stale generated owner, broken execution exports,
pending evidence presented as completed qualification, candidate evidence used as
registry proof/publication authority, missing adopted pre-tag plans, and unequal ASC
or consumer publication bytes. The pure binding tests are fixtures, not substitute
proof of a final committed candidate. The actual tarball/cache/execution probe is
separately identified above.

Initial failed logs remain diagnostic evidence, not passes: the first real probe
hit a bounded stdout buffer while exporting Git (fixed by archive-to-file); the
initial full run lacked explicitly prepared build outputs; later iterations exposed
npm pack object/array assumptions and workflow/fixture wiring, which were repaired.
The first consumer preparation probe exposed a portable-README hook requiring Git
identity; the isolated consumer build now uses a local clone without committing.
No elapsed-time or inference-cost cutoff was used to stop healthy verification.

## Exact next legal release steps — parent/authorized release automation only

1. Inspect the source diff and exclude the dispatch-preexisting ontology projections
   from this implementation. Perform the parent's guarded source commit/push/landing
   only under its own authorization; this child has done none of them.
2. Regenerate/update the **single combined five-component Release Please candidate**:
   ASC `0.8.0`, helpers `0.12.0`, orchestrator `0.13.3`, registry `0.3.12`, clipper
   `0.2.1` (reconcile versions with the regenerated authoritative plan if changed).
   Let the pre-tag preparation retain bytes and commit the source lock, planned
   consumer lock, generated owner and candidate plan in that release PR.
3. Run all declared checks at the new exact release head, including positive receipt
   qualification, CI/governed canary, compatibility canary, release-check, immutable
   checks and visual release-evidence. Inspect retained same-head receipts/artifacts.
   These checks still do not authorize publication.
4. After the separately authorized combined PR approval/merge, allow the existing
   Release Please wave to create immutable tags and dispatch dependency-first
   publication. ASC publication must equal retained candidate bytes. Before consumer
   publication, prove the exact published ASC `0.8.0` bytes/signatures/SLSA and atomic
   installed owner. Consumer publication must equal its pre-tag retained bytes.
   **Never repair consumer metadata after its tag**, manually split the wave, or
   bootstrap a publish outside the combined wave.
5. Keep canonical activation and AK lifecycle/evidence actions separately authorized.

## Coverage limits

No remote workflow was executed or made green here; no publication, tagged artifact,
registry `0.8.0` availability/provenance, visual tape upload, or active Pi behavior is
claimed. The full local contract uses `PI_SKIP_ROCS=1` because ontology writes were
outside dispatch permission; optional real-Pi generation concurrency is not requested
(`PI_GENERATION_TEST_PI` unset). Production signature/provenance and final same-head
candidate checks remain mandatory in the authorized release sequence. The fixture
handoff code derives a new genuine qualification for a fixture's distinct commit
when running inside candidate context; that candidate-context branch still needs
execution at the parent's new committed release head, not a relabeled old receipt.
