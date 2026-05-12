---
summary: "Controlled cutover closeout for replacing npm:pi-prompt-template-model with pi-prompt-template-execution."
read_when:
  - "Preparing, reviewing, or auditing prompt-template execution live cutover state."
  - "Checking why Pi core /commit prompt metadata is not counted as a duplicate execution owner."
---

# pi-prompt-template-execution live cutover closeout

## Status

Phase 4 controlled live cutover is **complete**.

Current live owner:

- installed package: local `packages/pi-prompt-template-execution`
- live extension entrypoint: `packages/pi-prompt-template-execution/extensions/prompt-template-execution.js`
- removed package: `npm:pi-prompt-template-model`
- live `/commit` prompt: `/home/tryinget/.pi/agent/prompts/commit.md`
- live `/commit` model frontmatter:
  ```yaml
  model: zai/glm-5.1
  ```

`packages/pi-prompt-template-execution/` is now a root-managed live extension package. It registers prompt-template execution commands through the guarded registration path and does not expose `package.json#pi.prompts` or prompt bundles.

## Preconditions that were verified before cutover

1. Candidate package checks passed:
   ```bash
   cd packages/pi-prompt-template-execution
   npm run check
   ```
   Closure count after adding live-entrypoint tests: 62 tests passing.
2. Shared model resolver checks passed:
   ```bash
   cd packages/pi-interaction/pi-model-selection
   npm run check
   ```
   Closure count: 12 tests passing.
3. Compaction candidate checks passed, proving prompt execution did not couple to compaction:
   ```bash
   cd packages/pi-session-compaction
   npm run check
   ```
   Closure count: 61 tests passing.
4. Before cutover, candidate manifests were still non-live and the safety report blocked while the external package and `/commit` collision were present.
5. The operator explicitly approved proceeding despite Pi core prompt metadata also exposing `/commit`.

## Cutover actions completed

```bash
pi remove npm:pi-prompt-template-model
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-execution
/reload
```

Prompt Vault export was also refreshed so the live prompt markdown remains governed by Prompt Vault:

```bash
cd /home/tryinget/ai-society/core/prompt-vault
./scripts/export-to-pi.sh
```

The `commit` template has `export_to_pi=1` and exports to `/home/tryinget/.pi/agent/prompts/commit.md`.

## No-double-registration interpretation after cutover

The post-cutover invariant is:

> exactly one extension execution owner for `/commit`.

Pi core may still expose a prompt-source `/commit` entry from `~/.pi/agent/prompts/commit.md`. That entry is expected after Prompt Vault export and is treated as prompt metadata/template expansion visibility, not as a duplicate prompt-template execution owner.

The live entrypoint therefore filters `source: "prompt"` and `source: "skill"` commands out of extension-owner collision checks while still blocking existing extension command owners.

## Live proof captured

A safe throwaway probe ran `/commit PTX_SENTINEL_ARGUMENTS` from a throwaway repo with the current model set to `openai-codex/gpt-5.4`. The probe aborted before provider execution.

Observed sequence:

1. model switched from `openai-codex/gpt-5.4` to `zai/glm-5.1`
2. rendered prompt contained the commit orchestrator body
3. `$ARGUMENTS` substituted `PTX_SENTINEL_ARGUMENTS`
4. model restored from `zai/glm-5.1` to `openai-codex/gpt-5.4`

Additional proof:

- `pi list` no longer lists `npm:pi-prompt-template-model`
- the old npm package directory is absent
- `pi list` lists local `packages/pi-prompt-template-execution`
- a fresh command snapshot shows one extension `/commit` owner from `extensions/prompt-template-execution.js`
- no `chain-prompts` or `prompt-tool` successor commands are registered
- no `pi-session-compaction` commands are registered

## Owner boundaries after cutover

- `pi-prompt-template-execution` owns prompt-template model/thinking/restore/args/conditionals/skill preparation semantics.
- `pi-prompt-template-accelerator` remains picker/prefill UX only.
- `pi-society-orchestrator` remains loop/chain/workflow owner.
- ASC remains subagent/runtime execution owner.
- `pi-session-compaction` remains the separate compaction-summary owner. It was non-live during prompt-template cutover and later moved to its own guarded live cutover without coupling to prompt-template execution.

## Rollback plan

If the successor fails in live use:

1. Disable or remove the successor package:
   ```bash
   pi remove /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-execution
   ```
2. Reinstall or re-enable the external owner:
   ```bash
   pi install npm:pi-prompt-template-model
   ```
3. Reload Pi:
   ```text
   /reload
   ```
4. Verify `/commit` exists as an extension command again.
5. Verify `/commit` still honors `model: zai/glm-5.1` on a safe throwaway repo or dry-run equivalent.
6. Record the failure mode as a compatibility canary or safety-report fixture before attempting cutover again.

Rollback should prefer restoring known working `/commit` behavior over preserving the attempted successor install.
