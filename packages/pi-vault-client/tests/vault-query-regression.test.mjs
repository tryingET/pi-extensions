import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const DB_SOURCE = readFileSync(new URL("../src/vaultDb.ts", import.meta.url), "utf8");
const PICKER_SOURCE = readFileSync(new URL("../src/vaultPicker.ts", import.meta.url), "utf8");
const COMMANDS_SOURCE = readFileSync(new URL("../src/vaultCommands.ts", import.meta.url), "utf8");
const TOOLS_SOURCE = readFileSync(new URL("../src/vaultTools.ts", import.meta.url), "utf8");
const TYPES_SOURCE = readFileSync(new URL("../src/vaultTypes.ts", import.meta.url), "utf8");
const GROUNDING_SOURCE = readFileSync(new URL("../src/vaultGrounding.ts", import.meta.url), "utf8");
const RENDERER_SOURCE = readFileSync(
  new URL("../src/templateRenderer.js", import.meta.url),
  "utf8",
);
const EXTENSION_SOURCE = readFileSync(new URL("../extensions/vault.ts", import.meta.url), "utf8");
const RECEIPTS_SOURCE = readFileSync(new URL("../src/vaultReceipts.ts", import.meta.url), "utf8");
const FUZZY_SELECTOR_SOURCE = readFileSync(
  new URL("../src/fuzzySelector.js", import.meta.url),
  "utf8",
);
const TRIGGER_ADAPTER_SOURCE = readFileSync(
  new URL("../src/triggerAdapter.js", import.meta.url),
  "utf8",
);
const PACKAGE_JSON_SOURCE = readFileSync(new URL("../package.json", import.meta.url), "utf8");

