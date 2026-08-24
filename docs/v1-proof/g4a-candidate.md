---
summary: "G4-A SoftwareCo participant candidate: G1 scan-adoption completeness is not proof of an active v1 resolution."
read_when:
  - "Reviewing the SoftwareCo v1 G4-A re-origination under the 2026-08-24 origination rule."
  - "Deciding whether a G1 prove_active_resolution journey may pass from scanner completeness alone."
type: "plan"
---

# G4-A candidate — scanner completeness is not an active v1 resolution

**Origin group:** softwareco.
**Origin repo:** `softwareco/owned/pi-extensions`.
**Origin task:** AK `#5020`, claimed by `softwareco-g4a-5020`.
**Pilot groups (opt-in only):** holdingco, teachingco.
**Expiry / review event:** 2026-09-30.
**Opt-in, bounded, cannot become default silently.**
**Non-qualifying predecessor:** `cycle-softwareco-package-scopes` (AK `#4954`) remains historical lockstep evidence and is not this cycle.

This record is a **participant proposal plus local disposition**. It does not contain, and must not be read as, an engineering-core content-owner decision. Shared catalog, lane, discipline, template, and harness bytes stay unchanged.

## Minimum decision record

- **problem:** Gate G1 asks a consumer to prove one *active* v1 resolution for a declared scope. In this repo's disposable-replica G1 run, that journey was scored `pass` because `scan-adoption --include-scope-root` returned `completeness: "complete"` with zero diagnostics. The same replica, in the same run, refused `init --apply` with a structured exit 2 (`applied: false`, `changed: true`) and reported doctor as a non-executing static diagnostic with `0 healthy/degraded` and `1 blocked/degraded`. Treating scanner completeness as the active-resolution proof therefore over-claims: a brownfield pin can look "complete" while owner apply is refused and doctor is blocked. Separately, the same run's `failure_boundaries` journey required both path-traversal and missing-directory init to fail closed with no plan JSON; traversal (`plan --repo ../../etc/passwd`) correctly exited 1 with empty stdout, but `init --repo /this/path/does/not/exist` exited 0 and emitted a create-plan JSON. Journey status and command polarity are currently allowed to diverge. The repeated risk is that G1 denominators become scanner snapshots instead of live owner-resolution proofs.

- **audience and scope:** Heterogeneous SoftwareCo monorepos that already carry a consumer `policy/engineering-lane.json` pin and a root-vs-package validation split (this repo: engineering-core commit `8f59f4178f0c40f73d64c417e7a591de42a0f0d2`, lane `pi-ts`). Applies to G1 journey scoring and any later shared rule about what counts as an "active resolution." Non-goals: rewriting this monorepo into many AK repos; promoting a G1 schema field from one owner; changing engineering-core `src/`; claiming G1 PASS; deciding shared content.

- **invariant or decision rule:** `scan-adoption` completeness is a diagnostic observation. It is not, by itself, proof that a scope has an active v1 resolution. A G1 `prove_active_resolution` journey may pass only when the owner-visible apply/resolution command for that same revision either (a) applies a declared resolution or (b) records a *lawful structured refusal* that the journey then scores as such — not as a silent pass. Missing-target and traversal inputs must fail closed with no plan JSON. A repo-level green check, a complete scanner report, or a doctor `exit 0` cannot stand in for that polarity.

- **load triggers:** A G1 or adoption scan of a brownfield consumer that already has `policy/engineering-lane.json`; any `prove_active_resolution` journey that would pass from `completeness: "complete"` alone; any `init --repo` / `plan --repo` call whose target is missing or contains `..`; review of a G1 run that mixes `pass` journeys with `g1_pass_claimed: false`.

