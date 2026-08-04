---
summary: "Overview and quickstart for monorepo package @tryinget/pi-little-helpers."
read_when:
  - "Starting work in this package workspace."
system4d:
  container: "Monorepo package for small Pi helper workflows."
  compass: "Keep package behavior useful for daily operator work while aligning to monorepo contracts."
  engine: "Implement focused package changes -> validate package -> validate monorepo root when needed."
  fog: "Main risk is drifting from the legacy package behavior during migration into the monorepo."
---

# @tryinget/pi-little-helpers

Canonical monorepo home for the former standalone `pi-little-helpers` extension package.

- Workspace path: `packages/pi-little-helpers`
- Release component key: `pi-little-helpers`
- Legacy standalone source: `~/programming/pi-extensions/pi-little-helpers`

## Extensions

| Extension | Description |
|---|---|
| `code-block-picker` | Pick a code block from the conversation and copy it safely to the clipboard |
| `codex-reset` | Inspect banked OpenAI Codex rate-limit resets and spend one through an explicit, idempotent confirmation flow |
| `html-output-browser` | Auto-open written/edited HTML files in the browser, append clickable `file://` links to tool output, and expose `/artifacts` / `/show-artifacts` plus `Ctrl+Shift+S` to pick an openable artifact from the workspace or recently written outside it |
| `package-update-notify` | Check for updates to pinned npm/git packages in Pi settings |
| `session-presence` | Publish exact Pi session identity for Steve's Ghostty/Niri hourly observation and hot restore flow |
| `sidequest` | Human slash command to fork the current Pi session into the current Ghostty window as a new tab when supported; also owns automatic read-only Ghostty observers for ASC dispatch/loop progress |
| `handoff-tab` | Generate a self-contained handoff from the current conversation and auto-submit it as the sole initial user message in a clean Pi session, preferring a same-window Ghostty tab with an honest new-window fallback |
| `scoutpeer` | Launch a clean visible read-only scout/review peer in the current workspace |
| `parallelquest` | Human slash command to launch a clean visible candidate peer in an isolated git worktree |
| `visible-loop` | Launch a clean visible Ghostty Pi tab for each iteration and submit a six-step real-prompt plan one frontier at a time: bound design/implementation, completion audit, governed deep review, consolidated Nexus fixup, posture refresh, and commit; `--delegate-commit` resolves `/commit` and delegates it to `dispatch_subagent` instead of running commit inline |
| `nexus-loop` | Launch the same machinery with four real prompts: governed `deep-review` through `vault_execute_template`, one consolidated Nexus fixup that may use at most one non-Prompt-Vault read-only reviewer when available and useful before atomic completion, posture refresh, and a resolved `/commit` prompt delegated to `dispatch_subagent` |
| `stash` | Persist and restore stashed editor content across sessions |

## Automatic ASC execution observer

When Pi runs in TUI mode inside Ghostty, the `sidequest` extension listens for bounded `asc.execution_observation.v1` events and automatically opens a read-only progress tab only when it can target the controller Ghostty process and surface exactly. Direct `dispatch_subagent` calls get one tab per dispatch; all `loop_execute` phases share one tab per logical loop run. The renderer shows status, phase, latest tool, usage, a renewable telemetry-liveness lease, semantic-activity age, and quiet/suspected-stall cues without receiving prompts, objectives, assistant output, stderr, session paths, or receipt paths.

The executing helper remains headless and ASC-owned. Closing the observer does not cancel work, Ghostty launch is not execution proof, and observer failure falls back to normal headless execution. Automatic observers never use an untargeted wrapper tab or a new-window fallback: when exact same-controller placement cannot be proven, the current Pi session receives one warning and execution continues without an external observer. RPC/JSON/print/CI/non-TUI sessions never auto-launch even when they inherit Ghostty environment variables. Set `PI_ASC_OBSERVER=off` to disable or `PI_ASC_OBSERVER=ghostty` to request observation-policy evaluation for a TUI session; the override does not waive exact controller-tab targeting. Full contract: [ASC execution observer contract](docs/project/2026-08-04-asc-execution-observer-contract.md).

