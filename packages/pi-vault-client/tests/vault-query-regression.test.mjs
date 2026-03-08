import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const DB_SOURCE = readFileSync(new URL("../src/vaultDb.ts", import.meta.url), "utf8");
const PICKER_SOURCE = readFileSync(new URL("../src/vaultPicker.ts", import.meta.url), "utf8");
const COMMANDS_SOURCE = readFileSync(new URL("../src/vaultCommands.ts", import.meta.url), "utf8");
const TOOLS_SOURCE = readFileSync(new URL("../src/vaultTools.ts", import.meta.url), "utf8");
const TYPES_SOURCE = readFileSync(new URL("../src/vaultTypes.ts", import.meta.url), "utf8");
const EXTENSION_SOURCE = readFileSync(new URL("../extensions/vault.ts", import.meta.url), "utf8");

test("vault runtime targets Prompt Vault schema v7", () => {
  assert.match(TYPES_SOURCE, /const\s+SCHEMA_VERSION\s*=\s*7/);
  assert.match(TYPES_SOURCE, /const\s+DEFAULT_VAULT_QUERY_LIMIT\s*=\s*20/);
  assert.match(DB_SOURCE, /SELECT MAX\(version\) AS version FROM schema_version/);
  assert.match(
    EXTENSION_SOURCE,
    /owner_company\/visibility_companies\/controlled_vocabulary\/export_to_pi/,
  );
});

test("schema compatibility requires governance and controlled vocabulary columns", () => {
  for (const column of [
    "artifact_kind",
    "control_mode",
    "formalization_level",
    "owner_company",
    "visibility_companies",
    "controlled_vocabulary",
    "export_to_pi",
  ]) {
    assert.match(DB_SOURCE, new RegExp(`"${column}"`));
  }
});

test("vault_query uses implicit visibility filtering", () => {
  assert.match(DB_SOURCE, /function\s+buildVisibilityPredicate\(/);
  assert.match(
    DB_SOURCE,
    /JSON_SEARCH\(visibility_companies, 'one', '\$\{escapeSql\(company\)\}'\) IS NOT NULL/,
  );
  assert.match(
    DB_SOURCE,
    /status = 'active'", buildVisibilityPredicate\(filters\.visibility_company\)/,
  );
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
  assert.match(
    DB_SOURCE,
    /buildSelectColumns\(includeContent \|\| Boolean\(filters\.intent_text\)\)/,
  );
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

test("session_start reports vault unavailability instead of empty counts", () => {
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
  assert.match(
    COMMANDS_SOURCE,
    /const exactMatch = query\.trim\(\) \? runtime\.loadVaultTemplate\(query\.trim\(\)\) : null/,
  );
  assert.match(COMMANDS_SOURCE, /selection mode=exact/);
});

test("legacy browse select and list commands are removed", () => {
  assert.doesNotMatch(COMMANDS_SOURCE, /pi\.registerCommand\("vault-browse"/);
  assert.doesNotMatch(COMMANDS_SOURCE, /pi\.registerCommand\("vault-browser"/);
  assert.doesNotMatch(COMMANDS_SOURCE, /pi\.registerCommand\("vault-select"/);
  assert.doesNotMatch(COMMANDS_SOURCE, /\/vault-list/);
});

test("vault picker surfaces full candidate set to UI", () => {
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

test("vault check command reports company context and key template visibility", () => {
  assert.match(DB_SOURCE, /function\s+resolveCurrentCompanyContext\(/);
  assert.match(DB_SOURCE, /source: "env:PI_COMPANY"/);
  assert.match(DB_SOURCE, /source: `cwd:\$\{cwd\}`/);
  assert.match(COMMANDS_SOURCE, /pi\.registerCommand\("vault-check"/);
  assert.match(COMMANDS_SOURCE, /# Vault Check/);
  assert.match(COMMANDS_SOURCE, /company_source:/);
  assert.match(COMMANDS_SOURCE, /meta-orchestration:/);
  assert.match(COMMANDS_SOURCE, /next-10-expert-suggestions:/);
});

test("vault live telemetry command is exposed", () => {
  assert.match(COMMANDS_SOURCE, /pi\.registerCommand\("vault-live-telemetry"/);
});
