// ---
// summary: "Proves real offline Pi RPC G1 survives production G2 materialization with isolated file-dependency churn."
// read_when:
//   - "Changing generation concurrency, real host provenance, activation, or rollback coverage."
// ---
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { activateGeneration, initPrivateEnvironment, rollbackActivation } from "./pi-extension-generations/activation.mjs";
import { run } from "./pi-extension-generations/common.mjs";
import { materializePlan } from "./pi-extension-generations/materialize.mjs";
import { planGeneration } from "./pi-extension-generations/plan.mjs";
import { probeFreshHost } from "./pi-extension-generations/probe.mjs";
import { verifyGeneration } from "./pi-extension-generations/verify.mjs";

const PACKAGE_ROOT = "packages/pi-agent-interaction-canary";
const PACKAGE_NAME = "@tryinget/pi-agent-interaction-canary";
const COMMAND_NAME = "generation-fixture";

async function makeRemovable(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await makeRemovable(target);
    else if (!entry.isSymbolicLink()) await chmod(target, 0o600).catch(() => {});
  }
  await chmod(directory, 0o700).catch(() => {});
}

async function scratch(t) {
  const root = await mkdtemp(path.join(tmpdir(), "pi-extension-generations-real-rpc-"));
  await chmod(root, 0o700);
  t.after(async () => { await makeRemovable(root); await rm(root, { recursive: true, force: true }); });
  return root;
}

async function findPi() {
  const explicit = process.env.PI_GENERATION_TEST_PI;
  const candidates = explicit ? [explicit] : (process.env.PATH ?? "").split(path.delimiter).map((directory) => path.join(directory, "pi"));
  for (const candidate of candidates) {
    try { await access(candidate, constants.X_OK); return realpath(candidate); } catch {}
  }
  throw new Error("real Pi executable is required for the generation concurrency regression");
}

async function writeSelectedPackage(repo, generation) {
  const packageDir = path.join(repo, PACKAGE_ROOT);
  await mkdir(path.join(packageDir, "extensions"), { recursive: true });
  const manifest = {
    name: PACKAGE_NAME,
    version: "1.0.0",
    private: true,
    type: "module",
    pi: { extensions: ["./extensions/generation-fixture.mjs"] },
    peerDependencies: { "@earendil-works/pi-coding-agent": "*" },
  };
  const lock = {
    name: PACKAGE_NAME,
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: { "": { name: PACKAGE_NAME, version: "1.0.0", peerDependencies: manifest.peerDependencies } },
  };
  await writeFile(path.join(packageDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(packageDir, "package-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  await writeFile(path.join(packageDir, "extensions", "generation-fixture.mjs"), `export default function (pi) { pi.registerCommand(${JSON.stringify(COMMAND_NAME)}, { description: "immutable generation fixture", handler: async (_args, ctx) => { ctx.ui.notify(JSON.stringify({ generation: ${JSON.stringify(generation)} }), "info"); } }); }\n`);
}

async function writeChurnPackages(repo) {
  const app = path.join(repo, "fixtures", "churn-app");
  const neighbor = path.join(repo, "fixtures", "neighbor");
  await mkdir(app, { recursive: true });
  await mkdir(neighbor, { recursive: true });
  const lifecycleTarget = "../lifecycle-ran";
  await writeFile(path.join(neighbor, "package.json"), `${JSON.stringify({ name: "neighbor", version: "2.0.0", type: "module", exports: "./index.mjs", scripts: { postinstall: `node -e \"require('fs').writeFileSync('${lifecycleTarget}','ran')\"` } }, null, 2)}\n`);
  await writeFile(path.join(neighbor, "index.mjs"), "export const neighborGeneration = 'G2-neighbor';\n");
  const appManifest = { name: "churn-app", version: "1.0.0", type: "module", dependencies: { neighbor: "file:../neighbor" } };
  const lock = {
    name: "churn-app",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name: "churn-app", version: "1.0.0", dependencies: appManifest.dependencies },
      "../neighbor": { name: "neighbor", version: "2.0.0", hasInstallScript: true },
      "node_modules/neighbor": { resolved: "../neighbor", link: true },
    },
  };
  await writeFile(path.join(app, "package.json"), `${JSON.stringify(appManifest, null, 2)}\n`);
  await writeFile(path.join(app, "package-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  await writeFile(path.join(app, "index.mjs"), "import { neighborGeneration } from 'neighbor'; console.log(neighborGeneration);\n");
}

async function commit(repo, message) {
  await run("git", ["-C", repo, "add", "-A"]);
  await run("git", ["-C", repo, "commit", "-q", "-m", message]);
  return (await run("git", ["-C", repo, "rev-parse", "HEAD"])).stdout.toString("utf8").trim();
}

function planOptions(repo, stateRoot, commitValue) {
  return { repoRoot: repo, commit: commitValue, packageRoot: PACKAGE_ROOT, stateRoot };
}

function hostEnvironment(sandboxRoot, agentDir, temporary) {
  const env = {};
  for (const key of ["PATH", "LANG", "LC_ALL", "SystemRoot", "WINDIR"]) if (process.env[key]) env[key] = process.env[key];
  return { ...env, HOME: path.join(sandboxRoot, "home"), PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0", TMPDIR: temporary, TMP: temporary, TEMP: temporary, npm_config_offline: "true", npm_config_ignore_scripts: "true", npm_config_audit: "false", npm_config_fund: "false" };
}

function startRealRpc(piExecutable, environment, timeoutMs = 15_000) {
  const child = spawn(piExecutable, ["--mode", "rpc", "--no-session", "--offline", "--no-approve", "--no-context-files", "--no-builtin-tools", "--no-skills", "--no-prompt-templates", "--no-themes"], { cwd: environment.projectDir, env: environment.env, stdio: ["pipe", "pipe", "pipe"] });
  const events = [];
  const errors = [];
  const stderr = [];
  const pending = new Map();
  let buffer = "";
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    while (true) {
      const index = buffer.indexOf("\n");
      if (index < 0) break;
      const line = buffer.slice(0, index).replace(/\r$/u, "");
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      events.push(event);
      if (event.type === "extension_error") errors.push(event);
      if (event.type === "response" && event.id && pending.has(event.id)) {
        const request = pending.get(event.id);
        pending.delete(event.id);
        clearTimeout(request.timer);
        request.resolve(event);
      }
    }
  });
  const exited = new Promise((resolve) => child.once("close", (code, signal) => resolve({ code, signal })));
  return {
    child, events, errors, stderr,
    request(type, fields = {}) {
      const id = `test-${Math.random().toString(16).slice(2)}`;
      const response = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`RPC ${type} timed out`)), timeoutMs);
        pending.set(id, { resolve, reject, timer });
      });
      child.stdin.write(`${JSON.stringify({ id, type, ...fields })}\n`);
      return response;
    },
    async close() { child.stdin.end(); return exited; },
  };
}