## Visible peer tools

The `sidequest` extension owns the visible peer and loop helper capability. Slash commands and model-callable peer tools are registered by the extension as standard tooling during Pi startup; `/handoff-tab`, `/visible-loop`, and `/nexus-loop` are command-only surfaces, not model-callable peer-spawn tools. They also have a narrow pi-little-helpers-owned `pi.sendUserMessage` bridge for extension-originated whole-message `/visible-loop ...` and `/nexus-loop ...` inputs; this does not bridge arbitrary slash commands. The toolbox bundle exposes the same manifest for catalog/test alignment. Both projections are governed by one capability manifest in [`src/capabilityManifest.ts`](src/capabilityManifest.ts), including the machine-readable `LITTLE_HELPERS_TOOL_COMMAND_PROJECTIONS` map for tool-to-slash equivalents; see [Visible peer and loop capability contract](docs/project/2026-05-05-visible-peer-capability-contract.md) when debugging registration, package-export drift, or visible-loop prompt expansion.

Visible-loop first renders a persistent operator widget for the complete iteration plan. Plan visibility is not queue authority: only the exact frontier step is submitted, and the next step is submitted with Pi-native `deliverAs: "followUp"` only after the frontier's exact user text is observed at `message_start` and that run reaches `agent_settled`. This remains correct under Pi `followUpMode=all` because multiple runnable prompts are never placed in the native queue. Since `sendUserMessage` has no delivery acknowledgement, the widget distinguishes submitted/pending from observed/running and never converts submission into a positive `hostQueuedCount` claim. The schema-5 per-session active snapshot binds a plan id to its exact iteration, lifecycle, single frontier, settled cursor, and governed call/receipt for recovery only. Cross-session exclusion comes from a separate run-global iteration lease under an exclusive run lock: it binds ACTIVE ownership to the exact session/process incarnation, token-gates LAUNCHING handoff, permits one FAILED recovery, and retains a COMPLETED tombstone. Same-process extension reload renders and resumes without duplicate submission; fresh-process restart, corrupt state, token replay, or an indeterminate `submitting` effect fails closed explicitly rather than replaying or stalling.

The deep-review step is not a slash-template expansion: exactly one governed call may satisfy the barrier. It correlates one `tool_execution_start`/`tool_execution_end` pair by tool-call id, rejects a second matching call instead of overwriting correlation, requires the exact governed template name and objective, rejects top-level tool errors, and accepts only `details.ok=true`, `executionSurface=workflow_execute`, a non-empty Vault `handoffId`, and `status=done`; missing or failed receipts release nothing downstream and stop the loop before Nexus, posture refresh, commit, or completion. Raw `deep-review.md` files are neither required nor accepted as execution. The default visible loop replaces three context-free continuation turns with one design-membrane completion audit, then uses one consolidated Nexus fixup for the review findings, at most one optional non-Prompt-Vault read-only review when reviewer tooling is available and a separate review would materially reduce risk, focused revalidation, and atomic completion. That fixup explicitly forbids a second `deep-review` or `vault_execute_template` call in the same iteration. Prompt Vault use in that fixup is limited to optional non-review `text_ok` grounding; gated workflows are skipped. Ordinary slash prompts such as `/commit` still resolve from `<cwd>/.pi/prompts` before `~/.pi/agent/prompts`, with repo-local templates overriding global templates and unresolved templates failing closed. `/nexus-loop` wraps the resolved `/commit` content in a bounded `dispatch_subagent` objective; `/visible-loop --delegate-commit` opts into the same delegation while ordinary `/visible-loop` keeps inline `/commit` plus the normal completion checkpoint. The ordinary completion checkpoint is not sent for delegated commit steps; after the delegated worker succeeds, the child calls `visible_loop_child_complete`. Completion cannot be recreated from config alone: it requires the persisted terminal plan step to be running with every preceding step settled. Pi package/settings/CLI prompt-template bodies remain unavailable to this extension through the public API.

