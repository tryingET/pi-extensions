---
summary: "Visible peer and loop helper capability contract for slash commands and model-callable peer tools."
read_when:
  - "When debugging /sidequest, /scoutpeer, /parallelquest, /visible-loop, /nexus-loop, fork_peer_spawn, scout_peer_spawn, or candidate_peer_spawn registration."
  - "When changing the pi-little-helpers visible peer or loop surface."
type: "runbook"
system4d:
  container: "Capability contract for pi-little-helpers visible peer-spawn surfaces."
  compass: "Keep slash commands, model-callable tools, package exports, and toolbox activation aligned."
  engine: "Update manifest -> register from manifest -> verify package and toolbox tests."
  fog: "Main risk is treating toolbox activation as a substitute for startup tool-schema registration."
---

# Visible peer and loop capability contract

The little-helpers visible surface is one compatibility capability with asymmetric runtime projections:

- slash commands: `/sidequest`, `/scoutpeer`, `/parallelquest`, `/visible-loop`, `/nexus-loop`
- model-callable peer tools: `fork_peer_spawn`, `scout_peer_spawn`, `candidate_peer_spawn`, `candidate_peer_cleanup`
- command-only loop surfaces: `/visible-loop`, `/nexus-loop`

`/visible-loop` and `/nexus-loop` intentionally do not have model-callable peer-spawn tool projections; they launch visible child sessions and drive prompt queues through visible-loop state/intercom machinery. They also own a narrow extension-originated `pi.sendUserMessage` bridge: when Pi reports `input.source === "extension"` and the entire message is `/visible-loop ...` or `/nexus-loop ...`, pi-little-helpers dispatches its own command handler instead of letting the literal text reach the model. This is not a general slash-command parser and does not bridge other packages' commands. Product posture for the package lives in [product-posture.md](./product-posture.md); this contract covers registration/runtime compatibility details.

The source of truth is `src/capabilityManifest.ts`. It also exports `LITTLE_HELPERS_TOOL_COMMAND_PROJECTIONS`, the machine-readable map used by downstream suggestion surfaces to choose the operator-facing slash command instead of model-callable tool syntax:

| Tool | Slash projection |
|---|---|
| `fork_peer_spawn` | `/sidequest` |
| `scout_peer_spawn` | `/scoutpeer` |
| `candidate_peer_spawn` | `/parallelquest` |


```text
LITTLE_HELPERS_CAPABILITY_MANIFEST
```

The sidequest extension imports this manifest and registers slash commands plus model-callable peer-spawn tools by default during Pi startup. The toolbox bundle exports the same manifest for package-owned test/catalog compatibility. `fork_peer_spawn` is still the model-callable `/sidequest` projection and intentionally forks the controller context; unlike manual `/sidequest`, it can opt into explicit intercom report-back through `reportBack: "intercom"` plus exact `parentPeerTarget`. Tests assert that the manifest, slash-command projection, standard tool projection, and toolbox-tool projection stay aligned so API sessions include peer-spawn tools in their initial callable namespace. `/visible-loop` and `/nexus-loop` share the visible-loop state/intercom machinery; `/nexus-loop` swaps in the focused governed deep-review → consolidated Nexus/atomic-fixup → posture-refresh sequence and delegates the resolved `/commit` template to `dispatch_subagent`. Ordinary `/visible-loop` uses product membrane/implementation → one membrane completion audit → governed deep review → consolidated Nexus/atomic fixup → posture refresh → inline `/commit` plus the explicit completion checkpoint by default, while `/visible-loop --delegate-commit` opts into the same resolved-commit subagent delegation. Prompts are delivered sequentially. The deep-review turn must call `vault_execute_template` exactly once and produce an exact successful `workflow_execute` handoff receipt before any later turn is released. The default queue still requires an owning product-posture refresh before commit/completion. The ordinary completion checkpoint is not queued for delegated commit steps; after the subagent returns success, the child calls `visible_loop_child_complete`.

Both commands are execution harnesses, not direction selectors. Launch requires exactly one explicit binding: `--task AK-ID`, `--objective "bounded objective"`, or `--candidate evolution-...`; repeated or conflicting flags fail. Task mode performs a read-only AK preflight before any loop state write: exact task identity and current-repo containment must match, active deferral is rejected, claimed work requires a live lease, and pending work must appear in `ak task ready`. Candidate mode retains its correlated typed-envelope checks, while objective mode represents explicit operator scope. The typed binding is mandatory when the child loads a config, so unbound legacy/manual configs fail with restart guidance. New configs persist the binding with mode `0600` and no-replace creation; every delivered turn is prefixed with the same fail-closed binding guard after slash-template expansion. A task/objective/candidate fixes the slice but does not confer missing owner authority. Direction-to-execution and task/decision selection therefore happen before these loops; `/nexus-loop` hardens an existing bound implementation and never chooses a replacement product slice.

