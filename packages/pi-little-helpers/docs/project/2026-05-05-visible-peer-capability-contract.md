---
summary: "Visible peer-spawn capability contract for slash commands and model-callable tools."
read_when:
  - "When debugging /sidequest, /scoutpeer, /parallelquest, fork_peer_spawn, scout_peer_spawn, or candidate_peer_spawn registration."
  - "When changing the pi-little-helpers visible peer-spawn surface."
type: "runbook"
system4d:
  container: "Capability contract for pi-little-helpers visible peer-spawn surfaces."
  compass: "Keep slash commands, model-callable tools, package exports, and toolbox activation aligned."
  engine: "Update manifest -> register from manifest -> verify package and toolbox tests."
  fog: "Main risk is treating a successful lazy import as proof that every projection stayed aligned."
---

# Visible peer capability contract

The visible peer-spawn surface is one capability with two runtime projections:

- slash commands: `/sidequest`, `/scoutpeer`, `/parallelquest`
- model-callable tools: `fork_peer_spawn`, `scout_peer_spawn`, `candidate_peer_spawn`

The source of truth is `src/capabilityManifest.ts`:

```text
LITTLE_HELPERS_CAPABILITY_MANIFEST
```

The sidequest extension imports this manifest and registers slash commands from its command array by default. The toolbox lazy bundle exports the same manifest and registers only the model-callable tools from its tool array on demand. Tests assert that the manifest, slash-command projection, and toolbox-tool projection stay aligned without making peer-spawn tools eager startup registrations.

## Why this exists

The failure mode that motivated this contract was a split-brain runtime:

```text
toolbox reported peer-spawn activation
but @tryinget/pi-little-helpers/toolbox-bundle package resolution failed
and /sidequest was not reliably available
```

A second failure mode is adapter/schema drift:

```text
toolbox reports fork_peer_spawn/scout_peer_spawn/candidate_peer_spawn active
but the current API adapter exposes a static tool schema without those function recipients
```

That is not just a missing import. It means slash commands, toolbox lazy imports, package exports, adapter tool-schema refresh behavior, and documentation can drift unless they share one capability membrane.

## Debugging checklist

When a peer-spawn surface fails, check the capability in this order:

1. `src/capabilityManifest.ts` contains the expected command and tool names.
2. `package.json` exports both:
   - `./capability-manifest`
   - `./toolbox-bundle`
3. `src/toolboxBundle.ts` exports `PEER_SPAWN_CAPABILITY_MANIFEST` and delegates tool registration to `createSidequestExtension({ registerCommands: false, registerTools: true })`.
4. `extensions/sidequest.ts` imports the manifest and registers slash commands from it by default without eagerly registering the peer-spawn tools.
5. `npm run check` passes in `packages/pi-little-helpers`.
6. If toolbox activation retries a published-package fallback after local registration already succeeded, inspect `packages/pi-toolbox-discovery/extensions/toolbox.ts`; activation should skip lazy imports once all requested capability tools are registered.
7. If toolbox status reports the peer-spawn tools active but an API session cannot call `candidate_peer_spawn`, check whether that adapter uses a static tool schema for the current turn/session. The runtime registry may be correct while the adapter schema still needs refresh, `/reload`, or a new session. Use the current interactive visible-peer command documented by this package as the immediate workaround; do not hard-code historical slash-command names in adapter-facing docs.

## Boundary

This contract does not make intercom messages or peer worktree output authoritative. Peer launch still returns communication/launch facts only; the controller must inspect candidate branches/worktrees before promotion.