| Tool | Purpose | Mutation boundary |
|---|---|---|
| `fork_peer_spawn` | Canonical tool for launching a visible peer that inherits the current Pi conversation/context. Supports explicit intercom report-back with `reportBack: "intercom"` and exact `parentPeerTarget`; otherwise remains manual-visible by default. | Same forked-context family as `/sidequest`; use only when inherited context is intended. |
| `scout_peer_spawn` | Launch a clean visible scout/review peer in the controller's current/requested workspace. Defaults to intercom report-back and requires an exact `parentPeerTarget` unless `reportBack` is explicitly `manual` or `none`. | Read-only by prompt contract only; editable shared-cwd work remains manual `/sidequest`. |
| `candidate_peer_spawn` | Create an isolated git worktree and launch a clean visible candidate peer for bounded mutation. Defaults to intercom report-back and requires an exact `parentPeerTarget` unless `reportBack` is explicitly `manual` or `none`. | Before Git mutation it consumes exactly one owner-authorized lifecycle-v2 admission permit bound to repository, objective, task, actor, inventory digest, capacity reservation, configuration, and expiry. |
| `candidate_peer_cleanup` | Read-only dry-run projection of historical registry-v1 cleanup packets. | Execution is permanently quarantined by Decision 59. Exact cleanup must use lifecycle-v2 review, disposition, proof, restoration archive, authorization, and terminal receipts. |
| `candidate_peer_closeout` | Resolve exact peer-run aliases to lifecycle-v2 resource generations, project the next closeout step, execute already-authorized cleanup, or run a repository-bounded janitor. | `status` and `plan` are read-only. Execution delegates to lifecycle-v2 locks, archive verification, expiring authorization, drift checks, and effect receipts; peer reports, integration status, and age are never authority. |

Clean peer surfaces (`scout_peer_spawn`, `candidate_peer_spawn`, `/scoutpeer`, and `/parallelquest`) launch a clean Pi session rather than forking the controller conversation; this keeps the boot ACK prompt as the first user turn and avoids inherited controller/tool-result context overriding peer identity. `/handoff-tab [optional goal]` is a clean continuation rather than a peer: little-helpers first captures bounded read-only Git HEAD/status and AK claimed/ready-task readbacks, then `pi-session-compaction` reduces the current branch and uses the active host model registry to generate one self-contained prompt; little-helpers then launches clean Pi without `--fork`, preserves the selected model and thinking level, and passes that prompt once as the automatically submitted initial user message. With no goal argument, it asks the fresh session to continue the current unfinished operator-directed work from the verified next legal step. Unavailable Git/AK readbacks are labeled rather than invented, and the generated handoff requires fresh owner-surface verification before mutation. Generation or launch failures fail closed; Ghostty success proves transport, not task completion.

Fork peer surfaces (`fork_peer_spawn` and `/sidequest`) intentionally inherit the current Pi context. `fork_peer_spawn` preserves manual-visible default behavior, but can inject the same bounded `PEER_ACK` / `PEER_FINAL` intercom instructions when called with `reportBack: "intercom"` and an exact `parentPeerTarget`; `/sidequest` remains a manual operator command without automatic report-back. Peer launches are staggered by about one second by default so concurrent candidate/scout/fork starts do not race Ghostty/Pi tab activation and leave later tabs inert; set `PI_SIDEQUEST_LAUNCH_STAGGER_MS=0` to disable or another millisecond value to tune. Controller-spawned intercom report-back must include the exact controller session id, usually from `intercom({ action: "status" })`, so spawned peers do not guess among many same-cwd sessions; `/scoutpeer` uses the current session id for intercom report-back when Pi exposes it, otherwise it falls back to manual visible reporting. `/scoutpeer` launch notifications include the exact `intercom({ action: "peer_watch", peerRunId: "...", waitFor: "final" })` bridge when intercom report-back is active. Intercom prompts prefer the bounded canonical two-message protocol: one `PEER_ACK peer_run_id=...` and one `PEER_FINAL peer_run_id=...`; after `PEER_FINAL`, the peer should stop unless the controller explicitly asks a clarifying question or assigns new work. Legacy `QUEST_ACK quest_id=...` / `QUEST_FINAL quest_id=...` remains a peer-messaging compatibility path, not the preferred beta vocabulary. The tools return launch/worktree facts only; visible peers are parallel cognition, not parallel authority. Intercom report-back is communication, not durable evidence or promotion authority.

