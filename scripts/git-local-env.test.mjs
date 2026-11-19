// summary: Guards every automated test entry point against inherited Git local environment (GIT_DIR, GIT_INDEX_FILE, ...), which made fixture git commands write into the real repository.
// read_when:
//   - changing how hooks, gates, or the package test runner start test processes, or how tests spawn git.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { GIT_LOCAL_ENV_FALLBACK, gitLocalEnvVars, withoutGitLocalEnv } from "./git-local-env.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const cleanGit = () => withoutGitLocalEnv(process.env);

test("Git's own local-env list is stripped and unrelated variables are kept", () => {
  const fromGit = execFileSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8", env: cleanGit() })
    .split("\n").filter(Boolean);
  const locating = fromGit.filter((name) => !name.startsWith("GIT_CONFIG"));
  assert.deepEqual([...gitLocalEnvVars()].sort(), [...locating].sort());
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY"]) {
    assert.ok(GIT_LOCAL_ENV_FALLBACK.includes(name), `${name} must be in the fallback list`);
  }
  const poisoned = Object.fromEntries(locating.map((name) => [name, "/poison"]));
  const config = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "maintenance.auto", GIT_CONFIG_VALUE_0: "false" };
  const env = withoutGitLocalEnv({ ...poisoned, ...config, GIT_AUTHOR_NAME: "keep", PATH: "/bin" });
  for (const name of locating) assert.equal(env[name], undefined, name);
  for (const [name, value] of Object.entries(config)) assert.equal(env[name], value, name);
  assert.equal(env.GIT_AUTHOR_NAME, "keep");
  assert.equal(env.PATH, "/bin");
});

test("run-package-tests starts every test file without inherited Git local env", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "git-local-env-runner-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const probe = path.join(dir, "probe.test.mjs");
  writeFileSync(probe, `import test from "node:test";\nimport assert from "node:assert/strict";\n` +
    `test("no inherited git local env", () => {\n` +
    `  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) assert.equal(process.env[name], undefined, name);\n` +
    `  assert.equal(process.env.KEEP_ME, "yes");\n});\n`);
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts/run-package-tests.mjs"), "--timeout-ms", "30000", "--", probe], {
    cwd: dir, encoding: "utf8", timeout: 60000,
    env: { ...process.env, GIT_DIR: path.join(dir, "not-a-repo"), GIT_WORK_TREE: dir, GIT_INDEX_FILE: path.join(dir, "index"), KEEP_ME: "yes" },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

// Each shell entry point that starts tests must drop Git local env before anything else runs git
// or tests: hooks receive GIT_DIR/GIT_INDEX_FILE from git itself.
for (const [file, before] of [
  [".githooks/pre-commit", "npm run quality:pre-commit"],
  [".githooks/pre-push", "npm run quality:pre-push"],
  ["scripts/ci/full.sh", "git rev-parse --show-toplevel"],
  ["scripts/package-quality-gate.sh", "run-package-tests.mjs"],
]) {
  test(`${file} drops Git local env before ${before}`, () => {
    const text = readFileSync(path.join(ROOT, file), "utf8");
    const strip = text.indexOf("git rev-parse --local-env-vars");
    assert.ok(strip >= 0, `${file} must unset git rev-parse --local-env-vars`);
    assert.ok(strip < text.indexOf(before), `${file} must strip before ${before}`);
  });
}

test("pre-commit hook really runs its checks without the hook's GIT_INDEX_FILE", (t) => {
  // Execute only the hook's strip block, then print what a test would inherit.
  const hook = readFileSync(path.join(ROOT, ".githooks/pre-commit"), "utf8");
  const block = hook.slice(hook.indexOf("git_local_env_vars="), hook.indexOf("done <<< \"$git_local_env_vars\"") + 30);
  const dir = mkdtempSync(path.join(tmpdir(), "git-local-env-hook-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = spawnSync("bash", ["-c", `set -euo pipefail\n${block}\nprintf '%s|%s' "\${GIT_INDEX_FILE-unset}" "\${GIT_DIR-unset}"`], {
    cwd: ROOT, encoding: "utf8", env: { ...process.env, GIT_INDEX_FILE: path.join(dir, "index"), GIT_DIR: path.join(ROOT, ".git") },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "unset|unset");
});
