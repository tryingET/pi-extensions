import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const DB_SOURCE = readFileSync(new URL("../src/vaultDb.ts", import.meta.url), "utf8");
const COMPANY_CONTEXT_SOURCE = readFileSync(
  new URL("../src/companyContext.ts", import.meta.url),
  "utf8",
);
const SCHEMA_SOURCE = readFileSync(new URL("../src/vaultSchema.ts", import.meta.url), "utf8");
const MUTATIONS_SOURCE = readFileSync(new URL("../src/vaultMutations.ts", import.meta.url), "utf8");
const FEEDBACK_SOURCE = readFileSync(new URL("../src/vaultFeedback.ts", import.meta.url), "utf8");
const PICKER_SOURCE = readFileSync(new URL("../src/vaultPicker.ts", import.meta.url), "utf8");
const COMMANDS_SOURCE = readFileSync(new URL("../src/vaultCommands.ts", import.meta.url), "utf8");
const ROUTE_SOURCE = readFileSync(new URL("../src/vaultRoute.ts", import.meta.url), "utf8");
const TOOLS_SOURCE = readFileSync(new URL("../src/vaultTools.ts", import.meta.url), "utf8");
const TYPES_SOURCE = readFileSync(new URL("../src/vaultTypes.ts", import.meta.url), "utf8");
const REPLAY_SOURCE = readFileSync(new URL("../src/vaultReplay.ts", import.meta.url), "utf8");
const GROUNDING_SOURCE = readFileSync(new URL("../src/vaultGrounding.ts", import.meta.url), "utf8");
const RENDERER_SOURCE = readFileSync(
  new URL("../src/templateRenderer.js", import.meta.url),
  "utf8",
);
const EXTENSION_SOURCE = readFileSync(new URL("../extensions/vault.ts", import.meta.url), "utf8");
const RECEIPTS_SOURCE = readFileSync(new URL("../src/vaultReceipts.ts", import.meta.url), "utf8");
const RUNTIME_REGISTRY_SOURCE = readFileSync(
  new URL("../src/vaultRuntimeRegistry.ts", import.meta.url),
  "utf8",
);
const FUZZY_SELECTOR_SOURCE = readFileSync(
  new URL("../src/fuzzySelector.js", import.meta.url),
  "utf8",
);
const TRIGGER_ADAPTER_SOURCE = readFileSync(
  new URL("../src/triggerAdapter.js", import.meta.url),
  "utf8",
);
const PACKAGE_JSON_SOURCE = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const ROOT_INDEX_SOURCE = readFileSync(new URL("../index.ts", import.meta.url), "utf8");