Candidate admission is governed by `scripts/candidate-admission-v2.mjs`. Owner-authored configuration defines global and exact-repository limits for unresolved count, measured bytes, age, and active admissions. Authorization binds a fresh inventory and active-reservation digest; any drift before spawn fails closed. The owner-only `expire --input PATH` transition records `status: "expired"` and `expiredAt` for an unreserved authorized permit at or after its canonical `expiresAt`; it rejects unexpired, reserved or bound, released, and already-expired permits. Canary mode admits exactly one owner-authorized candidate while the historical hold remains active. After a successful terminal canary and a separate accepted owner decision, activation preserves the hold artifact as `superseded_by_admission_v2`; it does not delete history or re-enable v1 cleanup. Configuration/hold activation is preflighted and recovery-journaled so partial publication rolls back or completes idempotently on retry.

One historical July 13 cleanup shape predates hardened effect observations. It remains invalid for ordinary `release`; `verifyCleanedCandidateTerminalRecord` is unchanged. The anomaly-only owner flow is `prepare-reconcile-release --request ABSOLUTE_PATH --output ABSOLUTE_PATH`, `verify-reconcile-input --input ABSOLUTE_PATH`, then `reconcile-release --input ABSOLUTE_PATH`. Preparation creates a new canonical owner-only 0600 packet from the small owner request; semantic preflight performs two stable, non-mutating reads of current permit, lifecycle, archive, and Git facts; execution consumes the same unchanged packet. The exact verifier binds both rejected review cycles, the raw ten-entry JSONL SHA-256, archive member bytes, authorization, receipt, and deletion postconditions, and records `hardenedV2Verified: false`. Resource and admission locks make the one permit rewrite atomic and idempotent. This releases admission pressure only; it does not execute cleanup, authorize another candidate, certify lifecycle-v2 hardening, alter the historical hold, or reconcile live state automatically. See [Legacy terminal anomaly reconciliation](docs/project/2026-07-31-candidate-admission-legacy-terminal-reconciliation.md).

Candidate peer worktrees are intentionally left for controller/operator review. Each `candidate_peer_spawn` result includes a persisted registry sidecar under `$XDG_STATE_HOME/pi-quests/peer-registry/<peerRunId>.json` (fallback `~/.local/state/...`) with the exact admission binding plus historical registry-v1 cleanup projection. `candidate_peer_cleanup` may display that projection but refuses `execute=true` regardless of closeout claims. Lifecycle-v2 is the only executable archive and cleanup path.

Use `candidate_peer_closeout` with one of five explicit actions:

- `status` and `plan` require exact `peerRunIds`, resolve each registry alias to one inventory resource and generation, and never mutate lifecycle state. Controller `taskId`, integration-closeout evidence, and cleanup-trigger fields are echoed as non-authorizing planning context only.
- `execute_authorized` requires the supplied peer aliases to resolve to exactly one lifecycle resource. Before delegation, the lifecycle aliases, repository roots, and branches must exactly equal current registry inventory, and state plus unexpired authorization lineage must match. Admission bind (which precedes visible launch), registry publication, and destructive cleanup share a global mutation lock. Inside that membrane the executor re-reads current inventory and rejects any bound, unpublished same-worktree entrant before performing the full archive, Git, process-lease, and drift checks under the exact resource lock.
- `janitor_status` requires an absolute normalized `repoRoot`, reports overdue nonterminal resources, and performs no effects.
- `janitor_execute_authorized` uses the same repository and current-inventory boundary, blocks before effects if any authorization is stale or invalid, and attempts at most one current `cleanup_authorized` resource per invocation. It reports remaining eligible resources for later cycles and never selects work from age, `PEER_FINAL`, registry-v1 packets, or inferred candidate quality.

