---
summary: "Session handoff for the canonical monorepo package pi-vault-client."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Canonical package session handoff artifact."
  compass: "Keep vault behavior stable while aligning with monorepo package conventions."
  engine: "Read package context -> implement one focused slice -> validate package and monorepo contracts."
  fog: "The main risk is reintroducing standalone-repo assumptions or bypassing shared pi-interaction package surfaces."
---

# Next session prompt for pi-vault-client

## Canonical package context

- canonical monorepo root: `~/ai-society/softwareco/owned/pi-extensions`
- canonical package path: `~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client`
- legacy standalone repo: deleted after archive-and-deprecation workflow completion

## First reads

1. `AGENTS.md`
2. `README.md`
3. `docs/dev/prompt-vault-v2-relocation-handoff.md`
4. `~/ai-society/core/prompt-vault/docs/dev/vault-client-relocation-interface.md`

## Current package state

- package scaffold now comes from `~/ai-society/softwareco/owned/pi-extensions-template/`
- legacy implementation was ported into the scaffolded package
- picker/fuzzy integration now routes through shared package surfaces:
  - `@tryinget/pi-trigger-adapter`
  - `@tryinget/pi-interaction-kit`
- package-local validation passes
- monorepo root validation passes

## Recommended next audit slice

1. check for remaining standalone-era assumptions in docs and scripts
2. verify publish/release expectations remain correct for monorepo package mode
3. decide whether package-local `tsconfig.json` should be restored intentionally or left omitted by design
4. keep any new runtime integration work in `packages/pi-vault-client` only

## Validation

Package-local:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
npm run check
```

Monorepo root:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions
./scripts/ci/full.sh
```
