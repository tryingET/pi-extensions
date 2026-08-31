---
summary: "Overview and operator contract for pi-agent-registry manifest inspection, immutable fleet lint, and the Phase-2 exact-task read-only dispatch contract."
read_when:
  - "Starting work in this package workspace."
  - "Using agent_registry, pi-agent-registry-lint, dispatch_agent, or the agent manifest convention."
system4d:
  container: "Pi extension and CLI for standing-agent manifest/fleet observation and the Phase-2 dispatch contract."
  compass: "Make fleet contract drift visible and bind one provable read-only dispatch without owning lifecycle or spawn machinery."
  engine: "Discover every candidate -> capture committed bytes -> lint deterministically -> authorize one exact task -> dispatch read-only through ASC."
  fog: "A green tool run can be mistaken for a healthy or authorized fleet, and one settled dispatch can be mistaken for general standing-agent enablement."
---

# pi-agent-registry

Standing-agent registry for Pi: reads `ai-society.agent/1` manifests for
inspection, emits a bounded, immutable-observation fleet lint report, and owns
the Fleet Phase-2 dispatch contract. It does not own agent creation,
lifecycle, role acceptance, or execution machinery — spawn/session/capacity
stay ASC-owned.

Status: **Fleet Phase 2 (AK 5132)**. Manifest/template/profile contracts and
fleet lint are converged (Phase 1), and `dispatch_agent` now executes exactly
one read-only standing-agent dispatch per `(agent, exact AK task)` pair with an
immutable receipt and one typed AK evidence row. Visible Ghostty standing
agents, lifecycle-v2 permit binding, and orchestrator fleet integration
remain later fleet phases.

## Operator surfaces

- `agent_registry`
  - `list` — already loadable manifests;
  - `show` — one agent's mutable worktree inspection metadata;
  - `validate` — compatibility resolution check for already loaded manifests;
  - `lint` — aggregate immutable fleet observation, including missing/malformed
    manifests, with no skill materialization or fleet-script execution;
  - `refresh` — rebuild the mutable inspection registry.
- `pi-agent-registry-lint` / `npm run fleet:lint` — JSON CLI for CI/operator
  use; exits `1` for a coherent unhealthy report and `2` for infrastructure or
  contract failure. `--allow-unhealthy` keeps known-debt dogfood exit-zero.
- `dispatch_agent` — the Fleet Phase-2 exact-task read-only contract (see
  below); fails closed with `confirmed_no_effects` before any ASC identity,
  capacity, session, or spawn effect exists.
- `/agents` — concise operator listing.

## Fleet layout

ONE STANDALONE REPO PER AGENT. The canonical fleet home is
`~/ai-society/agents/agent-*`; `softwareco-agents/docs/agent-registry.md` owns
lifecycle conventions. `PI_AGENT_REGISTRY_ROOTS` overrides the read roots with
colon-separated patterns or exact repo roots.

Runtime discovery reads only root manifests. Fleet lint enumerates every
immediate candidate repository first, so a missing manifest or one malformed
repo cannot disappear or hide the rest of the fleet.

## Manifest compatibility

Runtime schema-1 parsing accepts the ratified additive `role` and
`creation_task` fields while keeping them optional for legacy inspection.
Fleet lint requires them for v2 conformance:

- `role` — canonical role-card name; descriptive, not delegation;
- `creation_task` — syntactic `AK-<positive integer>` provenance; registry does
  not query or absorb AK authority.

Unknown schema-1 additions at the top level and inside known objects are ignored
by runtime normalization and reported by lint. Unknown schema versions still
fail closed. Empty `tools`
remains an empty least-privilege declaration; Phase 1 does not silently add
`read`.

## Mutable resolution contract

```text
registry.resolve(name) -> {
  name, role?, creation_task?,
  systemPrompt,
  tools, thinking, model, extensions,
  skillDirs, activities, advisory scope,
  cleanup()
}
```

This is worktree inspection metadata, not an immutable receipt or launch
contract. Temporary skill materialization is cleaned after inspection.

## Fleet lint contract

The report schema is `ai-society.agent-fleet-lint/1` with:

