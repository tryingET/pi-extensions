import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { profileCatalog } from "../dist/task-session/profiles.js";
import { durableWrite } from "../dist/task-session/state.js";
import { provisionOwnerModel, setup } from "./fixtures/task-session/startup-fixture.mjs";

const pkg = resolve(
    dirname(fileURLToPath(import.meta.resolve("../dist/task-session/profiles.js"))),
    "../..",
  ),
  loader = resolve(import.meta.dirname, "fixtures/task-session/profile-public-loader.mjs");
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "task5480-public-profiles-")),
    root = join(home, ".local/state/pi-task-sessions"),
    config = join(home, ".config/pi-task-sessions");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  mkdirSync(config, { recursive: true, mode: 0o700 });
  const f = provisionOwnerModel(setup(false, root));
  durableWrite(join(config, "host.json"), f.locator, true);
  return { ...f, home };
}
function run(f, args) {
  return execFileSync(process.execPath, ["--import", loader, ...args], {
    cwd: pkg,
    encoding: "utf8",
    env: {
      PATH: "/usr/bin:/bin",
      TMPDIR: tmpdir(),
      HOME: f.home,
      TEST_PROFILE_HOME: f.home,
    },
    timeout: 30000,
  });
}
test("public CLI and Pi tool discover exact profiles with all subprocess/provider calls prohibited", async () => {
  const f = fixture(),
    before = readFileSync(join(f.root, "state.json"));
  const expected = await profileCatalog(f.locator);
  const cli = JSON.parse(run(f, ["dist/task-session/bin.js", "profiles"]));
  assert.deepEqual(cli, expected);
  const tool = JSON.parse(
    run(f, [
      "--input-type=module",
      "-e",
      `import tool from './dist/task-session/pi-tool.js';let registered;tool({registerTool:s=>registered=s});console.log(JSON.stringify(await registered.execute('synthetic',{operation:'profiles'})));`,
    ]),
  );
  assert.deepEqual(tool.details, expected);
  assert.deepEqual(JSON.parse(tool.content[0].text), expected);
  const row = cli.profiles.find((p) => p.profile === f.request.profile);
  assert.equal(row.validation, "profile_preflight_passed");
  assert.deepEqual(row.requested, f.source.requested);
  assert.deepEqual(row.resolved, f.source.resolved);
  assert.equal(cli.admissionAssessed, false);
  assert.equal(cli.publicationPerformed, false);
  const serialized = JSON.stringify(cli);
  for (const key of ["access", "refresh", "credentialDigest"])
    assert.equal(serialized.includes(`"${key}"`), false);
  assert.deepEqual(readFileSync(join(f.root, "state.json")), before);
  assert.deepEqual(readdirSync(join(f.root, "attempts")), []);
});
test("unavailable profile diagnostics disclose no raw credential/parser content", async () => {
  const f = fixture();
  writeFileSync(
    join(f.root, "credentials", `${f.pin.credentialDigest}.json`),
    '{"not-a-credential":"synthetic-secret-never-log"}',
  );
  const result = JSON.parse(run(f, ["dist/task-session/bin.js", "profiles"]));
  assert.ok(result.profiles.every((p) => p.validation === "unavailable"));
  assert.equal(JSON.stringify(result).includes("synthetic-secret-never-log"), false);
});
test("profile catalog rejects unknown files rather than presenting a partial inventory", async () => {
  const f = fixture();
  writeFileSync(join(f.root, "profiles", "unexpected.txt"), "synthetic");
  await assert.rejects(profileCatalog(f.locator), /profile_catalog_unexpected_entry/);
});
