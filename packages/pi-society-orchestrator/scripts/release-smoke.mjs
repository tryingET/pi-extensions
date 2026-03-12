#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const agentDir = process.env.PI_CODING_AGENT_DIR;
const packageSpec = process.env.PACKAGE_SPEC;

assert.equal(typeof agentDir, "string", "PI_CODING_AGENT_DIR is required");
assert.equal(typeof packageSpec, "string", "PACKAGE_SPEC is required");

const settingsPath = path.join(agentDir, "settings.json");
assert.ok(fs.existsSync(settingsPath), `Missing settings.json: ${settingsPath}`);

const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const configuredPackages = Array.isArray(settings.packages) ? settings.packages : [];
assert.ok(
  configuredPackages.includes(packageSpec),
  `Expected ${packageSpec} in ${settingsPath} packages[]`,
);

const tarballPath = resolveLocalTarballPath(packageSpec);
assert.ok(fs.existsSync(tarballPath), `Tarball does not exist: ${tarballPath}`);

const tarballRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-release-smoke-tarball-"));
execFileSync("tar", ["-xzf", tarballPath, "-C", tarballRoot], { encoding: "utf8" });

const tarballPackageDir = path.join(tarballRoot, "package");
const tarballPackageJsonPath = path.join(tarballPackageDir, "package.json");
assert.ok(
  fs.existsSync(tarballPackageJsonPath),
  `Missing tarball package.json: ${tarballPackageJsonPath}`,
);

const tarballPackage = JSON.parse(fs.readFileSync(tarballPackageJsonPath, "utf8"));
const packageName = String(tarballPackage.name || "").trim();
assert.ok(packageName.length > 0, "Tarball package.json missing name");

const extensionEntry = tarballPackage.pi?.extensions?.[0];
assert.equal(typeof extensionEntry, "string", "Tarball package missing pi.extensions entry");

const npmGlobalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const installedPackageDir = path.join(npmGlobalRoot, ...packageName.split("/"));
const installedPackageJsonPath = path.join(installedPackageDir, "package.json");
assert.ok(
  fs.existsSync(installedPackageJsonPath),
  `Installed package.json missing: ${installedPackageJsonPath}`,
);

assertInstalledPackageMatchesTarball({
  tarballPackageDir,
  installedPackageDir,
});

const importRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-release-smoke-import-"));
const importablePackageDir = path.join(importRoot, "package");
const importNodeModulesPath = path.join(importRoot, "node_modules");
fs.symlinkSync(npmGlobalRoot, importNodeModulesPath, "dir");
fs.cpSync(installedPackageDir, importablePackageDir, { recursive: true });

