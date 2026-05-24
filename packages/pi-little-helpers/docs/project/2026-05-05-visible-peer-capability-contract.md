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

`/visible-loop` and `/nexus-loop` intentionally do not have model-callable peer-spawn tool projections; they launch visible child sessions and drive prompt queues through visible-loop state/intercom machinery.

The source of truth is `src/capabilityManifest.ts`. It also exports `LITTLE_HELPERS_TOOL_COMMAND_PROJECTIONS`, the machine-readable map used by downstream suggestion surfaces to choose the operator-facing slash command instead of model-callable tool syntax:

| Tool | Slash projection |
|---|---|
| `fork_peer_spawn` | `/sidequest` |
| `scout_peer_spawn` | `/scoutpeer` |
| `candidate_peer_spawn` | `/parallelquest` |


```text
LITTLE_HELPERS_CAPABILITY_MANIFEST
```

The sidequest extension imports this manifest and registers slash commands plus model-callable peer-spawn tools by default during Pi startup. The toolbox bundle exports the same manifest for package-owned test/catalog compatibility. Tests assert that the manifest, slash-command projection, standard tool projection, and toolbox-tool projection stay aligned so API sessions include peer-spawn tools in their initial callable namespace. `/visible-loop` and `/nexus-loop` share the visible-loop state/intercom machinery; `/nexus-loop` only swaps in the focused deep-review → nexus implementation → atomic-completion → commit prompt sequence.

Visible-loop slash prompt expansion is deterministic and fail-closed. Extension-originated `pi.sendUserMessage` does not invoke Pi's command/prompt expansion pipeline, so the extension resolves configured slash prompts itself from `<cwd>/.pi/prompts` before `~/.pi/agent/prompts`; repo-local templates win over global templates for queued loop prompts. If a required configured slash prompt such as `/deep-review` or `/commit` cannot resolve from those extension-visible directories, the loop does not launch/continue with misleading literal slash text. Package, settings, and CLI prompt-template sources remain upstream Pi host state and are not currently exposed through the public extension API.

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
