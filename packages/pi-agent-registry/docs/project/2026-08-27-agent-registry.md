---
summary: "Design record for pi-agent-registry runtime inspection, Fleet Phase-1 immutable lint, and the Phase-2 exact-task read-only dispatch contract."
read_when:
  - "Changing manifest loading, fleet discovery/lint, immutable observations, or dispatch posture."
  - "Onboarding to the standing-agent fleet contract implementation."
system4d:
  container: "Pi-side read-only registry and fleet observation package."
  compass: "Converge owner interfaces without absorbing lifecycle or execution authority."
  engine: "Capture committed bytes -> lint every candidate -> report stable diagnostics -> keep dispatch disabled."
  fog: "Mutable paths and a green process exit can be mistaken for immutable fleet health."
---

# pi-agent-registry — Phase-1 design record

The monorepo manifest convention is the consumer contract. L0
`tpl-agent-repo` owns birth/propagation shape, `softwareco-agents` owns
fleet/role/lifecycle conventions, engineering-core owns profile keys/members,
AK owns task/evidence/decision truth, and ASC owns any future execution.

This package owns two read-only Pi-side surfaces and one bounded execution
contract:

1. mutable manifest inspection for already loadable agents;
2. aggregate immutable-observation fleet lint;
3. the Fleet Phase-2 exact-task read-only dispatch contract (authorization,
   receipt, evidence) with all spawn/session/capacity machinery ASC-owned.

None of these surfaces grants standing-agent lifecycle authority.

## Architecture

```text
src/manifest.ts
  schema-1 runtime parser, additive role/creation_task, contained resources

src/registry-discovery.ts
  shared bounded one-repo-per-agent discovery; lint sees missing manifests

src/registry.ts
  mutable inspection index and resolution metadata; no execution

src/ec-profiles.ts
  versioned profile envelope + aliases + exact parsed raw SHA-256

src/fleet-git-snapshot.ts
  full commit/tree capture, committed blobs, worktree currentness, race fence

src/fleet-prompt-compiler.ts
  trusted byte-for-byte v2 compiler reconstruction; never executes repo code

src/fleet-lint-provenance.ts
  bounded ownership/Copier provenance and verifiable full source revisions

src/fleet-lint-skills.ts
  immutable profile-member and extra-skill capture diagnostics

src/fleet-lint-repository.ts
  per-agent manifest/profile/prompt/revision/lifecycle diagnostics

src/fleet-lint.ts + fleet-lint-types.ts
  aggregate collisions, bounds, stable ordering, report identity

scripts/fleet-lint.mjs
  shipped JSON CLI / npm bin with unhealthy vs infrastructure exit semantics

src/dispatch-contract.ts
  Phase-2 constants: phase, schemas, tool allowlist, provenance marker, bounds

src/dispatch-authorization.ts
  ak task-show read, exact-task claim/lease/repo authorization, evidence record

src/dispatch-receipt.ts
  write-once 0o400 receipts with canonical digests and tamper-evident re-read

src/agent-skill-resolver.ts
  registry-owned ExtraSkillProfileResolver for ASC's skill seam

src/dispatch-request.ts
  ASC child-request composition and runtime wiring (sessions/model via ASC)

src/dispatch.ts + src/sessions-dir.ts
  Phase-2 pipeline with fail-closed gates; sessions delegated to ASC
```

## Manifest compatibility

The ratified v2 template adds `role` and `creation_task` to
`ai-society.agent/1`. Runtime parsing accepts both but keeps them optional so
legacy adoption/backfill can remain owner-scoped. Fleet lint requires both and
emits stable errors when absent.

Unknown schema-1 additions at the top level and inside known objects are ignored
by runtime normalization and reported by lint. Known field values remain strict.
Unknown schema versions fail closed. Removing/renaming fields requires a future
schema and compatibility window.

`skills.profile: null`, empty `skills.extra`, and empty scope arrays from the
L0 template are valid. `tools: []` remains empty; Phase 1 does not fabricate a
`read` capability.

## Discovery and aggregate failure semantics

Mutable runtime discovery indexes only repos with valid root manifests and may
fail fast. Fleet lint first enumerates every immediate candidate repo from each
configured `agent-*` pattern, including missing manifests, then captures each
independently. It aggregates malformed manifests and exact collisions instead
of letting the first failure hide later repos.

