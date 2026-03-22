# 2026-03-22 — Integrate PTX runtime ownership and model lifecycle into the shared runtime registry

## What I Did
- Claimed AK task #242 and implemented a PTX runtime-registry bridge in `packages/pi-prompt-template-accelerator/src/ptxRuntimeRegistry.js`.
- Registered two PTX capability surfaces in `@tryinget/pi-runtime-registry`:
  - prompt-template runtime ownership
  - observed model lifecycle
- Wired `packages/pi-prompt-template-accelerator/extensions/ptx.ts` to:
  - register PTX runtime capabilities at startup
  - track `model_select` events without changing PTX's deterministic-only prefill behavior
  - unregister registry entries on `session_shutdown`
  - avoid leaking late live-trigger registrations after shutdown
- Added regression coverage for both the pure registry bridge and the extension wiring.
- Added the local `@tryinget/pi-runtime-registry` dependency to the PTX package and refreshed `package-lock.json`.
- Updated PTX docs/changelog to state that model lifecycle is now observable through the shared runtime registry while slot filling remains deterministic.

## What Surprised Me
- PTX already had an async live-trigger registration path that could outlive `session_shutdown`; integrating the registry made that lifecycle edge case visible enough to harden now.

## Patterns
- The new runtime-registry bridge pattern now mirrors the earlier `pi-vault-client` receipt/telemetry bridge:
  - owner-scoped runtime IDs
  - capability descriptors for discovery
  - accessor objects that close over live state instead of forcing re-registration on every update
- Tracking model lifecycle can be useful even before model-assisted behavior exists, as long as the accessor explicitly reports `deterministic-only` behavior.

## Validation
- `cd packages/pi-prompt-template-accelerator && npm run check` ✅

## Crystallization Candidates
- → shared pattern doc for cross-extension runtime-registry bridges in the `pi-interaction` package family
- → future PTX architecture note explaining how observed model lifecycle could feed a guarded hybrid inference design without misrepresenting current behavior

## Related
- AK task: #242 — Integrate prompt-template runtime ownership and model lifecycle into the shared runtime registry