- **evidence references:**
  - Direct observation, this repo, file `docs/v1-proof/g1-run.json` (content SHA-256 `0f06c6cf63276204dacdebdb7d02f338bb666ab4c4f8e592865421b1966e2b43`). Schema `engineering-core.v1.g1-run/1`. Subject replica `/home/tryinget/.local/state/pi-quests/tmp/g1-replicas-3257530/pos-4` at candidate commit `b313becf7f1bf5261843d7b29c939b0bc5072ef1`. `g1_pass_claimed` is `false`. Counts: `pass=6`, `fail=1`, `incomplete=3`.
  - Same artifact, journey `prove_active_resolution`: status `pass`; command `scan-adoption --scope <replica> --format json --include-scope-root` exit 0; stdout reports `baseline_supplied: false`, `completeness: "complete"`, `diagnostic_summary.counts` all zero, `diagnostics: []`, `failures: []`, generated at `2026-08-24T19:30:14.740201+00:00`. Note on the journey: "scan-adoption on the replica; not a mixed-runtime proof."
  - Same artifact, journey `apply_owner_plan`: status `incomplete`; `init --repo <replica> --apply --format json` exit 2; stdout `applied: false`, `changed: true`, action `update` against the existing consumer pin. Note: "init --apply in disposable replica only; exit 2 is structured refusal."
  - Same artifact, journey `plan_transition_mode`: status `pass` with the same exit-2 structured conflict treated as "still a plan."
  - Same artifact, journey `diagnose_v1_adoption`: status `pass`; `doctor --repo <replica>` exit 0; note "doctor is non-executing; 0 healthy/degraded, 1 blocked/degraded"; stdout authority string begins `static diagnostic only; no command execution or authority promotion`.
  - Same artifact, journey `failure_boundaries`: status `fail`; `plan --repo ../../etc/passwd` exit 1, 0 stdout bytes, stderr `plan rejected: repository path must not contain '..'`; `init --repo /this/path/does/not/exist --format json` exit 0, 4116 stdout bytes, `action: "create"` plan JSON.
  - Same artifact, journeys `rollback_recovery` and `removal_with_owner_edits`: both `incomplete` because the installed candidate shipped no public rollback or removal command. This is absence of a tool, not proof that rollback is unnecessary.
  - Repo-local consumer pin observed at execution of this re-origination: `policy/engineering-lane.json` `engineering_core.ref` = `8f59f4178f0c40f73d64c417e7a591de42a0f0d2`; `docs/engineering.local.md` states that consumer policy is local adoption truth and that the root is a monorepo control plane, not a full npm workspace.
  - Admission `docs/v1-proof/admission.md` (SHA-256 `81b83462c9d5e99ba417f4571b1a084e310730b2fe46ce85a340cd19e77fda56`): accepted role includes heterogeneous transition, federation, package boundaries, and hostile-history canary. Enrollment is administrative; proof independence is earned at execution.
  - Inference, not direct G1 proof: root `AGENTS.md` live-activation rule (install the local package path, `/reload`, then a real command/tool call) and `docs/project/product-posture.md` live-runtime guard both say install-only or scanner-only claims fail closed. Those docs corroborate the polarity split; they are not the G1 run.

- **strongest alternative:** Keep `prove_active_resolution` defined as "scanner completeness on the scope root." Rejected for this origin: this repo's own G1 packet shows a complete scanner report beside a refused apply and a blocked doctor, and the packet correctly refused to claim G1 PASS. The alternative would have let the scanner journey launder an incomplete owner resolution. A second alternative — treat every structured `init --apply` refusal as adoption failure — is also rejected: this brownfield pin is local adoption truth, and a lawful refusal is not the same as a missing resolution.

- **counterevidence and exceptions:** A greenfield repo with no `policy/engineering-lane.json` may legitimately receive an `init` create plan; that is not this consumer. A single-package repo without a root/package split may not exhibit the doctor-blocked / scanner-complete split. Doctor `exit 0` is not a health claim here — the payload says it is a static diagnostic. Live Pi extension install/reload proof is a *different* unit (this monorepo's operator contract) and must not be smuggled into a G1 scanner journey. One SoftwareCo monorepo is not two owner groups.

- **falsification conditions:** A second distinct positive owner group runs the same G1 journeys on an already-pinned consumer and observes `scan-adoption` completeness *and* an applied (not merely refused) owner resolution *and* a non-blocked doctor for that revision. Or: `init --repo <missing>` begins fail-closing with no plan JSON, and `prove_active_resolution` is rescored so a complete scanner report cannot pass while apply is refused. Or: owners start using this rule to hide a failing root check by calling every refusal "lawful."

- **adoption and compatibility:** Pilot only. No G1 manifest field, no harness edit, no catalog/lane/template change is requested from this participant record. If later promoted by the engineering-core content owner under a later exact task, the compatible change would be a scoring rule: bind `prove_active_resolution` to owner-apply polarity and keep `scan-adoption` as a diagnostic. Rollback: drop the scoring rule; existing consumer pins and this G1 JSON remain. No pre-v1 compatibility claim. Distribution and adoption stay `not_distributed` / `not_adopted`.

- **review trigger:** 2026-09-30, or the first G1 journey in another positive owner group that would pass `prove_active_resolution` from scanner completeness while `init --apply` is a structured refusal, or the first missing-target `init` that is still exit 0 with plan JSON.

- **retirement signal:** Engineering-core G1 journey definitions already separate scanner diagnostics from active-resolution polarity, missing-target init fail-closes, and this candidate is redundant.

- **semantic references:** none yet. "Active resolution," "scanner completeness," and "structured refusal" are used as local descriptive terms. They are not ontology IDs and must not be treated as ROCS-canonical.

## Pilot and participant disposition

Bounded local write-up of the polarity split observed in this repo's G1 disposable-replica run (`docs/v1-proof/g1-run.json`). No shared engineering-core content was mutated. No package source was changed for this cycle. The 4954 package-scope cycle is not reused.

**Participant disposition: supports, as a pilot only.** Do not add a G1 field, do not retune scanner semantics, and do not treat this as a content-owner revise/promote/reject. A later engineering-core task owns that decision.

## Explicit non-claims

- Not G1 PASS, G4 PASS, G4-B, tag, or `main` candidate update.
- Not a content-owner decision.
- Not a second owner group's evidence.
- Not a live Pi install/reload proof.
- Not a mutation of HoldingCo, TeachingCo, or engineering-core `src/`.
