---
summary: "Current-state assessment for integrating prompt-vault into autonomous-session-control."
read_when:
  - "Before implementing prompt-vault integration slices."
  - "When clarifying repo boundaries between autonomy and prompt management."
system4d:
  container: "Cross-repo contract assessment."
  compass: "Strong separation of concerns with reliable runtime integration."
  engine: "Discover -> map contracts -> identify gaps -> rank risks."
  fog: "Runtime behavior may diverge from docs unless validated with code."
---

# Prompt-vault Integration Assessment

## Scope and evidence

Analyzed:
- `~/ai-society/core/prompt-vault/`
- `~/.pi/agent/extensions/vault-client/`
- `~/programming/pi-extensions/pi-autonomous-session-control/`

Required discovery commands executed:
- `git -C ~/ai-society/core/prompt-vault log --oneline -20`
- `git -C ~/ai-society/core/prompt-vault status --short` (clean)

Additional evidence collected from:
- [prompt-vault schema](~/ai-society/core/prompt-vault/schema/schema.sql)
- [vault-client extension](~/.pi/agent/extensions/vault-client/index.ts)
- [vault-client evaluator](~/.pi/agent/extensions/vault-client/evaluator.ts)
- [self extension](../../extensions/self.ts)
- [subagent tool](../../extensions/self/subagent.ts)

## Post-implementation update (2026-03-03)

Implemented in this repo since initial assessment:
- Explicit prompt-envelope contract in `dispatch_subagent` (`prompt_name`, `prompt_content`, `prompt_tags`, `prompt_source`).
- Deterministic prompt injection + prompt provenance in result `details`.
- Soft-fail fallback guidance (`prompt_warning`) for partial/invalid envelopes.
- Quality-gate coverage for nested tests (`tests/**/*.test.*`) and mocked vault payload integration path.
- Default extension entrypoint now wires delegation runtime (resolving previous default-export drift).
- Package manifest includes `extensions/self/` runtime modules required by `extensions/self.ts`.

## Method prompts applied (from prompt-vault)

Using templates directly from `prompt_templates`:
- `meta-orchestration`
- `dependency-cartography`
- `blast-radius`
- `escape-hatch`
- `audit`
- `nexus`

### 1) meta-orchestration (phase + formalization)
- **PHASE:** Validation/design handoff
- **FORMALIZATION:** 2 (bounded run)
- **NEXT:** Promote to reusable workflow (phase plan + contract docs), then implement smallest safe slice.

### 2) dependency-cartography (hidden coupling)

**autonomous-session-control depends on:**
- Pi runtime tool/event API
- Internal state model (`self` resolvers)
- Spawned `pi` subprocess behavior (`dispatch_subagent`)

**It should depend on prompt-vault via:**
- `vault-client` tool surface (`vault_query`, `vault_retrieve`, etc.)
- stable response contract for prompt retrieval and prompt metadata

**Hidden coupling found (initial assessment):**
- Current autonomy repo has no explicit runtime contract with vault tools, so integration is implicit in model behavior.
- `dispatch_subagent` was only wired in `createExtension(...)`, while package default export registered only `self`; this created doc/runtime drift.

**Status update:**
- Prompt-envelope contract and default-entrypoint delegation wiring are now implemented in this repo.

### 3) blast-radius + escape-hatch

- Most integration risk is in runtime contract changes and tool-schema drift, not database schema.
- Safe first move is additive and reversible: add explicit prompt-envelope contract in this repo without changing prompt-vault schema.
- Escape hatch: feature flag / optional parameters, keep legacy `systemPrompt` path intact.

### 4) audit (bugs/debt/smells/gaps)

- **Bugs**
  - `vault_rate` fallback path attempts `execution_id=0`, which violates FK constraints in `feedback` (`feedback.execution_id -> executions.id`).
  - `logExecution` writes `entity_version = 1` instead of template version.
- **Debt**
  - No shared typed contract package between this repo and vault-client.
  - Live cross-extension tests can still skip in environments missing runtime dependencies.
- **Smells**
  - Docs claim broader integration than runtime wiring currently provides.
  - Mixed contract style: rich slash-commands + text-heavy tool outputs, but weak structured details for autonomous chaining.
- **Gaps**
  - End-to-end pattern for `self -> vault -> dispatch_subagent` exists, but still depends on text parsing in some paths.
  - No migration/rollback playbook for cross-repo contract updates.

### 5) nexus (highest-leverage first slice)

**Nexus:** define and implement a minimal, explicit **Prompt Envelope contract** for autonomy orchestration.

Why this is highest leverage:
1. Enables immediate end-to-end use of prompt-vault prompts in `dispatch_subagent`.
2. Preserves separation (prompt retrieval in vault-client, orchestration in autonomy repo).
3. Creates a stable seam for telemetry/error handling improvements later.

