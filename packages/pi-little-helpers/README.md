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
| `sidequest` | Human slash command to fork the current Pi session into the current Ghostty window as a new tab when supported; otherwise a new Ghostty window |
| `scoutpeer` | Launch a clean visible read-only scout/review peer in the current workspace |
| `parallelquest` | Human slash command to launch a clean visible candidate peer in an isolated git worktree |
| `visible-loop` | Launch a clean visible Ghostty Pi tab for each iteration after exactly one execution binding is supplied with `--task`, `--objective`, or `--candidate`; queue the bounded product membrane, implementation, review/fixup, posture, and commit sequence; `--delegate-commit` resolves `/commit` and delegates it to `dispatch_subagent` |
| `nexus-loop` | Launch the same bound machinery for an existing implementation slice: governed `deep-review` workflow execution, consolidated Nexus/atomic fixup, product-posture refresh, and resolved `/commit` delegation; it cannot launch unbound to select product direction |
| `stash` | Persist and restore stashed editor content across sessions |

## Visible peer tools

The `sidequest` extension owns the visible peer and loop helper capability. Slash commands and model-callable peer tools are registered by the extension as standard tooling during Pi startup; `/visible-loop` and `/nexus-loop` are command-only loop surfaces, not model-callable peer-spawn tools. They also have a narrow pi-little-helpers-owned `pi.sendUserMessage` bridge for extension-originated whole-message `/visible-loop ...` and `/nexus-loop ...` inputs; this does not bridge arbitrary slash commands. The toolbox bundle exposes the same manifest for catalog/test alignment. Both projections are governed by one capability manifest in [`src/capabilityManifest.ts`](src/capabilityManifest.ts), including the machine-readable `LITTLE_HELPERS_TOOL_COMMAND_PROJECTIONS` map for tool-to-slash equivalents; see [Visible peer and loop capability contract](docs/project/2026-05-05-visible-peer-capability-contract.md) when debugging registration, package-export drift, or visible-loop prompt expansion.

### Adaptive controller Wave 1

The Wave 1 controller is the zero-configuration default for `/visible-loop` and `/nexus-loop`; ordinary Pi startup needs no special environment. The launch persists the policy in the run config, records bounded weighted transport events, carries deeply validated host-recorded prompt-delivery and checkpoint/delegation receipts in private run-level state, rejects completion when required receipts are missing or invalidated, and records a deterministic HTN continuation decision (`complete`, `same_session`, `new_session`, or `baseline_fallback`). Budget overflow falls back to the hardened fixed transport decision rather than skipping safety gates; malformed or missing controller state fails closed. `PI_VISIBLE_LOOP_MAX_WEIGHTED_COST=<positive-number>` can override the default budget of `100`.

This first wave measures extension-observable transport events, not model tokens, tool duration, test cost, semantic quality, or owner approval. Its receipt ledger and status JSONL are diagnostic local state only: they are not tamper-proof, AK evidence, validation authority, merge/release approval, promotion, or external authority. Adaptive runs fail closed when their persisted controller state cannot be restored; baseline runs retain the existing recovery path. Emergency rollback remains available with `PI_VISIBLE_LOOP_ADAPTIVE_CONTROLLER=0`, `false`, or `off`; an already-launched adaptive run retains its persisted policy and must finish or be stopped separately.

Visible-loop slash prompts are resolved before delivery because extension-originated `pi.sendUserMessage` bypasses normal Pi command handling. The bridge only recognizes pi-little-helpers-owned whole-message `/visible-loop ...` and `/nexus-loop ...` inputs, then uses the same command handlers as operator submission. Text-safe slash-template expansion is limited to `<cwd>/.pi/prompts` first and `~/.pi/agent/prompts` second; repo-local templates intentionally override global templates. Governed `deep-review` is not raw prompt expansion: the loop instructs the child to activate the orchestrator tool bundle when necessary and call `vault_execute_template` exactly once, then requires an exact successful `workflow_execute` handoff receipt before releasing Nexus, posture, or commit turns. Prompts are delivered sequentially so a missing, malformed, failed, or duplicate deep-review execution stops before later work. `/nexus-loop` wraps resolved `/commit` content in a bounded `dispatch_subagent` objective; `/visible-loop --delegate-commit` opts into the same delegation while ordinary `/visible-loop` keeps inline `/commit` plus the normal completion checkpoint. Pi package/settings/CLI prompt-template sources remain outside the extension-visible raw expansion API.

