#!/usr/bin/env node
// ---
// summary: "Runs a synthetic, temp-isolated /runtime-status fence canary with sentinel AK/Dolt executables."
// read_when:
//   - "Verifying that incident-fenced runtime status performs zero AK invocation and creates no society DB artifacts."
// ---

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const gitPath = execFileSync("/usr/bin/env", ["sh", "-c", "command -v git"], {
  encoding: "utf8",
}).trim();
const tmpBase = process.env.TMPDIR || os.tmpdir();
const tempRoot = fs.mkdtempSync(path.join(tmpBase, "pi-orch-d2e-fence-canary-"));
const binDir = path.join(tempRoot, "bin");
const homeDir = path.join(tempRoot, "home");
const vaultDir = path.join(tempRoot, "vault");
const akLogPath = path.join(tempRoot, "ak-calls.log");
const societyDb = path.join(tempRoot, "society.v2.db");
const fakeAk = path.join(binDir, "ak");
const fakeDolt = path.join(binDir, "dolt");
const watchedDbPaths = [societyDb, `${societyDb}-wal`, `${societyDb}-shm`];
const requireZeroAk = process.argv.includes("--require-zero-ak");
const keepArtifacts = process.argv.includes("--keep-artifacts");

function writeExecutable(filePath, content) {
  fs.writeFileSync(filePath, content, { mode: 0o755 });
}

function trackedStatus() {
  return execFileSync(
    gitPath,
    ["status", "--porcelain=v1", "--untracked-files=no", "--", packageRoot],
    { cwd: packageRoot, encoding: "utf8" },
  );
}

const savedEnv = Object.fromEntries(
  [
    "HOME",
    "PATH",
    "VAULT_DIR",
    "SOCIETY_DB",
    "AGENT_KERNEL",
    "PI_COMPANY",
    "PI_ORCH_AK_CLEARANCE_STATE",
    "PI_ORCH_AK_INCIDENT_FENCE",
    "D2E_CANARY_AK_LOG",
  ].map((key) => [key, process.env[key]]),
);

let receipt;
try {
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(vaultDir, { recursive: true });
  fs.writeFileSync(akLogPath, "");
  writeExecutable(
    fakeAk,
    `#!/bin/bash\nprintf '%s\\t%s\\n' "\${AK_DB:-}" "$*" >>"\${D2E_CANARY_AK_LOG:?}"\nprintf '%s\\n' '{"nodes":[]}'\n`,
  );
  writeExecutable(fakeDolt, `#!/bin/bash\nprintf '%s\\n' '{"rows":[]}'\n`);

  process.env.HOME = homeDir;
  process.env.PATH = binDir;
  process.env.VAULT_DIR = vaultDir;
  process.env.SOCIETY_DB = societyDb;
  process.env.AGENT_KERNEL = fakeAk;
  process.env.PI_COMPANY = "software";
  process.env.PI_ORCH_AK_CLEARANCE_STATE = "unknown";
  process.env.PI_ORCH_AK_INCIDENT_FENCE = "active";
  process.env.D2E_CANARY_AK_LOG = akLogPath;

  const beforeStatus = trackedStatus();
  const dbBefore = Object.fromEntries(watchedDbPaths.map((entry) => [entry, fs.existsSync(entry)]));
  const commands = new Map();
  const pi = {
    registerCommand(name, command) {
      commands.set(name, command);
    },
    registerTool() {},
    on() {},
    async exec() {
      return { stdout: "", stderr: "", code: 0 };
    },
  };

  const extensionUrl = `${pathToFileURL(path.join(packageRoot, "extensions/runtime-footer.ts")).href}?d2e-fence-canary=${Date.now()}`;
  const extensionModule = await import(extensionUrl);
  extensionModule.default(pi);
  const runtimeStatus = commands.get("runtime-status");
  assert.ok(runtimeStatus, "runtime-status command was not registered");

  const editors = [];
  await runtimeStatus.handler("", {
    hasUI: true,
    cwd: packageRoot,
    model: { id: "synthetic-fence-canary" },
    sessionManager: { getEntries: () => [] },
    getContextUsage: () => undefined,
    ui: {
      async editor(title, text) {
        editors.push({ title, text });
      },
      notify() {},
    },
  });

  const akCalls = fs
    .readFileSync(akLogPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const dbAfter = Object.fromEntries(watchedDbPaths.map((entry) => [entry, fs.existsSync(entry)]));
  const afterStatus = trackedStatus();
  const dbArtifactsCreated = watchedDbPaths.filter((entry) => !dbBefore[entry] && dbAfter[entry]);
  const pass =
    akCalls.length === 0 && dbArtifactsCreated.length === 0 && beforeStatus === afterStatus;

  receipt = {
    schema: "d2e.pi.synthetic-fence-canary.v1",
    owner_surface: "softwareco/owned/pi-extensions/packages/pi-society-orchestrator",
    synthetic_fence: {
      clearance: "unknown",
      incident_fence: "active",
      current_runtime_contract_supports_these_inputs: false,
    },
    isolation: {
      temp_root: tempRoot,
      ak_executable: "temp sentinel",
      dolt_executable: "temp sentinel",
      live_ak_invoked: false,
      live_society_db_selected: false,
      package_activation_or_reload_performed: false,
    },
    expected: {
      ak_invocations: 0,
      society_db_artifacts_created: 0,
      tracked_worktree_changed: false,
    },
    observed: {
      ak_invocations: akCalls.length,
      ak_calls: akCalls,
      society_db_artifacts_created: dbArtifactsCreated,
      tracked_worktree_changed: beforeStatus !== afterStatus,
      runtime_status_rendered: editors.length === 1,
    },
    pass,
    interpretation: pass
      ? "Synthetic absent/unknown fence performed zero AK invocations."
      : "NO-GO: /runtime-status invoked the injected AK sentinel while synthetic clearance was unknown and the incident fence was active.",
  };
} finally {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (!keepArtifacts) fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log(JSON.stringify(receipt, null, 2));
if (requireZeroAk && receipt?.pass !== true) process.exitCode = 1;
