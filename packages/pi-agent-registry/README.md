---
summary: "Overview and operator contract for pi-agent-registry manifest inspection, immutable fleet lint, and Phase-2 dispatch / Phase-3 visible admission contracts."
read_when:
  - "Starting work in this package workspace."
  - "Using agent_registry, pi-agent-registry-lint, dispatch_agent, standing_agent_spawn, or the agent manifest convention."
system4d:
  container: "Pi extension and CLI for standing-agent manifest/fleet observation and bounded dispatch/visible admission contracts."
  compass: "Make fleet contract drift visible and bind one provable read-only dispatch without owning lifecycle or transport machinery."
  engine: "Discover every candidate -> capture committed bytes -> lint deterministically -> authorize one exact task -> dispatch read-only through ASC."
  fog: "A green tool run can be mistaken for a healthy or authorized fleet, and one settled dispatch can be mistaken for general standing-agent enablement."
---

# pi-agent-registry

Standing-agent registry for Pi: reads `ai-society.agent/1` manifests for
inspection, emits a bounded, immutable-observation fleet lint report, and owns
the Fleet Phase-2 dispatch and Phase-3 visible admission contracts. It does not
own agent creation, lifecycle, role acceptance, or transport machinery. Phase-2
execution stays ASC-owned; Phase-3 Ghostty transport stays little-helpers-owned.

Status: **Fleet Phase 3 (AK 5133), locally implemented and live-dogfood verified**.
Phase-2 (AK 5132) read-only ASC dispatch is unchanged. Phase 3 adds one clean
visible standing-agent TUI admission for an exact claimed task, not lifecycle
authority. The real TUI driver → real child TUI proof and passing package/release
gates are recorded below. AK owns closeout. This is not a published-feature
claim; AK 5134 remains separate.

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
- `standing_agent_spawn` — Fleet Phase-3 exact-task clean visible admission
  through the little-helpers Ghostty transport; no automatic retry or AK
  evidence recording (see below).
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

## Phase-3 clean visible admission (AK 5133)

`standing_agent_spawn { agent, task, objective, parentPeerTarget, reportBack?, cwd? }`
composes one clean Pi TUI session in a Ghostty tab/window. `task` is an exact
positive AK task id; `objective` is nonblank, bounded to 32 KiB UTF-8, and
read-only — never an unbound standby brief. `reportBack` defaults to
`intercom` and requires an exact `session-<UUID>` controller target, not
`parent`/`active` aliases. `manual` and `none` may omit `parentPeerTarget`.
`cwd` defaults to the origin repository root and must remain within that
same Git repository.

Admission gates and composition:

1. Reject malformed requests, recursive standing-agent children, unavailable
   version-1 transport, unknown agents, mutation tools, and any manifest
   extensions. Declared tools must be a nonempty subset of `read,bash`;
   `intercom` is an explicit added communication instrument, recorded
   separately from declared tools.
2. Observe the origin Git repository and authorize `ak task show`: the exact
   task must be origin-repo-bound, claimed, and carry a live lease. This does
   not authenticate the caller as the AK claimant.
3. Require a clean agent repository and agreement between cached, freshly
   parsed, committed, and current manifest/persona inputs. Compose the persona
   plus advisory scope, selected skills, model, and manifest thinking request;
   recheck these inputs and origin/agent stability around transport admission.
4. Use `--offline --no-extensions --no-skills --no-prompt-templates`, then
   explicit `--extension` paths for approved locally installed
   `@tryinget/pi-peer-messaging` intercom and `@tryinget/pi-little-helpers`
   session-presence entrypoints, and explicit `--skill` selections. No ambient
   extension/skill discovery or controller conversation is inherited. Normal
   cwd-bound AGENTS context is retained; this is not an empty-policy session.
   `--offline` is a Pi startup flag, not network isolation: model/intercom
   communication still occurs. Installed Pi supplies builtin `zai` (including
   the dogfood model `zai/glm-5.3`); no ambient provider extension is needed.
   Unsupported provider/bootstrap shapes fail closed.
5. Persist an exclusive per-`(agent, task)` reservation before transport,
   then reread the exact task/lease and recheck inputs, bootstrap entry bytes,
   and origin/agent observations immediately before launch. Reservations are
   scoped to the resolved visible-receipts directory, not fleet-global.
6. Delegate to `@tryinget/pi-little-helpers/sidequest-launch` only when
   `STANDING_AGENT_TRANSPORT_VERSION === 1` and `launchPiQuestSession` exists.
   Registry owns composition/admission/receipts, not Ghostty or session machinery.
   Publish a write-once `pi-agent-registry.visible-launch-receipt/1` receipt
   (`0o400`, canonical self-digest, hard-link publication) after transport
   observation; post-launch drift remains indeterminate rather than clean proof.