Launch is also execution-bound. Exactly one of `--task AK-ID`, `--objective "bounded objective"`, or `--candidate evolution-...` is required; repeated or conflicting flags fail. An AK task binding is read before launch and must match the current repo, have no active deferral, and be either ready-pending or claimed with a live lease. Missing, stale, completed, cross-repo, deferred, or non-ready tasks fail before config creation or Ghostty launch. The typed binding is mandatory at child-config load, so legacy/manually constructed unbound configs must be relaunched. It is persisted in a mode-0600, no-replace local config and prefixed to every delivered prompt, including governed deep-review dispatch, Nexus, posture, commit-delegation, and completion turns. The binding fixes scope but does not grant missing owner authority; every later turn repeats the stop-before-mutation guard. Run direction-to-execution or choose an owner-authorized task before launching these execution harnesses; do not place secrets in an objective because it is persisted locally.

| Tool | Purpose | Mutation boundary |
|---|---|---|
| `fork_peer_spawn` | Canonical tool for launching a visible peer that inherits the current Pi conversation/context. Supports explicit intercom report-back with `reportBack: "intercom"` and exact `parentPeerTarget`; otherwise remains manual-visible by default. | Same forked-context family as `/sidequest`; use only when inherited context is intended. |
| `scout_peer_spawn` | Launch a clean visible scout/review peer in the controller's current/requested workspace. Defaults to intercom report-back and requires an exact `parentPeerTarget` unless `reportBack` is explicitly `manual` or `none`. | Read-only by prompt contract only; editable shared-cwd work remains manual `/sidequest`. |
| `candidate_peer_spawn` | Create an isolated git worktree and launch a clean visible candidate peer for bounded mutation when no lifecycle backlog hold is active. | A state-root hold blocks both this tool and `/parallelquest` before Git mutation; no merge, push, PR, AK mutation, or promotion authority. |
| `candidate_peer_cleanup` | Read-only candidate registry dry-run/inventory while candidate lifecycle v2 is under review. | Destructive execution is temporarily blocked after the 2026-07-13 census exposed untracked-file loss, duplicate worktree aliases, and missing disposition state. |

Clean peer surfaces (`scout_peer_spawn`, `candidate_peer_spawn`, `/scoutpeer`, and `/parallelquest`) launch a clean Pi session rather than forking the controller conversation; this keeps the boot ACK prompt as the first user turn and avoids inherited controller/tool-result context overriding peer identity. Fork peer surfaces (`fork_peer_spawn` and `/sidequest`) intentionally inherit the current Pi context. `fork_peer_spawn` preserves manual-visible default behavior, but can inject the same bounded `PEER_ACK` / `PEER_FINAL` intercom instructions when called with `reportBack: "intercom"` and an exact `parentPeerTarget`; `/sidequest` remains a manual operator command without automatic report-back. Peer launches are staggered by about one second by default so concurrent candidate/scout/fork starts do not race Ghostty/Pi tab activation and leave later tabs inert; set `PI_SIDEQUEST_LAUNCH_STAGGER_MS=0` to disable or another millisecond value to tune. Controller-spawned intercom report-back must include the exact controller session id, usually from `intercom({ action: "status" })`, so spawned peers do not guess among many same-cwd sessions; `/scoutpeer` uses the current session id for intercom report-back when Pi exposes it, otherwise it falls back to manual visible reporting. `/scoutpeer` launch notifications include the exact `intercom({ action: "peer_watch", peerRunId: "...", waitFor: "final" })` bridge when intercom report-back is active. Intercom prompts prefer the bounded canonical two-message protocol: one `PEER_ACK peer_run_id=...` and one `PEER_FINAL peer_run_id=...`; after `PEER_FINAL`, the peer should stop unless the controller explicitly asks a clarifying question or assigns new work. Legacy `QUEST_ACK quest_id=...` / `QUEST_FINAL quest_id=...` remains a peer-messaging compatibility path, not the preferred beta vocabulary. The tools return launch/worktree facts only; visible peers are parallel cognition, not parallel authority. Intercom report-back is communication, not durable evidence or promotion authority.