Configured missing roots fail closed. Defaults skip absent forward-compatible
company/lane patterns. Physical duplicate roots and repository-count overflow
fail closed.
Candidate-resolution failures, bounded blob reads, and repository/profile
endpoint-finalization failures are projected as stable local/aggregate
diagnostics rather than rejecting an otherwise coherent report. Configuration
ambiguity and an invalid profile source remain infrastructure failures.

## Immutable observation

One report binds exact committed data where possible:

- full Git commit/tree for every included agent;
- committed manifest blob OID + SHA-256;
- engineering-core profile commit/blob/schema/SHA-256;
- trusted prompt compiler input/output SHA-256;
- template ownership and Copier answers digests;
- only a full template source commit that resolves exactly in a local
  `tpl-agent-repo` source containing the required template files;
- separate initial/final HEAD and porcelain-status hashes for observed endpoint
  drift;
- per-repo composite snapshot SHA-256;
- deterministic `stateSha256` plus complete-report `reportSha256`.

`stateSha256` excludes `observedAt`; `reportSha256` includes it. Physical paths
are projected logically/redacted and do not establish identity or freshness.
Native exception/command text is never serialized. Additive field names are
represented by SHA-256 rather than raw text; physical-path-shaped role values
are omitted with an error. This keeps machine reports, CLI JSON, and Pi lint
text/details independent of home/temp/repository paths.

Dirty worktrees remain observable but unhealthy because mutable runtime bytes
can differ from the committed snapshot. Different initial/final HEAD or status
invalidates the observation; an undetectable modify-and-restore interval is not
claimed absent. Missing, short, unverifiable, or author-only template revision
claims remain unbound. `verified_local_source` proves only a matching local Git
object and required source files, not template-owner authority or rendered
product currentness.

## Trusted prompt freshness

Fleet lint never runs `scripts/compile-system-prompt.py` or any repository
script. Registry-owned code reconstructs the ratified compiler contract from:

- exact raw committed `agent.json`;
- `docs/person/README.md`;
- `identity.md`;
- `reason.md`;
- `main_task.md`;
- `dream_goal.md`;
- `behavior_rules.md`.

It first requires the manifest's runtime `system_prompt_file` to be the canonical
compiled path, then compares expected bytes to that exact committed artifact.
Missing inputs/output, mismatch, or noncanonical runtime paths are errors. The
compiler uses code-point key order and Python universal-newline semantics;
numeric additive values degrade freshness to unproven until byte-equivalence is
implemented. The compiler contract is explicitly versioned in the report.
Runtime manifest/profile loading also hashes/decodes exact bytes with strict
UTF-8, rejects BOM-invalid JSON and recursively rejects unpaired surrogates.
Template ownership and Copier `_src_path` recognition use the ratified Python
owner's whitespace, line, cardinality, quoting, comment, and overlap semantics.

## Profile and skill references

Fleet lint requires `engineering-core.skill-profiles/1`. Runtime may retain a
legacy raw-map transition read, but a legacy source cannot produce healthy
fleet lint.

Canonical profile references are healthy. Runtime and L0 birth remain compatible
with `profile: null`, but the exact engineering-core fleet interface requires a
non-empty profile, so immutable fleet lint emits `profile.missing`. Deprecated
aliases warn with exact canonical target. Unknown profiles or committed profile
members fail. Extra
skills are immutable-bound only when committed in the agent or engineering-core
snapshot; a mutable user-skill fallback remains runtime-only and is an error in
immutable lint.

## Collisions and lifecycle

Name and role collision automation proves only exact normalized equality.
Semantic recurring-pain/differentiation review remains the owner creation gate.

The 90-day signal reads the latest committed diary/learning activity at the
captured agent commit. It emits `recent_activity`, `stale_candidate`, or
`unknown`, always with `authorityEffect=none`. It never declares current,
active, retired, authorized, or approved lifecycle state.

## Phase-2 exact-task read-only dispatch (AK 5132)

`dispatch_agent { agent, task, objective }` is no longer a static gate. It
executes the Fleet Phase-2 contract — at most one SETTLED read-only
standing-agent run per `(agent, exact AK task)` pair, with failed attempts
retained immutably and bounded to three — while every pre-authorization
failure still fails closed with `confirmed_no_effects`:

- **Exact-task authorization** reads `ak task show <id> -F json`; the task
  must be bound to the dispatch-origin repository, `claimed`, and carry a
  live lease. Readiness never becomes authorization.
- **Immutable revision** reuses the fleet git snapshot: the agent repo must be
  `clean_observed`; committed `agent.json` and prompt blobs are bound by OID
  and SHA-256; `finish()` must prove stability across the dispatch window.