async function selectedCommand(rpc, expectedPackageDir) {
  const response = await rpc.request("get_commands");
  assert.equal(response.success, true);
  const selected = response.data.commands.filter((command) => command.source === "extension" && command.name === COMMAND_NAME);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].sourceInfo.baseDir, expectedPackageDir);
  assert.equal(selected[0].sourceInfo.path, path.join(expectedPackageDir, "extensions", "generation-fixture.mjs"));
  return selected[0].sourceInfo;
}

async function invokeGenerationCommand(rpc, expectedGeneration, expectedPackageDir) {
  const sourceInfo = await selectedCommand(rpc, expectedPackageDir);
  const start = rpc.events.length;
  const response = await rpc.request("prompt", { message: `/${COMMAND_NAME} {}` });
  assert.equal(response.success, true);
  const notifications = rpc.events.slice(start).filter((event) => event.type === "extension_ui_request" && event.method === "notify");
  const failure = notifications.find((event) => event.notifyType === "error");
  assert.equal(failure, undefined);
  const success = notifications.findLast((event) => event.notifyType === "info");
  assert.ok(success);
  assert.deepEqual(JSON.parse(success.message), { generation: expectedGeneration });
  return sourceInfo;
}

function npmEnvironment(root) {
  const env = {};
  for (const key of ["PATH", "LANG", "LC_ALL", "SystemRoot", "WINDIR"]) if (process.env[key]) env[key] = process.env[key];
  return { ...env, HOME: path.join(root, "home"), TMPDIR: path.join(root, "tmp"), TMP: path.join(root, "tmp"), TEMP: path.join(root, "tmp"), npm_config_cache: path.join(root, "cache"), npm_config_offline: "true", npm_config_ignore_scripts: "true", npm_config_audit: "false", npm_config_fund: "false" };
}