const extensionPath = path.join(importablePackageDir, extensionEntry.replace(/^\.\//, ""));
assert.ok(fs.existsSync(extensionPath), `Importable extension entry missing: ${extensionPath}`);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-release-smoke-"));
const binDir = path.join(tempRoot, "bin");
const homeDir = path.join(tempRoot, "home");
const vaultDir = path.join(tempRoot, "vault");
const societyDbPath = path.join(tempRoot, "society.db");
const akCallLogPath = path.join(tempRoot, "ak-calls.log");
const fakeAkPath = path.join(binDir, "ak");
const fakePiPath = path.join(binDir, "pi");
const teamMismatchMarkerPath = path.join(tempRoot, "team-mismatch-subagent.marker");

fs.mkdirSync(binDir, { recursive: true });
fs.mkdirSync(homeDir, { recursive: true });
fs.mkdirSync(vaultDir, { recursive: true });
fs.writeFileSync(societyDbPath, "");

function writeExecutable(filePath, content) {
  fs.writeFileSync(filePath, content);
  fs.chmodSync(filePath, 0o755);
}

function seedVault(dir) {
  execFileSync("dolt", ["init", "-b", "main"], { cwd: dir, encoding: "utf8" });
  execFileSync(
    "dolt",
    [
      "sql",
      "-q",
      [
        "CREATE TABLE prompt_templates (",
        "name VARCHAR(64) PRIMARY KEY,",
        "artifact_kind VARCHAR(32) NOT NULL,",
        "description TEXT,",
        "content TEXT,",
        "status VARCHAR(16) NOT NULL",
        ");",
        "INSERT INTO prompt_templates VALUES",
        "('inversion','cognitive','Installed smoke cognitive tool','Use inversion for installed smoke.','active');",
      ].join(" "),
    ],
    { cwd: dir, encoding: "utf8" },
  );
}

function createPiHarness() {
  const tools = new Map();
  const commands = new Map();
  const events = new Map();

  return {
    tools,
    commands,
    events,
    pi: {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand(name, command) {
        commands.set(name, command);
      },
      on(event, handler) {
        events.set(event, handler);
      },
    },
  };
}

function getText(result) {
  const entry = Array.isArray(result?.content) ? result.content[0] : undefined;
  return entry?.type === "text" ? entry.text : "";
}

function writeFakePi(mode) {
  if (mode === "timeout") {
    writeExecutable(
      fakePiPath,
      `#!/usr/bin/env bash
sleep 2
`,
    );
    return;
  }

  if (mode === "truncation") {
    const longText = "x".repeat(128);
    writeExecutable(
      fakePiPath,
      `#!/usr/bin/env bash
printf '%s' ${JSON.stringify(
        JSON.stringify({
          type: "message_end",
          message: {
            role: "assistant",
            content: [{ type: "text", text: longText }],
          },
        }),
      )}
`,
    );
    return;
  }

  if (mode === "marker") {
    writeExecutable(
      fakePiPath,
      `#!/usr/bin/env bash
printf 'unexpected subagent invocation' > ${JSON.stringify(teamMismatchMarkerPath)}
exit 99
`,
    );
    return;
  }

  throw new Error(`Unknown fake pi mode: ${mode}`);
}

writeExecutable(
  fakeAkPath,
  `#!/usr/bin/env bash
{
  printf '%q ' "$@"
  printf '\n'
} >> ${JSON.stringify(akCallLogPath)}
printf 'ak-ok'
`,
);
seedVault(vaultDir);

const previousEnv = {
  AGENT_KERNEL: process.env.AGENT_KERNEL,
  HOME: process.env.HOME,
  PATH: process.env.PATH,
  PI_ORCH_SUBAGENT_OUTPUT_CHARS: process.env.PI_ORCH_SUBAGENT_OUTPUT_CHARS,
  PI_ORCH_SUBAGENT_TIMEOUT_MS: process.env.PI_ORCH_SUBAGENT_TIMEOUT_MS,
  PI_ORCH_DEFAULT_AGENT_TEAM: process.env.PI_ORCH_DEFAULT_AGENT_TEAM,
  SOCIETY_DB: process.env.SOCIETY_DB,
  VAULT_DIR: process.env.VAULT_DIR,
};

try {
  process.env.HOME = homeDir;
  process.env.PATH = `${binDir}:${process.env.PATH || ""}`;
  process.env.VAULT_DIR = vaultDir;
  process.env.SOCIETY_DB = societyDbPath;
  process.env.AGENT_KERNEL = fakeAkPath;
  process.env.PI_ORCH_SUBAGENT_TIMEOUT_MS = "50";
  process.env.PI_ORCH_SUBAGENT_OUTPUT_CHARS = "16";
  delete process.env.PI_ORCH_DEFAULT_AGENT_TEAM;

  const module = await import(
    `${pathToFileURL(extensionPath).href}?installed-release-smoke=${Date.now()}`
  );
  assert.equal(typeof module.default, "function", "Installed extension missing default export");

  const harness = createPiHarness();
  module.default(harness.pi);

  const cognitiveDispatch = harness.tools.get("cognitive_dispatch");
  const loopExecute = harness.tools.get("loop_execute");
  const agentsTeam = harness.commands.get("agents-team");

  assert.ok(cognitiveDispatch, "cognitive_dispatch not registered");
  assert.ok(loopExecute, "loop_execute not registered");
  assert.ok(agentsTeam, "agents-team command not registered");

  writeFakePi("timeout");
  const timeoutResult = await cognitiveDispatch.execute(
    "installed-timeout",
    {
      context: "Installed timeout smoke",
      agent: "scout",
      cognitive_tool: "inversion",
    },
    undefined,
    undefined,
    { cwd: tempRoot, model: undefined },
  );
  assert.match(getText(timeoutResult), /timed_out/);
  console.log("installed timeout smoke: ok");

  writeFakePi("truncation");
  const truncationResult = await cognitiveDispatch.execute(
    "installed-truncation",
    {
      context: "Installed truncation smoke",
      agent: "scout",
      cognitive_tool: "inversion",
    },
    undefined,
    undefined,
    { cwd: tempRoot, model: undefined },
  );
  assert.match(getText(truncationResult), /assistant output truncated/);
  console.log("installed truncation smoke: ok");

  const akCallLinesAfterDispatch = readNonEmptyLines(akCallLogPath);
  assert.equal(
    akCallLinesAfterDispatch.length,
    2,
    "Expected two evidence writes after dispatch smokes",
  );
  assert.match(akCallLinesAfterDispatch[0], /evidence record/);
  assert.match(akCallLinesAfterDispatch[0], /--check-type cognitive:dispatch/);
  assert.match(akCallLinesAfterDispatch[0], /--result fail/);
  assert.match(akCallLinesAfterDispatch[1], /evidence record/);
  assert.match(akCallLinesAfterDispatch[1], /--check-type cognitive:dispatch/);
  assert.match(akCallLinesAfterDispatch[1], /--result pass/);

  writeFakePi("marker");
  const notifications = [];
  await agentsTeam.handler("", {
    hasUI: true,
    cwd: tempRoot,
    sessionKey: "installed-team-mismatch-session",
    ui: {
      async select() {
        return "quality — reviewer, researcher";
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  });

  assert.deepEqual(notifications, [
    {
      message: "Team: quality (reviewer, researcher)",
      level: "info",
    },
  ]);

  const teamMismatchResult = await loopExecute.execute(
    "installed-team-mismatch",
    {
      loop: "strategic",
      objective: "Installed team mismatch smoke",
    },
    undefined,
    undefined,
    {
      cwd: tempRoot,
      sessionKey: "installed-team-mismatch-session",
      model: undefined,
    },
  );

  assert.equal(teamMismatchResult?.details?.error, "loop-agent-team-mismatch");
  assert.match(getText(teamMismatchResult), /incompatible with the active team/);
  assert.equal(fs.existsSync(teamMismatchMarkerPath), false);

  const akCallLinesAfterLoopMismatch = readNonEmptyLines(akCallLogPath);
  assert.equal(
    akCallLinesAfterLoopMismatch.length,
    2,
    "Loop/team mismatch should not emit additional evidence writes",
  );
  console.log("installed team mismatch smoke: ok");

  console.log("SUCCESS");
} finally {
  if (previousEnv.HOME === undefined) delete process.env.HOME;
  else process.env.HOME = previousEnv.HOME;

  if (previousEnv.PATH === undefined) delete process.env.PATH;
  else process.env.PATH = previousEnv.PATH;

  if (previousEnv.VAULT_DIR === undefined) delete process.env.VAULT_DIR;
  else process.env.VAULT_DIR = previousEnv.VAULT_DIR;

  if (previousEnv.SOCIETY_DB === undefined) delete process.env.SOCIETY_DB;
  else process.env.SOCIETY_DB = previousEnv.SOCIETY_DB;

  if (previousEnv.AGENT_KERNEL === undefined) delete process.env.AGENT_KERNEL;
  else process.env.AGENT_KERNEL = previousEnv.AGENT_KERNEL;

  if (previousEnv.PI_ORCH_SUBAGENT_TIMEOUT_MS === undefined) {
    delete process.env.PI_ORCH_SUBAGENT_TIMEOUT_MS;
  } else {
    process.env.PI_ORCH_SUBAGENT_TIMEOUT_MS = previousEnv.PI_ORCH_SUBAGENT_TIMEOUT_MS;
  }

  if (previousEnv.PI_ORCH_SUBAGENT_OUTPUT_CHARS === undefined) {
    delete process.env.PI_ORCH_SUBAGENT_OUTPUT_CHARS;
  } else {
    process.env.PI_ORCH_SUBAGENT_OUTPUT_CHARS = previousEnv.PI_ORCH_SUBAGENT_OUTPUT_CHARS;
  }

  if (previousEnv.PI_ORCH_DEFAULT_AGENT_TEAM === undefined) {
    delete process.env.PI_ORCH_DEFAULT_AGENT_TEAM;
  } else {
    process.env.PI_ORCH_DEFAULT_AGENT_TEAM = previousEnv.PI_ORCH_DEFAULT_AGENT_TEAM;
  }

  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.rmSync(importRoot, { recursive: true, force: true });
  fs.rmSync(tarballRoot, { recursive: true, force: true });
}

function resolveLocalTarballPath(spec) {
  if (!spec.startsWith("npm:")) {
    throw new Error(`Unsupported PACKAGE_SPEC for release smoke: ${spec}`);
  }

  return spec.slice("npm:".length);
}

function assertInstalledPackageMatchesTarball(params) {
  const tarballFiles = listRelativeFiles(params.tarballPackageDir);
  assert.ok(tarballFiles.length > 0, "Expected tarball to contain packaged files");

  for (const relativePath of tarballFiles) {
    const tarballFilePath = path.join(params.tarballPackageDir, relativePath);
    const installedFilePath = path.join(params.installedPackageDir, relativePath);

    assert.ok(
      fs.existsSync(installedFilePath),
      `Installed package missing tarball file: ${relativePath}`,
    );

    const tarballContent = fs.readFileSync(tarballFilePath);
    const installedContent = fs.readFileSync(installedFilePath);
    assert.equal(
      Buffer.compare(tarballContent, installedContent),
      0,
      `Installed package content drifted from tarball for ${relativePath}`,
    );
  }
}

function listRelativeFiles(rootDir) {
  const files = [];
  const queue = [""];

  while (queue.length > 0) {
    const relativeDir = queue.shift();
    const absoluteDir = path.join(rootDir, relativeDir || ".");
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        queue.push(relativePath);
        continue;
      }
      if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  return files.sort();
}

function readNonEmptyLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