- `kind=immutable_observation`;
- `authorityEffect=none`;
- `policy.dispatchPosture=fleet_phase_0_disabled`;
- stable diagnostic codes/order;
- `stateSha256` for equal captured state/policy regardless of observation time;
- `reportSha256` over the complete report including `observedAt`;
- explicit healthy/unhealthy summary and bounded omission count.

Where provable, it binds full agent/profile Git revisions, committed blob OIDs,
SHA-256 content digests, prompt compiler inputs/output, template ownership, and
locally verified full template-source revisions whose required template files
exist. This proves only a local source object, not template owner authority or
rendered-product currentness. Worktree dirty state is a separate observation.
Paths, mtimes, semantic versions, short SHAs, and author assertions never
establish freshness. LLM-facing paths are logical/redacted.
Native Git/filesystem errors and configured physical paths are not serialized;
additive keys are digest-only and path-shaped roles are omitted with an error.
Repository-local capture/finalization failures remain visible without hiding
later candidates.

The trusted lint implementation reconstructs the ratified v2 system prompt in
registry code. It rejects numeric additive values whose Python byte rendering
cannot yet be proven, and normalizes Python-style universal newlines. It never
executes an agent repo's compiler, Git hook/fsmonitor, propagation, or validation
script; Git replacement refs and optional index locks are disabled. It never
materializes skills.
Runtime manifest/profile reads use strict UTF-8 exact bytes, reject BOM-invalid
JSON and unpaired surrogates, and hash the original profile bytes. Template
ownership and Copier source parsing are parity-tested against the ratified
Python owner, including Python whitespace and scalar cardinality.

Diagnostics include manifest/schema/name/role/creation task, canonical and
deprecated profiles, profile members/extras, exact role/name collisions,
compiled-prompt freshness, template provenance, Git currentness, and advisory
90-day diary/learning activity. Exact collision does not claim semantic role
overlap. Lifecycle signals never mark an agent active or retired.

The committed real-fleet baseline is intentionally unhealthy and
revision-bound. It records the known L2 backfill/provenance debt rather than
mutating external agent repos or claiming Phase-1 implementation made the
fleet green.

## Engineering-core profile interface

`skills/profiles.json` must use `engineering-core.skill-profiles/1`. Canonical
profile keys are stable API identifiers; direct deprecated aliases remain
valid for the transition window but emit migration diagnostics. Although the
L0 template and runtime parser permit `profile: null`, the published EC fleet
check requires one non-empty profile, so fleet lint reports `profile.missing`
as an error. Legacy raw maps remain runtime migration reads only and make fleet
lint unhealthy.

## Phase-2 dispatch contract

`dispatch_agent { agent, task, objective }` executes at most ONE SETTLED
read-only standing-agent run per `(agent, exact AK task)` pair; failed attempts
are retained as immutable receipts and bounded (max 3 per pair, then explicit
owner disposition). Gates, in fail-closed order:

1. request shape; recursion guard (`PI_PROVENANCE_STANDING_AGENT_DISPATCH`
   marks dispatched children; dispatch is exactly one level deep);
2. registered agent; no settled receipt for the pair; attempts not exhausted;
3. dispatch-origin Git repository captured (HEAD + porcelain digest);
4. AK authorization via `ak task show <id>`: the task must exist, be bound to
   the dispatch-origin repo, be `claimed`, and carry a live lease;
5. read-only tool gate: declared tools must be a non-empty subset of
   `[read, bash]` (`bash` admitted only as the fleet's established read-only
   exploration instrument); agent repo must be clean so committed `agent.json`
   and prompt blob digests bind an immutable revision;
6. execution through `createAscExecutionRuntime` with ASC-owned session-root
   and model resolution; the registry supplies only its skill-profile resolver
   seam (`skillProfile = <agent name>`); child task contract is
   `mutationPolicy=read_only` with explicit no-mutation constraints;
7. post-observation: agent-revision stability plus dispatch-origin HEAD and
   porcelain digests must be unchanged across the dispatch window;
8. one write-once receipt (`pi-agent-registry.dispatch-receipt/1`, canonical
   JSON, `0o400`, hard-link publication, self-digest `receiptSha256`) binding
   agent revision/manifest/prompt digests, task authorization facts, ASC