The janitor does not decide disposition, acceptance, integration, or cleanup authorization. Partial cleanup remains an explicit per-resource owner/controller action rather than an automatic janitor retry.

Do not manually remove candidate worktrees or branches. Use `scripts/candidate-lifecycle-v2.mjs` so exact resource identity, drift checks, restoration-grade archives, authorization expiry, effect receipts, and terminal state remain bound.

Terminal lifecycle storage has a separate, explicit retention path; it is never part of cleanup or age-based janitor execution. `terminal-retention-prepare` accepts one already-terminal resource, re-verifies its exact terminal receipt, and creates an owner-only compressed capsule containing the lifecycle record, full append-only events, exact registry-v1 sidecars, and every restoration-archive byte. Preparation is non-destructive and restoration-tests every capsule member. `terminal-retention-authorize` requires a separate owner actor and canonical expiry no more than 30 minutes away. `terminal-retention-compact` revalidates terminal state, current registry plus bound admissions, capsule, and all source hashes under the registry/resource locks; checks authorization again immediately before durable marker publication; retains registry sidecars for compatibility; and removes only redundant event/archive copies. Ordinary terminal verification switches to capsule evidence only after an exact durable GC receipt. Catchable failures release locks; after a hard process crash, `terminal-retention-recover-locks` requires an owner actor and removes only exact compaction leases whose recorded process is provably absent before retry. Marker-first retries may finish exact remaining removals after authorization expiry, but late aliases, events, archives, or a reappeared worktree block before further GC. `closed_with_retained_effects` remains fail-closed until its own terminal verifier exists. See [Terminal candidate retention compaction](docs/project/2026-08-03-terminal-candidate-retention-compaction.md).

```bash
node scripts/candidate-lifecycle-v2.mjs terminal-retention-prepare --resource cpr-...
node scripts/candidate-lifecycle-v2.mjs terminal-retention-authorize --resource cpr-... --input /absolute/owner-authorization.json
node scripts/candidate-lifecycle-v2.mjs terminal-retention-compact --resource cpr-...
# Hard-crash recovery only; input JSON is {"actor":"owner:identity"}:
node scripts/candidate-lifecycle-v2.mjs terminal-retention-recover-locks --resource cpr-... --input /absolute/owner-lock-recovery.json
node scripts/candidate-lifecycle-v2.mjs terminal-retention-verify --resource cpr-...
```

The authorization JSON contains only `actor` and `expiresAt`. These commands do not infer terminality from age, peer reports, registry packets, or missing processes; they do not merge, push, publish, prune Git objects, or delete registry lineage. No production terminal resource is compacted merely because this code is installed or reloaded.

### Adopt one existing unregistered worktree

An owner may bring one clean, linked, unregistered Git worktree under lifecycle-v2 control with an expiry-bound JSON authorization:

```json
{
  "schemaVersion": 2,
  "action": "adopt_existing_worktree",
  "worktreePath": "/absolute/canonical/path/to/candidate",
  "repoRoot": "/absolute/canonical/path/to/durable-owner-worktree",
  "gitCommonDir": "/absolute/canonical/path/to/shared/.git",
  "branchName": "candidate/exact-branch",
  "headOid": "0123456789abcdef0123456789abcdef01234567",
  "actor": "owner:identity",
  "rationale": "why this pre-existing candidate should enter lifecycle-v2",
  "expiresAt": "2026-07-20T14:00:00.000Z"
}
```

The object must contain exactly those keys. Paths, branch, and immutable HEAD must match Git's live identity; `expiresAt` must be a future canonical UTC timestamp. Run:

```bash
node scripts/candidate-lifecycle-v2.mjs adopt --input /absolute/path/to/owner-adoption.json
```

