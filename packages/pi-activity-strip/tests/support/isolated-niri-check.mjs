// Invoke only after canonical nested-niri.sh up/env. This harness never addresses the outer socket.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { selectEmptyWorkspace } from "./fixture-workspaces.mjs";
import { checkCrossVersions } from "./protocol-cross-check.mjs";

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
  PI_ACTIVITY_STRIP_NATIVE_PANEL_BIN: path.join(
    root,
    "native/bin/linux-x64-gnu/pi-activity-strip-panel",
  ),
  PI_ACTIVITY_STRIP_GUI_TRACE: path.join(fixture, "panel-protocol.jsonl"),
  PI_ACTIVITY_STRIP_GUI_STATE: stateFile,
  PI_ACTIVITY_STRIP_VIRTUAL_POINTER: path.join(fixture, "virtual-pointer"),
  PI_ACTIVITY_STRIP_VIRTUAL_KEYBOARD: path.join(fixture, "virtual-keyboard"),
  PI_ACTIVITY_STRIP_RUNTIME_LOCK_HELD: "1",
  PI_ACTIVITY_STRIP_PANEL_DEMO: "0",
  PI_ACTIVITY_STRIP_CLICK_THROUGH: "0",
  PI_ACTIVITY_STRIP_SOCKET_DIR: "native/panel/target/gui-fixture/broker",
  PI_ACTIVITY_STRIP_SOCKET_PATH: "native/panel/target/gui-fixture/broker/activity-strip.sock",
  PI_ACTIVITY_STRIP_TAB_INVENTORY: "0",
  PI_ACTIVITY_STRIP_AGENT_TABS: "0",
  PI_ACTIVITY_STRIP_AK_TASKS: "0",
  PI_ACTIVITY_STRIP_HEIGHT_REPAIR: "0",
};
for (const key of [
  "DISPLAY",
  "XAUTHORITY",
  "WAYLAND_SOCKET",
  "PI_ACTIVITY_STRIP_ALLOW_UNVERIFIED_PANEL",
  "AT_SPI_BUS_ADDRESS",
  "DBUS_STARTER_ADDRESS",
  "DBUS_STARTER_BUS_TYPE",
  "DBUS_SESSION_BUS_ADDRESS",
  "SESSION_MANAGER",
])
  delete env[key];
