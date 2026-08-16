// ---
// summary: "Launches a sanitized fresh Pi RPC process and verifies exact generation command provenance."
// read_when:
//   - "Changing fresh-process host identity, RPC inventory, or command dogfood probes."
// ---
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import {
  assertAbsolute,
  assertRegularFile,
  canonical,
  ensurePrivateDirectory,
  fail,
  run,
} from "./common.mjs";
import { assertActivatedGeneration } from "./activation.mjs";
import { assertCanonicalFileWithin, ensureOwnedDirectory } from "./roots.mjs";

function sanitizedEnvironment({ sandboxRoot, agentDir, temporary }) {
  const env = {};
  for (const key of ["PATH", "LANG", "LC_ALL", "SystemRoot", "WINDIR"]) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {
    HOME: path.join(sandboxRoot, "home"),
    PI_CODING_AGENT_DIR: agentDir,
    PI_OFFLINE: "1",
    PI_SKIP_VERSION_CHECK: "1",
    PI_TELEMETRY: "0",
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    npm_config_offline: "true",
    npm_config_ignore_scripts: "true",
    npm_config_audit: "false",
    npm_config_fund: "false",
  });
  return env;
}

function startRpc(hostExecutable, cwd, env, timeoutMs) {
  const args = [
    "--mode", "rpc", "--no-session", "--offline", "--no-approve", "--no-context-files",
    "--no-builtin-tools", "--no-skills", "--no-prompt-templates", "--no-themes",
  ];
  const child = spawn(hostExecutable, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map();
  const events = [];
  const errors = [];
  const stderr = [];
  let outputBytes = 0;
  let buffer = "";
  let protocolError = null;
  const decoder = new StringDecoder("utf8");
  const settle = (id, event) => {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    clearTimeout(request.timer);
    request.resolve(event);
  };
  const line = (text) => {
    if (!text || protocolError) return;
    let event;
    try { event = JSON.parse(text.endsWith("\r") ? text.slice(0, -1) : text); }
    catch {
      protocolError = new Error(`host emitted non-JSON RPC output: ${text.slice(0, 200)}`);
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(protocolError); }
      pending.clear();
      child.kill("SIGKILL");
      return;
    }
    events.push(event);
    if (event.type === "extension_error") errors.push(event);
    if (event.type === "response" && event.id) settle(event.id, event);
  };
  child.stdout.on("data", (chunk) => {
    outputBytes += chunk.length;
    if (outputBytes > 4 * 1024 * 1024) { child.kill("SIGKILL"); return; }
    buffer += decoder.write(chunk);
    while (true) {
      const index = buffer.indexOf("\n");
      if (index < 0) break;
      const record = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      line(record);
    }
  });
  child.stdout.on("end", () => {
    buffer += decoder.end();
    if (buffer) line(buffer);
  });
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const exited = new Promise((resolve) => child.on("close", (code, signal) => resolve({ code, signal })));
  const spawnError = new Promise((_, reject) => child.on("error", reject));
  return {
    events,
    errors,
    stderr,
    async request(type, fields = {}) {
      if (protocolError) throw protocolError;
      const id = `probe-${randomUUID()}`;
      const response = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`host RPC ${type} timed out after ${timeoutMs}ms`));
          child.kill("SIGKILL");
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
      });
      child.stdin.write(`${JSON.stringify({ id, type, ...fields })}\n`);
      return Promise.race([response, spawnError]);
    },
    async close() {
      child.stdin.end();
      let result = await Promise.race([
        exited,
        new Promise((resolve) => setTimeout(() => resolve(null), Math.min(timeoutMs, 2000))),
      ]);
      if (!result) { child.kill("SIGTERM"); result = await exited; }
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("host exited before RPC response"));
      }
      pending.clear();
      return result;
    },
  };
}

function commandSource(command) {
  const sourceInfo = command?.sourceInfo;
  if (!sourceInfo || typeof sourceInfo !== "object") fail(`host command ${command?.name ?? "<unknown>"} has no sourceInfo`);
  if (typeof sourceInfo.path !== "string" || typeof sourceInfo.baseDir !== "string") fail(`host command ${command.name} has incomplete sourceInfo`);
  return sourceInfo;
}

const INLINE_COMMAND_INVENTORY = new Map([
  ["llama", { name: "llama", sourceInfo: { path: "<inline:llama.cpp>", source: "inline", scope: "temporary", origin: "top-level" } }],
]);

function expectedInlineNames(value) {
  if (!Array.isArray(value)) fail("expected inline commands must be an explicit array");
  if (value.some((name) => typeof name !== "string" || !name || name.includes(","))) fail("expected inline command names must be non-empty strings without commas");
  if (new Set(value).size !== value.length) fail("expected inline command names must be unique");
  for (const name of value) if (!INLINE_COMMAND_INVENTORY.has(name)) fail(`unsupported expected inline command: /${name}`);
  return [...value].sort();
}

function assertInlineCommand(command, name) {
  const expected = INLINE_COMMAND_INVENTORY.get(name);
  if (!expected || canonical({ name: command?.name, sourceInfo: command?.sourceInfo }) !== canonical(expected)) {
    fail(`fresh host command /${name} does not match its exact allowed inline inventory`);
  }
}

