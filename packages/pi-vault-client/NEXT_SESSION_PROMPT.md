---
summary: "Session handoff for the canonical monorepo package pi-vault-client after the Prompt Vault schema-v7 boundary refactor."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Canonical package session handoff artifact."
  compass: "Keep vault-client aligned to the Prompt Vault schema-v7 boundary without reintroducing legacy tags, standalone drift, or overlapping command surfaces."
  engine: "Re-read package context -> verify schema-v7 consumer behavior -> validate exact-match/picker UX -> clean remaining docs/tests drift -> re-run package checks."
  fog: "Main risk is resuming from outdated v2/v3 assumptions or accidentally widening the command surface again after it was intentionally simplified."
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
3. `docs/dev/template-drift-audit.md`
4. `NEXT_SESSION_PROMPT.md`
5. `~/ai-society/core/prompt-vault/docs/dev/vault-client-relocation-interface.md`
6. `~/ai-society/core/prompt-vault/docs/dev/vault-client-company-visibility-boundary.md`

## Current package state

- `pi-vault-client` is now aligned to the Prompt Vault schema-v7 boundary
- runtime requires schema version `7`
- runtime checks for these prompt columns:
  - `artifact_kind`
  - `control_mode`
  - `formalization_level`
  - `owner_company`
  - `visibility_companies`
  - `controlled_vocabulary`
  - `export_to_pi`
- client behavior is now contract-driven from Prompt Vault repo artifacts:
  - `ontology/v2-contract.json`
  - `ontology/controlled-vocabulary-contract.json`
  - `ontology/company-visibility-contract.json`
- tag-based assumptions were removed from vault query/insert/vocabulary behavior
- vault query behavior now separates:
  - ontology filters
  - governance filters
  - controlled-vocabulary filters
- implicit company visibility filtering is applied by default via current runtime company context
- picker/fuzzy integration still routes through shared package surfaces:
  - `@tryinget/pi-trigger-adapter`
  - `@tryinget/pi-interaction-kit`
- command surface was intentionally simplified:
  - kept:
    - `/vault`
    - live `/vault:`
    - `/vault-search`
    - `/route`
    - `/vault-stats`
    - `/vault-live-telemetry`
    - `/vault-fzf-spike`
  - removed:
    - `/vault-browse`
    - `/vault-browser`
    - `/vault-select`
    - `/vault-list`
- `/vault <name>` now resolves an exact visible match directly before falling back to picker behavior
- package-local validation currently passes

## What not to redo

- do **not** resume work from the retired standalone repo
- do **not** reintroduce legacy `type`-based Prompt Vault assumptions
- do **not** reintroduce prompt tags or namespaced tags into vault-client query/insert logic
- do **not** infer ontology or controlled vocabulary from current live rows when the contract files already define them
- do **not** widen the command surface again unless there is a strong product reason
- do **not** treat `~/.pi/agent/extensions/vault-client/` as canonical source

## Recommended next audit slice

1. update package docs to match schema-v7 behavior and simplified command surface
2. verify live runtime UX for:
   - `/vault`
   - `/vault <exact-name>`
   - `/vault <fuzzy-query>`
   - live `/vault:`
3. decide whether to add a small explicit inspect/health surface such as:
   - `/vault-show <name>`
   - `/vault-check`
4. audit whether `meta-orchestration` and `next-10-expert-suggestions` are guaranteed visible in the intended company contexts
5. verify current company detection is acceptable or needs a stricter runtime source
6. decide whether `src/vaultPicker.ts` still contains now-unused browser/report helpers that should be pruned
7. decide whether package-local `tsconfig.json` should be restored intentionally or remain omitted by design

## Suggested commands

Package-local:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
npm run check
npm run docs:list
rg -n "\btype\b|\btags\b|pi-input-triggers|standalone|vault-browse|vault-browser|vault-select|vault-list|~/.pi/agent/extensions/vault-client" .
```

Prompt Vault boundary reads/checks:

```bash
cd ~/ai-society/core/prompt-vault
./verify.sh
rg -n "schema version|controlled_vocabulary|visibility_companies|owner_company" docs/dev ontology schema tests
```

Monorepo root:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions
./scripts/ci/full.sh
```

## Success condition for next session

By the end of the next session:
- docs and handoff notes in `packages/pi-vault-client` reflect schema-v7 reality,
- live `/vault` and `/vault:` behavior is confirmed coherent for exact-match vs picker flows,
- and any remaining cleanup is a small, explicit diff that preserves the Prompt Vault schema-v7 boundary.
