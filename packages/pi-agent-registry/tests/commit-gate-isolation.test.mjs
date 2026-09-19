// summary: Default commit tests must run without live fleet or engineering-core reads.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const self = fileURLToPath(import.meta.url);
const testsRoot = dirname(self);
const guard = join(testsRoot, "forbid-live-fleet.guard.mjs");
function run(args) {
  const scratch = mkdtempSync(join(tmpdir(), "fleet-io-tripwire-"));
  const trace = join(scratch, "violations.jsonl");
  const env = { ...process.env, PI_AGENT_REGISTRY_TEST_VIOLATIONS: trace };
  delete env.NODE_TEST_CONTEXT;
  // NODE_OPTIONS reaches ordinary Node subprocesses as well as test-file workers.
  env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(guard).href}`;
  try {
    const result = spawnSync(process.execPath, args, {
      cwd: dirname(testsRoot),
      env,
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { ...result, violations: existsSync(trace) ? readFileSync(trace, "utf8") : "" };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
function defaultTests(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = join(root, entry.name);
    if (entry.isDirectory()) return defaultTests(file);
    return /\.test\.[cm]?[jt]sx?$/.test(entry.name) && file !== self ? [file] : [];
  });
}
const imports =
  'import fs from "node:fs"; import fsp from "node:fs/promises"; import os from "node:os"; import path from "node:path"; const target=path.join(os.homedir(), "ai-society/agents");';
for (const [name, body] of [
  ["caught sync read", "try { fs.existsSync(target); } catch {}"],
  ["caught opendir rejection", "await fsp.opendir(target).catch(() => {});"],
  [
    "ignored callback read error",
    "await new Promise(resolve => fs.readFile(target, () => resolve()));",
  ],
  [
    "explicit successful exit after caught read",
    "try { fs.existsSync(target); } catch {} process.exit(0);",
  ],
  [
    "promisified exists",
    'const {promisify}=await import("node:util"); await promisify(fs.exists)(target);',
  ],
]) {
  test(`tripwire records ${name} and cannot exit green`, () => {
    const result = run(["--input-type=module", "-e", `${imports} ${body}`]);
    assert.notEqual(result.status, 0);
    assert.match(result.violations, /ai-society\/agents/);
  });
}

test("allowed promisified exists preserves its boolean result", () => {
  const result = run([
    "--input-type=module",
    "-e",
    'import fs from "node:fs"; import {promisify} from "node:util"; if(await promisify(fs.exists)("package.json") !== true) throw new Error("exists result changed");',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.violations, "");
});

test("ordinary Node grandchildren inherit the guard; ignored child failure still leaves evidence", () => {
  const child = `${imports} try { fs.existsSync(target); } catch {}`;
  const result = run([
    "--input-type=module",
    "-e",
    `import {spawnSync} from "node:child_process"; const child=spawnSync(process.execPath,["--input-type=module","-e",${JSON.stringify(child)}]); if(child.status !== 1) throw new Error("unguarded grandchild");`,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.violations, /ai-society\/agents/);
});

test("all default commit tests pass with live fleet/profile I/O forbidden", () => {
  const files = defaultTests(testsRoot).sort();
  assert.ok(files.length > 0);
  assert.ok(
    files.every((file) => !file.startsWith(`${join(testsRoot, "environment-health")}${sep}`)),
  );
  const result = run(["--test", "--test-timeout=30000", ...files]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.violations, "", `caught/child live-source access:\n${result.violations}`);
});
