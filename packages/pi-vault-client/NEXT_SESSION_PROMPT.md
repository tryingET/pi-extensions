---
summary: "pi-vault-client is now aligned to Prompt Vault schema v9 with diagnostic-mode startup behavior and passing package/local isolated checks; the next truthful slice is live installed-runtime verification for `/vault`, `/vault:`, and `/vault-check`, not reopening old tags/v8/PTX regressions."
read_when:
  - "Starting the next focused session in packages/pi-vault-client."
  - "Deciding whether the next slice still belongs here or should move to Prompt Vault or PTX."
system4d:
  container: "Canonical post-cutover handoff for the current pi-vault-client runtime state."
  compass: "Preserve the completed schema-v9 cutover, avoid stale regression narratives, and focus only on remaining live-runtime evidence gaps in this package."
  engine: "Reacquire current truth -> verify installed runtime behavior -> record evidence -> stop unless a real vault regression appears."
  fog: "Main risks are resuming from stale v8/tags/PTX assumptions, patching the wrong repo, or mistaking adjacent runtime issues for vault-client regressions."
---

# Next session prompt for `pi-vault-client`

## One-line handoff

`pi-vault-client` should now be treated as **functionally repaired** for Prompt Vault schema v9: the package targets v9, exposes detailed schema diagnostics, remains loaded in diagnostic mode on mismatch, and passes package checks plus isolated headless tool validation. The next truthful work here is **installed interactive runtime verification** for `/vault`, live `/vault:`, and `/vault-check` after `/reload`.

## Current package truth

### What is now true
- Prompt Vault schema compatibility is **v9 only**.
- Schema diagnostics are now first-class:
  - `checkSchemaCompatibilityDetailed()` in the runtime
  - `vault_schema_diagnostics()` on the tool surface
  - `/vault-check` in the interactive TUI
- On schema mismatch:
  - the extension stays loaded in diagnostic mode
  - `/vault-check` and `vault_schema_diagnostics()` remain available
  - vault query/mutation/live-trigger surfaces stay gated
- Query/retrieval behavior is facet-native only:
  - `artifact_kind`
  - `control_mode`
  - `formalization_level`
  - `controlled_vocabulary`
  - `owner_company`
  - `visibility_companies`
- No tag-based compatibility behavior should be reintroduced.
- `/vault` exact-name and live `/vault:` exact-name transform paths are covered by package-local tests.

### Verified in-package evidence
From `~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client`:
```bash
npm run check
npm run docs:list
```

Both passed after the v9 + diagnostic-mode work.

### Verified isolated live evidence
These isolated runs already succeeded:
```bash
PI_COMPANY=software \
pi --no-extensions -e /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client -p \
  "Call vault_schema_diagnostics, then reply with only SUCCESS or FAILURE based on whether the tool call succeeded."

PI_COMPANY=software \
pi --no-extensions -e /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client -p \
  "Call vault_query with limit 1 and include_content false, then reply with only SUCCESS or FAILURE based on whether the tool call succeeded."

PI_COMPANY=software \
pi --no-extensions -e /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client -p \
  "Call vault_retrieve for the exact name meta-orchestration with include_content true, then reply with only SUCCESS or FAILURE based on whether the tool call succeeded."
```

## What is **not** the current problem here

Do **not** resume from these stale assumptions unless new evidence forces it:
- `/vault` still broken because of `tags`
- schema-v8 compatibility still current
- PTX `$$ /...` issues belong to this package
- Prompt Vault itself needs patching because of a client-side runtime symptom

## Remaining honest uncertainty in this package

### Primary remaining gap
Installed interactive parity proof is still thinner than the package-local + isolated-headless proof.

The remaining high-value evidence here is:
1. install/reload in a normal Pi runtime
2. run `/vault-check`
3. run `/vault meta-orchestration`
4. run `/vault:meta-orchestration`
5. confirm editor/result behavior matches the documented contract

### Secondary cross-repo doc debt
Prompt Vault-side boundary docs may still contain stale v8 wording in `~/ai-society/core/prompt-vault/docs/dev/...`.
That is a **Prompt Vault docs** task, not a reason to reopen runtime changes here unless a live vault-client defect reappears.

## Recommended next step in this repo

### Single best next step
Capture durable installed interactive evidence for:
- `/vault-check`
- `/vault <exact-name>`
- live `/vault:<exact-name>`

### Live pass kickoff
```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
npm run check
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
```

Then inside Pi:
```text
/reload
/vault-check
/vault meta-orchestration
/vault:meta-orchestration
```

## Repo routing rule
If the next session is about:
- **`/vault`, `/vault:`, `/vault-check`, schema diagnostics, or Prompt Vault client runtime correctness** → stay here in `pi-vault-client`
- **Prompt Vault schema/contracts/data or stale Prompt Vault-side boundary docs** → move to `~/ai-society/core/prompt-vault`
- **PTX `$$ /...` picker/prefill behavior** → move to `../pi-prompt-template-accelerator`
- **semantic-organism / AK bridge design** → move to Prompt Vault + agent-kernel, not here

## Read first next time
1. `AGENTS.md`
2. `README.md`
3. `docs/dev/status.md`
4. `NEXT_SESSION_PROMPT.md`
5. `docs/dev/v9-cutover.md`
6. `~/ai-society/core/prompt-vault/docs/dev/vault-client-relocation-interface.md`
7. `~/ai-society/core/prompt-vault/docs/dev/vault-client-company-visibility-boundary.md`

## Files most relevant right now
- `extensions/vault.ts`
- `src/vaultCommands.ts`
- `src/vaultDb.ts`
- `src/vaultTools.ts`
- `src/vaultPicker.ts`
- `src/vaultGrounding.ts`
- `src/vaultTypes.ts`
- `tests/vault-query-regression.test.mjs`
- `tests/vault-dolt-integration.test.mjs`
- `tests/vault-commands.test.mjs`
- `tests/vault-update.test.mjs`

## Success condition for the next slice
A truthful next session in this repo is successful if it cleanly does all of the following:
1. verifies installed interactive `/vault-check` behavior after `/reload`
2. verifies installed `/vault meta-orchestration` exact-name load behavior
3. verifies installed live `/vault:meta-orchestration` exact-name behavior
4. records any runtime mismatch as real evidence before making more code changes
5. leaves PTX and Prompt Vault-doc drift to their owning repos unless new evidence proves otherwise
