import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { resolvePanelBinary } from "../src/native/panel-binary.mjs";
import { admitPanelEvent, PANEL_PROTOCOL } from "../src/native/panel-protocol.mjs";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "activity-strip-protocol-unit-"));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const legacy = path.join(scratch, "legacy");
fs.mkdirSync(legacy, { recursive: true });
const binary = path.join(legacy, "pi-activity-strip-panel");
// Synthetic v1 receipt/admission fixture, NOT a historical binary or cross-version GUI proof.
// Genuine historical controller/binary checks live only in the explicitly prepared GUI harness.
fs.writeFileSync(binary, "#!/bin/sh\necho 'unit fixture must never launch' >&2\nexit 97\n");
fs.chmodSync(binary, 0o755);
const oldReceipt = {
  schema: "pi-activity-strip-native-artifact.v1",
  target: "x86_64-unknown-linux-gnu",
  sha256: createHash("sha256").update(fs.readFileSync(binary)).digest("hex"),
  // Genuine v1 receipts omit panelProtocol; test that semantic without requiring Git history.
};
fs.writeFileSync(path.join(legacy, "artifact.json"), JSON.stringify(oldReceipt));

test("private protocol 2 is independent of the unchanged public broker protocol", async () => {
  const { makeMessage } = await import("../src/common/protocol.mjs");
  assert.equal(PANEL_PROTOCOL, 2);
  const message = makeMessage("upsert", { session: { sessionId: "fixture" } });
  assert.deepEqual(Object.keys(message), ["id", "type", "session"]);
  assert.equal(message.protocol, undefined);
});

test("synthetic v1 receipt is rejected before launch, including override bypass", () => {
  assert.equal(
    createHash("sha256").update(fs.readFileSync(binary)).digest("hex"),
    oldReceipt.sha256,
  );
  for (const flag of ["0", "1"]) {
    assert.throws(
      () =>
        resolvePanelBinary({
          PI_ACTIVITY_STRIP_NATIVE_PANEL_BIN: binary,
          PI_ACTIVITY_STRIP_ALLOW_UNVERIFIED_PANEL: flag,
        }),
      /private protocol mismatch in receipt: expected 2/,
    );
  }
});

test("actual Node controller refuses a synthetic v1 override receipt without launching any GUI", async () => {
  const dir = path.join(scratch, "node");
  fs.mkdirSync(dir, { recursive: true });
  const privateHome = path.join(dir, "home");
  fs.mkdirSync(privateHome, { recursive: true, mode: 0o700 });
  const env = {
    ...process.env,
    HOME: privateHome,
    XDG_CONFIG_HOME: privateHome,
    XDG_RUNTIME_DIR: privateHome,
    PI_ACTIVITY_STRIP_RUNTIME_LOCK_HELD: "1",
    PI_ACTIVITY_STRIP_NATIVE_PANEL_BIN: binary,
    // Relative socket names avoid Linux's sockaddr_un limit with a long TMPDIR.
    PI_ACTIVITY_STRIP_SOCKET_DIR: path.relative(process.cwd(), path.join(dir, "broker")),
    PI_ACTIVITY_STRIP_SOCKET_PATH: path.relative(process.cwd(), path.join(dir, "broker/sock")),
    PI_ACTIVITY_STRIP_AK_TASKS: "0",
    PI_ACTIVITY_STRIP_AGENT_TABS: "0",
    PI_ACTIVITY_STRIP_TAB_INVENTORY: "0",
    PI_ACTIVITY_STRIP_HEIGHT_REPAIR: "0",
  };
  for (const key of [
    "NIRI_SOCKET",
    "WAYLAND_DISPLAY",
    "DISPLAY",
    "PI_ACTIVITY_STRIP_ALLOW_UNVERIFIED_PANEL",
  ])
    delete env[key];
  const child = spawn(process.execPath, ["src/native/main.mjs"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
    killSignal: "SIGKILL",
  });
  let stderr = "";
  child.stderr.on("data", (c) => (stderr += c));
  child.stdout.resume();
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  assert.equal(code, 1);
  assert.match(stderr, /private protocol mismatch in receipt: expected 2/);
});

test("incompatible ready is fatal, cannot become ready via a later packet, and revokes once", () => {
  let ended = 0,
    killed = 0,
    revoked = 0;
  const child = {
    stdin: { end: () => ended++ },
    kill: (signal) => {
      assert.equal(signal, "SIGTERM");
      killed++;
    },
  };
  const status = { state: "starting", error: null };
  assert.equal(
    admitPanelEvent(child, { type: "ready", protocol: 1 }, status, () => revoked++),
    false,
  );
  assert.equal(status.state, "error");
  assert.match(status.error, /expected 2, received 1/);
  assert.equal(
    admitPanelEvent(child, { type: "ready", protocol: 2 }, status, () => revoked++),
    false,
  );
  assert.deepEqual([ended, killed, revoked], [1, 1, 1]);
});
