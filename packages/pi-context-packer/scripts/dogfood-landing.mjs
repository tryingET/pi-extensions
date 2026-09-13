#!/usr/bin/env node
/** Re-execute every increment on the exact packed landing candidate, including the prompt. */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export async function landingScenario(migrationScenario) {
  const checks = [await migrationScenario()];
  for (const [file, name] of [
    ["budget", "budgetScenario"],
    ["adapter", "adapterScenario"],
    ["discovery", "discoveryScenario"],
    ["expansion", "expansionScenario"],
    ["cache", "cacheScenario"],
    ["working-set", "workingSetScenario"],
    ["evaluation", "evaluationScenario"],
    ["policy", "policyScenario"],
    ["mustfix", "mustfixScenario"],
  ]) {
    checks.push(await (await import(`./dogfood-${file}.mjs`))[name]());
  }
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const parser = await import(
    new URL("./core/prompt-templates.js", import.meta.resolve("@earendil-works/pi-coding-agent"))
  );
  const prompts = parser.loadPromptTemplates({
    cwd: root,
    agentDir: root,
    promptPaths: [join(root, "prompts")],
    includeDefaults: false,
  });
  const expanded = parser.expandPromptTemplate("/ripwire-context Find the cache identity", prompts);
  assert.match(expanded, /Find the cache identity/);
  assert.match(expanded, /providers\.ripwire: "required"/);
  assert.doesNotMatch(expanded, /\$@/);
  for (const field of [
    "code.mode",
    "code.selection",
    "contentSha256",
    "code.refresh",
    "stale_selection",
    "isError",
  ])
    assert.ok(expanded.includes(field), `Installed prompt must explain ${field}`);
  assert.equal(prompts.filter((p) => p.name === "ripwire-context").length, 1);
  return {
    gate: "RW-10",
    checks,
    prompt: "installed_pinned_runtime_parser_passed",
    automaticActivation: false,
    independentAuthorship: false,
    modelTaskBenchmark: false,
  };
}
