---
summary: "Agent instructions for pi-tool-execution-boundary."
read_when:
  - "Starting work in this package."
  - "Changing policy semantics, controller durability, protocol, or execution placement."
---

# AGENTS.md

## Scope

This package owns generic Pi computer-effect placement. It does not own model inference, workstation model lifecycle, external SaaS authority, or automatic Git promotion.

## Mandatory invariants

1. Effect and durability derive only from the closed operation variant.
2. Request identity binds every normalized effect-relevant input.
3. Human policy never reaches a backend renderer; only compiled semantic plans do.
4. D1 effects never start without durable authority.
5. Unknown D1 effects quarantine; they are never blindly retried.
6. Runtime activation requires a verified production backend identity and exact attestation binding.
7. No failure may fall back to host execution.
8. Test doubles stay under `tests/support/`, are unpublished, and cannot satisfy runtime types.
9. Real effects remain disabled until the owner-workstation backend and guest-TCB gates pass.

## Required checks

```bash
npm run vectors:generate
npm run proto:lint
npm run proto:generate
npm test
npm run validate:artifacts
npm run rust:test
TLA2TOOLS_JAR=/path/to/tla2tools.jar npm run formal:check
```
