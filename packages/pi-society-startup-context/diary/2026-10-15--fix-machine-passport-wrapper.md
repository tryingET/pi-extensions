---
summary: "AK7095: machine passport repair and historical verification; 2026-10-22 startup-only rollout authorization supersedes the original release-wave hold."
read_when:
  - "Investigating passport schema/type warnings or integrating the AK7095 candidate."
system4d:
  container: "Package-local repair diary."
  compass: "Match the read-only consumer to the owner-published machine contract."
  engine: "Reproduce -> correct wrapper -> verify candidate -> coordinate activation."
  fog: "Candidate checks do not establish canonical rollout or decision authorization."
---

# Machine passport wrapper repair — 2026-10-15

## Authority and cause

- task:7095 authorizes this package-scoped implementation. No AK decision-state repair, release publication, or unrelated Pi settings change is included.
- `ak machine schema decision-passport` explicitly locates the body at `payload.passport`; `-F json` is the separate flattened output mode.
- The Pi payload validator, requested-decision identity check, and summary read the flattened location instead. The shared test fixture repeated that wrong shape, hiding the consumer defect.
- Independent read-only owner inspection found no demonstrated divergence in AK's emitted machine contract.

## Changes

- Validate the nested passport's decision and required object collections.
- Compare the requested ID with `payload.passport.decision.id`, never a shadow outer decision.
- Report only `passport readable` after successful checks. Removed speculative `readiness.summary`, `next_step`, and `status` projection: readability is not legal readiness or authorization.
- Correct the shared fixture and negative collection cases. Add regression coverage for the real nested wire shape, legitimate nullable lifecycle fields, missing/malformed/flattened bodies, invalid identity fields, and outer shadow fields.
- Clarify the canonical [startup context contract](../docs/project/startup-context-contract.md).

## Historical verification observed — 2026-10-15

From the linked worktree, using the repository-selected Node 22.23.3 and npm 12.0.2:

- Untouched related collector suite: **4 passed**.
- Corrected fixture plus new regressions before implementation: **7 tests, 4 failed**, including the same degraded-versus-healthy mismatch and an incorrectly accepted shadow decision.
- Same focused suite after implementation: **7 passed**.
- `npm run check`: **58 tests across 17 files passed**, plus lint, typecheck, structure, host-pin/local-link checks, file budgets and packaging dry runs. The extracted tarball loaded/registered on an isolated production Pi host. No actual publication occurred.
- Independent package work-product inspection: no actionable findings; its focused test run passed. This is not exhaustive whole-monorepo qualification.
- The same live `ak decision passport <id> --machine` bytes for decisions 178, 177 and 183 were rejected by the unchanged canonical decoder and accepted by the candidate decoder.
- Candidate full collector against the workstation repo and installed AK: **healthy, zero warnings**, with readable passports 178/177. All owned reader cleanups settled.
- A fresh, isolated Pi process explicitly loaded the candidate and executed `/society-context refresh` against installed AK: **healthy, zero warnings**, with readable passports 178/177. This exercises the real command, not only the exported collector. No model generation or live decision mutation was requested.
- The first command-smoke assertion looked only at stdout and failed to find output; Pi routed the extension's console output to stderr. Captured logs already contained the healthy packet. A corrected harness checked both streams and passed on a fresh invocation.

Retained local evidence includes `$TMPDIR/ak7095-red.log`, `$TMPDIR/ak7095-package-check.log`, and the corrected command-smoke stdout/stderr under `$TMPDIR/ak7095-live-pi-ZIEbeT/`. AK records the canonical evidence bindings.

## Historical integration and rollout boundary — 2026-10-15

The following records the original hold, superseded by the bounded authorization below.

- Candidate worktree: `$TMPDIR/ak7095-passport.CsS09m/worktree`, branch `task/7095-passport-contract`, based on canonical `2792dc43292310acbed280fed4aaa11bdb361595`.
- Canonical checkout intentionally differs from delivered `origin/main` at `dc767184ab8e5188ed51d77b719d9533a45a6b53`. This package's source was identical across those two bases at inspection time.
- task:7076's controller confirmed the package scope is disjoint, but canonical activation of the release wave remains held. An old-base task landing would cause divergence; a descendant landing of the remote release base would also adopt unrelated held components.
- **Canonical landing and operator-session activation are held.** Do not pull/merge/reset canonical by hand, change Pi registration to an isolated worktree as a workaround, infer task:7076 release authority covers this rollout, or claim a fresh candidate command proves the operator's loaded generation changed.
- Preserve the tested candidate and prepare a separate isolated integration ref on current delivered main. Obtain an explicit owner-authorized activation decision before changing the canonical checkout or the live package registration. Once the release wave is ready, coordinate one descendant landing through `scripts/land-canonical.sh`.

## Superseding startup-only authorization — 2026-10-22

- The operator explicitly selected a startup-only rollout in an interactive authorization response, recorded as AK evidence **16670**. Deferral 701 was released; task 7095 was claimed for this work.
- Transplant the retained fix onto current canonical base `f854101b22e504401b6d2e18b271e168a796454e`, not onto the old integration branch or unrelated release refs. Current branch: `task/7095-startup-only-20261022`.
- Re-run current-candidate checks and isolated real Pi command verification. Historical results above do not establish qualification of this candidate.
- Only after successful verification and confirmation that the entire landing delta is package-scoped may this package be activated through `scripts/land-canonical.sh`. Stop if isolation cannot be established or unrelated installation repairs are required.
- Leave AK7076, npm publication, AK6392/6396, and the unrelated AK7404 deferral unchanged. Preserve other sessions' dirty files. This authorization does not grant broader release adoption or task lifecycle closeout.
- This entry records authorization and scope, **not completed activation**. Current execution evidence and any remaining limits belong in AK7095.
