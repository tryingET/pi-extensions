#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const agentDir = process.env.PI_CODING_AGENT_DIR ?? resolve(homedir(), ".pi/agent");
const configPaths = [resolve(agentDir, "models.json"), resolve(agentDir, "settings.json")];
const modelScope = process.env.PI_STARTUP_MODEL_SCOPE ?? "openai-codex/gpt-5.6-sol";
if (!modelScope.trim()) throw new Error("PI_STARTUP_MODEL_SCOPE must not be empty");

function configDigests() {
  return Object.fromEntries(
    configPaths.map((configPath) => [
      basename(configPath),
      existsSync(configPath)
        ? createHash("sha256").update(readFileSync(configPath)).digest("hex")
        : null,
    ]),
  );
}

function usage() {
  console.log(`Usage: node scripts/startup-latency/dogfood-interaction-rpc.mjs [options]

Options:
  --output PATH      JSON evidence output path
  --timeout-ms N     per-operation timeout (default: 30000)
  -h, --help         show this help

Environment:
  PI_STARTUP_MODEL_SCOPE  no-invocation model scope used for startup resolution
                          (default: openai-codex/gpt-5.6-sol)

The probe starts a fresh offline RPC Pi process with only the repo-local
pi-interaction entrypoint. It invokes all six trigger commands,
exercises both built-in pickers, verifies custom-editor mount diagnostics, and
checks that Pi settings remain unchanged without invoking a model.`);
}

let outputPath = resolve(
  repoRoot,
  ".autoresearch/startup-latency/fresh-interaction-rpc-dogfood.json",
);
let timeoutMs = 30_000;
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "-h" || arg === "--help") {
    usage();
    process.exit(0);
  }
  if (arg === "--output") {
    outputPath = resolve(repoRoot, args[++index] ?? "");
    continue;
  }
  if (arg === "--timeout-ms") {
    timeoutMs = Number(args[++index]);
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}
if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
  throw new Error("--timeout-ms must be an integer from 1000 through 120000");
}

const extension = resolve(
  repoRoot,
  "packages/pi-interaction/pi-interaction/extensions/input-triggers.ts",
);
const configDigestsBefore = configDigests();
const piArgs = [
  "--offline",
  "--mode",
  "rpc",
  "--no-session",
  "--no-skills",
  "--no-prompt-templates",
  "--no-themes",
  "--no-context-files",
  "--models",
  modelScope,
  "--no-extensions",
  "-e",
  extension,
];
const child = spawn("pi", piArgs, {
  cwd: repoRoot,
  env: {
    ...process.env,
    PI_INTERACTION_EXAMPLES: "1",
    PI_OFFLINE: "1",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let stdoutBuffer = "";
let stderr = "";
let parseError = null;
const responses = new Map();
const waiters = new Map();
const uiEvents = [];
const eventTypes = [];
const editorReports = new Map();
const notifications = [];
const editorTexts = [];
const selectPlan = [
  { title: "Pick a trigger", startsWith: "!! / picker" },
  { title: "Pick a command", exact: "git status" },
  { title: "Pick a trigger", startsWith: "!! . picker" },
  { title: "Pick a file", exact: "README.md" },
];
const selectedValues = [];

function send(value) {
  child.stdin.write(`${JSON.stringify(value)}\n`);
}

function waitForResponse(id) {
  const existing = responses.get(id);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolveResponse, rejectResponse) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      rejectResponse(new Error(`Timed out waiting for RPC response ${id}`));
    }, timeoutMs);
    waiters.set(id, (response) => {
      clearTimeout(timer);
      resolveResponse(response);
    });
  });
}

function chooseSelectValue(event) {
  const expected = selectPlan.shift();
  if (!expected) throw new Error(`Unexpected select UI request: ${event.title}`);
  if (event.title !== expected.title) {
    throw new Error(`Expected select title '${expected.title}', received '${event.title}'`);
  }

  const options = Array.isArray(event.options) ? event.options : [];
  const selected = expected.exact
    ? options.find((option) => option === expected.exact)
    : options.find((option) => option.startsWith(expected.startsWith));
  if (!selected) {
    throw new Error(`Select '${event.title}' did not include the required option`);
  }
  selectedValues.push({ title: event.title, value: selected });
  return selected;
}