const children = [];
const expectedExits = new Set();
const childErrors = new Map();
function start(command, args, name, childEnv = env) {
  const log = fs.openSync(path.join(fixture, `${name}.txt`), "w");
  const child = spawn(command, args, { env: childEnv, stdio: ["ignore", log, log] });
  fs.closeSync(log);
  children.push(child);
  child.on("error", (error) => childErrors.set(child, error));
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
  // Per-condition watchdog, not a task/build budget: longer than all four 5s panel startup
  // attempts + supervisor backoff + two 1500ms fallback polls. A broken assertion must fail.
  const deadline = performance.now() + 30_000;
  for (;;) {
    const result = await check();
    if (heartbeatError) throw heartbeatError;
    for (const child of children) {
      if (childErrors.has(child)) throw childErrors.get(child);
      if (!expectedExits.has(child) && (child.exitCode !== null || child.signalCode !== null))
        throw new Error(
          `${label}: required fixture ${child.pid} exited ${child.signalCode ?? child.exitCode}`,
        );
    }
    if (result) return result;
    if (performance.now() >= deadline)
      throw new Error(
        `${label}: condition not reached within compositor/supervisor assertion window`,
      );
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
    expectedExits.add(cargo); // This test child is required to complete, unlike resident fixtures.
    assert.equal(
      await waitExit(cargo),
      0,
      fs.readFileSync(path.join(fixture, "native-gui.txt"), "utf8"),
    );
    console.log(fs.readFileSync(path.join(fixture, "native-gui.txt"), "utf8"));
  } else {
    console.log("NATIVE GTK TEST SKIPPED: controller-only diagnostic selection");
  }

  Object.assign(process.env, env);
  const legacyRoot = await checkCrossVersions({
    root,
    fixture,
    env,
    start,
    waitExit,
    eventually,
    niri,
    expectedExits,
    track: (child) => {
      children.push(child);
      child.on("error", (error) => childErrors.set(child, error));
      return child;
    },
  });
  const legacyPublisher = await import(
    pathToFileURL(path.join(legacyRoot, "src/client/broker-client.mjs")).href
  );

  for (const [appId, title] of [
    ["com.mitchellh.ghostty", "π - fixture · gs:main:7114 · 019fa4d071427fb48d30f98e951f0513"],
    ["com.mitchellh.ghostty", "π - target · gs:main:7115 · 019fa4d171427fb48d30f98e951f0513"],
    ["org.ak7114.browser", "AK7114 browser fixture"],
    ["org.ak7114.obsidian", "AK7114 Obsidian fixture"],
    ["org.ak7114.plain", "AK7114 plain non-agent fixture"],
  ])
    start(
      "python3",
      [
        "tests/support/isolated-gtk-window.py",
        appId,
        title,
        path.join(fixture, title.includes("target") ? "target-typing.txt" : `${appId}-typing.txt`),
      ],
      title.includes("target") ? "target" : appId,
    );
  const windows = await eventually(async () => {
    const windows = await niri("windows");
    return windows.length === 5 ? windows : null;
  }, "five private fixture windows");
  const agent = windows.find((w) => w.title.includes("gs:main:7114"));
  const target = windows.find((w) => w.title.includes("gs:main:7115"));
  assert.ok(agent && target);
  const initialWorkspaces = await niri("workspaces");
  const targetWorkspace = initialWorkspaces.find((w) => w.id !== agent.workspace_id);
  assert.ok(targetWorkspace);
  await run("niri", [
    "msg",
    "action",
    "move-window-to-workspace",
    "--window-id",
    String(target.id),
    "--focus",
    "false",
    String(targetWorkspace.idx),
  ]);
  Object.assign(process.env, env);
  const { publishSessionSnapshot, getBrokerStatus, sendBrokerMessage, requestBrokerShutdown } =
    await import("../../src/client/broker-client.mjs");
  const { createInitialSnapshot } = await import("../../src/common/telemetry.mjs");
  controller = start(
    "flock",
    [
      "--no-fork",
      `${fixture}/controller.lock`,
      "node",
      "--import",
      "./tests/support/trace-panel.mjs",
      "src/native/main.mjs",
    ],
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
    repoLabel: "source-agent",
    terminalKind: "ghostty-surface",
    terminalKey: "ghostty:main:7114",
    terminalFamily: "main",
    terminalSurfaceId: "7114",
  });
  const targetRecord = {
    ...createInitialSnapshot({ cwd: root, sessionName: "isolated target telemetry" }),
    sessionId: "019fa4d1-7142-7fb4-8d30-f98e951f0513",
    repoLabel: "target-agent",
    terminalKind: "ghostty-surface",
    terminalKey: "ghostty:main:7115",
    terminalFamily: "main",
    terminalSurfaceId: "7115",
  };
  const secondRecord = { ...record, publisherId: "isolated-base-publisher" };
  await publishSessionSnapshot(record);
  await legacyPublisher.publishSessionSnapshot(secondRecord);
  await publishSessionSnapshot(targetRecord);
  let beat = 0;
  heartbeat = setInterval(() => {
    beat++;
    const now = Date.now();
    record.updatedAt = record.lastEventAt = now + (beat % 2);
    secondRecord.updatedAt = secondRecord.lastEventAt = now + 1 - (beat % 2);
    targetRecord.updatedAt = targetRecord.lastEventAt = now;
    void Promise.all([
      publishSessionSnapshot(record),
      legacyPublisher.publishSessionSnapshot(secondRecord),
      publishSessionSnapshot(targetRecord),
    ]).catch((error) => {
      heartbeatError = error;
    });
  }, 1000);
  const focus = (id) => run("niri", ["msg", "action", "focus-window", "--id", String(id)]);
  await focus(agent.id);
  await eventually(async () => (await status())?.windowVisible === true, "agent surface visible");
  const layers = () => niri("layers");
  await eventually(() => {
    const rows = fs
      .readFileSync(env.PI_ACTIVITY_STRIP_GUI_TRACE, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return rows.some(
      (e) =>
        e.message.type === "view" &&
        e.message.sessions?.some(
          (card) => card.windowId === agent.id && card.publisherRecordKeys?.length === 2,
        ),
    );
  }, "both current and actual base publisher admitted to one production card");
  console.log(
    "PUBLIC TELEMETRY PASS actual base publisher and current publisher aggregate into one agent card",
  );
  console.log("CONTROLLER PASS agent focus", JSON.stringify(await layers()));
  for (const other of windows.filter((w) => w.app_id !== "com.mitchellh.ghostty")) {
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
  // REAL production controller admission + native GTK + virtual Wayland pointer/keyboard.
  // No focus-strip command has succeeded before this hover-only number/Enter test.
  const output = Object.values(await niri("outputs"))[0].logical;
  const pointer = spawn(
    env.PI_ACTIVITY_STRIP_VIRTUAL_POINTER,
    ["300", String(output.height - 40), String(output.width), String(output.height)],
    { env, stdio: ["pipe", "pipe", "inherit"] },
  );
  children.push(pointer);
  pointer.on("error", (error) => childErrors.set(pointer, error));
  const pointerLines = createInterface({ input: pointer.stdout })[Symbol.asyncIterator]();
  assert.equal((await pointerLines.next()).value, "ready");
  const keyboard = spawn(env.PI_ACTIVITY_STRIP_VIRTUAL_KEYBOARD, [], {
    env,
    stdio: ["pipe", "pipe", "inherit"],
  });
  children.push(keyboard);
  keyboard.on("error", (error) => childErrors.set(keyboard, error));
  const keyboardLines = createInterface({ input: keyboard.stdout })[Symbol.asyncIterator]();
  assert.equal((await keyboardLines.next()).value, "ready");
  const type = async (command, value) => {
    keyboard.stdin.write(`${command}\t${value}\n`);
    assert.equal((await keyboardLines.next()).value, "typed");
  };
  const move = async (x, y) => {
    pointer.stdin.write(`${x} ${y}\n`);
    assert.equal((await pointerLines.next()).value, "moved");
    await delay(200);
  };
  const panelLayer = async () => (await layers()).find((l) => l.namespace === "pi-activity-strip");
  const exclusive = async () => (await panelLayer())?.keyboard_interactivity === "Exclusive";
  const trace = () =>
    fs
      .readFileSync(env.PI_ACTIVITY_STRIP_GUI_TRACE, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  const enterHover = async () => {
    await move(300, output.height - 40);
    await focus(agent.id);
    await eventually(async () => (await status())?.windowVisible === true, "hover source visible");
    const before = trace().length;
    await move(60, 40);
    // Nested IPC inspection can take two seconds per query on a parked compositor. Observe
    // the real protocol immediately, then type; do not accidentally consume the 3s idle lease
    // on several sequential inspection roundtrips. Actual Niri NULL/mode are asserted below.
    await eventually(
      () =>
        trace()
          .slice(before)
          .filter((e) => e.message.type === "keyboard-active")
          .at(-1)?.message.active === true,
      "real pointer entry granted hover keyboard by Node",
    );
  };
  const returned = async (id, label) => {
    await eventually(
      async () => !(await exclusive()) && (await niri("focused-window"))?.id === id,
      label,
    );
    await eventually(async () => (await status())?.panelExpanded === false, `${label}: compact`);
    assert.equal(
      trace()
        .filter((e) => e.message.type === "expanded")
        .at(-1)?.message.queryLength,
      0,
      `${label}: actual native query cleared`,
    );
  };
  const receiver = (targetReceiver = false) =>
    fs.readFileSync(
      path.join(fixture, targetReceiver ? "target-typing.txt" : "com.mitchellh.ghostty-typing.txt"),
      "utf8",
    );
  const typeQuery = async (text) => {
    const before = trace().length;
    const underlying = receiver();
    await type("text", text);
    await eventually(
      () =>
        trace()
          .slice(before)
          .some((e) => e.message.type === "expanded" && e.message.queryLength === text.length),
      "actual native nonempty query",
    );
    assert.equal(receiver(), underlying, "query typed into panel, not underlying fixture");
  };
  const typeReturned = async (text, targetReceiver = false) => {
    await type("text", text);
    await eventually(
      () => receiver(targetReceiver).endsWith(text),
      `subsequent typing returned: ${text}`,
    );
  };
  const firstHoverStart = trace().length;
  await enterHover();
  // Already-initialized real Wayland keyboard: no wtype startup roundtrips can consume idle.
  const numberTyping = type("number", String(target.id));
  await delay(1800);
  await move(350, 40); // Brand -> card remains one interaction region, NOT a new request.
  assert.equal(await exclusive(), true);
  assert.equal(await niri("focused-window"), null);
  await delay(1500); // >2 fallback polls plus ordinary 1s publisher updates; key activity resets idle.
  assert.equal(await exclusive(), true);
  assert.equal((await status()).windowVisible, true);
  assert.equal(receiver(), "", "hover number was captured, not sent to source fixture");
  await numberTyping;
  await eventually(
    () =>
      trace()
        .slice(firstHoverStart)
        .some((e) => e.message.type === "jump"),
    "real Enter reached controller",
  );
  const interaction = trace().slice(firstHoverStart);
  const jumpIndex = interaction.findIndex((e) => e.message.type === "jump");
  const beforeJump = interaction.slice(0, jumpIndex);
  assert.equal(
    beforeJump.filter((e) => e.message.type === "hover-request").length,
    1,
    "one region, no child-crossing re-request",
  );
  assert.equal(beforeJump.filter((e) => e.message.type === "hover-grant").length, 1);
  const memberOrders = new Set(
    beforeJump
      .filter((e) => e.message.type === "view")
      .flatMap((e) =>
        e.message.sessions
          .filter((card) => card.windowId === agent.id)
          .map((card) => JSON.stringify(card.publisherRecordKeys)),
      ),
  );
  assert.ok(
    memberOrders.size >= 2,
    "real broker activity reordered aggregated publishers during active hover",
  );
  const ownership = beforeJump.filter(
    (e) =>
      e.message.type === "keyboard-active" &&
      e.message.revision === interaction[jumpIndex].message.request,
  );
  assert.deepEqual(
    ownership.map((e) => e.message.active),
    [true],
    "no grab/drop flicker through telemetry/polls",
  );
  assert.ok(
    interaction[jumpIndex].at - ownership[0].at >= 3200,
    "actual active span covers two fallback polls",
  );
  await returned(
    target.id,
    "hover-only number+Enter focused EXACT listed agent on other workspace",
  );
  await typeReturned("after-jump", true);
  assert.equal((await status()).panelJumpCount, 1);
  await delay(1700);
  assert.equal(await exclusive(), false, "no spontaneous regrab after jump/telemetry");
  console.log(
    "CONTROLLER PASS real hover -> typed listed window id -> Enter; exact cross-workspace target + subsequent typing; NULL ownership survives telemetry/two fallback polls",
  );

  await enterHover();
  const browser = windows.find((w) => w.app_id === "org.ak7114.browser");
  await focus(browser.id);
  await eventually(
    async () => (await status())?.windowVisible === false,
    "known non-agent revokes active hover",
  );
  assert.equal((await sendBrokerMessage({ type: "focus-strip" }, { expectReply: true })).ok, false);
  assert.equal(
    (await layers()).some((l) => l.namespace === "pi-activity-strip"),
    false,
  );
  await move(300, output.height - 40);
  await focus(agent.id);
  await eventually(
    async () => (await status())?.windowVisible === true,
    "agent returns after hover revoked",
  );
  assert.equal((await status()).panelExpanded, false);
  console.log(
    "CONTROLLER PASS known non-agent focus revokes active hover, unmaps layer, denies keyboard; return compact",
  );

  await enterHover();
  await typeQuery("leave-query");
  await move(300, output.height - 40);
  await returned(agent.id, "real region leave releases nonempty query");
  await typeReturned("after-leave");
  await delay(1700);
  assert.equal(await exclusive(), false);
  assert.equal((await status()).panelExpanded, false, "no stale re-expansion after pointer gone");

  await enterHover();
  await typeQuery("escape-query");
  await type("key", "Escape");
  await returned(agent.id, "Escape releases hover and query");
  await typeReturned("after-escape");
  await delay(1700);
  assert.equal(
    await exclusive(),
    false,
    "Escape while pointer remains cannot recapture on telemetry",
  );

  await enterHover();
  await typeQuery("idle-query");
  await returned(agent.id, "bounded idle releases NONEMPTY query");
  await typeReturned("after-idle");
  await delay(3200);
  assert.equal(
    await exclusive(),
    false,
    "idle remains released through two more polls with pointer still inside",
  );
  assert.equal((await status()).panelExpanded, false);

  await enterHover();
  await typeQuery("target-agent");
  await type("key", "Return");
  await returned(
    target.id,
    "hover project search activates exact admitted card after prior query cleanup",
  );
  await typeReturned("after-project", true);
  assert.equal((await status()).panelActivationCount, 1);
  console.log(
    "CONTROLLER PASS hover project search after leave/Escape/idle; exact target + subsequent typing",
  );

  await enterHover();
  await type("key", "Right");
  await returned(agent.id, "hover arrow interrupts rather than taking manual navigation");
  await typeReturned("after-interrupt"); // No claim that the interrupting Right was replayed.
  console.log(
    "CONTROLLER PASS leave/Escape/idle(nonempty query)/interrupt return keyboard; no telemetry recapture or stale expansion",
  );

  // An unlisted actual non-agent window cannot be reached through hover's numeric path.
  await enterHover();
  const unlisted = windows.find((w) => w.app_id === "org.ak7114.browser");
  const unlistedTyping = type("unlisted", String(unlisted.id));
  assert.equal(await exclusive(), true, "unlisted hover number does nothing");
  assert.equal(await niri("focused-window"), null);
  assert.equal((await status()).panelJumpCount, 1, "unlisted hover Enter emitted no jump");
  // A shortcut upgrades hover; a second shortcut toggles explicit mode off.
  assert.equal((await sendBrokerMessage({ type: "focus-strip" }, { expectReply: true })).ok, true);
  await unlistedTyping;
  assert.equal(await exclusive(), true);
  await move(300, output.height - 40);
  assert.equal(
    await exclusive(),
    true,
    "explicit upgrade survives pointer leave / stale hover cancellation",
  );
  assert.equal((await sendBrokerMessage({ type: "focus-strip" }, { expectReply: true })).ok, true);
  await returned(agent.id, "second explicit shortcut exits upgraded hover");
  console.log(
    "CONTROLLER PASS unlisted hover denied; explicit upgrade survives leave, then toggles off",
  );

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
  await eventually(
    async () => (await niri("focused-window")) === null,
    "second explicit grab actually applied before Escape input",
  );
  await type("key", "Escape");
  await eventually(async () => (await status())?.panelExpanded === false, "keyboard exit compact");
  await focus(agent.id);
  const workspace = agent.workspace_id;
  const workspaces = await niri("workspaces");
  const empty = selectEmptyWorkspace(workspaces, await niri("windows"), workspace);
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
  await eventually(
    async () => (await niri("focused-window")) === null,
    "explicit grab actually applied before owner close",
  );
  const ownedAgent = children.find((child) => child.pid === agent.pid);
  assert.ok(ownedAgent, "close only the exact GUI process launched by this harness");
  expectedExits.add(ownedAgent);
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
  expectedExits.add(controller);
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
