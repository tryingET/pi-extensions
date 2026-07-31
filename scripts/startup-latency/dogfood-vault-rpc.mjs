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
  console.log(`Usage: node scripts/startup-latency/dogfood-vault-rpc.mjs [options]

Options:
  --template NAME    exact visible text-safe template (default: inversion)
  --output PATH      JSON evidence output path
  --timeout-ms N     per-operation timeout (default: 30000)
  -h, --help         show this help

The probe starts a fresh offline RPC Pi process with only the repo-local Vault
entrypoint. It verifies command registration, /vault-check schema/company
health, and one exact /vault read without changing Pi settings or invoking a
model.`);
}

let template = "inversion";
let outputPath = resolve(
  repoRoot,
  ".autoresearch/startup-latency/fresh-vault-rpc-dogfood.json",
);
let timeoutMs = 30_000;
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "-h" || arg === "--help") {
    usage();
    process.exit(0);
  }
  if (arg === "--template") {
    template = args[++index] ?? "";
    continue;
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
if (!template.trim()) throw new Error("--template must not be empty");
if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
  throw new Error("--timeout-ms must be an integer from 1000 through 120000");
}

const extension = resolve(repoRoot, "packages/pi-vault-client/extensions/vault.js");
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
  "openai-codex/gpt-5.4",
  "--no-extensions",
  "-e",
  extension,
];
const child = spawn("pi", piArgs, {
  cwd: repoRoot,
  env: { ...process.env, PI_OFFLINE: "1" },
  stdio: ["pipe", "pipe", "pipe"],
});

let stdoutBuffer = "";
let stderr = "";
let schemaReport = null;
let preparedText = null;
const responses = new Map();
const waiters = new Map();
const uiEvents = [];

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

function acceptEvent(event) {
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
    if (event.title === "Vault Check") schemaReport = event.prefill ?? event.value ?? "";
    send({ type: "extension_ui_response", id: event.id, cancelled: true });
    return;
  }
  if (event.method === "set_editor_text") preparedText = event.text ?? "";
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
    acceptLine(line);
  }
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

async function waitForObserved(readValue, label) {
  const deadline = Date.now() + timeoutMs;
  while (!readValue() && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  const value = readValue();
  if (!value) throw new Error(`Timed out waiting for ${label}`);
  return value;
}

const hardTimeout = setTimeout(() => child.kill("SIGKILL"), timeoutMs * 3);
try {
  send({ id: "commands", type: "get_commands" });
  const commandsResponse = await waitForResponse("commands");
  if (!commandsResponse.success) throw new Error(commandsResponse.error);
  const commandNames = (commandsResponse.data?.commands ?? []).map((command) => command.name);
  for (const required of ["vault", "vault-check"]) {
    if (!commandNames.includes(required)) throw new Error(`Missing Vault command: ${required}`);
  }

  send({ id: "check", type: "prompt", message: "/vault-check" });
  const checkResponse = await waitForResponse("check");
  if (!checkResponse.success) throw new Error(checkResponse.error);
  const observedSchemaReport = await waitForObserved(() => schemaReport, "Vault Check output");
  if (!observedSchemaReport.includes("- schema_status: ok")) {
    throw new Error("Vault schema diagnostics did not report ok");
  }
  if (!observedSchemaReport.includes("- current_company: software")) {
    throw new Error("Vault company context did not resolve to software");
  }
  if (!/- visible_active_templates: [1-9][0-9]*/u.test(observedSchemaReport)) {
    throw new Error("Vault Check did not expose any active templates");
  }

  send({ id: "read", type: "prompt", message: `/vault ${template}` });
  const readResponse = await waitForResponse("read");
  if (!readResponse.success) throw new Error(readResponse.error);
  const observedPreparedText = await waitForObserved(() => preparedText, "prepared Vault text");
  if (observedPreparedText.length < 100) throw new Error("Prepared Vault text was unexpectedly short");

  const configDigestsAfter = configDigests();
  const changedConfigFiles = Object.keys(configDigestsBefore).filter(
    (name) => configDigestsBefore[name] !== configDigestsAfter[name],
  );
  if (changedConfigFiles.length > 0) {
    throw new Error(`Vault RPC dogfood mutated Pi config: ${changedConfigFiles.join(", ")}`);
  }

  const report = {
    kind: "pi.startup_latency_fresh_vault_rpc_dogfood.v1",
    capturedAt: new Date().toISOString(),
    cwd: repoRoot,
    extension,
    args: piArgs,
    assertions: {
      commandsRegistered: true,
      schemaStatus: "ok",
      currentCompany: "software",
      visibleTemplates: true,
      exactTemplateRead: template,
      preparedTextObserved: true,
      settingsMutated: changedConfigFiles.length > 0,
    },
    configDigestsBefore,
    configDigestsAfter,
    configFilesVerified: Object.keys(configDigestsBefore),
    vaultCheck: observedSchemaReport,
    preparedTextBytes: Buffer.byteLength(observedPreparedText, "utf8"),
    preparedTextSha256: createHash("sha256").update(observedPreparedText).digest("hex"),
    uiMethods: uiEvents.map((event) => event.method),
    stderr: stderr.trim().split("\n").filter(Boolean).slice(-20),
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  clearTimeout(hardTimeout);
  child.kill("SIGTERM");
}