function acceptEvent(event) {
  eventTypes.push(event.type);
  if (event.type === "response" && event.id) {
    responses.set(event.id, event);
    const waiter = waiters.get(event.id);
    if (waiter) {
      waiters.delete(event.id);
      waiter(event);
    }
  }
  if (event.type !== "extension_ui_request") return;

  uiEvents.push(event);
  if (event.method === "editor") {
    editorReports.set(event.title, event.prefill ?? event.value ?? "");
    send({ type: "extension_ui_response", id: event.id, cancelled: true });
    return;
  }
  if (event.method === "select") {
    const value = chooseSelectValue(event);
    send({ type: "extension_ui_response", id: event.id, value, cancelled: false });
    return;
  }
  if (event.method === "notify") {
    notifications.push({ message: event.message ?? "", level: event.notifyType ?? event.level });
    return;
  }
  if (event.method === "set_editor_text") {
    editorTexts.push(event.text ?? "");
  }
}

function acceptLine(rawLine) {
  if (!rawLine) return;
  let event;
  try {
    event = JSON.parse(rawLine);
  } catch {
    throw new Error(`Pi emitted invalid RPC JSONL: ${rawLine.slice(0, 200)}`);
  }
  acceptEvent(event);
}

child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString("utf8");
  while (true) {
    const newlineIndex = stdoutBuffer.indexOf("\n");
    if (newlineIndex < 0) break;
    let line = stdoutBuffer.slice(0, newlineIndex);
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    try {
      acceptLine(line);
    } catch (error) {
      parseError = error;
      child.kill("SIGKILL");
      break;
    }
  }
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

