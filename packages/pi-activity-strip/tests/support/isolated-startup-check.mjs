// Run only inside the approved private headless namespace. No host runtime is addressed.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const work = "/work";
assert.equal(process.env.PI_ACTIVITY_STRIP_ISOLATED_GUI, "1");
const state = JSON.parse(fs.readFileSync(process.env.PI_ACTIVITY_STRIP_GUI_STATE, "utf8"));
assert.equal(state.outer_socket, null);
assert.ok(process.env.NIRI_SOCKET.endsWith(`.${state.pid}.sock`));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const storage = path.join(work, "startup-proof");
fs.mkdirSync(storage, { mode: 0o700 });
const home = path.join(storage, "home");
const runtime = path.join(storage, "runtime");
fs.mkdirSync(home, { mode: 0o700 });
fs.mkdirSync(runtime, { mode: 0o700 });
const runtimeFd = fs.openSync(runtime, "r");
const shortRuntime = `/proc/${process.pid}/fd/${runtimeFd}`;
const env = {
  ...process.env,
  HOME: home,
  XDG_RUNTIME_DIR: shortRuntime,
  WAYLAND_DISPLAY: path.resolve(process.env.XDG_RUNTIME_DIR, process.env.WAYLAND_DISPLAY),
  XDG_CONFIG_HOME: path.join(storage, "config"),
  XDG_CACHE_HOME: path.join(storage, "cache"),
  XDG_STATE_HOME: path.join(storage, "state"),
  GTK_A11Y: "none",
  NO_AT_BRIDGE: "1",
  GDK_BACKEND: "wayland",
  GSK_RENDERER: "cairo",
  PI_ACTIVITY_STRIP_AGENT_TABS: "0",
  PI_ACTIVITY_STRIP_TAB_INVENTORY: "0",
  PI_ACTIVITY_STRIP_AK_TASKS: "0",
  PI_ACTIVITY_STRIP_HEIGHT_REPAIR: "0",
};
// Exercise default HOME-based socket, packaged native selection and real flock ownership.
for (const key of [
  "PI_ACTIVITY_STRIP_NATIVE_PANEL_BIN",
  "PI_ACTIVITY_STRIP_ALLOW_UNVERIFIED_PANEL",
  "PI_ACTIVITY_STRIP_SOCKET_DIR",
  "PI_ACTIVITY_STRIP_SOCKET_PATH",
  "PI_ACTIVITY_STRIP_RUNTIME_LOCK_HELD",
  "PI_ACTIVITY_STRIP_PANEL_DEMO",
  "DISPLAY",
  "XAUTHORITY",
  "WAYLAND_SOCKET",
  "AT_SPI_BUS_ADDRESS",
  "DBUS_STARTER_ADDRESS",
  "DBUS_STARTER_BUS_TYPE",
  "SESSION_MANAGER",
])
  delete env[key];
