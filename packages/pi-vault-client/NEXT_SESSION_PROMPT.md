---
summary: "Session handoff for the canonical monorepo package pi-vault-client after merging the migration branch to main."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Canonical package session handoff artifact."
  compass: "Keep Prompt Vault v2 behavior stable while cleaning up remaining migration drift."
  engine: "Re-read package context -> verify current v2 state -> remove stale standalone assumptions -> validate package and monorepo contracts."
  fog: "Main risk is wasting time re-proving the migration instead of auditing the remaining edge cases and documentation drift."
---

# Next session prompt for pi-vault-client

## Canonical package context

- canonical monorepo root: `~/ai-society/softwareco/owned/pi-extensions`
- canonical package path: `~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client`
- current branch baseline: `main`
- legacy standalone repo: retired from active development

## First reads

1. `AGENTS.md`
2. `README.md`
3. `docs/dev/prompt-vault-v2-relocation-handoff.md`
4. `docs/dev/template-drift-audit.md`
5. `~/ai-society/core/prompt-vault/docs/dev/vault-client-relocation-interface.md`

## Current package state

- migration branch has been merged to `main`
- `pi-vault-client` now lives canonically in the monorepo package path above
- Prompt Vault v2 / schema v3 behavior appears already integrated:
  - runtime requires schema version `3`
  - runtime checks for facet columns:
    - `artifact_kind`
    - `control_mode`
    - `formalization_level`
  - query / retrieve / insert / vocabulary logic is facet-native
- picker/fuzzy integration now routes through shared package surfaces:
  - `@tryinget/pi-trigger-adapter`
  - `@tryinget/pi-interaction-kit`
- package-local validation passed during merge/push
- monorepo root validation passed during merge/push

## What not to redo

- do **not** resume work from the retired standalone repo
- do **not** reintroduce legacy `type`-based Prompt Vault assumptions
- do **not** treat `~/.pi/agent/extensions/vault-client/` as canonical source
- do **not** spend time re-proving whether v2 exists; start from the assumption that schema-v3 support is already present and audit the remaining gaps

## Recommended next audit slice

1. search `packages/pi-vault-client` for any remaining standalone-era assumptions in docs, scripts, and tests
2. verify there are no lingering legacy `type` references or old vocabulary expectations in package-local docs/tests
3. verify publish/release expectations are still correct for monorepo package mode
4. decide whether package-local `tsconfig.json` should be restored intentionally or remain omitted by design
5. keep any new runtime integration work in `packages/pi-vault-client` only

## Suggested commands

Package-local:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
npm run check
npm run docs:list
rg -n "\btype\b|pi-input-triggers|standalone|~/programming/pi-extensions|~/.pi/agent/extensions/vault-client" .
```

Monorepo root:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions
./scripts/ci/full.sh
```

## Success condition for next session

By the end of the next session:
- either confirm there is no meaningful standalone-era drift left,
- or produce a small, explicit cleanup diff that removes the remaining drift without changing stable Prompt Vault v2 runtime behavior.