**Never retry automatically**, including `confirmed_no_effects`, reservation
failure, cancellation, crash, receipt-publication failure, or indeterminate
transport. Existing, corrupt, or partial reservations block admission and are
never automatically released. Supervise the returned run id; any further
attempt requires explicit owner disposition. Phase-2's three-attempt policy
is not a Phase-3 retry policy.

For intercom mode, the child must send one correlated `PEER_ACK` before any
file/context work, stop visibly with `ACK_FAILED` if sending fails, and send
one correlated `PEER_FINAL` when the bounded objective ends, then stop.
Admission is **not** session-start, ACK, read-only lifetime, task consumption,
or completion proof. Receipt fields for startup/ACK/completion remain
`unproven` even when separate live evidence exists. The launcher writes no
AK evidence; the parent owns reality-test evidence and closeout.

Limits: `bash` and scope/read-only instructions are advisory, not a sandbox.
Launch-window Git observations exclude ignored files, .git internals, external
surfaces, and modify-and-restore intervals. Bootstrap hashes cover approved
package manifests and entry files only, not settings/auth/models or transitive
import integrity. Skill selection/materialization is not whole-runtime
immutability. Manifest thinking is the **request**, not a guarantee of the
runtime level: Pi clamps to model-supported levels; live `medium` requested
became `high` on `zai/glm-5.3`.

### Local evidence and release boundary (2026-09-07)

Real TUI driver → real child TUI proof, with immutable launch receipt,
independent runtime assertion output and bounded session observation:
[Phase-3 dogfood](docs/project/2026-09-07-fleet-phase3-dogfood.md).
AK evidence/task state remains authoritative.

- Run: `standingagent-mtqmbq5w-aeaf6023`; agent revision:
  `dc354723482f0470ad287d1de3e067a72cd99a85`.
- Receipt: `visible-agent-adoption-steward.20260907T022519Z.8fb48fd0.launch-receipt.json`;
  SHA-256: `6a37b218e3ea7dff14ec0a13e8230920585ddcbf83598d5d949d62828adffd15`.
- Child session: `01a079af-2ef4-762c-8bfc-228d0b411d4a`; observed PID
  `189076`, `terminalBound` on `/dev/pts/11`, Ghostty surface
  `0x516815b20d7e09a3`.
- Ghostty build: `origin-main492300cad`, actual version `1.3.2-main`;
  this does **not** prove a literal 1.4 release.
- Correlated ACK `cce92533-53a7-49d0-bc42-0b808408aafe` and FINAL
  `44cee2a7-9695-42f8-a76e-d4a08b000752` received; no duplicate protocol.
  Child inspected four files read-only; no file or AK writes observed.
- Registry check: **134/134**; little-helpers check: **430/430**; both full
  release checks pass, including installed-tarball smoke. The stale real-fleet
  baseline was explicitly refreshed after independent HEAD-only reproduction:
  engineering-core docs-only revision `51fc387` → `9225dd6`, unchanged profile
  bytes, fleet revisions, diagnostics and counts. Assertions were not weakened.
- The new standing-agent reality assertion passes. The broader all-controller
  observer check still detects an unrelated live process naming retired Ghostty
  `9d8fbd15`; this task did not restart other sessions to hide that drift.

The version-1 export exists in local little-helpers **0.9.0 source**, not a
proven published release. Its next release must ship `./sidequest-launch`
and the version marker before registry publication can claim Phase 3. A packed
registry resolving older npm helpers fails closed `visible_transport_unavailable`.
See [dependency posture](docs/engineering.local.md#package-local-deltas-on-the-pi-ts-lane).

## Environment

| Variable | Meaning |
| --- | --- |
| `PI_AGENT_REGISTRY_ROOTS` | colon-separated candidate repo patterns/roots |
| `PI_AGENT_REGISTRY_EC_PROFILES` | engineering-core `skills/profiles.json` |
| `PI_AGENT_REGISTRY_USER_SKILLS` | mutable user fallback for runtime extras; fleet lint does not call it immutable |
| `PI_AGENT_REGISTRY_DISPATCH_RECEIPTS_DIR` | explicit dispatch-receipts directory (default `<pi-agent-dir>/dispatch-receipts`) |
| `PI_AGENT_REGISTRY_VISIBLE_LAUNCH_RECEIPTS_DIR` | Phase-3 receipts and persistent pair reservations (default `<pi-agent-dir>/visible-launch-receipts`) |

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
request composition. Phase-3 coverage adds explicit bootstrap/argv composition,
exact-task rechecks, drift/cancellation gates, durable pair reservation,
transport capability gating, and immutable admission receipts.

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