export async function probeFreshHost(options) {
  const generation = await assertActivatedGeneration(options);
  assertAbsolute(options.hostExecutable, "host executable");
  if (await realpath(options.hostExecutable) !== options.hostExecutable) fail("host executable must use its canonical path");
  const hostInfo = await assertRegularFile(options.hostExecutable, "host executable");
  if ((hostInfo.mode & 0o111) === 0) fail("host executable is not executable");
  if (typeof options.commandName !== "string" || !options.commandName) fail("expected command name is required");
  const inlineNames = expectedInlineNames(options.expectedInlineCommands);
  if (inlineNames.includes(options.commandName)) fail("selected generation command cannot also be an expected inline command");
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) fail("probe timeout must be between 100 and 120000 milliseconds");

  const probesRoot = await ensureOwnedDirectory(options.sandboxRoot, ".pi-extension-generations-probes", "probe history root");
  const probeRoot = path.join(probesRoot, randomUUID());
  await mkdir(probeRoot, { mode: 0o700 });
  await ensurePrivateDirectory(probeRoot, "probe root");
  const temporary = await ensureOwnedDirectory(probeRoot, "tmp", "probe temporary directory");
  await ensureOwnedDirectory(options.sandboxRoot, "home", "private probe home");
  const env = sanitizedEnvironment({ ...options, temporary });
  const version = (await run(options.hostExecutable, ["--version"], { cwd: options.projectDir, env })).stdout.toString("utf8").trim();
  if (!version) fail("host executable returned an empty version");

  const rpc = startRpc(options.hostExecutable, options.projectDir, env, timeoutMs);
  let receipt;
  let operationError;
  try {
    const inventoryResponse = await rpc.request("get_commands");
    if (!inventoryResponse.success || !Array.isArray(inventoryResponse.data?.commands)) fail(`host command inventory failed: ${inventoryResponse.error ?? "invalid response"}`);
    const extensionCommands = inventoryResponse.data.commands.filter((command) => command.source === "extension");
    const selected = extensionCommands.filter((command) => command.name === options.commandName);
    if (selected.length !== 1) fail(`fresh host expected exactly one /${options.commandName} command, observed ${selected.length}`);
    const sourceInfo = commandSource(selected[0]);
    const expectedSelectedCommand = { name: options.commandName, sourceInfo: { path: sourceInfo.path, source: generation.packageDir, scope: "user", origin: "package", baseDir: generation.packageDir } };
    if (!generation.entrypoints.some((entrypoint) => entrypoint.path === sourceInfo.path) || canonical({ name: selected[0].name, sourceInfo }) !== canonical(expectedSelectedCommand)) {
      fail(`fresh host selected command has mixed or unexpected provenance: ${options.commandName}`);
    }
    const inlineCommands = extensionCommands.filter((command) => command.name !== options.commandName);
    for (const command of inlineCommands) {
      if (!inlineNames.includes(command.name)) fail(`fresh host observed unexpected extension command: /${command.name}`);
      assertInlineCommand(command, command.name);
    }
    for (const name of inlineNames) {
      const matches = inlineCommands.filter((command) => command.name === name);
      if (matches.length !== 1) fail(`fresh host expected exactly one allowed inline /${name} command, observed ${matches.length}`);
    }
    if (extensionCommands.length !== 1 + inlineNames.length) fail("fresh host extension inventory is not exact");
    const expectedExtensionInventory = {
      exactCount: 1 + inlineNames.length,
      selectedGenerationCommand: expectedSelectedCommand,
      allowedInlineCommands: inlineNames.map((name) => INLINE_COMMAND_INVENTORY.get(name)),
    };
    let commandResult = null;
    if (options.requestFile) {
      await assertCanonicalFileWithin(options.sandboxRoot, options.requestFile, "probe request file");
      const requestBytes = await readFile(options.requestFile);
      if (requestBytes.length > 128 * 1024) fail("probe command request exceeds 128 KiB");
      let request;
      try { request = JSON.parse(requestBytes.toString("utf8")); }
      catch { fail("probe command request is not JSON"); }
      const eventStart = rpc.events.length;
      const response = await rpc.request("prompt", { message: `/${options.commandName} ${JSON.stringify(request)}` });
      if (!response.success) fail(`fresh host command invocation failed: ${response.error ?? "unknown RPC failure"}`);
      const notifications = rpc.events.slice(eventStart).filter((event) => event.type === "extension_ui_request" && event.method === "notify");
      const failure = notifications.find((event) => event.notifyType === "error");
      if (failure) fail(`fresh host command failed closed: ${failure.message}`);
      const success = notifications.findLast((event) => event.notifyType === "info");
      if (!success) fail("fresh host command emitted no success notification");
      try { commandResult = JSON.parse(success.message); }
      catch { fail("fresh host command success notification was not JSON"); }
    }
    receipt = {
      ok: true,
      hostExecutable: options.hostExecutable,
      hostVersion: version,
      generationId: generation.generationId,
      sourceCommit: generation.sourceCommit,
      inputDigest: generation.inputDigest,
      packageDir: generation.packageDir,
      selectedCommand: { name: options.commandName, sourceInfo },
      selectedCommandCount: selected.length,
      expectedExtensionInventory,
      observedExtensionCommands: extensionCommands.map((command) => ({ name: command.name, sourceInfo: command.sourceInfo })),
      commandResult,
      probeRoot,
    };
  } catch (error) { operationError = error; }
  const closeResult = await rpc.close();
  const stderr = Buffer.concat(rpc.stderr).toString("utf8");
  if (operationError) throw operationError;
  if (closeResult?.code !== 0) fail(`fresh host exited ${closeResult?.code ?? closeResult?.signal}: ${stderr.trim()}`);
  if (rpc.errors.length > 0) fail(`fresh host reported extension-load diagnostics: ${JSON.stringify(rpc.errors)}`);
  if (stderr.trim()) fail(`fresh host emitted stderr diagnostics: ${stderr.trim()}`);
  return { ...receipt, extensionErrors: [...rpc.errors], stderr };
}