async function waitForObserved(readValue, label) {
  const deadline = Date.now() + timeoutMs;
  while (!readValue() && !parseError && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  if (parseError) throw parseError;
  const value = readValue();
  if (!value) throw new Error(`Timed out waiting for ${label}`);
  return value;
}

async function invokeCommand(id, message) {
  send({ id, type: "prompt", message });
  const response = await waitForResponse(id);
  if (!response.success) throw new Error(`${message}: ${response.error}`);
  return response;
}

const hardTimeout = setTimeout(() => child.kill("SIGKILL"), timeoutMs * 4);
try {
  send({ id: "commands", type: "get_commands" });
  const commandsResponse = await waitForResponse("commands");
  if (!commandsResponse.success) throw new Error(commandsResponse.error);
  const commandNames = (commandsResponse.data?.commands ?? []).map((command) => command.name);
  const requiredCommands = [
    "triggers",
    "trigger-enable",
    "trigger-disable",
    "trigger-diag",
    "trigger-pick",
    "trigger-reload",
  ];
  for (const required of requiredCommands) {
    if (!commandNames.includes(required)) throw new Error(`Missing interaction command: ${required}`);
  }

  await waitForObserved(
    () => notifications.some((entry) => entry.message === "Interaction runtime enabled"),
    "interaction mount notification",
  );

  await invokeCommand("triggers-initial", "/triggers");
  const triggerReport = await waitForObserved(
    () => editorReports.get("Input Triggers"),
    "Input Triggers output",
  );
  for (const triggerId of ["bash-command-picker", "file-picker"]) {
    if (!triggerReport.includes(`**${triggerId}**`)) {
      throw new Error(`Input Triggers output missing ${triggerId}`);
    }
  }

  await invokeCommand("disable", "/trigger-disable bash-command-picker");
  await waitForObserved(
    () => notifications.some((entry) => entry.message === "Trigger 'bash-command-picker' disabled"),
    "trigger-disable notification",
  );

  await invokeCommand("enable", "/trigger-enable bash-command-picker");
  await waitForObserved(
    () => notifications.some((entry) => entry.message === "Trigger 'bash-command-picker' enabled"),
    "trigger-enable notification",
  );

  await invokeCommand("diag", "/trigger-diag");
  const diagnosticReport = await waitForObserved(
    () => editorReports.get("Trigger Diagnostics"),
    "Trigger Diagnostics output",
  );
  for (const requiredLine of [
    "- Owner: @tryinget/pi-interaction",
    "- Mounted: true",
    "- Mount count: 1",
    "### bash-command-picker",
    "### file-picker",
  ]) {
    if (!diagnosticReport.includes(requiredLine)) {
      throw new Error(`Trigger Diagnostics output missing: ${requiredLine}`);
    }
  }

  await invokeCommand("pick-bash", "/trigger-pick");
  await waitForObserved(
    () => editorTexts.includes("!! git status"),
    "bash built-in picker editor result",
  );
  await waitForObserved(
    () => notifications.some((entry) => entry.message === "Triggered: bash-command-picker"),
    "bash built-in trigger notification",
  );

  await invokeCommand("pick-file", "/trigger-pick");
  await waitForObserved(
    () => editorTexts.includes("!! cat README.md"),
    "file built-in picker editor result",
  );
  await waitForObserved(
    () => notifications.some((entry) => entry.message === "Triggered: file-picker"),
    "file built-in trigger notification",
  );

  await invokeCommand("reload", "/trigger-reload");
  await waitForObserved(
    () =>
      notifications.some(
        (entry) => entry.message === "Reloaded built-in triggers (2 total registered)",
      ),
    "trigger-reload notification",
  );

  if (selectPlan.length > 0) throw new Error(`Unused select expectations: ${selectPlan.length}`);
  if (parseError) throw parseError;
  if (stderr.trim()) throw new Error(`Interaction RPC emitted stderr: ${stderr.trim()}`);

  const modelEventTypes = eventTypes.filter((type) =>
    ["agent_start", "message_start", "message_update", "tool_execution_start"].includes(type),
  );
  if (modelEventTypes.length > 0) {
    throw new Error(`Unexpected model/agent events: ${modelEventTypes.join(", ")}`);
  }

  const extensionErrorEventTypes = eventTypes.filter((type) => type === "extension_error");
  if (extensionErrorEventTypes.length > 0) {
    throw new Error(`Interaction emitted extension_error events: ${extensionErrorEventTypes.length}`);
  }

  const errorNotifications = notifications.filter((entry) => entry.level === "error");
  if (errorNotifications.length > 0) {
    throw new Error(`Interaction emitted error notifications: ${JSON.stringify(errorNotifications)}`);
  }

  const configDigestsAfter = configDigests();
  const changedConfigFiles = Object.keys(configDigestsBefore).filter(
    (name) => configDigestsBefore[name] !== configDigestsAfter[name],
  );
  if (changedConfigFiles.length > 0) {
    throw new Error(`Interaction RPC dogfood mutated Pi config: ${changedConfigFiles.join(", ")}`);
  }

  const report = {
    kind: "pi.startup_latency_fresh_interaction_rpc_dogfood.v1",
    capturedAt: new Date().toISOString(),
    cwd: repoRoot,
    extension,
    args: piArgs,
    assertions: {
      allSixCommandsRegisteredAndInvoked: true,
      builtInTriggers: ["bash-command-picker", "file-picker"],
      editorRegistryMountDiagnostics: true,
      mountCount: 1,
      manualPickerResults: ["!! git status", "!! cat README.md"],
      commandsAvailableOnInitialGetCommands: true,
      startupMountNotificationObserved: true,
      extensionErrors: 0,
      modelInvocations: 0,
      settingsMutated: false,
    },
    requiredCommands,
    selectedValues,
    notifications,
    editorTexts,
    triggerReport,
    diagnosticReport,
    uiMethods: uiEvents.map((event) => event.method),
    eventTypes,
    configDigestsBefore,
    configDigestsAfter,
    configFilesVerified: Object.keys(configDigestsBefore),
    stderr: [],
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  clearTimeout(hardTimeout);
  child.kill("SIGTERM");
}