Adoption rejects symlink or path ambiguity (including lifecycle publication roots), non-linked/detached/dirty worktrees, registry or lifecycle duplicates, identity drift or mismatches, expiry, and lexical resource/generation/archive collisions including dangling symlinks. It holds the exact resource lock while atomically publishing one owner-only native v2 record at `resourceVersion: 1` in `review_pending` and while re-verifying the bound snapshot, Git identity, registry identity, and expiry, so concurrent lifecycle updates fail closed. A catchable race or post-publication error atomically withdraws the record before releasing that lock. A hard process termination cannot run catchable rollback and may leave the provisional resource plus resource lock fail-closed for explicit owner recovery; it is not claimed as automatic rollback. Adoption does not clean anything and creates no alternate cleanup path: continue only through lifecycle-v2 review, disposition, integration proof when accepted, restoration archive, cleanup authorization, and cleanup.

Shared utilities live in [lib/package-utils.ts](lib/package-utils.ts).

## Codex reset credits

Use `/codex-reset status` to inspect the active OpenAI Codex subscription account without spending anything. It lists every available banked reset with both relative and absolute expiry times. Use `/codex-reset` or `/codex-reset use` to review that same list and then explicitly confirm spending one credit.

The extracted workflow intentionally improves on the source interaction:

- the command name describes the action instead of hiding it in a settings tab
- every spend requires a confirmation that shows the before/after credit count
- print/JSON invocations are status-only and never spend a credit; RPC requires its confirmation response just like the TUI
- ambiguous transport failures retain and retry the same idempotent request ID for the life of the loaded extension
- the result reports how many windows were reset and refreshes the remaining count

The command requires the active model provider to be `openai-codex`; it reuses Pi's model-registry authentication and does not persist credentials.

## Toolbox bundle

This package exports `@tryinget/pi-little-helpers/toolbox-bundle` for `pi-toolbox-discovery`.
The sidequest extension registers the visible peer tool family (`fork_peer_spawn`, `scout_peer_spawn`, `candidate_peer_spawn`, `candidate_peer_cleanup`, `candidate_peer_closeout`) as standard model-callable tooling at Pi startup. The toolbox bundle registers the same tool family only for package-owned test/catalog compatibility; command/UI helpers such as `/visible-loop`, `/nexus-loop`, `/codeblocks`, `/artifacts`, `/package-updates`, `/session-presence`, and `/stash` are not part of the model-callable toolbox coverage.

## Steve-specific session presence / hot restore coupling

This package now includes a deliberately **Steve-specific** helper for exact Pi session restore.

The `session-presence` extension does two things:

1. writes a live sidecar JSON for the current Pi process under `$XDG_RUNTIME_DIR/pi-session-presence/` (fallback `~/.local/state/pi-session-presence/`)
2. sets and briefly re-applies the terminal title with the full hyphenless 32-hex Pi session UUID, for example `π - agent-kernel · 77bc82bb21b84651a0588b6e4d50636c`

Using the full identity avoids truncated UUIDv7 timestamp-prefix collisions. The title base can also be overridden for special flows such as `/sidequest`, so a forked tab/window can read like `Sidequest: trace this failure · 6e7c38f08b3340edaa6f4852c5aa64c4` instead of only using the cwd label.

This lets the workstation hourly observer join:

- the Ghostty/Niri window title
- the live Pi process metadata
- the exact session file under `~/.pi/agent/sessions/`

The important restore consequence is:

- use `pi --session <exact-session-file>` for hot restore
- do **not** fall back to `pi --resume` when the exact session file is already known

Detailed setup note:

- [docs/project/2026-04-12-session-presence-for-steve-hot-restore.md](docs/project/2026-04-12-session-presence-for-steve-hot-restore.md)

## Runtime dependencies

This package expects Pi host runtime APIs and declares them as peer dependencies:

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-ai`

Fresh-session handoff transport also depends on the sibling owner package:

- `@tryinget/pi-session-compaction` through its `handoff-generation` export

When using UI APIs (`ctx.ui`), guard interactive-only behavior with `ctx.hasUI` so `pi -p` non-interactive runs stay stable.

## Package checks

From the package directory:

```bash
npm install
npm run check
npm run release:check:quick
```

From the monorepo root:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-little-helpers
```

## Live package activation

