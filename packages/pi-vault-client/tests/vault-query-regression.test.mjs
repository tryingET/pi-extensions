import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const DB_SOURCE = readFileSync(new URL("../src/vaultDb.ts", import.meta.url), "utf8");
const PICKER_SOURCE = readFileSync(new URL("../src/vaultPicker.ts", import.meta.url), "utf8");
const COMMANDS_SOURCE = readFileSync(new URL("../src/vaultCommands.ts", import.meta.url), "utf8");
const TOOLS_SOURCE = readFileSync(new URL("../src/vaultTools.ts", import.meta.url), "utf8");
const TYPES_SOURCE = readFileSync(new URL("../src/vaultTypes.ts", import.meta.url), "utf8");

test("vault_query uses SQL-side keyword filtering without pre-limit window", () => {
  assert.match(
    DB_SOURCE,
    /function\s+queryTemplates\([\s\S]*keywords:\s*string\[],[\s\S]*limit:\s*number,[\s\S]*includeContent:\s*boolean/,
  );
  assert.doesNotMatch(DB_SOURCE, /limit\s*\*\s*2/);
});

test("vault_query tag matching uses JSON_QUOTE to avoid malformed JSON literals", () => {
  assert.match(DB_SOURCE, /JSON_CONTAINS\(tags,\s*JSON_QUOTE\('/);
});

test("vault_query keyword LIKE matching escapes wildcards explicitly", () => {
  assert.match(DB_SOURCE, /function\s+escapeLikePattern\(/);
  assert.match(DB_SOURCE, /ESCAPE '!'/);
});

test("vault_query distinguishes query failure from empty search result", () => {
  assert.match(TOOLS_SOURCE, /Vault query failed:/);
  assert.match(TOOLS_SOURCE, /const\s+queryError\s*=\s*runtime\.getVaultQueryError\(\)/);
});

test("vault_query limits are clamped to a maximum", () => {
  assert.match(TYPES_SOURCE, /const\s+MAX_VAULT_QUERY_LIMIT\s*=\s*50/);
  assert.match(
    TOOLS_SOURCE,
    /Math\.min\(MAX_VAULT_QUERY_LIMIT,\s*Math\.max\(1,\s*Math\.floor\(requestedLimit\)\)\)/,
  );
});

test("vault_search uses escaped LIKE patterns and explicit wildcard escape", () => {
  assert.match(DB_SOURCE, /function\s+searchTemplates\(query:\s*string\)/);
  assert.match(DB_SOURCE, /const\s+escapedQuery\s*=\s*escapeLikePattern\(normalizedQuery\)/);
  assert.match(DB_SOURCE, /LOWER\(name\) LIKE '%\$\{escapedQuery\}%' ESCAPE '!'/);
  assert.match(DB_SOURCE, /LOWER\(content\) LIKE '%\$\{escapedQuery\}%' ESCAPE '!'/);
});

test("vault_search surfaces backend query failures explicitly", () => {
  assert.match(COMMANDS_SOURCE, /Vault search failed:/);
  assert.match(COMMANDS_SOURCE, /Usage: \/vault-search <query>/);
});

test("vault_query include_content emits full content without truncation", () => {
  assert.match(TOOLS_SOURCE, /output \+= `\\n---\\n\$\{t\.content\}\\n`;/);
  assert.doesNotMatch(TOOLS_SOURCE, /t\.content\.slice\(0,\s*500\)/);
});

test("vault selection parsing delegates :: context handling to helper", () => {
  assert.match(PICKER_SOURCE, /function\s+splitVaultQueryAndContext\(rest:\s*string\)/);
  assert.match(PICKER_SOURCE, /splitQueryAndContext\(rest,\s*"::"\)/);
});

test("vault picker surfaces full candidate set to UI", () => {
  assert.match(PICKER_SOURCE, /maxOptions:\s*Math\.max\(1,\s*candidates\.length\)/);
  assert.match(PICKER_SOURCE, /Vault template picker \(all templates\)/);
});

test("vault browser command is registered with alias", () => {
  assert.match(COMMANDS_SOURCE, /pi\.registerCommand\("vault-browse"/);
  assert.match(COMMANDS_SOURCE, /pi\.registerCommand\("vault-browser"/);
});

test("vault browser report includes ranking visibility fields", () => {
  assert.match(PICKER_SOURCE, /# Vault Browser/);
  assert.match(PICKER_SOURCE, /ranking mode:/);
  assert.match(PICKER_SOURCE, /results:\s*\$\{ranking\.ranked\.length\}\/\$\{candidates\.length\}/);
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

test("vault live telemetry command is exposed", () => {
  assert.match(COMMANDS_SOURCE, /pi\.registerCommand\("vault-live-telemetry"/);
});
