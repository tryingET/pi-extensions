// Invoke only after canonical nested-niri.sh up/env. This harness never addresses the outer socket.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const controllerOnly = process.argv.includes("--controller-only");
const stateFile = process.env.PI_ACTIVITY_STRIP_GUI_STATE;
assert.ok(stateFile, "PI_ACTIVITY_STRIP_GUI_STATE must name the owned helper state.json");
const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
assert.notEqual(process.env.NIRI_SOCKET, state.outer_socket);
assert.ok(process.env.NIRI_SOCKET?.endsWith(`.${state.pid}.sock`));
const helperEnv = fs.readFileSync(path.join(path.dirname(stateFile), "nested.env"), "utf8");
assert.ok(helperEnv.includes(`WAYLAND_DISPLAY=${process.env.WAYLAND_DISPLAY}\n`));
const fixture = path.join(root, "native/panel/target/gui-fixture");
fs.mkdirSync(fixture, { recursive: true, mode: 0o700 });
const privateRuntime = path.join(fixture, "runtime");
fs.mkdirSync(privateRuntime, { recursive: true, mode: 0o700 });
// Keep a short *owned* path for Unix sockets without creating anything in /tmp or host runtime.
const runtimeFd = fs.openSync(privateRuntime, "r");
const shortRuntime = `/proc/${process.pid}/fd/${runtimeFd}`;
const originalRuntime = process.env.XDG_RUNTIME_DIR;
const display = path.resolve(originalRuntime, process.env.WAYLAND_DISPLAY);
const env = {
  ...process.env,
  WAYLAND_DISPLAY: display,
  XDG_RUNTIME_DIR: shortRuntime,
  HOME: path.join(fixture, "home"),
  RUSTUP_HOME: process.env.RUSTUP_HOME ?? path.join(process.env.HOME, ".rustup"),
  CARGO_HOME: process.env.CARGO_HOME ?? path.join(process.env.HOME, ".cargo"),
  XDG_CONFIG_HOME: path.join(fixture, "config"),
  GDK_BACKEND: "wayland",
  GSK_RENDERER: "cairo",
  GTK_A11Y: "none",
  NO_AT_BRIDGE: "1",
  PI_ACTIVITY_STRIP_ISOLATED_GUI: "1",
  PI_ACTIVITY_STRIP_GUI_STATE: stateFile,
  PI_ACTIVITY_STRIP_VIRTUAL_POINTER: path.join(fixture, "virtual-pointer"),
  PI_ACTIVITY_STRIP_RUNTIME_LOCK_HELD: "1",
  PI_ACTIVITY_STRIP_SOCKET_DIR: "native/panel/target/gui-fixture/broker",
  PI_ACTIVITY_STRIP_TAB_INVENTORY: "0",
  PI_ACTIVITY_STRIP_AGENT_TABS: "0",
  PI_ACTIVITY_STRIP_AK_TASKS: "0",
  PI_ACTIVITY_STRIP_HEIGHT_REPAIR: "0",
};
for (const key of [
  "DISPLAY",
  "AT_SPI_BUS_ADDRESS",
  "DBUS_STARTER_ADDRESS",
  "DBUS_STARTER_BUS_TYPE",
])
  delete env[key];
