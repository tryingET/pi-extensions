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
| `html-output-browser` | Auto-open written/edited HTML files in the browser, append clickable `file://` links to tool output, and expose `/artifacts` / `/show-artifacts` plus `Ctrl+Shift+S` to pick an openable artifact from the workspace or recently written outside it |
| `package-update-notify` | Check for updates to pinned npm/git packages in Pi settings |
| `session-presence` | Publish exact Pi session identity for Steve's Ghostty/Niri hourly observation and hot restore flow |
| `sidequest` | Human slash command to fork the current Pi session into the current Ghostty window as a new tab when supported; otherwise a new Ghostty window |
| `scoutpeer` | Launch a clean visible read-only scout/review peer in the current workspace |
| `parallelquest` | Human slash command to launch a clean visible candidate peer in an isolated git worktree |
| `visible-loop` | Launch a clean visible Ghostty Pi tab for each iteration, queue the default prompt sequence as follow-ups inside that per-iteration session, require product-posture refresh and `/commit` prompts before completion, then launch the next iteration in a fresh visible session after the explicit completion checkpoint while emitting canonical intercom progress/final messages from persisted loop state |
| `stash` | Persist and restore stashed editor content across sessions |

## Visible peer tools

The `sidequest` extension owns the visible peer capability. Slash commands and model-callable peer tools are registered by the extension as standard tooling during Pi startup; the toolbox bundle exposes the same manifest for catalog/test alignment. Both projections are governed by one capability manifest in [`src/capabilityManifest.ts`](src/capabilityManifest.ts), including the machine-readable `LITTLE_HELPERS_TOOL_COMMAND_PROJECTIONS` map for tool-to-slash equivalents; see [Visible peer capability contract](docs/project/2026-05-05-visible-peer-capability-contract.md) when debugging registration or package-export drift:

| Tool | Purpose | Mutation boundary |
|---|---|---|
| `fork_peer_spawn` | Canonical tool for launching a visible peer that inherits the current Pi conversation/context. | Same forked-context family as `/sidequest`; use only when inherited context is intended. |
| `scout_peer_spawn` | Launch a clean visible scout/review peer in the controller's current/requested workspace. Defaults to intercom report-back and requires an exact `parentPeerTarget` unless `reportBack` is explicitly `manual` or `none`. | Read-only by prompt contract only; editable shared-cwd work remains manual `/sidequest`. |
| `candidate_peer_spawn` | Create an isolated git worktree and launch a clean visible candidate peer for bounded mutation. Defaults to intercom report-back and requires an exact `parentPeerTarget` unless `reportBack` is explicitly `manual` or `none`. | Mutations stay inside the worktree; no merge, push, PR, AK mutation, or promotion authority. |
| `candidate_peer_cleanup` | Dry-run or execute exact candidate cleanup from persisted registry sidecars after successful integration closeout. | Archives first, can terminate only sidequest/Pi processes matched by the exact registered worktree path, then removes only named worktrees/branches; no fuzzy tab close, merge, promotion, or owner-surface write authority. |

Clean peer surfaces (`scout_peer_spawn`, `candidate_peer_spawn`, `/scoutpeer`, and `/parallelquest`) launch a clean Pi session rather than forking the controller conversation; this keeps the boot ACK prompt as the first user turn and avoids inherited controller/tool-result context overriding peer identity. Fork peer surfaces (`fork_peer_spawn` and `/sidequest`) intentionally inherit the current Pi context. Peer launches are staggered by about one second by default so concurrent candidate/scout/fork starts do not race Ghostty/Pi tab activation and leave later tabs inert; set `PI_SIDEQUEST_LAUNCH_STAGGER_MS=0` to disable or another millisecond value to tune. Controller-spawned intercom report-back must include the exact controller session id, usually from `intercom({ action: "status" })`, so spawned peers do not guess among many same-cwd sessions; `/scoutpeer` uses the current session id for intercom report-back when Pi exposes it, otherwise it falls back to manual visible reporting. `/scoutpeer` launch notifications include the exact `intercom({ action: "peer_watch", peerRunId: "...", waitFor: "final" })` bridge when intercom report-back is active. Intercom prompts prefer the bounded canonical two-message protocol: one `PEER_ACK peer_run_id=...` and one `PEER_FINAL peer_run_id=...`; after `PEER_FINAL`, the peer should stop unless the controller explicitly asks a clarifying question or assigns new work. Legacy `QUEST_ACK quest_id=...` / `QUEST_FINAL quest_id=...` remains a peer-messaging compatibility path, not the preferred beta vocabulary. The tools return launch/worktree facts only; visible peers are parallel cognition, not parallel authority. Intercom report-back is communication, not durable evidence or promotion authority.

