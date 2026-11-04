// Private headless helper only; cwd = staged package. No builds or operator applications.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { selectEmptyWorkspace } from "./fixture-workspaces.mjs";

const root = fs.realpathSync(process.cwd());
assert.ok(root.startsWith("/work/"), "stage package inside the approved /work namespace");
assert.equal(process.env.PI_ACTIVITY_STRIP_ISOLATED_GUI, "1");
const stateFile = fs.realpathSync(process.env.PI_ACTIVITY_STRIP_GUI_STATE);
assert.ok(stateFile.startsWith("/work/"));
const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
assert.equal(state.outer_socket, null, "host/nested desktop sockets forbidden");
assert.equal(state.pid_namespace, "private");
assert.equal(state.status, "ready");
assert.ok(Number.isInteger(state.pid) && state.pid > 0);
for (const forbidden of ["/run/user", "/home", "/dev/dri", "/dev/input", "/sys"])
  assert.equal(fs.existsSync(forbidden), false, `not the approved namespace: ${forbidden}`);
for (const key of ["NIRI_SOCKET", "WAYLAND_DISPLAY"]) {
  assert.equal(process.env[key], state[key], `${key} differs from helper receipt`);
  const socket = fs.realpathSync(path.resolve(process.env.XDG_RUNTIME_DIR, process.env[key]));
  assert.ok(socket.startsWith("/work/runtime/") && fs.statSync(socket).isSocket());
}
assert.ok(process.env.NIRI_SOCKET.endsWith(`.${state.pid}.sock`));
const display = path.resolve(process.env.XDG_RUNTIME_DIR, process.env.WAYLAND_DISPLAY);
assert.notEqual(display, state.privateParentWayland);
const fixture = fs.mkdtempSync("/work/persistent-strip-");
console.log(
  "ISOLATION",
  JSON.stringify({ fixture, socket: state.NIRI_SOCKET, display, accessibility: "disabled" }),
);
const runtime = path.join(fixture, "runtime");
fs.mkdirSync(runtime, { mode: 0o700 });
const env = { ...process.env };
// No inherited visibility override, unverified binary, discovery settings or host bus.
for (const key of Object.keys(env))
  if (
    key.startsWith("PI_ACTIVITY_STRIP_") ||
    key.startsWith("DBUS_") ||
    [
      "DISPLAY",
      "XAUTHORITY",
      "WAYLAND_SOCKET",
      "AT_SPI_BUS_ADDRESS",
      "SESSION_MANAGER",
      "NODE_OPTIONS",
    ].includes(key)
  )
    delete env[key];
Object.assign(env, {
  HOME: `${fixture}/home`,
  XDG_RUNTIME_DIR: runtime,
  WAYLAND_DISPLAY: display,
  XDG_CONFIG_HOME: `${fixture}/config`,
  XDG_CACHE_HOME: `${fixture}/cache`,
  XDG_STATE_HOME: `${fixture}/state`,
  GDK_BACKEND: "wayland",
  GSK_RENDERER: "cairo",
  GTK_A11Y: "none",
  NO_AT_BRIDGE: "1",
  DBUS_SESSION_BUS_ADDRESS: `unix:path=${runtime}/bus`,
  DBUS_SYSTEM_BUS_ADDRESS: `unix:path=${runtime}/no-system-bus`,
  PI_ACTIVITY_STRIP_ISOLATED_GUI: "1",
  PI_ACTIVITY_STRIP_GUI_STATE: stateFile,
  PI_ACTIVITY_STRIP_GUI_TRACE: `${fixture}/panel-protocol.jsonl`,
  PI_ACTIVITY_STRIP_RUNTIME_LOCK_HELD: "1",
  PI_ACTIVITY_STRIP_PANEL_DEMO: "0",
  PI_ACTIVITY_STRIP_SOCKET_DIR: runtime,
  PI_ACTIVITY_STRIP_SOCKET_PATH: `${runtime}/broker.sock`,
  PI_ACTIVITY_STRIP_AGENT_TABS: "0",
  PI_ACTIVITY_STRIP_TAB_INVENTORY: "0",
  PI_ACTIVITY_STRIP_AK_TASKS: "0",
  PI_ACTIVITY_STRIP_HEIGHT_REPAIR: "0",
});
fs.mkdirSync(env.HOME, { mode: 0o700 });
// Dynamic broker imports below must see the same explicit private socket as the controller.
for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
Object.assign(process.env, env);
const children = [];
let fatal,
  heartbeat,
  publishing = Promise.resolve(),
  publicationBusy = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    fatal = new Error(`interrupted: ${signal}`);
  });