effect receipt, output digest, and the bounded observation; then one typed AK
   evidence row (`check-type standing-agent-dispatch`) only for a settled,
   provably-read-only dispatch.

Failure taxonomy is typed (`reason` codes) with explicit `effectDisposition`.
An attempt receipt, once published, can never be rewritten by the tool's write
path: only a settled receipt closes the pair (`dispatch_already_recorded`),
failed attempts cap at three (`dispatch_attempts_exhausted`), and tampering is
detected by digest verification (deletion by the receipts-dir owner remains
possible and unlogged; settled receipts carry the external AK evidence anchor).
Settlement additionally requires a complete ASC identity (dispatch/attempt/
session/file), a present owner-issued ASC effect receipt whose
`consumerCorrelationId` echoes the composed `effectCorrelationId`, and
receipt-first disposition `settled` — a bare details-field claim never
settles. Known bounds:
the attempt ledger is scoped to the resolved receipts directory (per
`PI_CODING_AGENT_DIR` unless `PI_AGENT_REGISTRY_DISPATCH_RECEIPTS_DIR` pins
one), and the ledger read is not locked against concurrent dispatches of the
same pair (concurrent writers still cannot publish two settled receipts; the
hard-link gate fails the second write). The dispatched child's composed
prompt is wrapped in a registry-authored dispatch header because the ASC child
transport forwards the initial prompt as the child pi CLI's leading positional
argument and a pi positional cannot begin with dash-led tokens (persona YAML
front matter would otherwise abort the child at argv parse). A dispatch whose window
observation detects any change fails `read_only_violation_observed` and never
records AK evidence; an undetectable modify-and-restore interval is not
claimed absent. The dispatch does not authenticate the calling session as the
AK claimant — lifecycle-v2 permit binding (Fleet Phase 4) tightens that.

## Environment

| Variable | Meaning |
| --- | --- |
| `PI_AGENT_REGISTRY_ROOTS` | colon-separated candidate repo patterns/roots |
| `PI_AGENT_REGISTRY_EC_PROFILES` | engineering-core `skills/profiles.json` |
| `PI_AGENT_REGISTRY_USER_SKILLS` | mutable user fallback for runtime extras; fleet lint does not call it immutable |
| `PI_AGENT_REGISTRY_DISPATCH_RECEIPTS_DIR` | explicit dispatch-receipts directory (default `<pi-agent-dir>/dispatch-receipts`) |

## Validation

```bash
npm run fleet:lint -- --allow-unhealthy
npm run check
npm run release:check
```

Tests include synthetic adversarial Git fleets, CLI exit semantics, deterministic
digests, aggregate malformed/missing handling, collisions, aliases, dirty
worktrees, prompt drift, a revision-bound real fleet walk, packed CLI/tool
smoke, and the Phase-2 dispatch contract: AK authorization matrix,
write-once/tamper-evident receipts, settled-pair re-dispatch rejection, the
three-attempt bound, ledger rename-integrity, read-only violation observation,
recursion guard, ASC effect-receipt-first disposition derivation, and ASC
request composition.

Live dogfood (2026-08-31, AK 5132): `agent-adoption-steward` dispatched for
task 5132 through a fresh one-shot Pi session. Attempt 1 failed closed at child
argv parse (`Unknown option: ---` persona front matter) and produced the
dash-safe prompt-envelope fix; attempt 2 completed the child but was recorded
not-settled because terminal ASC details omit the declared `effectDisposition`
field (only the ASC effect receipt carries disposition — the registry now
derives it receipt-first, mirroring ASC's own observation layer); attempt 3
settled: receipt `ak-5132.agent-adoption-steward.03.dispatch-receipt.json`
(sha256 `7eb7e467…f3e3`, 0o400), ASC effect receipt `settled` bound to
correlation `pi-agent-registry:ak-5132:agent-adoption-steward:3e185cc57699dcf0`,
`noMutationObserved=true` against the dispatch window, AK evidence
`#8091 standing-agent-dispatch`, and a live re-dispatch of the settled pair
rejected `dispatch_already_recorded` with `confirmed_no_effects`. The
dispatched child's own report's hardening suggestion (ledger
filename↔attempt-index consistency) is implemented and tested.