const children = [];
const receipts = [];
let activeRoot = null;
async function execute(command, args, allowFailure = false) {
  const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (data) => {
    stdout += data;
  });
  child.stderr.on("data", (data) => {
    stderr += data;
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (!allowFailure) assert.equal(code, 0, `${command} ${args.join(" ")}: ${stderr}\n${stdout}`);
  return { code, stdout, stderr };
}
const cli = (root, ...args) =>
  execute(process.execPath, [path.join(root, "bin/pi-activity-strip.mjs"), ...args]);
function procIdentity(pid) {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
  const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  return {
    pid,
    startTicks: fields[19],
    executableSha256: sha256(fs.readFileSync(`/proc/${pid}/exe`)),
    args: fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean),
  };
}
function sourceFingerprint(root) {
  const files = ["package.json"];
  function visit(relative) {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  visit("src");
  return sha256(
    files
      .sort()
      .map((file) => `${file}\0${sha256(fs.readFileSync(path.join(root, file)))}\n`)
      .join(""),
  );
}
try {
  const bus = spawn(
    "dbus-daemon",
    ["--session", "--nofork", "--print-address=1", `--address=unix:path=${shortRuntime}/bus`],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  children.push(bus);
  env.DBUS_SESSION_BUS_ADDRESS = await new Promise((resolve, reject) => {
    bus.once("error", reject);
    bus.stdout.once("data", (data) => resolve(String(data).trim()));
  });
  const installed = path.join(work, "installed");
  fs.mkdirSync(installed);
  const candidate = path.join(installed, "candidate");
  const rollback = path.join(installed, "rollback");
  fs.cpSync("/work/payload/package", candidate, { recursive: true, errorOnExist: true });
  fs.cpSync("/work/payload/rollback-package", rollback, { recursive: true, errorOnExist: true });
  for (const [label, root] of [
    ["candidate-cold", candidate],
    ["rollback-pair", rollback],
    ["candidate-restored", candidate],
  ]) {
    activeRoot = root;
    const receipt = JSON.parse(
      fs.readFileSync(path.join(root, "native/bin/linux-x64-gnu/artifact.json"), "utf8"),
    );
    const binary = path.join(root, "native/bin/linux-x64-gnu/pi-activity-strip-panel");
    assert.equal(sha256(fs.readFileSync(binary)), receipt.sha256);
    await cli(root, "doctor", "--json");
    const opened = await cli(root, "open");
    assert.match(opened.stdout, /Started activity strip/);
    let status;
    const deadline = performance.now() + 15_000;
    for (;;) {
      status = JSON.parse((await cli(root, "status", "--json")).stdout);
      if (
        label === "rollback-pair" ||
        status.runtimeStatus?.ribbonDiagnostics?.panelBuild?.state === "receipt-matched"
      )
        break;
      assert.ok(
        performance.now() < deadline,
        "new build diagnostics must observe the actual native image",
      );
      await delay(100);
    }
    const runtimeStatus = status.runtimeStatus;
    assert.equal(runtimeStatus.state, "ready");
    const controller = procIdentity(runtimeStatus.controllerPid);
    const panel = procIdentity(runtimeStatus.panelPid);
    assert.equal(controller.executableSha256, sha256(fs.readFileSync(process.execPath)));
    assert.ok(controller.args.includes(path.join(root, "src/native/main.mjs")));
    assert.equal(fs.realpathSync(`/proc/${panel.pid}/exe`), binary);
    assert.equal(panel.executableSha256, receipt.sha256);
    const fingerprint = sourceFingerprint(root);
    if (label !== "rollback-pair") {
      assert.equal(runtimeStatus.ribbonDiagnostics.controllerStartupSourceSha256, fingerprint);
      assert.equal(runtimeStatus.ribbonDiagnostics.expectedPrivateProtocol, 2);
      assert.equal(
        runtimeStatus.ribbonDiagnostics.panelBuild.receiptedSourceSha256,
        receipt.sourceSha256,
      );
      assert.equal(
        runtimeStatus.ribbonDiagnostics.captureExpiry,
        "not-observed",
        "do not invent production native expiry telemetry",
      );
    }
    await cli(root, "open");
    assert.equal(
      JSON.parse((await cli(root, "status", "--json")).stdout).runtimeStatus.controllerPid,
      controller.pid,
      "normal repeated open must retain singleton",
    );
    receipts.push({
      label,
      sourceFingerprint: fingerprint,
      receipt,
      controller,
      panel,
      runtimeStatus,
    });
    await cli(root, "stop");
    activeRoot = null;
    const lock = path.join(home, ".pi/agent/state/pi-activity-strip/runtime.lock");
    await execute("flock", ["--nonblock", "--conflict-exit-code", "75", lock, "true"]);
    const stopped = await execute(
      process.execPath,
      [path.join(root, "bin/pi-activity-strip.mjs"), "status", "--json"],
      true,
    );
    assert.equal(stopped.code, 1);
    for (const previous of [controller, panel]) {
      try {
        const now = procIdentity(previous.pid);
        assert.notEqual(now.startTicks, previous.startTicks, "stopped generation must be gone");
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ESRCH") throw error;
      }
    }
    console.log(
      `STARTUP PASS ${label}: default normal CLI, exact pair, singleton, complete stop/lock release`,
    );
  }
  assert.equal(receipts[0].sourceFingerprint, receipts[2].sourceFingerprint);
  assert.notEqual(receipts[0].sourceFingerprint, receipts[1].sourceFingerprint);
  fs.writeFileSync("/work/startup-rollback-proof.json", `${JSON.stringify(receipts, null, 2)}\n`);
} finally {
  if (activeRoot) await cli(activeRoot, "stop");
  for (const child of children.reverse()) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
  }
  fs.closeSync(runtimeFd);
}