Candidate peer worktrees are intentionally left for controller/operator review. Each `candidate_peer_spawn` result includes a persisted registry sidecar under `$XDG_STATE_HOME/pi-quests/peer-registry/<peerRunId>.json` (fallback `~/.local/state/...`) plus a prospective archive-before-cleanup packet. The sidecar records peer-run launch metadata; it is not disposition, integration, or cleanup authority.

**Emergency safety hold:** `candidate_peer_cleanup` currently supports dry-run inventory only. `execute: true` fails closed and cites AK decision 59. While `$XDG_STATE_HOME/pi-quests/candidate-spawn.HOLD.json` exists, `candidate_peer_spawn` and `/parallelquest` also fail before Git mutation so the backlog cannot keep growing through updated/reloaded sessions. Do not bypass either hold with manual worktree creation/removal or branch deletion. The [2026-07-13 lifecycle RFC](../../docs/project/2026-07-13-candidate-peer-lifecycle-rfc.md) and [one-by-one reconciliation](../../docs/project/2026-07-13-candidate-peer-lifecycle-reconciliation.md) govern the repair: accepted, rejected, preserved, missing, and cleanup-ready resources must first receive explicit resource-level disposition and lossless archive handling.

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
The sidequest extension registers the visible peer-spawn tool family (`fork_peer_spawn`, `scout_peer_spawn`, `candidate_peer_spawn`, `candidate_peer_cleanup`) as standard model-callable tooling at Pi startup. The toolbox bundle registers the same tool family only for package-owned test/catalog compatibility; command/UI helpers such as `/visible-loop`, `/nexus-loop`, `/codeblocks`, `/artifacts`, `/package-updates`, `/session-presence`, and `/stash` are not part of the model-callable toolbox coverage.

## Steve-specific session presence / hot restore coupling

This package now includes a deliberately **Steve-specific** helper for exact Pi session restore.

The `session-presence` extension does two things:

1. writes a live sidecar JSON for the current Pi process under `$XDG_RUNTIME_DIR/pi-session-presence/` (fallback `~/.local/state/pi-session-presence/`)
2. sets and briefly re-applies the terminal title so it keeps the short Pi session id, for example `π - agent-kernel · 77bc82bb`

The title base can also be overridden for special flows such as `/sidequest`, so a forked tab/window can read like `Sidequest: trace this failure · 6e7c38f0` instead of only using the cwd label.

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
2. verify `/codeblocks`, `/codex-reset status`, `/codex-reset` (including cancel-before-spend), `/artifacts`, `/show-artifacts`, `Ctrl+Shift+S`, `/sidequest "test prompt"`, `/scoutpeer "test prompt"`, `/parallelquest "test prompt"`, bound `/visible-loop` and `/nexus-loop` commands as specified below, `/session-presence`, the `stash` shortcuts/commands, `fork_peer_spawn`, `scout_peer_spawn`, `candidate_peer_spawn`, `candidate_peer_cleanup` dry-run, and any `write`/`edit` flow that produces an `.html` file in a real session
3. verify unbound `/visible-loop --count 2` and `/nexus-loop --count 2` fail before launch with direction-to-execution guidance; then verify `/visible-loop --task <active-AK-id> --count 2` (or an explicit `--objective`) opens one visible Ghostty Pi tab for iteration 1, binds every delivered turn to that slice, queues only the six real prompts, requires posture refresh before commit, and launches iteration 2 only after the explicit completion checkpoint
4. verify `/nexus-loop --objective "harden the named existing implementation" --count 2` uses the same binding/iteration/intercom behavior while delivering only four real prompts in order: governed `deep-review` via `vault_execute_template`, consolidated Nexus/atomic fixup with Prompt Vault grounding, posture refresh, and resolved `/commit` delegation
5. for `/sidequest`, `/visible-loop`, `/nexus-loop`, and quest tools, verify both paths: same-window tab attach when the current Pi session is already running inside a Ghostty binary/class that truly supports `+new-tab`, and fallback to a new window when the current session cannot support tab attach without jumping to the wrong Ghostty window
6. if `/sidequest`, `/visible-loop`, `/nexus-loop`, or quest-tool launch does not stay in the current Ghostty window, debug against [docs/project/2026-04-16-sidequest-ghostty-launch-contract.md](docs/project/2026-04-16-sidequest-ghostty-launch-contract.md)

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
