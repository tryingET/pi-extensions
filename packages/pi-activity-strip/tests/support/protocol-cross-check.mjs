// Real base controller/artifact, not a passing protocol mock. Only called in owned GUI isolation.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export async function checkCrossVersions({
  root,
  fixture,
  env,
  start,
  waitExit,
  eventually,
  niri,
  track,
  expectedExits,
}) {
  const oldRoot = path.join(root, "native/panel/target/cross-version/packages/pi-activity-strip");
  const oldBinary = path.join(oldRoot, "native/bin/linux-x64-gnu/pi-activity-strip-panel");
  assert.ok(fs.existsSync(oldBinary), "extract actual 5d12a2a7 package into owned target first");
  const current = path.join(root, "native/bin/linux-x64-gnu/pi-activity-strip-panel");
  const { getBrokerStatus, requestBrokerShutdown } = await import(
    "../../src/client/broker-client.mjs"
  );
  const ensureNoLayer = async () =>
    assert.equal(
      (await niri("layers")).some((l) => l.namespace === "pi-activity-strip"),
      false,
    );
  const direct = track(spawn(current, [], { env, stdio: ["pipe", "pipe", "pipe"] }));
  let buffer = "";
  const packets = [];
  direct.stderr.resume();
  direct.stdout.on("data", (chunk) => {
    buffer += chunk;
    let at = buffer.indexOf("\n");
    while (at >= 0) {
      packets.push(JSON.parse(buffer.slice(0, at)));
      buffer = buffer.slice(at + 1);
      at = buffer.indexOf("\n");
    }
  });
  await eventually(
    () => packets.some((p) => p.type === "ready" && p.protocol === 2),
    "v2 native ready for legacy-message rejection",
  );
  expectedExits.add(direct);
  direct.stdin.end(`${JSON.stringify({ protocol: 1, type: "focus-strip", revision: 1 })}\n`);
  await eventually(
    () => direct.exitCode !== null || direct.signalCode !== null,
    "v2 panel rejects v1 control input",
  );
  assert.equal(await waitExit(direct), 1);
  assert.ok(
    packets.some(
      (p) =>
        p.type === "error" && /private protocol mismatch: expected 2, received 1/.test(p.message),
    ),
  );
  await ensureNoLayer();
  console.log(
    "CROSS VERSION PASS new native rejects legacy v1 input, diagnostic + exit 1, no layer",
    JSON.stringify(packets.filter((p) => p.type === "error")),
  );
  const forged = path.join(fixture, "forged-v2");
  fs.mkdirSync(forged, { recursive: true });
  fs.copyFileSync(oldBinary, path.join(forged, "pi-activity-strip-panel"));
  fs.chmodSync(path.join(forged, "pi-activity-strip-panel"), 0o755);
  const oldReceipt = JSON.parse(
    fs.readFileSync(path.join(path.dirname(oldBinary), "artifact.json"), "utf8"),
  );
  fs.writeFileSync(
    path.join(forged, "artifact.json"),
    JSON.stringify({ ...oldReceipt, panelProtocol: 2 }),
  );
  for (const [name, main, binary, legacy] of [
    [
      "current-old",
      path.join(root, "src/native/main.mjs"),
      path.join(forged, "pi-activity-strip-panel"),
      false,
    ],
    ["old-current", path.join(oldRoot, "src/native/main.mjs"), current, true],
  ]) {
    const socketPath = `native/panel/target/gui-fixture/${name}.sock`;
    const childEnv = {
      ...env,
      PI_ACTIVITY_STRIP_SOCKET_PATH: socketPath,
      PI_ACTIVITY_STRIP_NATIVE_PANEL_BIN: binary,
    };
    const child = start(
      "flock",
      ["--no-fork", path.join(fixture, `${name}.lock`), process.execPath, main],
      name,
      childEnv,
    );
    const status = async () => {
      try {
        return (await getBrokerStatus({ socketPath })).runtimeStatus;
      } catch {
        return null;
      }
    };
    await eventually(async () => {
      const s = await status();
      return legacy
        ? s?.warnings?.some((w) => /unsupported native panel protocol/.test(w))
        : s?.state === "error";
    }, `${name} actual incompatible readiness refused`);
    const s = await status();
    assert.equal(s.windowVisible, false);
    assert.equal(s.readyAt, null);
    assert.notEqual(s.state, "ready");
    if (!legacy) {
      assert.match(s.error, /private protocol mismatch: expected 2, received 1/);
      assert.equal(s.panelRestartCount, 0);
    }
    await ensureNoLayer();
    console.log(
      "CROSS VERSION DIAGNOSTIC",
      name,
      JSON.stringify({
        state: s.state,
        readyAt: s.readyAt,
        visible: s.windowVisible,
        error: s.error,
        warnings: s.warnings,
      }),
    );
    expectedExits.add(child);
    await requestBrokerShutdown({ socketPath });
    assert.equal(await waitExit(child), 0);
    await ensureNoLayer();
    console.log(
      `CROSS VERSION PASS ${name} actual base/new pair: never ready, diagnostic, no layer/keyboard; public broker command still works`,
    );
  }
  return oldRoot;
}