- **Read-only posture** is three-layered: declared tools must be a non-empty
  subset of `[read, bash]`; the child task contract is `mutationPolicy=read_only`
  with explicit no-mutation constraints and stop conditions; and the parent
  observes dispatch-origin HEAD + porcelain digests across the window. Any
  drift fails `read_only_violation_observed` and voids AK evidence. The
  observation is bounded; modify-and-restore is not claimed absent.
- **ASC-owned execution**: `src/dispatch-request.ts` composes the child
  request and creates the runtime through ASC's exported
  `createAscExecutionRuntime` + `resolveSubagentSessionsDir` + model
  selection; the registry supplies only the `extraSkillProfileResolver` seam
  (`skillProfile = agent name`). No spawn/session/capacity code lives here.
  `src/sessions-dir.ts` now delegates to ASC instead of the Phase-0
  quarantine.
- **One level deep**: dispatched children carry
  `PI_PROVENANCE_STANDING_AGENT_DISPATCH` (an allowed request-env key) and the
  gate rejects recursive dispatch.
- **Immutable attempt receipts**: `src/dispatch-receipt.ts` publishes
  `pi-agent-registry.dispatch-receipt/1` write-once — private temp file,
  hard-link publication, `0o400`, verified re-read, canonical-JSON
  `receiptSha256` excluding the digest field. Attempt-indexed file names
  `ak-<task>.<agent>.<NN>.dispatch-receipt.json` keep failed attempts as
  immutable history while `readDispatchAttemptLedger` enforces one settled
  receipt per pair and the three-attempt bound.
- **AK evidence**: a settled, provably-read-only dispatch records exactly one
  `standing-agent-dispatch` evidence row binding receipt digest, ASC effect
  receipt correlation, and observation outcome. Failed dispatches keep the
  receipt as truth and leave AK recording to the parent task.
- **Effect truth is receipt-first**: terminal ASC `DispatchSubagentDetails`
  omit the declared `effectDisposition` field; the owner-issued
  `effectReceipt.disposition` is authoritative and the registry derives from it
  exactly as ASC's own observation projection does (proven live 2026-08-31:
  attempt 2 of the 5132 dogfood ran `done` with a settled effect receipt while
  naive details-field reading classified it indeterminate).
- **Attempt ledger integrity**: a receipt whose file name disagrees with its
  recorded `dispatch.attemptIndex` fails the ledger read closed, so renames
  cannot skew the settled-once or three-attempt bounds (hardening proposed by
  the dispatched child's own 5132 verification report and adopted).

Known Phase-2 limits (deliberate): the tool does not authenticate the caller
as the AK claimant (Fleet Phase 4 permit binding); dispatch is headless (no
Ghostty visibility — Fleet Phase 3); `bash` remains admitted as the fleet's
established read-only exploration instrument, bounded by the task contract and
window observation rather than a filesystem sandbox; and the child transport
carries the initial prompt as the child pi CLI's leading positional argument,
so dash-led prompts (persona front matter) require the registry's dispatch
header envelope — a pi/ASC transport hardening candidate for a later slice
(first observed live 2026-08-31 as child exit `Unknown option: ---`).

## Real fleet baseline

The real `~/ai-society/agents/agent-*` walk is revision-bound in
`tests/fixtures/real-fleet-lint-baseline.json`. The known unhealthy result is a
successful implementation proof:

- four canonical repositories observed;
- three missing manifests;
- adoption-steward missing role/creation task;
- stale compiled prompt under the trusted v2 compiler;
- mutable/unbound extra skill and missing template provenance;
- three owner-dispositioned stale-candidate signals.

Phase 1 does not mutate those external repos. When owner-authorized L2 backfill
changes exact revisions, the baseline must change under a reviewed registry
slice rather than silently turning green.

## Verification

- manifest tests: additive compatibility, role/task validation, null profile,
  empty least-privilege tools;
- synthetic Git fleet tests: healthy v2, malformed/missing aggregation,
  collisions, aliases, prompt drift, dirty state, extras, deterministic digest,
  repository bounds;
- real fleet test: exact commits, profile bytes, diagnostics, and report digest;
- extension test: `action=lint` returns observation-only unhealthy baseline;
- CLI test: JSON and exit taxonomy;
- packed smoke: shipped CLI/module/action plus Phase-0 dispatch gate;
- package check, fresh Pi dogfood, root loop gates, and independent review.