async function churnNeighbor({ candidateRoot, repoDir }, hooks = {}) {
  const app = path.join(repoDir, "fixtures", "churn-app");
  const neighbor = path.join(repoDir, "fixtures", "neighbor");
  const neighborManifest = await readFile(path.join(neighbor, "package.json"));
  const neighborSource = await readFile(path.join(neighbor, "index.mjs"));
  const npmRoot = path.join(candidateRoot, "test-npm-effects");
  for (const name of ["home", "tmp", "cache"]) await mkdir(path.join(npmRoot, name), { recursive: true, mode: 0o700 });
  const env = npmEnvironment(npmRoot);
  await rm(neighbor, { recursive: true });
  await hooks.afterNeighborRemoved?.();
  const failedChurnCommand = await run("npm", ["pack", "../neighbor", "--ignore-scripts", "--json"], { cwd: app, env, allowFailure: true });
  assert.notEqual(failedChurnCommand.code, 0, "the explicit absent-neighbor churn command must actually fail");
  const candidateInstall = await run("npm", ["ci", "--omit=dev", "--ignore-scripts", "--legacy-peer-deps"], { cwd: app, env, allowFailure: true });
  const absentLoad = await run(process.execPath, [path.join(app, "index.mjs")], { env, allowFailure: true });
  assert.notEqual(absentLoad.code, 0, "candidate verification must reject the absent neighboring file dependency");
  await mkdir(neighbor, { mode: 0o700 });
  await writeFile(path.join(neighbor, "package.json"), neighborManifest);
  await writeFile(path.join(neighbor, "index.mjs"), neighborSource);
  const installed = await run("npm", ["ci", "--omit=dev", "--ignore-scripts", "--legacy-peer-deps"], { cwd: app, env, allowFailure: true });
  assert.equal(installed.code, 0, installed.stderr.toString("utf8"));
  const load = await run(process.execPath, [path.join(app, "index.mjs")], { env });
  assert.equal(load.stdout.toString("utf8").trim(), "G2-neighbor");
  await assert.rejects(readFile(path.join(repoDir, "fixtures", "lifecycle-ran")), /ENOENT/u);
  return { failedChurnCommandCode: failedChurnCommand.code, candidateInstallCode: candidateInstall.code, absentLoadCode: absentLoad.code, successfulInstallCode: installed.code };
}

function explicitBarrier() {
  let enteredResolve;
  let releaseResolve;
  const entered = new Promise((resolve) => { enteredResolve = resolve; });
  const released = new Promise((resolve) => { releaseResolve = resolve; });
  return {
    entered,
    release: releaseResolve,
    async hold() { enteredResolve(); await released; },
  };
}