const children = [];
function start(command, args, name, childEnv = env) {
  const log = fs.openSync(path.join(fixture, `${name}.txt`), "w");
  const child = spawn(command, args, { env: childEnv, stdio: ["ignore", log, log] });
  fs.closeSync(log);
  children.push(child);
  return child;
}
async function waitExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return child.exitCode;
  return await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
}
async function run(command, args) {
  const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (d) => {
    stdout += d;
  });
  child.stderr.on("data", (d) => {
    stderr += d;
  });
  const code = await waitExit(child);
  assert.equal(code, 0, `${command} ${args.join(" ")}: ${stderr}`);
  return stdout;
}
async function niri(...args) {
  return JSON.parse(await run("niri", ["msg", "-j", ...args]));
}
async function eventually(check, label) {
  // Wait for healthy asynchronous compositor work; process exits/errors fail explicitly.
  for (;;) {
    const result = await check();
    if (heartbeatError) throw heartbeatError;
    if (result) return result;
    if (controller?.exitCode !== null && controller?.exitCode !== undefined)
      throw new Error(`${label}: controller exited ${controller.exitCode}`);
    for (const child of children) {
      if (child.exitCode !== null && child.exitCode !== 0)
        throw new Error(`${label}: fixture exited ${child.exitCode}`);
    }
    await delay(50);
  }
}
let controller, heartbeat, heartbeatError;
try {
  const bus = spawn(
    "dbus-daemon",
    ["--session", "--nofork", "--print-address=1", `--address=unix:path=${shortRuntime}/bus`],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  children.push(bus);
  env.DBUS_SESSION_BUS_ADDRESS = await new Promise((resolve, reject) => {
    bus.once("error", reject);
    bus.stdout.once("data", (d) => resolve(String(d).trim()));
  });
  console.log(
    "ISOLATION",
    JSON.stringify({
      nestedPid: state.pid,
      socket: env.NIRI_SOCKET,
      display,
      privateRuntime,
      accessibility: "disabled (GTK_A11Y=none, NO_AT_BRIDGE=1); AT-SPI untested",
      renderer: "cairo fixture; host GPU rendering untested",
    }),
  );
  if (!controllerOnly) {
    const cargo = start(
      "heavy-job",
      [
        "run",
        "--label",
        "ak7114-isolated-gtk",
        "--task",
        "7114",
        "--",
        "env",
        `HOME=${env.HOME}`,
        "RUSTUP_TOOLCHAIN=1.98.0",
        `CARGO_TARGET_DIR=${root}/native/panel/target`,
        "cargo",
        "test",
        "--manifest-path",
        "native/panel/Cargo.toml",
        "--locked",
        "isolated_gtk_interaction",
        "--",
        "--ignored",
        "--nocapture",
        "--test-threads=1",
      ],
      "native-gui",
      { ...env, HOME: process.env.HOME },
    );
    assert.equal(
      await waitExit(cargo),
      0,
      fs.readFileSync(path.join(fixture, "native-gui.txt"), "utf8"),
    );
    console.log(fs.readFileSync(path.join(fixture, "native-gui.txt"), "utf8"));
  } else {
    console.log("NATIVE GTK TEST SKIPPED: controller-only diagnostic selection");
  }

  for (const [appId, title] of [
    ["com.mitchellh.ghostty", "π - fixture · gs:main:7114 · 019fa4d071427fb48d30f98e951f0513"],
    ["org.ak7114.browser", "AK7114 browser fixture"],
    ["org.ak7114.obsidian", "AK7114 Obsidian fixture"],
    ["org.ak7114.plain", "AK7114 plain non-agent fixture"],
  ])
    start("python3", ["tests/support/isolated-gtk-window.py", appId, title], appId);
  const windows = await eventually(async () => {
    const windows = await niri("windows");
    return windows.length === 4 ? windows : null;
  }, "four private fixture windows");
  const agent = windows.find((w) => w.app_id === "com.mitchellh.ghostty");
  assert.ok(agent);
  Object.assign(process.env, env);
  const { publishSessionSnapshot, getBrokerStatus, sendBrokerMessage, requestBrokerShutdown } =
    await import("../../src/client/broker-client.mjs");
  const { createInitialSnapshot } = await import("../../src/common/telemetry.mjs");
  controller = start(
    "flock",
    ["--no-fork", `${fixture}/controller.lock`, "node", "src/native/main.mjs"],
    "controller",
  );
  let lastStatus = "";
  const status = async () => {
    let current;
    try {
      current = (await getBrokerStatus()).runtimeStatus;
    } catch {
      return null;
    }
    const diagnostic = JSON.stringify({
      state: current?.state,
      restart: current?.panelRestartCount,
      error: current?.error,
    });
    if (diagnostic !== lastStatus) {
      lastStatus = diagnostic;
      console.log("CONTROLLER status", diagnostic);
    }
    if (current?.state === "error") throw new Error(diagnostic);
    return current;
  };
  await eventually(async () => (await status())?.state === "ready", "controller/panel ready");
  const record = createInitialSnapshot({
    cwd: root,
    sessionName: "isolated injected agent telemetry",
  });
  Object.assign(record, {
    sessionId: "019fa4d0-7142-7fb4-8d30-f98e951f0513",
    terminalKind: "ghostty-surface",
    terminalKey: "ghostty:main:7114",
    terminalFamily: "main",
    terminalSurfaceId: "7114",
  });
  await publishSessionSnapshot(record);
  heartbeat = setInterval(() => {
    record.updatedAt = Date.now();
    void publishSessionSnapshot(record).catch((error) => {
      heartbeatError = error;
    });
  }, 2500);
  const focus = (id) => run("niri", ["msg", "action", "focus-window", "--id", String(id)]);
  await focus(agent.id);
  await eventually(async () => (await status())?.windowVisible === true, "agent surface visible");
  const layers = () => niri("layers");
  console.log("CONTROLLER PASS agent focus", JSON.stringify(await layers()));
  for (const other of windows.filter((w) => w.id !== agent.id)) {
    await focus(other.id);
    await eventually(
      async () => (await status())?.windowVisible === false,
      `${other.title}: hidden`,
    );
    await eventually(
      async () => !(await layers()).some((layer) => layer.namespace === "pi-activity-strip"),
      "hidden layer actually unmapped",
    );
    assert.equal(
      (await sendBrokerMessage({ type: "focus-strip" }, { expectReply: true })).ok,
      false,
    );
    assert.equal(
      (await status()).rendererCardCount,
      1,
      "cards retained while non-agent owns focus",
    );
    console.log(
      "CONTROLLER PASS non-agent hidden / keyboard refused",
      other.app_id,
      JSON.stringify(await layers()),
    );
    await focus(agent.id);
    await eventually(async () => (await status())?.windowVisible === true, "return agent");
    assert.equal((await status()).panelExpanded, false);
  }
  const keyboardEntry = await sendBrokerMessage({ type: "focus-strip" }, { expectReply: true });
  if (!keyboardEntry.ok)
    console.log(
      "KEYBOARD ENTRY REFUSED",
      keyboardEntry,
      await niri("focused-window"),
      await status(),
    );
  assert.equal(keyboardEntry.ok, true, JSON.stringify(keyboardEntry));
  await eventually(
    async () => (await status())?.panelExpanded === true,
    "explicit keyboard expansion",
  );
  await eventually(
    async () => (await niri("focused-window")) === null,
    "exclusive panel keyboard produces NULL focus",
  );
  await delay(3200); // Cover two 1500ms fallback polls while NULL, not just immediate ack.
  assert.equal((await status()).windowVisible, true);
  assert.ok(
    (await layers()).some(
      (layer) =>
        layer.namespace === "pi-activity-strip" && layer.keyboard_interactivity === "Exclusive",
    ),
  );
  console.log(
    "CONTROLLER PASS explicit keyboard / real Niri NULL focus remains eligible",
    JSON.stringify(await layers()),
  );
  assert.equal((await sendBrokerMessage({ type: "focus-strip" }, { expectReply: true })).ok, true);
  await eventually(async () => (await status())?.panelExpanded === false, "second shortcut exits");
  await eventually(
    async () => (await niri("focused-window"))?.id === agent.id,
    "keyboard returned to agent",
  );
  assert.equal((await sendBrokerMessage({ type: "focus-strip" }, { expectReply: true })).ok, true);
  await eventually(async () => (await status())?.panelExpanded === true, "second keyboard entry");
  await run("wtype", ["-k", "Escape"]);
  await eventually(async () => (await status())?.panelExpanded === false, "keyboard exit compact");
  await focus(agent.id);
  const workspace = agent.workspace_id;
  const workspaces = await niri("workspaces");
  const empty = workspaces.find((w) => w.id !== workspace);
  assert.ok(empty);
  await run("niri", ["msg", "action", "focus-workspace", String(empty.idx)]);
  await eventually(async () => (await status())?.windowVisible === false, "empty workspace hidden");
  assert.equal((await sendBrokerMessage({ type: "focus-strip" }, { expectReply: true })).ok, false);
  await eventually(
    async () => !(await layers()).some((layer) => layer.namespace === "pi-activity-strip"),
    "empty workspace unmaps layer",
  );
  console.log(
    "CONTROLLER PASS empty workspace hide / keyboard refused",
    JSON.stringify(await layers()),
  );
  await run("niri", [
    "msg",
    "action",
    "focus-workspace",
    String(workspaces.find((w) => w.id === workspace).idx),
  ]);
  await focus(agent.id);
  await eventually(
    async () => (await status())?.windowVisible === true,
    "workspace return collapsed",
  );
  assert.equal((await status()).panelExpanded, false);
  assert.equal((await sendBrokerMessage({ type: "focus-strip" }, { expectReply: true })).ok, true);
  await eventually(
    async () => (await status())?.panelExpanded === true,
    "keyboard mode before owner close",
  );
  const ownedAgent = children.find((child) => child.pid === agent.pid);
  assert.ok(ownedAgent, "close only the exact GUI process launched by this harness");
  ownedAgent.kill("SIGTERM");
  await waitExit(ownedAgent);
  await eventually(
    async () => (await status())?.windowVisible === false,
    "closed keyboard owner hides",
  );
  await eventually(
    async () => !(await layers()).some((layer) => layer.namespace === "pi-activity-strip"),
    "owner close releases layer",
  );
  assert.equal((await sendBrokerMessage({ type: "focus-strip" }, { expectReply: true })).ok, false);
  console.log(
    "CONTROLLER PASS closing owned agent fixture revokes keyboard ownership and unmaps layer",
  );
  clearInterval(heartbeat);
  await requestBrokerShutdown();
  assert.equal(await waitExit(controller), 0);
  console.log(
    `${controllerOnly ? "CONTROLLER ONLY" : "ISOLATED"} GUI PASS; fixture telemetry/GTK app identities, not actual agent/browser/Obsidian apps or operator runtime`,
  );
} finally {
  clearInterval(heartbeat);
  // Only children started here are signalled; nested compositor lifetime remains helper-owned.
  for (const child of children.reverse()) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await waitExit(child);
  }
  fs.closeSync(runtimeFd);
}
console.log("ISOLATED GUI CLEANUP PASS");
