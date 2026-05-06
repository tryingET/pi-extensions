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
  fog: "Main risk is treating toolbox activation as a substitute for startup tool-schema registration."
---

# Visible peer capability contract

The visible peer-spawn surface is one capability with two runtime projections:

- slash commands: `/sidequest`, `/scoutpeer`, `/parallelquest`
- model-callable tools: `fork_peer_spawn`, `scout_peer_spawn`, `candidate_peer_spawn`

The source of truth is `src/capabilityManifest.ts`:

```text
LITTLE_HELPERS_CAPABILITY_MANIFEST
```

The sidequest extension imports this manifest and registers slash commands plus model-callable peer-spawn tools by default during Pi startup. The toolbox bundle exports the same manifest for package-owned test/catalog compatibility. Tests assert that the manifest, slash-command projection, standard tool projection, and toolbox-tool projection stay aligned so API sessions include peer-spawn tools in their initial callable namespace.

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

When a peer-spawn surface fails, check the capability in this order:

1. `src/capabilityManifest.ts` contains the expected command and tool names.
2. `package.json` exports both:
   - `./capability-manifest`
   - `./toolbox-bundle`
3. `src/toolboxBundle.ts` exports `PEER_SPAWN_CAPABILITY_MANIFEST` and delegates tool registration to `createSidequestExtension({ registerCommands: false, registerTools: true })`.
4. `extensions/sidequest.ts` imports the manifest and registers slash commands plus peer-spawn tools from it by default.
5. `npm run check` passes in `packages/pi-little-helpers`.
6. If toolbox status reports the peer-spawn tools missing, enable/install `pi-little-helpers` and `/reload`; toolbox cannot make missing tools API-callable mid-session.
7. If toolbox status reports the peer-spawn tools active but an API session cannot call `candidate_peer_spawn`, confirm the session started after the sidequest extension was enabled. Use the current interactive visible-peer command documented by this package as the immediate workaround; do not hard-code historical slash-command names in adapter-facing docs.

## Boundary

This contract does not make intercom messages or peer worktree output authoritative. Peer launch still returns communication/launch facts only; the controller must inspect candidate branches/worktrees before promotion.
