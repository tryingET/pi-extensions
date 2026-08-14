#!/usr/bin/env node
// Headless extension smoke harness.
//
// Loads each package's extensions exactly like the Pi runtime does
// (DefaultResourceLoader) but with an isolated agent directory and no model
// session, then verifies that every extension file loads without error and
// registers well-formed tools/commands. This closes the verification gap
// where `pi -p` one-shot sessions cannot exercise extension surfaces.
//
// This proves: load + factory execution + registration shape.
// It does NOT prove tool execute() behavior — packages own that in tests.
//
// Exit codes: 0 = all pass, 1 = any failure, 2 = harness failure.
//
// Usage:
//   node scripts/extension-smoke.mjs                     # all packages
//   node scripts/extension-smoke.mjs pi-vault-client     # one package
//   node scripts/extension-smoke.mjs --json

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function loadSdk() {
  // Prefer the installed pi-coding-agent so the harness matches the live runtime.
  const candidates = [
    resolve(homedir(), ".npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js"),
  ];
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    candidates.push(resolve(globalRoot, "@earendil-works/pi-coding-agent/dist/index.js"));
  } catch {
    // npm not available; fall through
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return import(`file://${candidate}`);
  }
  console.error("pi-coding-agent SDK not found; cannot smoke extensions");
  process.exit(2);
}

// RegisteredTool = { definition: ToolDefinition, sourceInfo }; containers may be arrays or name-keyed maps.
function entriesOf(container) {
  if (!container) return [];
  if (container instanceof Map) return Array.from(container.values());
  return Array.isArray(container) ? container : Object.values(container);
}

function toolIssues(registered) {
  const issues = [];
  const def = registered?.definition ?? registered;
  const name = def?.name ?? registered?.name ?? "(unnamed)";
  if (!def || typeof def !== "object") return [`tool ${name}: missing definition`];
  if (typeof def.name !== "string" || def.name.length === 0) issues.push("missing tool.name");
  if (typeof def.description !== "string" || def.description.length === 0) {
    issues.push(`tool ${name}: missing description`);
  }
  if (!def.parameters || typeof def.parameters !== "object") {
    issues.push(`tool ${name}: missing parameters schema`);
  }
  if (typeof def.execute !== "function") {
    issues.push(`tool ${name}: missing execute()`);
  }
  return issues;
}

async function smokePackage(sdk, packageDir, agentDir) {
  const result = { package: packageDir.split("/").pop(), files: 0, tools: 0, commands: 0, errors: [], warnings: [] };
  const manifestPath = resolve(packageDir, "package.json");
  let files = [];
  if (existsSync(manifestPath)) {
    // Smoke exactly the entrypoints Pi installs: package.json#pi.extensions.
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const declared = manifest?.pi?.extensions;
    if (Array.isArray(declared) && declared.length > 0) {
      files = declared
        .filter((e) => typeof e === "string" && !e.startsWith("-"))
        .map((e) => resolve(packageDir, e.replace(/^\./, "").replace(/^\//, "")));
      for (const [i, entry] of declared.entries()) {
        if (typeof entry === "string" && entry.startsWith("-")) {
          result.warnings.push(`manifest disables ${entry.slice(1)}; skipping`);
        }
      }
    }
  }
  if (files.length === 0) {
    const extDir = resolve(packageDir, "extensions");
    if (!existsSync(extDir)) {
      result.warnings.push("no manifest pi.extensions and no extensions/ directory");
      return result;
    }
    files = readdirSync(extDir, { recursive: true })
      .map((f) => String(f))
      .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
      .map((f) => resolve(extDir, f));
  }
  const missing = files.filter((f) => !existsSync(f));
  for (const f of missing) result.errors.push(`declared extension entrypoint does not exist: ${f}`);
  files = files.filter((f) => existsSync(f));
  result.files = files.length;
  if (files.length === 0) {
    if (missing.length === 0) result.warnings.push("no extension entrypoints found");
    return result;
  }

  const loader = new sdk.DefaultResourceLoader({
    cwd: repoRoot,
    agentDir,
    additionalExtensionPaths: files,
  });
  await loader.reload();
  const loaded = loader.getExtensions();

  for (const err of loaded.errors ?? []) {
    result.errors.push(String(err?.message ?? err?.error ?? JSON.stringify(err)).slice(0, 300));
  }
  for (const ext of loaded.extensions ?? []) {
    for (const tool of entriesOf(ext.tools)) {
      result.tools += 1;
      result.errors.push(...toolIssues(tool));
    }
    for (const command of entriesOf(ext.commands)) {
      result.commands += 1;
      const def = command?.definition ?? command;
      if (typeof def?.name !== "string" || def.name.length === 0) {
        result.errors.push("command entry missing name");
      }
      if (typeof def?.handler !== "function") {
        result.errors.push(`command ${def?.name ?? "(unnamed)"}: missing handler()`);
      }
    }
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const names = args.filter((a) => !a.startsWith("--"));
  const packagesRoot = resolve(repoRoot, "packages");
  let packageDirs;
  if (names.length > 0) {
    packageDirs = names.map((n) => resolve(packagesRoot, n));
    for (const dir of packageDirs) {
      if (!existsSync(dir)) {
        console.error(`package not found: ${dir}`);
        process.exit(2);
      }
    }
  } else {
    packageDirs = readdirSync(packagesRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const dir = resolve(packagesRoot, d.name);
        // package groups: packages/<group>/<pkg>
        const nested = resolve(dir, "extensions");
        return existsSync(nested) ? dir : dir;
      });
  }

  const sdk = await loadSdk();
  const isolatedAgentDir = mkdtempSync(resolve(tmpdir(), "ext-smoke-agentdir-"));
  const results = [];
  let failed = false;
  try {
    for (const dir of packageDirs) {
      // Nested package groups (e.g. pi-interaction/pi-interaction) get expanded.
      const direct = existsSync(resolve(dir, "extensions"));
      const candidates = direct ? [dir] : [];
      if (!direct && existsSync(resolve(dir, "package.json")) === false) {
        for (const child of readdirSync(dir, { withFileTypes: true })) {
          if (child.isDirectory() && existsSync(resolve(dir, child.name, "extensions"))) {
            candidates.push(resolve(dir, child.name));
          }
        }
      }
      if (candidates.length === 0) continue;
      for (const candidate of candidates) {
        const result = await smokePackage(sdk, candidate, isolatedAgentDir);
        results.push(result);
        if (result.errors.length > 0) failed = true;
      }
    }
  } finally {
    rmSync(isolatedAgentDir, { recursive: true, force: true });
  }

  if (asJson) {
    console.log(JSON.stringify({ failed, results }, null, 2));
  } else {
    for (const r of results) {
      const status = r.errors.length > 0 ? "FAIL" : "ok";
      console.log(
        `${status}  ${r.package.padEnd(34)} files=${String(r.files).padStart(2)} tools=${String(r.tools).padStart(2)} commands=${String(r.commands).padStart(2)}`,
      );
      for (const e of r.errors) console.log(`      error: ${e}`);
      for (const w of r.warnings) console.log(`      note:  ${w}`);
    }
    const totals = results.reduce(
      (acc, r) => ({
        files: acc.files + r.files,
        tools: acc.tools + r.tools,
        commands: acc.commands + r.commands,
        errors: acc.errors + r.errors.length,
      }),
      { files: 0, tools: 0, commands: 0, errors: 0 },
    );
    console.log(
      `extension-smoke: ${failed ? "FAILED" : "OK"} — ${results.length} packages, ${totals.files} files, ${totals.tools} tools, ${totals.commands} commands, ${totals.errors} errors`,
    );
  }
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