test("real Pi keeps verified G1 active through explicitly overlapping failed/successful G2 materialization, then activation and rollback stay unmixed", async (t) => {
  const root = await scratch(t);
  const piExecutable = await findPi();
  const version = (await run(piExecutable, ["--version"])).stdout.toString("utf8").trim();
  assert.equal(version, "0.84.1");
  const repo = path.join(root, "repo");
  const stateRoot = path.join(root, "state");
  await mkdir(repo, { mode: 0o700 });
  await run("git", ["-C", repo, "init", "-q"]);
  await run("git", ["-C", repo, "config", "user.email", "fixture@example.invalid"]);
  await run("git", ["-C", repo, "config", "user.name", "Real Pi Generation Fixture"]);
  await writeSelectedPackage(repo, "G1");
  const g1Commit = await commit(repo, "G1");
  const g1 = await materializePlan(await planGeneration(planOptions(repo, stateRoot, g1Commit)));
  await verifyGeneration(g1.generationDir);

  const sandboxRoot = path.join(root, "private-host");
  const agentDir = path.join(sandboxRoot, "agent");
  const projectDir = path.join(sandboxRoot, "cwd");
  await mkdir(sandboxRoot, { mode: 0o700 });
  await initPrivateEnvironment({ sandboxRoot, agentDir, projectDir });
  await mkdir(path.join(sandboxRoot, "home"), { mode: 0o700 });
  await activateGeneration({ sandboxRoot, agentDir, projectDir, generationDir: g1.generationDir });
  const rpcTmp = path.join(sandboxRoot, "rpc-tmp");
  await mkdir(rpcTmp, { mode: 0o700 });
  const rpc = startRealRpc(piExecutable, { projectDir, env: hostEnvironment(sandboxRoot, agentDir, rpcTmp) });
  t.after(() => rpc.child.kill("SIGKILL"));
  const observedPaths = [];
  for (let index = 0; index < 3; index += 1) observedPaths.push((await invokeGenerationCommand(rpc, "G1", g1.packageDir)).baseDir);

  await writeSelectedPackage(repo, "G2");
  await writeChurnPackages(repo);
  const g2Commit = await commit(repo, "G2 with neighboring file dependency churn fixture");
  const g2Plan = await planGeneration(planOptions(repo, stateRoot, g2Commit));
  const failedBarrier = explicitBarrier();
  const failedChurn = [];
  const failedOutcome = materializePlan(g2Plan, {
    async afterExport(context) { failedChurn.push(await churnNeighbor(context, { afterNeighborRemoved: () => failedBarrier.hold() })); },
    beforePublish() { throw new Error("injected prepublication failure"); },
  }).then((value) => ({ value }), (error) => ({ error }));
  await failedBarrier.entered;
  let failedOverlapSource;
  try { failedOverlapSource = (await invokeGenerationCommand(rpc, "G1", g1.packageDir)).baseDir; }
  finally { failedBarrier.release(); }
  const failed = await failedOutcome;
  assert.equal(failedOverlapSource, g1.packageDir, "G1 invocation must complete while failed G2 materialization is held in flight");
  observedPaths.push(failedOverlapSource);
  assert.match(failed.error?.message ?? "", /injected prepublication failure/u);
  assert.equal(failedChurn.length, 1);
  assert.notEqual(failedChurn[0].failedChurnCommandCode, 0);
  assert.notEqual(failedChurn[0].absentLoadCode, 0);
  await assert.rejects(stat(g2Plan.paths.generationDir), /ENOENT/u);

  const successBarrier = explicitBarrier();
  const successfulChurn = [];
  const successOutcome = materializePlan(g2Plan, {
    async afterExport(context) { successfulChurn.push(await churnNeighbor(context, { afterNeighborRemoved: () => successBarrier.hold() })); },
  }).then((value) => ({ value }), (error) => ({ error }));
  await successBarrier.entered;
  let successOverlapSource;
  try { successOverlapSource = (await invokeGenerationCommand(rpc, "G1", g1.packageDir)).baseDir; }
  finally { successBarrier.release(); }
  const successful = await successOutcome;
  assert.equal(successOverlapSource, g1.packageDir, "G1 invocation must complete while successful G2 materialization is held in flight");
  observedPaths.push(successOverlapSource);
  assert.equal(successfulChurn.length, 1);
  assert.notEqual(successfulChurn[0].failedChurnCommandCode, 0);
  assert.equal(successfulChurn[0].successfulInstallCode, 0);
  assert.equal(successful.error, undefined);
  const g2 = successful.value;
  await verifyGeneration(g2.generationDir);
  observedPaths.push((await invokeGenerationCommand(rpc, "G1", g1.packageDir)).baseDir);
  assert.ok(observedPaths.every((source) => source === g1.packageDir));
  assert.equal(rpc.errors.length, 0);
  const close = await rpc.close();
  assert.equal(close.code, 0, Buffer.concat(rpc.stderr).toString("utf8"));
  assert.equal(Buffer.concat(rpc.stderr).toString("utf8"), "");

  await activateGeneration({ sandboxRoot, agentDir, projectDir, generationDir: g2.generationDir });
  const requestFile = path.join(sandboxRoot, "request.json");
  await writeFile(requestFile, "{}\n", { mode: 0o600 });
  const g2Probe = await probeFreshHost({ sandboxRoot, agentDir, projectDir, generationDir: g2.generationDir, hostExecutable: piExecutable, commandName: COMMAND_NAME, expectedInlineCommands: ["llama"], requestFile });
  assert.equal(g2Probe.hostVersion, "0.84.1");
  assert.equal(g2Probe.commandResult.generation, "G2");
  assert.equal(g2Probe.selectedCommand.sourceInfo.baseDir, g2.packageDir);
  assert.ok(!JSON.stringify(g2Probe).includes(g1.packageDir));

  await rollbackActivation({ sandboxRoot, agentDir, projectDir });
  const g1Probe = await probeFreshHost({ sandboxRoot, agentDir, projectDir, generationDir: g1.generationDir, hostExecutable: piExecutable, commandName: COMMAND_NAME, expectedInlineCommands: ["llama"], requestFile });
  assert.equal(g1Probe.commandResult.generation, "G1");
  assert.equal(g1Probe.selectedCommand.sourceInfo.baseDir, g1.packageDir);
  assert.ok(!JSON.stringify(g1Probe).includes(g2.packageDir));
  assert.deepEqual((await readdir(path.join(stateRoot, "generations"))).sort(), [g1.plan.generationId, g2.plan.generationId].sort());
});
