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

The sidequest extension imports this manifest and registers slash commands plus model-callable peer-spawn tools by default during Pi startup. The toolbox bundle exports the same manifest for package-owned test/catalog compatibility. `fork_peer_spawn` is still the model-callable `/sidequest` projection and intentionally forks the controller context; unlike manual `/sidequest`, it can opt into explicit intercom report-back through `reportBack: "intercom"` plus exact `parentPeerTarget`. Tests assert that the manifest, slash-command projection, standard tool projection, and toolbox-tool projection stay aligned so API sessions include peer-spawn tools in their initial callable namespace. `/visible-loop` and `/nexus-loop` share the visible-loop state/intercom machinery and deliver one prompt only after the previous agent turn settles. `/nexus-loop` begins with governed deep-review through `vault_execute_template`, requires an exact successful workflow handoff receipt, then continues to Nexus implementation, atomic completion, posture refresh, and delegated `/commit`. Ordinary `/visible-loop` keeps inline `/commit` plus the explicit completion checkpoint by default, while `/visible-loop --delegate-commit` opts into resolved-commit subagent delegation. Missing or failed deep-review receipts stop both loop profiles before later prompts. The ordinary completion checkpoint is not sent for delegated commit steps; after the subagent returns success, the child calls `visible_loop_child_complete`.

Visible-loop slash prompt expansion remains deterministic and fail-closed for ordinary text-safe helpers such as `/commit`: project prompts override global prompts, and unresolved templates block launch or delivery. Deep-review is deliberately outside that expansion path because Prompt Vault quarantines workflow-grade templates from raw Pi projection. The loop sends a governed execution instruction, observes the completed `vault_execute_template` tool result, and advances only when the result identifies `deep-review`, `workflow_execute`, a non-empty Vault handoff id, and `status=done`. For `/nexus-loop` and `/visible-loop --delegate-commit`, commit delegation happens only after `/commit` resolves and the preceding governed review gate passed. Package, settings, and CLI prompt-template bodies remain upstream Pi host state and are not exposed through the public extension API.

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