Candidate peer worktrees are intentionally left for controller/operator review. Each `candidate_peer_spawn` result now includes a persisted registry sidecar under `$XDG_STATE_HOME/pi-quests/peer-registry/<peerRunId>.json` (fallback `~/.local/state/...`) plus an archive-before-cleanup command packet. The sidecar records the peer run id, parent cwd/repo, worktree path, branch/base ref, report-back target, prompt-scope lists, and safe launch/session/process hints. `candidate_peer_cleanup` consumes those exact sidecars, dry-runs by default, requires `integrationCloseoutStatus: "successful"` for execution, archives metadata/status/diffs first, can terminate only sidequest/Pi processes matched by the exact registered worktree path when `closeVisibleResources: true`, and then removes only the exact recorded worktree and branch; it does not fuzzy-close arbitrary tabs, remove arbitrary directories, merge, promote, or write owner-surface state.

Manual fallback after inspecting or discarding a candidate lane:

```bash
git worktree remove <path>
git branch -D <branch>
```

Shared utilities live in [lib/package-utils.ts](lib/package-utils.ts).

## Toolbox bundle

This package exports `@tryinget/pi-little-helpers/toolbox-bundle` for `pi-toolbox-discovery`.
The sidequest extension registers the visible peer-spawn tool family (`fork_peer_spawn`, `scout_peer_spawn`, `candidate_peer_spawn`, `candidate_peer_cleanup`) as standard model-callable tooling at Pi startup. The toolbox bundle registers the same tool family only for package-owned test/catalog compatibility; command/UI helpers such as `/codeblocks`, `/artifacts`, `/package-updates`, `/session-presence`, and `/stash` are not part of the model-callable toolbox coverage.

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

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-ai`

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
2. verify `/codeblocks`, `/artifacts`, `/show-artifacts`, `Ctrl+Shift+S`, `/sidequest "test prompt"`, `/scoutpeer "test prompt"`, `/parallelquest "test prompt"`, `/visible-loop --count 1`, `/session-presence`, the `stash` shortcuts/commands, `fork_peer_spawn`, `scout_peer_spawn`, `candidate_peer_spawn`, `candidate_peer_cleanup` dry-run, and any `write`/`edit` flow that produces an `.html` file in a real session
3. verify `/visible-loop --count 2` opens one visible Ghostty Pi tab for iteration 1, queues only the real prompt sequence as follow-up prompts, requires the product-posture refresh prompt and `/commit` prompt after the final fix-bugs prompt, emits `VISIBLE_LOOP_ITERATION` only after the explicit completion checkpoint confirms those prompts finished, then launches iteration 2 in a fresh visible Pi session; do not queue internal completion commands as follow-ups because extension-originated command prompts are intercepted at enqueue time rather than after prior follow-ups finish
4. for `/sidequest`, `/visible-loop`, and quest tools, verify both paths: same-window tab attach when the current Pi session is already running inside a Ghostty binary/class that truly supports `+new-tab`, and fallback to a new window when the current session cannot support tab attach without jumping to the wrong Ghostty window
5. if `/sidequest`, `/visible-loop`, or quest-tool launch does not stay in the current Ghostty window, debug against [docs/project/2026-04-16-sidequest-ghostty-launch-contract.md](docs/project/2026-04-16-sidequest-ghostty-launch-contract.md)

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