Adaptive controller Wave 1 is the zero-configuration launch default and persists its bounded policy in the run config. It adds deeply validated host-recorded prompt/checkpoint delivery receipts, invalidation, run-level weighted transport-event diagnostics, fail-closed adaptive completion, and a deterministic continuation decision while retaining the hardened fixed profile as the automatic budget fallback and an explicit emergency opt-out (`PI_VISIBLE_LOOP_ADAPTIVE_CONTROLLER=0`, `false`, or `off`). This controller state is local, non-tamper-proof diagnostic transport state only; it does not certify prompt success, repository validation, semantic quality, commit correctness, AK/KES evidence, promotion, or owner acceptance.

Visible-loop slash prompt expansion is deterministic and fail-closed. Extension-originated `pi.sendUserMessage` does not invoke Pi's command/prompt expansion pipeline, so pi-little-helpers handles only its own whole-message `/visible-loop ...` and `/nexus-loop ...` command bridge. Text-safe configured slash prompts resolve from `<cwd>/.pi/prompts` before `~/.pi/agent/prompts`; repo-local templates win over global templates. `deep-review` is intentionally excluded from raw file expansion because Prompt Vault classifies it as orchestrator-gated. The child activates the orchestrator bundle if needed and calls `vault_execute_template`; host-correlated execution events require the exact template/objective plus `details.ok=true`, `executionSurface=workflow_execute`, a non-empty handoff id, and `status=done`. Missing, malformed, failed, duplicate, stale, or uncorrelated results stop before Nexus. For `/nexus-loop` and `/visible-loop --delegate-commit`, delegation happens only after `/commit` resolves; the subagent receives a bounded objective containing the resolved commit prompt plus cwd, run id, iteration, no-new-implementation scope, and final-report expectations. Package, settings, and CLI prompt-template sources remain upstream Pi host state and are not exposed through the raw expansion API.

`dispatch_subagent` is the only supported commit delegation mode for `/nexus-loop` and `/visible-loop --delegate-commit`; `fork_peer_spawn` remains a separate visible peer tool, not a loop commit delegation mode.

## Why this exists

The failure mode that motivated this contract was a split-brain runtime:

```text
toolbox reported peer-spawn activation
but @tryinget/pi-little-helpers/toolbox-bundle package resolution failed
and /sidequest was not reliably available
```

A second failure mode is startup/schema drift:

```text
toolbox reports fork_peer_spawn/scout_peer_spawn/candidate_peer_spawn active
but the current API session did not load those function recipients at startup
```

That is not just a missing import. It means slash commands, package exports, startup tool registration, toolbox activation, and documentation can drift unless they share one capability membrane.

## Debugging checklist

When a peer or visible-loop surface fails, check the capability in this order:

1. `src/capabilityManifest.ts` contains the expected command names, peer tool names, and command-only loop surfaces.
2. `package.json` exports both:
   - `./capability-manifest`
   - `./toolbox-bundle`
3. `src/toolboxBundle.ts` exports `PEER_SPAWN_CAPABILITY_MANIFEST` and delegates tool registration to `createSidequestExtension({ registerCommands: false, registerTools: true })`.
4. `extensions/sidequest.ts` imports the manifest and registers slash commands plus peer-spawn tools from it by default.
5. `npm run check` passes in `packages/pi-little-helpers`.
6. If toolbox status reports the peer-spawn tools missing, enable/install `pi-little-helpers` and `/reload`; toolbox cannot make missing tools API-callable mid-session.
7. If toolbox status reports the peer-spawn tools active but an API session cannot call `candidate_peer_spawn`, confirm the session started after the sidequest extension was enabled. Use the current interactive visible-peer command documented by `LITTLE_HELPERS_TOOL_COMMAND_PROJECTIONS` as the immediate workaround; do not hard-code historical slash-command names in adapter-facing docs.

## Boundary

This contract does not make intercom messages or peer worktree output authoritative. Peer launch still returns communication/launch facts only; the controller must inspect candidate branches/worktrees before promotion.
