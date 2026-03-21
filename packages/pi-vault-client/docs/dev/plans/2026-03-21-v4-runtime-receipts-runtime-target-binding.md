---
summary: "Plan for a bounded v4 coordination slice: author the repo-native runtime-receipts runtime-target binding note without implying AK or shared-runtime cutover."
read_when:
  - "Executing AK task #223 for the v4 runtime_receipts concern in pi-vault-client."
  - "Authoring the repo-native boundary note that keeps pi-vault-client canonical for runtime receipts in the bounded v4 slice."
system4d:
  container: "Focused docs plan for the v4 runtime-receipts boundary note."
  compass: "State exactly what AK may project from pi-vault-client while keeping receipt/runtime authority package-native."
  engine: "Read current receipt architecture -> author boundary note -> cross-link docs -> validate package docs/contracts."
  fog: "Main risk is overclaiming shared-runtime or AK-native ownership when the current truth is still local package authority plus projection-only bindings."
---

# Plan: v4 runtime-receipts runtime-target binding note

## Scope
- author `docs/dev/v4-runtime-receipts-runtime-target-binding.md`
- preserve `pi-vault-client` as the current canonical runtime-receipt authority for the bounded v4 slice
- cite the existing receipt architecture anchors:
  - `docs/dev/vault-execution-receipts.md`
  - `docs/dev/plans/2026-03-11-vault-execution-receipts-architecture.md`
- state which receipt/runtime facts AK may consume as projection-only bindings
- keep report-only warning semantics explicit

## Acceptance criteria
- the note names the exact concern (`runtime_receipts`) and owner repo
- the note distinguishes current, emerging, and target authority instead of collapsing them
- the note lists the bounded runtime facts the v4 initiative may consume now
- the note lists AK-visible binding surfaces that remain non-canonical projections
- the note keeps `projection_only_authority` and `external_binding_not_runtime_native` explicit for this concern
- the note explicitly says that shared-runtime or AK-native cutover has **not** happened
- package docs remain coherent after the note lands
- `npm run docs:list`, `npm run typecheck`, and `npm run check` pass

## Non-goals
- no Prompt Vault schema changes
- no AK schema or runtime changes
- no movement of receipt payloads into shared persistence
- no replay/runtime implementation changes
- no claim that AK can replace `pi-vault-client` as the execution/replay surface today

## Planned files
- `docs/dev/v4-runtime-receipts-runtime-target-binding.md`
- `docs/dev/vault-execution-receipts.md`
- `README.md`
- `diary/2026-03-21-v4-runtime-receipts-runtime-target-binding.md`
