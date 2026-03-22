---
summary: "Hard-cut runbook for Prompt Vault schema v9 in pi-vault-client, including compatibility diagnostics and isolated validation commands."
read_when:
  - "Cutting pi-vault-client over to Prompt Vault schema v9."
  - "Verifying that /vault, /vault:, and tool surfaces run against the live Prompt Vault without schema-era drift."
system4d:
  container: "Package-local client/runtime cutover to the live Prompt Vault v9 contract."
  compass: "Prefer one truthful v9 boundary over soft dual-stack compatibility."
  engine: "Fail fast on mismatch -> surface exact diagnostics -> validate in isolated pi runtime."
  fog: "Main risks are stale docs, hidden global extension interference, and treating tags/v8 as still canonical."
---

# Prompt Vault v9 cutover

## Scope
This package now treats **Prompt Vault schema v9** as the only supported live contract.

Do:
- fail fast on non-v9 Prompt Vault DBs
- require v9 execution capture columns in compatibility checks
- validate in an isolated pi runtime when proving live behavior

Do not:
- reintroduce `tags`
- claim v8 support
- rely on unrelated global extensions loading cleanly during validation

## Required Prompt Vault v9 boundary

### Prompt template columns
- `artifact_kind`
- `control_mode`
- `formalization_level`
- `owner_company`
- `visibility_companies`
- `controlled_vocabulary`
- `export_to_pi`
- `version`

### Execution columns
- `id`
- `entity_type`
- `entity_id`
- `entity_version`
- `input_context`
- `model`
- `output_capture_mode`
- `output_text`
- `success`

### Feedback columns
- `execution_id`
- `rating`
- `notes`
- `issues`

## Runtime behavior
- startup compatibility checks require schema version `9`
- `/vault-check` reports expected vs actual version and missing column groups
- `vault_schema_diagnostics()` stays available on the tool surface even in schema-mismatch diagnostic mode
- `vault_query` and `vault_retrieve` stay facet-native and visibility-aware when the schema is healthy
- `/vault` and `/vault:` remain execution surfaces above raw retrieval

## Validation

### Package-local gate
```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
npm run check
```

### Isolated headless schema-diagnostic smoke
```bash
PI_COMPANY=software \
pi --no-extensions -e ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client -p \
  "Call vault_schema_diagnostics, then reply with only SUCCESS or FAILURE based on whether the tool call succeeded."
```

### Isolated headless query smoke
```bash
PI_COMPANY=software \
pi --no-extensions -e ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client -p \
  "Call vault_query with limit 1 and include_content false, then reply with only SUCCESS or FAILURE based on whether the tool call succeeded."
```

### Focused live-trigger contract lane
```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
npm run test:compat:live-trigger-contract
```

This lane protects the shared `/vault:` seam specifically:
- shared trigger broker behavior
- live trigger registration
- `150ms` debounce / rate-limiting contract
- bare `/vault:` query-prompt behavior
- picker fallback behavior

### Root-owned compatibility canary scenario
```bash
cd ~/ai-society/softwareco/owned/pi-extensions
npm run compat:canary -- --profile current --scenario vault-live-trigger-contract
```

### Isolated interactive slash-command smoke
```bash
export PI_COMPANY=software
pi --no-extensions -e ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
# then inside pi:
# /vault-check
# /vault meta-orchestration
# /vault:meta-orchestration
```

## Verified fast-path outcome
A truthful v9 cutover is complete when all of the following are true:
1. `npm run check` passes
2. temp-Dolt integration passes against Prompt Vault schema v9
3. isolated headless `vault_schema_diagnostics` smoke succeeds
4. isolated headless `vault_query` smoke succeeds
5. `npm run test:compat:live-trigger-contract` passes for the shared `/vault:` seam
6. the root-owned `vault-live-trigger-contract` compatibility canary scenario passes
7. interactive `/vault-check` no longer reports a stale schema requirement
8. `/vault` and `/vault:` exact-name paths work without schema-gating failures