test("vault runtime targets Prompt Vault schema v9", () => {
  assert.match(TYPES_SOURCE, /const\s+SCHEMA_VERSION\s*=\s*9/);
  assert.match(TYPES_SOURCE, /const\s+DEFAULT_VAULT_QUERY_LIMIT\s*=\s*20/);
  assert.match(SCHEMA_SOURCE, /SELECT MAX\(version\) AS version FROM schema_version/);
  assert.match(DB_SOURCE, /checkSchemaCompatibilityDetailed as computeSchemaCompatibilityDetailed/);
  assert.match(EXTENSION_SOURCE, /registerVaultDiagnosticsTool\(pi, vaultRuntime\)/);
  assert.match(EXTENSION_SOURCE, /createVaultReceiptManager\(vaultRuntime\)/);
  assert.match(EXTENSION_SOURCE, /registerVaultCapabilityBridges\(/);
  assert.match(EXTENSION_SOURCE, /unregisterVaultCapabilityBridges\(/);
  assert.match(
    EXTENSION_SOURCE,
    /summarizeTelemetry: pickerRuntime\.summarizeLiveTriggerTelemetry/,
  );
  assert.match(EXTENSION_SOURCE, /getTelemetryStats: pickerRuntime\.getLiveTriggerTelemetryStats/);
  assert.match(EXTENSION_SOURCE, /registerVaultCommands\(pi, runtime, receiptManager\)/);
  assert.match(EXTENSION_SOURCE, /formatMissingColumns\("prompt_templates"/);
  assert.match(EXTENSION_SOURCE, /missingPromptTemplateColumns/);
  assert.match(EXTENSION_SOURCE, /formatMissingColumns\("executions"/);
  assert.match(EXTENSION_SOURCE, /missingExecutionColumns/);
  assert.match(EXTENSION_SOURCE, /checkSchemaCompatibilityDetailed\(\)/);
  assert.match(EXTENSION_SOURCE, /expected=\$\{SCHEMA_VERSION\}/);
  assert.match(EXTENSION_SOURCE, /actual=\$\{schemaReport\.actualVersion \?\? "unknown"\}/);
});

test("extension registers capability bridges only after schema-gated startup and root export mirrors packaged js entrypoint", () => {
  const schemaCheckIndex = EXTENSION_SOURCE.indexOf(
    "const schemaReport = vaultRuntime.checkSchemaCompatibilityDetailed();",
  );
  const registerToolsIndex = EXTENSION_SOURCE.indexOf(
    "registerVaultTools(pi, runtime, receiptManager);",
  );
  const registerBridgesIndex = EXTENSION_SOURCE.lastIndexOf("registerVaultCapabilityBridges(");
  assert.ok(schemaCheckIndex >= 0);
  assert.ok(registerToolsIndex >= 0);
  assert.ok(registerBridgesIndex >= 0);
  assert.ok(registerBridgesIndex > schemaCheckIndex);
  assert.ok(registerBridgesIndex > registerToolsIndex);
  assert.match(ROOT_INDEX_SOURCE, /export \{ default \} from "\.\/extensions\/vault\.js";/);
});

test("vault runtime registry bridge stays scoped to receipts and live telemetry", () => {
  assert.match(RUNTIME_REGISTRY_SOURCE, /VAULT_CAPABILITIES = \{/);
  assert.match(RUNTIME_REGISTRY_SOURCE, /RECEIPTS: "vault:receipts"/);
  assert.match(RUNTIME_REGISTRY_SOURCE, /TELEMETRY: "vault:telemetry"/);
  assert.doesNotMatch(RUNTIME_REGISTRY_SOURCE, /TEMPLATES: "vault:templates"/);
  assert.match(RUNTIME_REGISTRY_SOURCE, /registerVaultCapabilityBridges/);
  assert.match(RUNTIME_REGISTRY_SOURCE, /readLatest\(options: \{ currentCompany\?: string \}\)/);
  assert.match(
    RUNTIME_REGISTRY_SOURCE,
    /readByExecutionId\([\s\S]*options: \{ currentCompany\?: string \}/,
  );
  assert.match(RUNTIME_REGISTRY_SOURCE, /if \(!currentCompany\) return null/);
  assert.match(RUNTIME_REGISTRY_SOURCE, /if \(!currentCompany\) return \[\]/);
  assert.match(RUNTIME_REGISTRY_SOURCE, /listRecent/);
  assert.match(RUNTIME_REGISTRY_SOURCE, /summarize/);
  assert.match(RUNTIME_REGISTRY_SOURCE, /getEventCount/);
  assert.match(RUNTIME_REGISTRY_SOURCE, /getStats/);
  assert.match(PICKER_SOURCE, /function\s+getLiveTriggerTelemetryStats\(/);
  assert.match(PICKER_SOURCE, /getLiveTriggerTelemetryStats:/);
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
    assert.match(SCHEMA_SOURCE, new RegExp(`"${column}"`));
  }
  assert.match(TYPES_SOURCE, /interface\s+SchemaCompatibilityReport/);
  assert.match(
    TYPES_SOURCE,
    /checkSchemaCompatibilityDetailed:\s*\(\)\s*=>\s*SchemaCompatibilityReport/,
  );
  assert.match(
    SCHEMA_SOURCE,
    /export function\s+checkSchemaCompatibilityDetailed\([\s\S]*\): SchemaCompatibilityReport/,
  );
  assert.match(DB_SOURCE, /function\s+checkSchemaCompatibilityDetailed\(\) \{/);
  assert.match(DB_SOURCE, /return computeSchemaCompatibilityDetailed\(queryVaultJson\)/);
  assert.match(SCHEMA_SOURCE, /expectedVersion: SCHEMA_VERSION/);
  assert.match(SCHEMA_SOURCE, /actualVersion,/);
  assert.match(SCHEMA_SOURCE, /missingPromptTemplateColumns/);
  assert.match(SCHEMA_SOURCE, /missingExecutionColumns/);
  assert.match(SCHEMA_SOURCE, /missingFeedbackColumns/);
});

test("vault_query uses centralized active + company-visible filtering with explicit execution context when available", () => {
  assert.match(
    DB_SOURCE,
    /function\s+buildVisibilityPredicate\(company = getCurrentCompany\(\), alias\?: string\)/,
  );
  assert.match(
    DB_SOURCE,
    /JSON_SEARCH\(\$\{qualifyTemplateColumn\("visibility_companies", alias\)\}, 'one', '\$\{escapeSql\(company\)\}'\) IS NOT NULL/,
  );
  assert.match(DB_SOURCE, /function\s+buildActiveVisibleTemplatePredicate\(/);
  assert.match(DB_SOURCE, /\$\{qualifyTemplateColumn\("export_to_pi", alias\)\} = true/);
  assert.doesNotMatch(DB_SOURCE, /function\s+buildPiVisibleTemplatePredicate\(/);
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
  assert.match(MUTATIONS_SOURCE, /visibility_companies must include owner_company/);
  assert.match(MUTATIONS_SOURCE, /controlled_vocabulary is required when control_mode=router/);
  assert.match(MUTATIONS_SOURCE, /Unknown controlled_vocabulary\./);
  assert.match(TOOLS_SOURCE, /owner_company/);
  assert.match(TOOLS_SOURCE, /visibility_companies/);
});

test("vault_insert now fails closed on duplicate names instead of overwriting", () => {
  assert.match(MUTATIONS_SOURCE, /Template already exists:/);
  assert.match(TOOLS_SOURCE, /Fails closed when the exact template name already exists/);
  assert.doesNotMatch(MUTATIONS_SOURCE, /ON DUPLICATE KEY UPDATE/);
});

test("vault_update is registered as the explicit in-place mutation path", () => {
  assert.match(TOOLS_SOURCE, /name: "vault_update"/);
  assert.match(TOOLS_SOURCE, /use vault_update for explicit in-place edits/i);
  assert.match(DB_SOURCE, /from "\.\/vaultMutations\.js"/);
  assert.match(DB_SOURCE, /updateTemplate as executeTemplateUpdate/);
  assert.match(DB_SOURCE, /prepareTemplateUpdate,/);
  assert.match(MUTATIONS_SOURCE, /export function prepareTemplateUpdate\(/);
  assert.match(MUTATIONS_SOURCE, /Template not found:/);
  assert.match(MUTATIONS_SOURCE, /No update fields provided/);
});

test("vault mutations require explicit company context, owner authorization, and version-safe updates", () => {
  assert.match(MUTATIONS_SOURCE, /Explicit company context is required for vault mutations/);
  assert.match(MUTATIONS_SOURCE, /allowAmbientCwdFallback === false/);
  assert.match(MUTATIONS_SOURCE, /owner_company must match the active mutation company/);
  assert.match(MUTATIONS_SOURCE, /owner_company cannot be reassigned via vault_update/);
  assert.match(
    MUTATIONS_SOURCE,
    /AND owner_company = '\$\{dependencies\.escapeSql\(actorContext\.actorCompany\)\}'/,
  );
  assert.match(MUTATIONS_SOURCE, /AND version = \$\{Number\(existing\.version\)\}/);
  assert.match(DB_SOURCE, /SELECT ROW_COUNT\(\) AS row_count/);
  assert.match(
    MUTATIONS_SOURCE,
    /changed during update\. Refresh and retry with the latest version/,
  );
  assert.match(TOOLS_SOURCE, /buildToolMutationContext\(ctx\)/);
  assert.match(TOOLS_SOURCE, /allowAmbientCwdFallback: false/);
  assert.match(TOOLS_SOURCE, /runtime\.insertTemplate\([\s\S]*mutationContext/);
  assert.match(TOOLS_SOURCE, /runtime\.updateTemplate\(name, patch, mutationContext\)/);
  assert.match(TOOLS_SOURCE, /runtime\.rateTemplate\([\s\S]*mutationContext/);
});

test("vault feedback mutations are isolated behind a dedicated execution-bound seam", () => {
  assert.match(DB_SOURCE, /from "\.\/vaultFeedback\.js"/);
  assert.match(DB_SOURCE, /rateTemplate as executeFeedbackRating/);
  assert.match(FEEDBACK_SOURCE, /export function rateTemplate\(/);
  assert.match(FEEDBACK_SOURCE, /Template execution not found or not visible/);
  assert.match(FEEDBACK_SOURCE, /Template execution not found:/);
  assert.match(FEEDBACK_SOURCE, /Feedback already exists for execution/);
  assert.match(FEEDBACK_SOURCE, /WHERE NOT EXISTS \(/);
  assert.match(FEEDBACK_SOURCE, /Execution receipt template mismatch/);
  assert.match(FEEDBACK_SOURCE, /Execution receipt version mismatch/);
  assert.match(FEEDBACK_SOURCE, /buildVisibilityPredicate\(actorContext\.actorCompany\)/);
  assert.match(TOOLS_SOURCE, /runtime\.rateTemplate\([\s\S]*mutationContext/);
});

test("vault tools pass explicit tool-call context when available", () => {
  assert.match(TOOLS_SOURCE, /async execute\(_toolCallId, params, _signal, _onUpdate, ctx\)/);
  assert.match(TOOLS_SOURCE, /runtime\.retrieveByNamesDetailed\([\s\S]*executionContext,/);
  assert.match(TOOLS_SOURCE, /currentCompanySource: executionContext\.companySource/);
});

test("vault exposes execution provenance for exact feedback binding", () => {
  assert.match(TOOLS_SOURCE, /name: "vault_replay"/);
  assert.match(TOOLS_SOURCE, /name: "vault_executions"/);
  assert.match(TOOLS_SOURCE, /execution_id/);
  assert.match(TOOLS_SOURCE, /entity_version/);
  assert.match(TOOLS_SOURCE, /Use vault_executions first, then pass the exact execution_id/);
  assert.match(FEEDBACK_SOURCE, /INNER JOIN prompt_templates pt ON pt.id = e\.entity_id/);
  assert.match(RECEIPTS_SOURCE, /receipt_kind: "vault_execution"/);
  assert.match(RECEIPTS_SOURCE, /readReceiptByExecutionId/);
});

test("vault replay surfaces are registered through deterministic command and tool contracts", () => {
  assert.match(COMMANDS_SOURCE, /pi\.registerCommand\("vault-replay"/);
  assert.match(COMMANDS_SOURCE, /Usage: \/vault-replay <execution_id>/);
  assert.match(COMMANDS_SOURCE, /formatVaultReplayReport\(report\)/);
  assert.match(TOOLS_SOURCE, /name: "vault_replay"/);
  assert.match(TOOLS_SOURCE, /formatVaultReplayReport\(report\)/);
  assert.match(REPLAY_SOURCE, /export function formatVaultReplayReport/);
  assert.match(REPLAY_SOURCE, /status: \$\{report\.status\}/);
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
  assert.match(DB_SOURCE, /output_capture_mode,/);
  assert.match(DB_SOURCE, /output_text,/);
  assert.match(DB_SOURCE, /'none',\s*\n\s*NULL,/);
  assert.match(COMMANDS_SOURCE, /pi\.on\("message_end"/);
  assert.match(COMMANDS_SOURCE, /receipts\.finalizePreparedExecution/);
  assert.match(RECEIPTS_SOURCE, /createPreparedExecutionToken/);
  assert.match(RECEIPTS_SOURCE, /withPreparedExecutionMarker/);
  assert.match(PICKER_SOURCE, /execution_token: executionToken/);
  assert.match(COMMANDS_SOURCE, /stripPreparedExecutionMarkers/);
});

test("governed contract parsing fails closed on invalid JSON", () => {
  assert.match(DB_SOURCE, /Invalid governed contract JSON at/);
  assert.doesNotMatch(DB_SOURCE, /catch \{\s*return fallback;\s*\}/);
});

test("receipt finalization persists through an emergency fallback sink before surfacing failure", () => {
  assert.match(RECEIPTS_SOURCE, /buildDefaultFallbackReceiptsFile/);
  assert.match(RECEIPTS_SOURCE, /fallbackSink/);
  assert.match(RECEIPTS_SOURCE, /appendReceiptWithFallback/);
  assert.match(RECEIPTS_SOURCE, /primary receipt sink failed/);
  assert.match(RECEIPTS_SOURCE, /readReceiptsFromPaths/);
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

test("vault picker surfaces full company-visible candidate set to UI through strict metadata reads", () => {
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
  assert.match(PICKER_SOURCE, /telemetry:\s*\(event\)\s*=>\s*recordLiveTriggerTelemetry/);
});

test("vault live trigger allows bare /vault: and prompts for filter", () => {
  assert.match(TYPES_SOURCE, /const\s+LIVE_VAULT_TRIGGER_DEBOUNCE_MS\s*=\s*150/);
  assert.match(TYPES_SOURCE, /const\s+LIVE_VAULT_MIN_QUERY\s*=\s*0/);
  assert.match(PICKER_SOURCE, /match:\s*\/\^\\\/vault:\(\.\*\)\$\//);
  assert.match(PICKER_SOURCE, /debounceMs:\s*LIVE_VAULT_TRIGGER_DEBOUNCE_MS/);
  assert.match(PICKER_SOURCE, /promptForQueryWhenEmpty:\s*true/);
  assert.match(PICKER_SOURCE, /queryPromptTitle:\s*"Filter vault templates"/);
  assert.match(PICKER_SOURCE, /maxOptions:\s*25/);
});

test("route prompt generation is centralized in a helper", () => {
  assert.match(COMMANDS_SOURCE, /from "\.\/vaultRoute\.js"/);
  assert.match(ROUTE_SOURCE, /export function buildRoutePrompt\(/);
  assert.match(ROUTE_SOURCE, /includeInvokeStep/);
  assert.match(ROUTE_SOURCE, /outputHeading: "Output format:"/);
  assert.match(ROUTE_SOURCE, /outputHeading: "Output:"/);
});

test("vault check command reports detailed schema diagnostics plus company context and key template visibility", () => {
  assert.doesNotMatch(DB_SOURCE, /activeSessionCwd/);
  assert.match(DB_SOURCE, /function\s+resolveCurrentCompanyContext\(cwd\?: string\)/);
  assert.match(DB_SOURCE, /resolveCompanyContext\(\{/);
  assert.match(DB_SOURCE, /let defaultCompany = "core"/);
  assert.match(
    DB_SOURCE,
    /defaultCompany = getContracts\(\)\.companyVisibility\.defaults\?\.owner_company \|\| "core"/,
  );
  assert.match(COMPANY_CONTEXT_SOURCE, /export function resolveCompanyContext\(/);
  assert.match(COMPANY_CONTEXT_SOURCE, /export function inferCompanyFromCwd\(/);
  assert.match(COMPANY_CONTEXT_SOURCE, /COMPANY_CONTEXT_ANCHOR_SEGMENTS/);
  assert.match(COMPANY_CONTEXT_SOURCE, /COMPANY_LANE_SEGMENTS/);
  assert.match(COMPANY_CONTEXT_SOURCE, /softwareco: "software"/);
  assert.match(COMPANY_CONTEXT_SOURCE, /source: "env:PI_COMPANY"/);
  assert.match(COMPANY_CONTEXT_SOURCE, /source: `cwd:\$\{effectiveCwd\}`/);
  assert.doesNotMatch(COMPANY_CONTEXT_SOURCE, /includes\("\/softwareco\/"\)/);
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

test("vault stats uses the caller company through the centralized active + visible predicate", () => {
  assert.match(COMMANDS_SOURCE, /resolveCommandCompanyContext\(runtime, ctx\)/);
  assert.match(COMMANDS_SOURCE, /const currentCompany = companyContext\.currentCompany/);
  assert.match(
    COMMANDS_SOURCE,
    /runtime\.buildActiveVisibleTemplatePredicate\(currentCompany, "pt"\)/,
  );
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
  assert.match(MUTATIONS_SOURCE, /export function validateTemplateContent\(/);
  assert.match(MUTATIONS_SOURCE, /content body must be non-empty after frontmatter/);
  assert.match(PICKER_SOURCE, /allowLegacyPiVarsAutoDetect: false/);
  assert.match(GROUNDING_SOURCE, /allowLegacyPiVarsAutoDetect: true/);
  assert.match(GROUNDING_SOURCE, /framework grounding render failed for/);
});

test("picker runtime exposes structured vault prompt preparation", () => {
  assert.match(TYPES_SOURCE, /prepareVaultPrompt:/);
  assert.match(PICKER_SOURCE, /function prepareVaultPrompt\(/);
  assert.match(COMMANDS_SOURCE, /runtime\.prepareVaultPrompt\(/);
});

test("interaction helpers are consumed through package boundaries without vendored source bridges", () => {
  assert.match(FUZZY_SELECTOR_SOURCE, /from "@tryinget\/pi-interaction-kit"/);
  assert.match(TRIGGER_ADAPTER_SOURCE, /from "@tryinget\/pi-trigger-adapter"/);
  assert.match(
    PACKAGE_JSON_SOURCE,
    /"@tryinget\/pi-interaction-kit": "file:\.\.\/pi-interaction\/pi-interaction-kit"/,
  );
  assert.match(
    PACKAGE_JSON_SOURCE,
    /"@tryinget\/pi-trigger-adapter": "file:\.\.\/pi-interaction\/pi-trigger-adapter"/,
  );
  assert.doesNotMatch(PACKAGE_JSON_SOURCE, /"bundleDependencies"/);
  assert.match(PACKAGE_JSON_SOURCE, /prepare-publish-manifest/);
  assert.doesNotMatch(PACKAGE_JSON_SOURCE, /sync:interaction-vendors/);
});

test("live vault paths surface render failures clearly", () => {
  assert.match(COMMANDS_SOURCE, /Vault template render failed \(/);
  assert.match(PICKER_SOURCE, /Vault live picker render failed \(/);
});