## Current state by repository

## 1) prompt-vault (core)

What changed recently:
- v1.2.0 added LLM-oriented vault tools, tag vocabulary, and tagging script.
- Schema remains versioned (`schema_version`) and currently at version 1.

Available data model relevant to integration:
- Prompt retrieval: `prompt_templates` (name/content/type/tags/version/status)
- Execution telemetry: `executions`
- Evaluation storage: `feedback`
- Variant storage: **not in baseline schema**; `prompt_variants` is created dynamically by extension evaluator.

## 2) vault-client extension

Exposes:
- LLM tools: `vault_query`, `vault_retrieve`, `vault_vocabulary`, `vault_insert`, `vault_rate`, `prompt_eval`
- Human commands: `/vault:*`, `/vaults`, `/vault-search`, `/route`, `/vault-stats`

Contract observations:
- Good retrieval/query surface exists.
- `prompt_eval` persists variants (`prompt_variants`) but does not persist full A/B test results.
- `vault_retrieve` returns text-heavy output; structured metadata is limited in `details`.

## 3) autonomous-session-control (this repo)

Current integration status (updated):
- Prompt-envelope contract is implemented in code and consumed by `dispatch_subagent`.
- `dispatch_subagent` includes prompt-vault-aware envelope fields and provenance details.
- Changelog correctly notes `prompt_eval` moved out to vault-client.

Runtime wiring status:
- Default export in [extensions/self.ts](../../extensions/self.ts) now registers both `self` and delegation runtime.
- `dispatch_subagent` is active in default package load path.

## Integration contract map (target)

## Responsibilities

### Stays in prompt-vault / vault-client
- Template storage/versioning/query
- Tag vocabulary governance
- Prompt insert/update/rating
- Prompt experiment and variant management
- Vault-side telemetry tables and schema versioning

### Stays in autonomous-session-control
- Autonomy reasoning (`self`)
- Delegation/execution (`dispatch_subagent`)
- Choosing when to request and apply cognitive prompts
- Fallback behavior when vault tools are unavailable

## Minimal API contract between repos

Required from vault-client:
1. Retrieve prompt content by name (`vault_retrieve`)
2. Search by tags/keywords (`vault_query`)
3. Optional feedback hook (`vault_rate`)

Required in this repo:
1. Accept a **prompt envelope** into delegation path
2. Attach prompt content to subagent system prompt deterministically
3. Preserve provenance in tool result details
4. Fail soft when prompt envelope absent/invalid

## Critical gap analysis

## Runtime contracts
- Prompt-envelope schema is now explicit in autonomy repo (`dispatch_subagent` fields + provenance + fallback warning).
- Remaining gap: no handshake that guarantees vault-tool availability before orchestration decisions.

## Error handling / fallback behavior
- Partial/invalid prompt envelopes now fail soft with actionable `prompt_warning` guidance.
- Remaining upstream gap: `vault_rate` behavior is brittle when no prior execution row exists.

## Data model compatibility
- `prompt_variants` lives outside baseline schema migration path.
- No shared versioned contract package for template payload shape between repos.

## Observability / evidence
- Autonomy repo now emits prompt provenance in delegation results.
- Remaining gap: vault telemetry still over-represents slash-command usage (`/vault:*`) vs autonomous tool usage.

## Security / policy boundaries
- Raw SQL execution in vault-client is local and direct; no capability-scoped API boundary.
- Prompt-injection provenance is now explicit, but policy enforcement on allowed prompt sources/tags is still advisory.

## Migration / rollback
- Compatibility guard notes are now documented in implementation plan.
- Remaining gap: no automated compatibility check at runtime across repo versions.

## Test strategy
- Integration-oriented mocked vault payload tests now cover prompt envelope application/fallback.
- Live prompt-vault DB integration test now validates template retrieval compatibility with envelope application (`tests/prompt-vault-db-integration.test.mjs`).
- Nested self tests are now exercised by CI quality gate.
- Remaining gap: live cross-extension integration test exists but may skip in CI when runtime dependencies/environment are unavailable.

## Risk register

1. **Contract drift risk (medium):** prompt envelope seam exists, but cross-repo payload evolution still lacks shared typed package.
2. **Runtime mismatch risk (reduced):** default wiring mismatch has been resolved in this repo.
3. **Telemetry trust risk (medium):** feedback/execution linkage is still inconsistent upstream.
4. **Schema drift risk (medium):** evaluator-managed tables bypass migration discipline.
5. **Security boundary risk (medium):** provenance is explicit, but no strict enforcement policy yet.

## Conclusion

The ecosystem now has sufficient primitives for proper integration, and this repo now has an explicit orchestration contract with fallback behavior.

Best next step: continue Phase 2 hardening around runtime compatibility checks, live cross-extension integration testing, and upstream telemetry linkage fixes.