function start(command, args, name, resident = true) {
  const log = fs.openSync(`${fixture}/${name}.log`, "w");
  const child = spawn(command, args, {
    cwd: root,
    env,
    detached: true,
    stdio: ["ignore", "pipe", log],
  });
  const item = {
    child,
    resident,
    stopped: false,
    closed: false,
    output: "",
    error: null,
    done: null,
  };
  child.stdout.on("data", (chunk) => {
    item.output += chunk;
    fs.writeSync(log, chunk);
  });
  item.done = new Promise((resolve) => {
    child.once("error", (error) => {
      item.error = error;
    });
    child.once("close", (code) => {
      item.closed = true;
      fs.closeSync(log);
      resolve(code);
    });
  });
  children.push(item);
  return item;
}
function signalGroup(item, signal) {
  // Each group was created here; open inherited pipes keep descendants owned after leader exit.
  if (item.child.pid && !item.closed)
    try {
      process.kill(-item.child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
}
async function stop(item) {
  item.stopped = true;
  if (item.closed) return;
  signalGroup(item, "SIGTERM");
  if (!(await Promise.race([item.done.then(() => true), delay(1500).then(() => false)]))) {
    signalGroup(item, "SIGKILL");
    assert.ok(
      await Promise.race([item.done.then(() => true), delay(1500).then(() => false)]),
      "owned child failed to reap",
    );
    throw new Error("owned child required SIGKILL; cleanup is not a clean pass");
  }
}
async function run(command, args) {
  const item = start(command, args, `command-${children.length}`, false);
  const timer = setTimeout(() => {
    item.error = new Error(`${command} timed out`);
    signalGroup(item, "SIGKILL");
  }, 5000);
  try {
    const code = await item.done;
    if (item.error) throw item.error;
    assert.equal(code, 0, `${command} ${args.join(" ")}; see ${fixture}`);
    return item.output;
  } finally {
    clearTimeout(timer);
  }
}
const niri = async (...args) => JSON.parse(await run("niri", ["msg", "-j", ...args]));
const action = (...args) => run("niri", ["msg", "action", ...args]);
function healthy() {
  if (fatal) throw fatal;
  for (const item of children.filter((item) => item.resident && !item.stopped)) {
    if (item.error) throw item.error;
    assert.ok(
      item.child.exitCode === null && item.child.signalCode === null,
      "required child exited; see logs",
    );
  }
}
async function eventually(check, label) {
  const deadline = performance.now() + 30000;
  do {
    healthy();
    const result = await check();
    if (result) return result;
    await delay(50);
  } while (performance.now() < deadline);
  throw new Error(`timeout: ${label}; evidence ${fixture}`);
}
const trace = () =>
  fs
    .readFileSync(env.PI_ACTIVITY_STRIP_GUI_TRACE, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
const heights = (windows) =>
  windows
    .map((w) => {
      const height = w.layout?.window_size?.[1];
      assert.ok(Number.isFinite(height) && height > 0, "real compositor height required");
      return [w.id, height];
    })
    .sort(([a], [b]) => a - b);
let result;
try {
  start(
    "dbus-daemon",
    ["--session", "--nofork", `--address=${env.DBUS_SESSION_BUS_ADDRESS}`],
    "bus",
  );
  await eventually(() => fs.existsSync(`${runtime}/bus`), "private bus");
  assert.equal((await niri("windows")).length, 0, "fresh private compositor required");
  assert.equal((await niri("layers")).length, 0);
  for (const [app, title] of [
    ["com.mitchellh.ghostty", "π - persistent · gs:main:8273 · 019fa4d071427fb48d30f98e951f0513"],
    ["org.ak8273.browser", "AK8273 browser"],
    ["org.ak8273.obsidian", "AK8273 Obsidian"],
  ])
    start(
      "python3",
      ["tests/support/isolated-gtk-window.py", app, title, `${fixture}/${app}.txt`],
      app,
    );
  const windows = await eventually(async () => {
    const all = await niri("windows");
    return all.length === 3 ? all : null;
  }, "three real GTK fixture windows");
  const [agent, browser, obsidian] = [
    "com.mitchellh.ghostty",
    "org.ak8273.browser",
    "org.ak8273.obsidian",
  ].map((id) => windows.find((w) => w.app_id === id));
  assert.ok(agent && browser && obsidian);
  assert.ok(windows.every((w) => w.workspace_id === agent.workspace_id));
  const source = (await niri("workspaces")).find((w) => w.id === agent.workspace_id);
  let lastHeights,
    stableSince = performance.now();
  const unreserved = new Map(
    await eventually(async () => {
      const vector = heights(await niri("windows"));
      if (JSON.stringify(vector) !== JSON.stringify(lastHeights)) stableSince = performance.now();
      lastHeights = vector;
      return performance.now() - stableSince >= 500 ? vector : null;
    }, "unreserved geometry settles"),
  );
  const { resolvePanelBinary } = await import("../../src/native/panel-binary.mjs");
  const binary = resolvePanelBinary(env); // Mandatory packaged receipt/hash check, no override.
  const { getBrokerStatus, publishSessionSnapshot } = await import(
    "../../src/client/broker-client.mjs"
  );
  const { createInitialSnapshot } = await import("../../src/common/telemetry.mjs");
  const status = async () => (await getBrokerStatus()).runtimeStatus;
  start(
    "flock",
    [
      "--no-fork",
      `${runtime}/controller.lock`,
      process.execPath,
      "--import",
      "./tests/support/trace-panel.mjs",
      "src/native/main.mjs",
    ],
    "controller",
  );
  await eventually(async () => {
    try {
      return (await status())?.state === "ready";
    } catch {
      return false;
    }
  }, "real controller ready");
  const record = Object.assign(
    createInitialSnapshot({ cwd: root, sessionName: "AK8273 fixture" }),
    {
      sessionId: "019fa4d0-7142-7fb4-8d30-f98e951f0513",
      terminalKind: "ghostty-surface",
      terminalKey: "ghostty:main:8273",
      terminalFamily: "main",
      terminalSurfaceId: "8273",
    },
  );
  await publishSessionSnapshot(record);
  heartbeat = setInterval(() => {
    if (publicationBusy) return;
    publicationBusy = true;
    record.updatedAt = record.lastEventAt = Date.now();
    publishing = publishSessionSnapshot(record)
      .catch((error) => {
        fatal = error;
      })
      .finally(() => {
        publicationBusy = false;
      });
  }, 1000);
  await action("focus-window", "--id", String(agent.id));
  await eventually(
    async () =>
      (await status())?.windowVisible &&
      trace().some(
        (r) =>
          r.message.type === "view" && r.message.sessions?.some((c) => c.windowId === agent.id),
      ),
    "real publisher admission",
  );
  const before = await eventually(async () => {
    const vector = heights(await niri("windows"));
    // Existing native compact zone 84 + anchored top margin 8, measured against no layer.
    return vector.length === 3 && vector.every(([id, h]) => unreserved.get(id) - h === 92)
      ? vector
      : null;
  }, "nonzero reserved height settles");
  const initial = await status(),
    boundary = trace().length;
  assert.equal(initial.panelRestartCount, 0);
  assert.equal(fs.realpathSync(`/proc/${initial.panelPid}/exe`), fs.realpathSync(binary));
  assert.ok(
    trace().some(
      (r) =>
        r.direction === "from-panel" &&
        r.message.type === "visibility-applied" &&
        r.message.visible === true,
    ),
  );
  let samples = 0;
  const phases = [];
  async function sample() {
    healthy();
    assert.deepEqual(heights(await niri("windows")), before, "application height vector changed");
    const layers = await niri("layers");
    const panel = layers.filter((l) => l.namespace === "pi-activity-strip");
    assert.equal(panel.length, 1, "persistent layer unmapped");
    assert.equal(panel[0].keyboard_interactivity, "None", "passive strip captured keyboard");
    const current = await status();
    assert.equal(current.state, "ready");
    assert.equal(current.panelPid, initial.panelPid);
    assert.equal(current.panelRestartCount, initial.panelRestartCount);
    assert.equal(current.windowVisible, true);
    assert.equal(
      current.clickThrough,
      false,
      "test normal input policy, not click-through override",
    );
    assert.equal(current.panelExpanded, false);
    assert.equal(current.ribbonDiagnostics?.keyboardAuthorization, "none");
    for (const { message: m } of trace().slice(boundary)) {
      if (["view", "visibility-applied"].includes(m.type))
        assert.equal(m.visible, true, "transient hide in real protocol");
      if (m.type === "keyboard-active")
        assert.notEqual(m.active, true, "transient keyboard capture");
      if (m.type === "keyboard-observation") assert.notEqual(m.captured, true);
    }
    samples++;
    return { current, layers, focused: await niri("focused-window") };
  }
  async function observe(label, predicate) {
    await eventually(async () => predicate(await sample()), label);
    const until = performance.now() + 1600; // Includes periodic controller reconciliation/telemetry.
    do {
      assert.ok(predicate(await sample()), `${label} did not remain settled`);
      await delay(50);
    } while (performance.now() < until);
    phases.push(label);
  }
  const focused =
    (id, kind) =>
    ({ focused: w, current }) =>
      w?.id === id && current.ribbonDiagnostics?.focus === kind;
  for (const [w, kind] of [
    [agent, "agent"],
    [browser, "non-agent"],
    [obsidian, "non-agent"],
    [agent, "agent"],
  ]) {
    await action("focus-window", "--id", String(w.id));
    await observe(w.app_id, focused(w.id, kind));
  }
  await action("focus-window", "--id", String(browser.id));
  await observe("browser before overlay", focused(browser.id, "non-agent"));
  await run("wtype", ["browser8273"]);
  await eventually(
    () => fs.readFileSync(`${fixture}/org.ak8273.browser.txt`, "utf8") === "browser8273",
    "browser receives typing",
  );
  const overlay = start(
    "env",
    [
      "LD_PRELOAD=/usr/lib/libgtk4-layer-shell.so",
      "python3",
      "tests/support/persistent-overlay.py",
      `${fixture}/overlay.txt`,
    ],
    "overlay",
  );
  await observe(
    "overlay exclusive NULL",
    ({ layers, focused: w, current }) =>
      w === null &&
      current.ribbonDiagnostics?.focus === "none" &&
      layers.some(
        (l) =>
          l.namespace === "ak8273-overlay" &&
          l.layer === "Overlay" &&
          l.keyboard_interactivity === "Exclusive",
      ),
  );
  await run("wtype", ["overlay8273"]);
  await eventually(
    () => fs.readFileSync(`${fixture}/overlay.txt`, "utf8") === "overlay8273",
    "overlay receives typing",
  );
  await stop(overlay);
  await observe(
    "overlay release",
    (s) =>
      focused(browser.id, "non-agent")(s) &&
      !s.layers.some((l) => l.namespace === "ak8273-overlay"),
  );
  const empty = selectEmptyWorkspace(await niri("workspaces"), await niri("windows"), source.id);
  assert.ok(empty, "real empty workspace required");
  await action("focus-workspace", String(empty.idx));
  await observe(
    "empty workspace",
    ({ focused: w, current }) =>
      w === null && current.rendererCardCount === 0 && current.ribbonDiagnostics?.focus === "none",
  );
  assert.equal((await niri("workspaces")).find((w) => w.is_focused)?.id, empty.id);
  await action("focus-workspace", String(source.idx));
  await action("focus-window", "--id", String(agent.id));
  await observe("return agent", focused(agent.id, "agent"));
  assert.ok(
    trace()
      .slice(boundary)
      .some((r) => r.direction === "to-panel" && r.message.type === "view"),
    "non-vacuous trace",
  );
  await run(process.execPath, ["bin/pi-activity-strip.mjs", "focus-strip"]);
  await eventually(
    async () =>
      (await niri("layers")).some(
        (l) => l.namespace === "pi-activity-strip" && l.keyboard_interactivity === "Exclusive",
      ),
    "SETUP: actual explicit strip capture",
  );
  const capturedBoundary = trace().length;
  const takeoverAt = performance.now();
  const competing = start(
    "env",
    [
      "LD_PRELOAD=/usr/lib/libgtk4-layer-shell.so",
      "python3",
      "tests/support/persistent-overlay.py",
      `${fixture}/active-overlay.txt`,
    ],
    "active-overlay",
  );
  await eventually(async () => {
    assert.deepEqual(heights(await niri("windows")), before);
    const layers = await niri("layers");
    const strip = layers.filter((l) => l.namespace === "pi-activity-strip");
    assert.equal(strip.length, 1);
    return (
      strip[0].keyboard_interactivity === "None" &&
      layers.some(
        (l) => l.namespace === "ak8273-overlay" && l.keyboard_interactivity === "Exclusive",
      ) &&
      (await status()).ribbonDiagnostics.keyboardAuthorization === "none"
    );
  }, "competing overlay revokes actual explicit capture without unmapping");
  assert.ok(performance.now() - takeoverAt < 3000, "release must not wait for an idle timeout");
  await run("wtype", ["takeover8273"]);
  assert.equal(fs.readFileSync(`${fixture}/active-overlay.txt`, "utf8"), "takeover8273");
  for (const { message: m } of trace().slice(capturedBoundary))
    if (["view", "visibility-applied"].includes(m.type)) assert.equal(m.visible, true);
  await stop(competing);
  phases.push("active explicit capture -> overlay takeover");
  result = {
    binary,
    phases,
    samples,
    unreserved: [...unreserved],
    reserved: before,
    panelPid: initial.panelPid,
    trace: env.PI_ACTIVITY_STRIP_GUI_TRACE,
  };
} finally {
  clearInterval(heartbeat);
  await publishing;
  const errors = [];
  for (const item of [...children].reverse())
    try {
      await stop(item);
    } catch (error) {
      errors.push(error);
    }
  if (errors.length) {
    fatal = new AggregateError(errors, "owned child cleanup failed");
    process.exitCode = 1;
  }
  console.log(`EVIDENCE ${fixture}`);
}
if (fatal) throw fatal;
fs.writeFileSync(`${fixture}/result.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log("PASS persistent production controller", JSON.stringify(result));