Install the package into Pi from this package directory:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-little-helpers
```

Then in Pi:

1. run `/reload`
2. verify `/codeblocks`, `/codex-reset status`, `/codex-reset` (including cancel-before-spend), `/artifacts`, `/show-artifacts`, `Ctrl+Shift+S`, `/sidequest "test prompt"`, `/handoff-tab "continue the verified next slice"`, `/scoutpeer "test prompt"`, `/parallelquest "test prompt"`, `/visible-loop --count 1`, `/visible-loop --count 1 --delegate-commit`, `/nexus-loop --count 1`, `/session-presence`, the `stash` shortcuts/commands, `fork_peer_spawn`, `scout_peer_spawn`, `candidate_peer_spawn`, `candidate_peer_cleanup` dry-run, `candidate_peer_closeout` status/plan plus a janitor status against a disposable state root, and any `write`/`edit` flow that produces an `.html` file in a real session
3. verify `/visible-loop --count 2` opens one visible Ghostty Pi tab for iteration 1, shows the six-real-prompt plan widget, submits only one executable frontier, replaces repeated continuation turns with one completion audit, advances only after correlated `message_start` plus `agent_settled`, withholds the consolidated Nexus fixup and all later work until governed deep-review returns the exact successful workflow handoff receipt, survives same-session `/reload` without duplicate delivery, fails closed on fresh restart or indeterminate submission, requires posture refresh and `/commit`, emits `VISIBLE_LOOP_ITERATION` only after the explicit completion checkpoint, then launches iteration 2 in a fresh visible Pi session
4. verify `/nexus-loop --count 2` uses the same single-frontier behavior with four real prompts: exactly one deep-review call through `vault_execute_template`, one consolidated Nexus fixup that forbids a second governed review and may use at most one non-Prompt-Vault read-only reviewer when available and useful before atomic completion, posture refresh, and a resolved `/commit` delegation prompt that calls `dispatch_subagent`; verify no `deep-review.md` file exists
5. for `/sidequest`, `/handoff-tab`, `/visible-loop`, `/nexus-loop`, and quest tools, verify both paths: same-window tab attach when the current Pi session is already running inside a Ghostty binary/class that truly supports `+new-tab`, and fallback to a new window when the current session cannot support tab attach without jumping to the wrong Ghostty window; for `/handoff-tab`, also verify the launched session is clean, receives exactly one generated initial prompt, and starts work automatically
6. run one real `dispatch_subagent` and one multi-phase `loop_execute`; from an exact-target-capable controller, verify the former opens one read-only observer in that controller's Ghostty window and the latter reuses exactly one same-window tab across phases, shows latest-tool/activity/quiet-stall state, and survives observer-tab closure without cancelling execution; from a stock/unsupported controller, verify one warning and no observer tab or new window; also verify headless behavior with `PI_ASC_OBSERVER=off`
7. if `/sidequest`, `/handoff-tab`, `/visible-loop`, `/nexus-loop`, observer, or quest-tool launch does not stay in the current Ghostty window, debug against [docs/project/2026-04-16-sidequest-ghostty-launch-contract.md](docs/project/2026-04-16-sidequest-ghostty-launch-contract.md)

## Docs discovery

```bash
npm run docs:list
npm run docs:list:workspace
npm run docs:list:json
```

## Release metadata

This package keeps component metadata in `package.json` under `x-pi-template`:

- `workspacePath`
- `releaseComponent`
- `releaseConfigMode`

Monorepo release automation is root-owned; package metadata must stay aligned with the root release-component map.

## Copier lifecycle policy

- Keep `.copier-answers.yml` committed.
- Do not edit `.copier-answers.yml` manually.
- Run update/recopy from a clean destination repo (commit or stash pending changes first).
- Use `copier update --trust` when `.copier-answers.yml` includes `_commit` and update is supported.
- In non-interactive shells/CI, append `--defaults` to update/recopy.
- Use `copier recopy --trust` when update is unavailable (for example local non-VCS source) or cannot reconcile cleanly.
- After recopy, re-apply local deltas intentionally and run `npm run check`.
