---
summary: "AK-125 decision through AK-4820 immutable-generation implementation/dogfood, origin reconciliation, docs-list canonical sweep landing, and upstream #8215."
type: "session"
---

# 2026-08-16 — immutable generations, reconciliation, canonical sweep

## AK-125 decision → AK-4820 execution

- Investigated whether live Pi extensions can consume immutable dependency generations
  instead of a mutable checkout + node_modules tree. Audit of pi-coding-agent 0.84.x
  (package-manager, resource-loader, reload) plus isolated experiments produced RFC
  `docs/project/2026-08-16-immutable-pi-extension-generations-rfc.md`: bounded
  exact-path generation activation is feasible at one settings boundary today; first-class
  npm/git generations, leases, and transactional reload need upstream changes.
- AK decision 125 created, reviewed (independent review memo, two blocker rounds
  resolved), ADR accepted: `docs/adr/2026-08-16-immutable-pi-extension-generations.md`.
- AK task 4820 implemented the bounded first slice: `scripts/pi-extension-generations*`
  (exact-commit plan/materialize/verify, publish-last markers, crash-recoverable locks,
  journaled private-scope activation/rollback, exact-inventory fresh-process probe, real-Pi
  concurrency regression). Adversarial review cycles caught and fixed real defects:
  in-process-only crash tests, symlinked state-root pre-effect mutation, probe accepting
  partial inventory, tampered retained markers passing recovery, journal path traversal,
  crafted-plan bypass, and CI that needed ambient Pi. First slice denies all
  runtime/optional dependencies by default.
- Dogfood on the final implementation commit proved: G1 survives overlapping failed and
  successful G2 materialization with neighboring file: churn (explicit barriers, 16-record
  trace); fresh-process G1→G2→G1 exact provenance with compact/expand/fail-closed;
  observational reload; conditional CAS rollback; both generations retained read-only.
  Evidence: `docs/project/2026-08-16-immutable-pi-extension-generations-dogfood-evidence.md`,
  learning: `docs/learnings/2026-08-16-immutable-extension-generations.md`.
- Dedicated hosted lane `.github/workflows/immutable-extension-generations.yml` (pins Pi
  0.84.1) passed green on its first two real runs.

## Origin reconciliation without losing operator WIP

- Primary checkout was ahead 6 / behind 22 with 138 dirty operator paths. Reconciled via
  an isolated integration worktree: clean merge (the only two-sided files auto-resolved —
  identical npm-12 patch in ci.yml; mutation/materialization gates plus generation lanes
  in full.sh), full gate green in the worktree, push, then primary reconciled by
  update-ref + mixed reset + restoring the 24 pure-lag files selected by proof (bytes
  identical to their pre-merge blobs). Checksum snapshot proved all operator-dirty files
  byte-identical throughout.
- Root cause of the residual "4 files" friction: the operator's docs-list sweep had edited
  4 package.json files whose version lines the morning's releases also bumped — merging
  PRs upstream can never rewrite uncommitted local bytes. Fixed surgically by syncing the
  4 version lines into the operator edits (zero version hunks left tree-wide).

## Canonical docs-list sweep landed

- Operator sweep (28 package.json rewired to
  `node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs`, 29 wrapper deletions,
  52 validator updates, AGENTS/README notes, 3 diary captures) landed as `9e8ff1665`
  after the gate surfaced hidden formatting debt: the 112-char `docs:list:workspace`
  expectation literal in 24 validators, the ASC metadata validator variant, and the
  nested pi-interaction group child. All fixed with each package's own Biome writer;
  validators re-run green. Five hosted workflows green on the commit.

## Upstream + tracker

- Filed upstream `earendil-works/pi#8215` (package lifecycle atomicity + transactional
  reload), restyled to the Contribution template after reading their CONTRIBUTING gate;
  auto-closed NOT_PLANNED by new-contributor triage as expected, awaiting daily review.
  Recorded in `softwareco/infra/issue-tracker` (body draft + STATE entry + AK import,
  contract validation ok) and as decision-125 cross_repo_fanout + ADR addendum.
- Dead-code finding: `validate-structure.metadata.mjs` (362 lines) was invoked by nothing
  — deleted in `4cd166226` after proving only a diary note and a generated JSON
  referenced it, and files[]/wrapper expectations were unaffected.

## Residual / next session

- Watch #8215 for maintainer triage; offer the six-item implementation sketch and the
  concurrency/SIGKILL regression suite if they engage.
- ASC file-budget warnings (10 files, warn-only posture) are brownfield debt; a split
  would be a scoped ASC task. The auditor's "record an explicit exception" message
  describes a mechanism that does not exist yet (FILE_BUDGET_POLICY has no exceptions
  field) — either add it or reword the message.
- Published tarballs for the four released packages still predate the sweep; each
  package's next release will carry the canonical wiring.
