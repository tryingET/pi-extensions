---
summary: "Historical vault-client relocation handoff; current live client target is Prompt Vault schema v9."
read_when:
  - "You need historical relocation context from the earlier Prompt Vault v2 transition."
  - "You want archival provenance before following the current v9 cutover guidance."
system4d:
  container: "Historical relocation note retained for provenance inside the monorepo package."
  compass: "Do not let this archival note override the current Prompt Vault v9 boundary."
  engine: "Use for history only -> follow current v9 package/docs/runtime guidance for implementation."
  fog: "The risk is skimming this note and accidentally reviving superseded v2/v3 assumptions."
---

# Historical vault-client relocation handoff (superseded by v9 cutover)

> Current implementation target: Prompt Vault schema v9.
> Use [Prompt Vault v9 cutover](v9-cutover.md) plus the live Prompt Vault boundary docs before changing runtime behavior.

## Status of this standalone repo
This repo is **not** the right long-term target for continuing live Prompt Vault integration work.

Why:
- `vault-client` is moving to:
  - `~/ai-society/softwareco/owned/pi-extensions/packages/`
- architecture there has already moved/refactored relative to this standalone repo
- old assumptions here, especially direct `pi-input-triggers` coupling, may no longer hold
- mid-session work here produced partial exploratory changes, but not a trustworthy final package migration

## What this repo is still useful for
Use this repo only as a temporary reference for:
- previous vault-client behavior shape
- command/tool names
- rough examples of facet-native query logic
- rough examples of schema mismatch fail-fast behavior

Do **not** treat this repo as canonical for final implementation.

## Shared source of truth for Prompt Vault behavior
Read the Prompt Vault-side boundary note first:

- `~/ai-society/core/prompt-vault/docs/dev/vault-client-relocation-interface.md`

That file is the shared contract/handoff for:
- schema version expectations
- facet ontology expectations
- canonical router fixtures
- Prompt Vault validation state
- what client behavior must now be facet-native

This file intentionally does **not** duplicate those details.

## What happened in the interrupted session
A partial sync happened into:
- `~/.pi/agent/extensions/vault-client/`
- this standalone repo

That work helped clarify the required behavior, but should be treated as exploratory only.

The important retained insight is:
- port the **behavioral changes**
- do **not** port the old repo structure blindly

## Correct next implementation target
Start in:
- `~/ai-society/softwareco/owned/pi-extensions/packages/`

Then find:
- the relocated `vault-client` package
- the replacement for old trigger integration
- the new command/tool registration boundaries
- the new build/check/reload flow

## First steps in the relocated package
1. Find the new `vault-client` package root.
2. Read its local `AGENTS.md` / next-session note / package README if present.
3. Identify the current equivalents of:
   - query helpers
   - picker integration
   - slash command registration
   - tool registration
   - runtime sync/deploy path
4. Port the current Prompt Vault behavior from the shared Prompt Vault contract note.
5. Validate in the new package’s own quality gate.

## Porting rule
Port these as concepts:
- hard fail-fast against the current live Prompt Vault schema/version boundary
- facet-native template model
- facet-native tool parameters and output labels
- cognitive framework lookup via `artifact_kind = cognitive`
- facet-aware stats/list/search/picker display

Do not port these blindly:
- direct imports from old `pi-input-triggers`
- old standalone file/module layout
- temporary partial refactors from this interrupted session
- assumptions about the active runtime copy under `~/.pi/agent/extensions/`

## Cleanup stance
No further cleanup/refactor effort should be spent in this standalone repo unless explicitly needed for archival or transition support.
