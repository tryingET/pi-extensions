#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadExecutionSeamCase } from "../../../governance/execution-seam-cases/index.mjs";
import {
  assertDirectoriesMatchExactly,
  settingsPackagesContainSpec,
} from "./release-smoke-helpers.mjs";

const agentDir = process.env.PI_CODING_AGENT_DIR;
const packageSpec = process.env.PACKAGE_SPEC;

assert.equal(typeof agentDir, "string", "PI_CODING_AGENT_DIR is required");
assert.equal(typeof packageSpec, "string", "PACKAGE_SPEC is required");

const timeoutEmptyOutputCase = loadExecutionSeamCase("timeout-empty-output");
const assistantProtocolParseErrorCase = loadExecutionSeamCase("assistant-protocol-parse-error");
const bundledBridgeImportCase = loadExecutionSeamCase("bundled-bridge-import");

const settingsPath = path.join(agentDir, "settings.json");
assert.ok(fs.existsSync(settingsPath), `Missing settings.json: ${settingsPath}`);

const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
assert.ok(
  settingsPackagesContainSpec(settings, packageSpec),
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
const bundledDependencies = [
  ...(Array.isArray(tarballPackage.bundleDependencies) ? tarballPackage.bundleDependencies : []),
  ...(Array.isArray(tarballPackage.bundledDependencies) ? tarballPackage.bundledDependencies : []),
].map(String);
assert.deepEqual(
  bundledDependencies.sort(),
  [...bundledBridgeImportCase.expectedBundledDependencies].sort(),
  `Bundled bridge case mismatch for ${bundledBridgeImportCase.id}`,
);
const packageName = String(tarballPackage.name || "").trim();
assert.ok(packageName.length > 0, "Tarball package.json missing name");

const extensionEntry = tarballPackage.pi?.extensions?.[0];
assert.equal(typeof extensionEntry, "string", "Tarball package missing pi.extensions entry");

const isolatedNpmGlobalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const hostNpmGlobalRoot = execFileSync("npm", ["root", "-g"], {
  encoding: "utf8",
  env: withoutIsolatedPrefixEnv(process.env),
}).trim();
const installedPackageDir = path.join(isolatedNpmGlobalRoot, ...packageName.split("/"));
const installedPackageJsonPath = path.join(installedPackageDir, "package.json");
assert.ok(
  fs.existsSync(installedPackageJsonPath),
  `Installed package.json missing: ${installedPackageJsonPath}`,
);

assertDirectoriesMatchExactly({
  expectedDir: tarballPackageDir,
  actualDir: installedPackageDir,
  actualLabel: "installed package",
  ignoredPathSegments: ["node_modules"],
});

const importRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-release-smoke-import-"));
const importablePackageDir = path.join(importRoot, "package");
const importNodeModulesPath = path.join(importRoot, "node_modules");
fs.mkdirSync(importNodeModulesPath, { recursive: true });
fs.cpSync(installedPackageDir, importablePackageDir, { recursive: true });
liftBundledDependencies(importablePackageDir);
for (const relativePath of bundledBridgeImportCase.expectedImportFiles) {
  const absolutePath = path.join(importablePackageDir, relativePath);
  assert.ok(
    fs.existsSync(absolutePath),
    `Bundled bridge case '${bundledBridgeImportCase.id}' missing import fixture: ${relativePath}`,
  );
}
linkHostPeerPackage(importNodeModulesPath, "@mariozechner/pi-coding-agent", [
  path.join(hostNpmGlobalRoot, "@mariozechner", "pi-coding-agent"),
]);
linkHostPeerPackage(importNodeModulesPath, "@mariozechner/pi-tui", [
  path.join(hostNpmGlobalRoot, "@mariozechner", "pi-tui"),
  path.join(
    hostNpmGlobalRoot,
    "@mariozechner",
    "pi-coding-agent",
    "node_modules",
    "@mariozechner",
    "pi-tui",
  ),
]);
linkHostPeerPackage(importNodeModulesPath, "@mariozechner/pi-ai", [
  path.join(hostNpmGlobalRoot, "@mariozechner", "pi-ai"),
  path.join(
    hostNpmGlobalRoot,
    "@mariozechner",
    "pi-coding-agent",
    "node_modules",
    "@mariozechner",
    "pi-ai",
  ),
]);

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
const abortMarkerPath = path.join(tempRoot, "abort-subagent.marker");

fs.mkdirSync(binDir, { recursive: true });
fs.mkdirSync(homeDir, { recursive: true });
fs.mkdirSync(vaultDir, { recursive: true });
fs.writeFileSync(societyDbPath, "");

function writeExecutable(filePath, content) {
  fs.writeFileSync(filePath, content);
  fs.chmodSync(filePath, 0o755);
}

function withoutIsolatedPrefixEnv(env) {
  const next = { ...env };
  delete next.NPM_CONFIG_PREFIX;
  delete next.npm_config_prefix;
  return next;
}

function linkHostPeerPackage(importNodeModulesPath, spec, candidatePaths) {
  const source = candidatePaths.find((candidate) => fs.existsSync(candidate));
  assert.ok(
    source,
    `Host peer package not found for ${spec}. Candidates: ${candidatePaths.join(", ")}`,
  );

  const destination = path.join(importNodeModulesPath, ...spec.split("/"));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.symlinkSync(source, destination, "dir");
}

function liftBundledDependencies(packageDir) {
  const manifestPath = path.join(packageDir, "package.json");
  if (!fs.existsSync(manifestPath)) return;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const bundled = [
    ...(Array.isArray(manifest.bundleDependencies) ? manifest.bundleDependencies : []).map(String),
    ...(Array.isArray(manifest.bundledDependencies) ? manifest.bundledDependencies : []).map(
      String,
    ),
  ];

  if (bundled.length === 0) return;

  const liftedRoot = path.join(packageDir, ".bundled-dependencies");
  fs.mkdirSync(liftedRoot, { recursive: true });

  for (const dependencyName of bundled) {
    const pathSegments = dependencyName.split("/");
    const bundledPath = path.join(packageDir, "node_modules", ...pathSegments);
    if (!fs.existsSync(bundledPath)) continue;

    const liftedPath = path.join(liftedRoot, ...pathSegments);
    fs.mkdirSync(path.dirname(liftedPath), { recursive: true });
    fs.renameSync(bundledPath, liftedPath);
    fs.symlinkSync(liftedPath, bundledPath, "dir");
  }
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

function getExpectedDisplayedOutput(text) {
  const configuredOutputChars = Number.parseInt(
    process.env.PI_ORCH_SUBAGENT_OUTPUT_CHARS || "",
    10,
  );
  if (Number.isFinite(configuredOutputChars) && configuredOutputChars > 0) {
    return text.slice(0, configuredOutputChars);
  }

  return text;
}

function getExpectedInstalledTimeoutBody() {
  const timeoutMs = Number.parseInt(process.env.PI_ORCH_SUBAGENT_TIMEOUT_MS || "", 10);
  const seconds = Number.isFinite(timeoutMs) && timeoutMs >= 0 ? Math.round(timeoutMs / 1000) : 0;
  return `Subagent timed out after ${seconds}s`;
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
    const longText = "x".repeat(1024);
    writeExecutable(
      fakePiPath,
      `#!/usr/bin/env bash
printf '%s\n' ${JSON.stringify(
        JSON.stringify({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_delta",
            delta: longText,
          },
        }),
      )}
printf '%s\n' ${JSON.stringify(
        JSON.stringify({
          type: "message_end",
          message: {
            role: "assistant",
            content: [{ type: "text", text: longText }],
            stopReason: "stop",
          },
        }),
      )}
`,
    );
    return;
  }

  if (mode === "semantic-error") {
    writeExecutable(
      fakePiPath,
      `#!/usr/bin/env bash
printf '%s\n' ${JSON.stringify(
        JSON.stringify({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_delta",
            delta: "partial",
          },
        }),
      )}
printf '%s\n' ${JSON.stringify(
        JSON.stringify({
          type: "message_end",
          message: {
            role: "assistant",
            content: [],
            stopReason: "error",
            errorMessage: "boom",
          },
        }),
      )}
`,
    );
    return;
  }

  if (mode === "parse-error") {
    writeExecutable(
      fakePiPath,
      `#!/usr/bin/env bash
printf '{not-json\n'
`,
    );
    return;
  }

  if (mode === "abort") {
    writeExecutable(
      fakePiPath,
      `#!/usr/bin/env bash
trap 'printf terminated > ${JSON.stringify(abortMarkerPath)}; exit 0' TERM
while true; do sleep 0.05; done
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
  process.env.PI_ORCH_SUBAGENT_TIMEOUT_MS = "250";
  process.env.PI_ORCH_SUBAGENT_OUTPUT_CHARS = "256";
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
  const timeoutText = getText(timeoutResult);
  const expectedTimeoutBody = getExpectedInstalledTimeoutBody();
  const expectedDisplayedTimeoutBody = getExpectedDisplayedOutput(expectedTimeoutBody);

  assert.ok(
    timeoutText.includes(timeoutEmptyOutputCase.expected.executionLikeStatus),
    `Installed timeout smoke missing execution status '${timeoutEmptyOutputCase.expected.executionLikeStatus}'. Full text: ${timeoutText}`,
  );
  assert.ok(
    timeoutText.includes(expectedDisplayedTimeoutBody),
    `Installed timeout smoke missing timeout body '${expectedDisplayedTimeoutBody}'. Full text: ${timeoutText}`,
  );

  if (expectedDisplayedTimeoutBody !== expectedTimeoutBody) {
    assert.ok(
      timeoutText.includes("...[assistant output truncated]"),
      `Installed timeout smoke missing truncation marker. Full text: ${timeoutText}`,
    );
  }
  console.log("installed timeout smoke: ok");

  writeFakePi("abort");
  const abortController = new AbortController();
  setTimeout(() => abortController.abort(), 100);
  const abortResult = await cognitiveDispatch.execute(
    "installed-abort",
    {
      context: "Installed abort smoke",
      agent: "scout",
      cognitive_tool: "inversion",
    },
    abortController.signal,
    undefined,
    { cwd: tempRoot, model: undefined },
  );
  assert.match(getText(abortResult), /\] aborted in /);
  assert.match(getText(abortResult), /Evidence path: skipped/);
  assert.equal(fs.existsSync(abortMarkerPath), true);
  console.log("installed abort smoke: ok");

  writeFakePi("semantic-error");
  const semanticErrorResult = await cognitiveDispatch.execute(
    "installed-semantic-error",
    {
      context: "Installed semantic error smoke",
      agent: "scout",
      cognitive_tool: "inversion",
    },
    undefined,
    undefined,
    { cwd: tempRoot, model: undefined },
  );
  assert.match(getText(semanticErrorResult), /\] error in /);
  console.log("installed semantic error smoke: ok");

  writeFakePi("parse-error");
  const parseErrorResult = await cognitiveDispatch.execute(
    "installed-parse-error",
    {
      context: "Installed parse error smoke",
      agent: "scout",
      cognitive_tool: "inversion",
    },
    undefined,
    undefined,
    { cwd: tempRoot, model: undefined },
  );
  const parseErrorText = getText(parseErrorResult);
  const expectedParseErrorBody = assistantProtocolParseErrorCase.expected.executionLikeOutput;
  const expectedDisplayedParseErrorBody = getExpectedDisplayedOutput(expectedParseErrorBody);

  assert.equal(
    expectedDisplayedParseErrorBody,
    expectedParseErrorBody,
    "Installed parse error smoke must verify the full parse-error body, not a truncated prefix.",
  );

  assert.ok(
    parseErrorText.includes(assistantProtocolParseErrorCase.expected.executionLikeStatus),
    `Installed parse error smoke missing execution status '${assistantProtocolParseErrorCase.expected.executionLikeStatus}'. Full text: ${parseErrorText}`,
  );
  assert.ok(
    parseErrorText.includes(expectedDisplayedParseErrorBody),
    `Installed parse error smoke missing parse body '${expectedDisplayedParseErrorBody}'. Full text: ${parseErrorText}`,
  );

  if (expectedDisplayedParseErrorBody !== expectedParseErrorBody) {
    assert.ok(
      parseErrorText.includes("...[assistant output truncated]"),
      `Installed parse error smoke missing truncation marker. Full text: ${parseErrorText}`,
    );
  }
  console.log("installed parse error smoke: ok");

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
    4,
    "Expected four evidence writes after dispatch smokes (abort skips evidence)",
  );
  assert.match(akCallLinesAfterDispatch[0], /evidence record/);
  assert.match(akCallLinesAfterDispatch[0], /--check-type cognitive:dispatch/);
  assert.match(akCallLinesAfterDispatch[0], /--result fail/);
  assert.match(akCallLinesAfterDispatch[1], /evidence record/);
  assert.match(akCallLinesAfterDispatch[1], /--check-type cognitive:dispatch/);
  assert.match(akCallLinesAfterDispatch[1], /--result fail/);
  assert.match(akCallLinesAfterDispatch[2], /evidence record/);
  assert.match(akCallLinesAfterDispatch[2], /--check-type cognitive:dispatch/);
  assert.match(akCallLinesAfterDispatch[2], /--result fail/);
  assert.match(akCallLinesAfterDispatch[3], /evidence record/);
  assert.match(akCallLinesAfterDispatch[3], /--check-type cognitive:dispatch/);
  assert.match(akCallLinesAfterDispatch[3], /--result pass/);

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
    4,
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