test("vault runtime targets Prompt Vault schema v9", () => {
  assert.match(TYPES_SOURCE, /const\s+SCHEMA_VERSION\s*=\s*9/);
  assert.match(TYPES_SOURCE, /const\s+DEFAULT_VAULT_QUERY_LIMIT\s*=\s*20/);
  assert.match(DB_SOURCE, /SELECT MAX\(version\) AS version FROM schema_version/);
  assert.match(EXTENSION_SOURCE, /registerVaultDiagnosticsTool\(pi, vaultRuntime\)/);
  assert.match(EXTENSION_SOURCE, /createVaultReceiptManager\(vaultRuntime\)/);
  assert.match(EXTENSION_SOURCE, /registerVaultCommands\(pi, runtime, receiptManager\)/);
  assert.match(EXTENSION_SOURCE, /formatMissingColumns\("prompt_templates"/);
  assert.match(EXTENSION_SOURCE, /missingPromptTemplateColumns/);
  assert.match(EXTENSION_SOURCE, /formatMissingColumns\("executions"/);
  assert.match(EXTENSION_SOURCE, /missingExecutionColumns/);
  assert.match(EXTENSION_SOURCE, /checkSchemaCompatibilityDetailed\(\)/);
  assert.match(EXTENSION_SOURCE, /expected=\$\{SCHEMA_VERSION\}/);
  assert.match(EXTENSION_SOURCE, /actual=\$\{schemaReport\.actualVersion \?\? "unknown"\}/);
});

test("schema compatibility requires governed prompt columns plus execution capture/provenance and feedback binding", () => {
  for (const column of [
    "artifact_kind",
    "control_mode",
    "formalization_level",
    "owner_company",
    "visibility_companies",
    "controlled_vocabulary",
    "export_to_pi",
    "version",
    "entity_version",
    "output_capture_mode",
    "output_text",
    "execution_id",
    "rating",
    "notes",
    "issues",
  ]) {
    assert.match(DB_SOURCE, new RegExp(`"${column}"`));
  }
  assert.match(TYPES_SOURCE, /interface\s+SchemaCompatibilityReport/);
  assert.match(
    TYPES_SOURCE,
    /checkSchemaCompatibilityDetailed:\s*\(\)\s*=>\s*SchemaCompatibilityReport/,
  );
  assert.match(
    DB_SOURCE,
    /function\s+checkSchemaCompatibilityDetailed\(\): SchemaCompatibilityReport/,
  );
  assert.match(DB_SOURCE, /expectedVersion: SCHEMA_VERSION/);
  assert.match(DB_SOURCE, /actualVersion,/);
  assert.match(DB_SOURCE, /missingPromptTemplateColumns/);
  assert.match(DB_SOURCE, /missingExecutionColumns/);
  assert.match(DB_SOURCE, /missingFeedbackColumns/);
});

test("vault_query uses centralized Pi-visible filtering with explicit execution context when available", () => {
  assert.match(
    DB_SOURCE,
    /function\s+buildVisibilityPredicate\(company = getCurrentCompany\(\), alias\?: string\)/,
  );
  assert.match(
    DB_SOURCE,
    /JSON_SEARCH\(\$\{qualifyTemplateColumn\("visibility_companies", alias\)\}, 'one', '\$\{escapeSql\(company\)\}'\) IS NOT NULL/,
  );
  assert.match(DB_SOURCE, /function\s+buildPiVisibleTemplatePredicate\(/);
  assert.match(
    DB_SOURCE,
    /COALESCE\(\$\{qualifyTemplateColumn\("export_to_pi", alias\)\}, 0\) <> 0/,
  );
  assert.match(
    DB_SOURCE,
    /const visibilityCompany = filters\.visibility_company \|\| companyContext\.company/,
  );
  assert.match(TOOLS_SOURCE, /resolveToolExecutionContext\(runtime, ctx\)/);
  assert.match(TOOLS_SOURCE, /runtime\.queryTemplatesDetailed\([\s\S]*executionContext/);
  assert.doesNotMatch(TOOLS_SOURCE, /getVaultQueryError/);
  assert.doesNotMatch(
    TOOLS_SOURCE,
    /# Vault Query Results \(\$\{templates\.length\}\)\\n\\n`;\s*output \+= `- current_company:/,
  );
});

test("vault_query supports controlled vocabulary filters instead of tags", () => {
  assert.match(DB_SOURCE, /function\s+buildControlledVocabularyClauses\(/);
  assert.match(DB_SOURCE, /JSON_UNQUOTE\(JSON_EXTRACT\(controlled_vocabulary/);
  assert.match(TOOLS_SOURCE, /controlled_vocabulary/);
  assert.match(TOOLS_SOURCE, /artifact_kind: \["procedure"\], formalization_level: \["workflow"\]/);
  assert.match(TOOLS_SOURCE, /artifact_kind: \["session"\]/);
  assert.doesNotMatch(TOOLS_SOURCE, /tags:/);
});

test("vault_query can rank a governed candidate set against intent text", () => {
  assert.match(TOOLS_SOURCE, /intent_text/);
  assert.match(DB_SOURCE, /function\s+tokenizeIntentText\(/);
  assert.match(DB_SOURCE, /function\s+buildIntentPhrases\(/);
  assert.match(DB_SOURCE, /function\s+normalizeIntentHaystack\(/);
  assert.match(DB_SOURCE, /function\s+scoreTemplateIntent\(/);
  assert.match(DB_SOURCE, /compareTemplatesForIntent\(/);
  assert.match(DB_SOURCE, /template\.control_mode === "loop"/);
  assert.match(DB_SOURCE, /template\.formalization_level === "workflow"/);
  assert.match(DB_SOURCE, /LEFT\(content, 4096\) AS content/);
  assert.match(TYPES_SOURCE, /const\s+INTENT_RANKING_CANDIDATE_POOL_LIMIT\s*=\s*500/);
  assert.match(
    DB_SOURCE,
    /candidatePoolLimit = filters\.intent_text\s*\?\s*INTENT_RANKING_CANDIDATE_POOL_LIMIT\s*:\s*effectiveLimit/,
  );
  assert.match(DB_SOURCE, /\.slice\(0, effectiveLimit\)/);
});

test("vault_vocabulary is contract-driven rather than tag-derived", () => {
  assert.match(DB_SOURCE, /ontology\/controlled-vocabulary-contract\.json/);
  assert.match(DB_SOURCE, /ontology\/company-visibility-contract\.json/);
  assert.match(TOOLS_SOURCE, /# Vault Governed Vocabulary/);
  assert.doesNotMatch(
    DB_SOURCE,
    /SELECT DISTINCT artifact_kind, control_mode, formalization_level, tags/,
  );
});

test("vault_insert validates governance and router controlled vocabulary", () => {
  assert.match(DB_SOURCE, /visibility_companies must include owner_company/);
  assert.match(DB_SOURCE, /controlled_vocabulary is required when control_mode=router/);
  assert.match(DB_SOURCE, /Unknown controlled_vocabulary\./);
  assert.match(TOOLS_SOURCE, /owner_company/);
  assert.match(TOOLS_SOURCE, /visibility_companies/);
});

test("vault_insert now fails closed on duplicate names instead of overwriting", () => {
  assert.match(DB_SOURCE, /Template already exists:/);
  assert.match(TOOLS_SOURCE, /Fails closed when the exact template name already exists/);
  assert.doesNotMatch(DB_SOURCE, /ON DUPLICATE KEY UPDATE/);
});

test("vault_update is registered as the explicit in-place mutation path", () => {
  assert.match(TOOLS_SOURCE, /name: "vault_update"/);
  assert.match(TOOLS_SOURCE, /use vault_update for explicit in-place edits/i);
  assert.match(DB_SOURCE, /function updateTemplate\(/);
  assert.match(DB_SOURCE, /prepareTemplateUpdate\(/);
  assert.match(DB_SOURCE, /Template not found:/);
  assert.match(DB_SOURCE, /No update fields provided/);
});

test("vault mutations require explicit company context, owner authorization, and version-safe updates", () => {
  assert.match(DB_SOURCE, /Explicit company context is required for vault mutations/);
  assert.match(DB_SOURCE, /allowAmbientCwdFallback === false/);
  assert.match(DB_SOURCE, /owner_company must match the active mutation company/);
  assert.match(DB_SOURCE, /owner_company cannot be reassigned via vault_update/);
  assert.match(DB_SOURCE, /AND owner_company = '\$\{escapeSql\(actorContext\.actorCompany\)\}'/);
  assert.match(DB_SOURCE, /AND version = \$\{Number\(existing\.version\)\}/);
  assert.match(DB_SOURCE, /SELECT ROW_COUNT\(\) AS row_count/);
  assert.match(DB_SOURCE, /changed during update\. Refresh and retry with the latest version/);
  assert.match(DB_SOURCE, /Template execution not found or not visible/);
  assert.match(DB_SOURCE, /Template execution not found:/);
  assert.match(DB_SOURCE, /Feedback already exists for execution/);
  assert.match(DB_SOURCE, /WHERE NOT EXISTS \(/);
  assert.match(TOOLS_SOURCE, /buildToolMutationContext\(ctx\)/);
  assert.match(TOOLS_SOURCE, /allowAmbientCwdFallback: false/);
  assert.match(TOOLS_SOURCE, /runtime\.insertTemplate\([\s\S]*mutationContext/);
  assert.match(TOOLS_SOURCE, /runtime\.updateTemplate\(name, patch, mutationContext\)/);
  assert.match(TOOLS_SOURCE, /runtime\.rateTemplate\([\s\S]*mutationContext/);
});

test("vault tools pass explicit tool-call context when available", () => {
  assert.match(TOOLS_SOURCE, /async execute\(_toolCallId, params, _signal, _onUpdate, ctx\)/);
  assert.match(TOOLS_SOURCE, /runtime\.retrieveByNamesDetailed\([\s\S]*executionContext,/);
  assert.match(TOOLS_SOURCE, /currentCompanySource: executionContext\.companySource/);
});

test("vault exposes execution provenance for exact feedback binding", () => {
  assert.match(TOOLS_SOURCE, /name: "vault_executions"/);
  assert.match(TOOLS_SOURCE, /execution_id/);
  assert.match(TOOLS_SOURCE, /entity_version/);
  assert.match(TOOLS_SOURCE, /Use vault_executions first, then pass the exact execution_id/);
  assert.match(DB_SOURCE, /INNER JOIN prompt_templates pt ON pt.id = e\.entity_id/);
  assert.match(RECEIPTS_SOURCE, /receipt_kind: "vault_execution"/);
  assert.match(RECEIPTS_SOURCE, /readReceiptByExecutionId/);
});

test("execution logging records the actual template version used and finalizes via receipts on message send", () => {
  assert.match(
    DB_SOURCE,
    /const entityVersion = Number\.isFinite\(template\.version\) \? Number\(template\.version\) : null/,
  );
  assert.match(DB_SOURCE, /LAST_INSERT_ID\(\) AS insert_id/);
  assert.match(
    RECEIPTS_SOURCE,
    /runtime\.logExecution\(candidate\.template, modelId, candidate\.input_context\)/,
  );
  assert.match(COMMANDS_SOURCE, /pi\.on\("message_end"/);
  assert.match(COMMANDS_SOURCE, /receipts\.finalizePreparedExecution/);
  assert.match(RECEIPTS_SOURCE, /createPreparedExecutionToken/);
  assert.match(RECEIPTS_SOURCE, /withPreparedExecutionMarker/);
  assert.match(PICKER_SOURCE, /execution_token: executionToken/);
  assert.match(COMMANDS_SOURCE, /stripPreparedExecutionMarkers/);
});

test("vault_query hides governance metadata by default and can opt in", () => {
  assert.match(TOOLS_SOURCE, /include_governance/);
  assert.match(DB_SOURCE, /includeGovernance = options\?\.includeGovernance \?\? false/);
  assert.match(DB_SOURCE, /if \(includeGovernance\) \{/);
  assert.match(DB_SOURCE, /### Governance/);
});

test("vault_search surfaces backend query failures explicitly", () => {
  assert.match(COMMANDS_SOURCE, /Vault search failed:/);
  assert.match(COMMANDS_SOURCE, /Usage: \/vault-search <query>/);
});

test("vault exposes a schema diagnostics tool that remains useful during mismatch", () => {
  assert.match(TOOLS_SOURCE, /name: "vault_schema_diagnostics"/);
  assert.match(TOOLS_SOURCE, /# Vault Schema Diagnostics/);
  assert.match(TOOLS_SOURCE, /missing_prompt_template_columns:/);
  assert.match(TOOLS_SOURCE, /missing_execution_columns:/);
  assert.match(TOOLS_SOURCE, /missing_feedback_columns:/);
});

test("session_start reports schema mismatch or vault unavailability instead of empty counts", () => {
  assert.match(COMMANDS_SOURCE, /Vault schema mismatch \(/);
  assert.match(COMMANDS_SOURCE, /Vault unavailable:/);
  assert.doesNotMatch(
    COMMANDS_SOURCE,
    /Vault: \$\{cognitive\} cognitive, \$\{procedure\} procedure templates/,
  );
});

test("vault selection parsing delegates :: context handling to helper", () => {
  assert.match(PICKER_SOURCE, /function\s+splitVaultQueryAndContext\(rest:\s*string\)/);
  assert.match(PICKER_SOURCE, /splitQueryAndContext\(rest,\s*"::"\)/);
});

test("vault exact match resolves directly before picker fallback", () => {
  assert.match(COMMANDS_SOURCE, /resolveCommandCompanyContext\(runtime, ctx\)/);
  assert.match(
    COMMANDS_SOURCE,
    /const exactMatchResult = query\.trim\(\)\s*\? runtime\.getTemplateDetailed\(query\.trim\(\), \{[\s\S]*currentCompany,[\s\S]*requireExplicitCompany: true,[\s\S]*\}\)\s*:\s*\{ ok: true, value: null, error: null as null \}/,
  );
  assert.match(COMMANDS_SOURCE, /selection mode=exact/);
});

test("legacy browse select and list commands are removed", () => {
  assert.doesNotMatch(COMMANDS_SOURCE, /pi\.registerCommand\("vault-browse"/);
  assert.doesNotMatch(COMMANDS_SOURCE, /pi\.registerCommand\("vault-browser"/);
  assert.doesNotMatch(COMMANDS_SOURCE, /pi\.registerCommand\("vault-select"/);
  assert.doesNotMatch(COMMANDS_SOURCE, /\/vault-list/);
});

test("vault picker surfaces full candidate set to UI through strict exported-only metadata reads", () => {
  assert.match(PICKER_SOURCE, /resolvePickerCompanyContext\(runtime, ctx\)/);
  assert.match(
    PICKER_SOURCE,
    /listTemplatesDetailed\([\s\S]*requireExplicitCompany: true,[\s\S]*\{ includeContent: false \}/,
  );
  assert.match(PICKER_SOURCE, /explicit-company-context-required/);
  assert.match(PICKER_SOURCE, /maxOptions:\s*Math\.max\(1,\s*candidates\.length\)/);
  assert.match(PICKER_SOURCE, /Vault template picker \(all templates\)/);
});

test("vault picker no longer carries unused browser report helper", () => {
  assert.doesNotMatch(PICKER_SOURCE, /# Vault Browser/);
  assert.doesNotMatch(PICKER_SOURCE, /function\s+buildVaultBrowserReport\(/);
  assert.doesNotMatch(PICKER_SOURCE, /function\s+rankVaultCandidates\(/);
});

test("vault live trigger is registered through shared interaction helper", () => {
  assert.match(PICKER_SOURCE, /function\s+registerVaultLiveTrigger\(/);
  assert.match(PICKER_SOURCE, /registerPickerInteraction\(\{/);
  assert.match(PICKER_SOURCE, /id:\s*LIVE_VAULT_TRIGGER_ID/);
  assert.match(PICKER_SOURCE, /telemetry:\s*recordLiveTriggerTelemetry/);
});

test("vault live trigger allows bare /vault: and prompts for filter", () => {
  assert.match(TYPES_SOURCE, /const\s+LIVE_VAULT_MIN_QUERY\s*=\s*0/);
  assert.match(PICKER_SOURCE, /match:\s*\/\^\\\/vault:\(\.\*\)\$\//);
  assert.match(PICKER_SOURCE, /promptForQueryWhenEmpty:\s*true/);
  assert.match(PICKER_SOURCE, /queryPromptTitle:\s*"Filter vault templates"/);
  assert.match(PICKER_SOURCE, /maxOptions:\s*25/);
});

test("route prompt generation is centralized in a helper", () => {
  assert.match(COMMANDS_SOURCE, /function\s+buildRoutePrompt\(/);
  assert.match(COMMANDS_SOURCE, /includeInvokeStep/);
  assert.match(COMMANDS_SOURCE, /outputHeading: "Output format:"/);
  assert.match(COMMANDS_SOURCE, /outputHeading: "Output:"/);
});

test("vault check command reports detailed schema diagnostics plus company context and key template visibility", () => {
  assert.doesNotMatch(DB_SOURCE, /activeSessionCwd/);
  assert.match(DB_SOURCE, /function\s+resolveCurrentCompanyContext\(cwd\?: string\)/);
  assert.match(DB_SOURCE, /const effectiveCwd = cwd\?\.trim\(\) \|\| process\.cwd\(\)/);
  assert.match(DB_SOURCE, /source: "env:PI_COMPANY"/);
  assert.match(DB_SOURCE, /source: `cwd:\$\{effectiveCwd\}`/);
  assert.match(COMMANDS_SOURCE, /pi\.registerCommand\("vault-check"/);
  assert.match(COMMANDS_SOURCE, /checkSchemaCompatibilityDetailed\(\)/);
  assert.match(COMMANDS_SOURCE, /# Vault Check/);
  assert.match(COMMANDS_SOURCE, /schema_actual:/);
  assert.match(COMMANDS_SOURCE, /schema_status:/);
  assert.match(COMMANDS_SOURCE, /missing_prompt_template_columns:/);
  assert.match(COMMANDS_SOURCE, /missing_execution_columns:/);
  assert.match(COMMANDS_SOURCE, /missing_feedback_columns:/);
  assert.match(COMMANDS_SOURCE, /company_source:/);
  assert.match(COMMANDS_SOURCE, /meta-orchestration:/);
  assert.match(COMMANDS_SOURCE, /next-10-expert-suggestions:/);
});

test("vault live telemetry command is exposed", () => {
  assert.match(COMMANDS_SOURCE, /pi\.registerCommand\("vault-live-telemetry"/);
});

test("vault stats uses the caller company through the centralized Pi-visible predicate", () => {
  assert.match(COMMANDS_SOURCE, /resolveCommandCompanyContext\(runtime, ctx\)/);
  assert.match(COMMANDS_SOURCE, /const currentCompany = companyContext\.currentCompany/);
  assert.match(COMMANDS_SOURCE, /runtime\.buildPiVisibleTemplatePredicate\(currentCompany, "pt"\)/);
});

test("session-sensitive execution paths pass explicit company context before rendering", () => {
  assert.doesNotMatch(COMMANDS_SOURCE, /runtime\.setSessionCwd\(/);
  assert.match(COMMANDS_SOURCE, /resolveCommandCompanyContext\(runtime, ctx\)/);
  assert.match(COMMANDS_SOURCE, /buildGroundedNext10Prompt\(text, \{/);
  assert.match(COMMANDS_SOURCE, /currentCompany: companyContext\.currentCompany/);
  assert.match(PICKER_SOURCE, /resolvePickerCompanyContext\(runtime, context\)/);
  assert.match(PICKER_SOURCE, /requireExplicitCompany: true/);
  assert.match(GROUNDING_SOURCE, /runtime\.resolveCurrentCompanyContext\(options\.cwd\)/);
  assert.match(
    GROUNDING_SOURCE,
    /BLOCKED: explicit company context is required for visibility-sensitive vault reads/,
  );
  assert.match(GROUNDING_SOURCE, /retrieveByNamesDetailed\(exactCandidates, true, \{/);
  assert.match(
    GROUNDING_SOURCE,
    /getTemplateDetailed\("next-10-expert-suggestions", \{[\s\S]*currentCompany,[\s\S]*\}\)/,
  );
  assert.match(GROUNDING_SOURCE, /context: frameworkContext/);
  assert.match(GROUNDING_SOURCE, /args: frameworkArgs/);
});

test("render engine contract uses explicit preparation for vault and grounding paths", () => {
  assert.match(TYPES_SOURCE, /const\s+RENDER_ENGINES\s*=\s*\["none", "pi-vars", "nunjucks"\]/);
  assert.match(RENDERER_SOURCE, /export function prepareTemplateForExecution\(/);
  assert.match(RENDERER_SOURCE, /allowLegacyPiVarsAutoDetect/);
  assert.match(RENDERER_SOURCE, /Unsafe Nunjucks expression/);
  assert.match(RENDERER_SOURCE, /Unsupported Nunjucks syntax/);
  assert.match(RENDERER_SOURCE, /Pi-vars render failed:/);
  assert.match(DB_SOURCE, /export function validateTemplateContent\(/);
  assert.match(DB_SOURCE, /content body must be non-empty after frontmatter/);
  assert.match(PICKER_SOURCE, /allowLegacyPiVarsAutoDetect: false/);
  assert.match(GROUNDING_SOURCE, /allowLegacyPiVarsAutoDetect: true/);
  assert.match(GROUNDING_SOURCE, /framework grounding render failed for/);
});

test("picker runtime exposes structured vault prompt preparation", () => {
  assert.match(TYPES_SOURCE, /prepareVaultPrompt:/);
  assert.match(PICKER_SOURCE, /function prepareVaultPrompt\(/);
  assert.match(COMMANDS_SOURCE, /runtime\.prepareVaultPrompt\(/);
});

test("interaction helpers are consumed through published package boundaries instead of local vendored or bundled bridges", () => {
  assert.match(FUZZY_SELECTOR_SOURCE, /from "@tryinget\/pi-interaction-kit"/);
  assert.match(TRIGGER_ADAPTER_SOURCE, /from "@tryinget\/pi-trigger-adapter"/);
  assert.match(PACKAGE_JSON_SOURCE, /"@tryinget\/pi-interaction-kit": "\^0\.1\.0"/);
  assert.match(PACKAGE_JSON_SOURCE, /"@tryinget\/pi-trigger-adapter": "\^0\.1\.0"/);
  assert.doesNotMatch(PACKAGE_JSON_SOURCE, /"bundleDependencies"/);
  assert.doesNotMatch(PACKAGE_JSON_SOURCE, /prepare-publish-manifest/);
  assert.doesNotMatch(PACKAGE_JSON_SOURCE, /sync:interaction-vendors/);
});

test("live vault paths surface render failures clearly", () => {
  assert.match(COMMANDS_SOURCE, /Vault template render failed \(/);
  assert.match(PICKER_SOURCE, /Vault live picker render failed \(/);
});
