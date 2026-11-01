// ---
// summary: "Given/When/Then diagnostics scenarios for stale reports and unknown readiness"
// read_when:
//   - "changing read-only ribbon state explanations or privacy behavior"
// ---

import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { normalizeKeyboardObservation } from "../src/common/keyboard-observation.mjs";
import { formatRibbonDiagnostics } from "../src/common/ribbon-status.mjs";
import {
  formatBrokerRuntimeStatus,
  summarizeBrokerRuntimeStatus,
} from "../src/common/status-report.mjs";
import { createNativePanelProjection } from "../src/native/panel-projection.mjs";
import {
  createRuntimeStatusReader,
  inspectPanelBuild,
  recordNativeKeyboardObservation,
} from "../src/native/runtime-diagnostics.mjs";
import { productionFixture } from "./support/production-panel-fixture.mjs";
import { createSocketFixture } from "./support/socket-fixture.mjs";

test("Given a real admitted presence source, When the production reader and formatter explain visibility, Then name eligible presence rather than unknown", () => {
  const raw = { sessionId: "agent", publisherId: "p" };
  const presence = { id: 99, workspace_id: 7, app_id: "com.onepassword.OnePassword", pid: 4100 };
  const projection = createNativePanelProjection({
    isNiriSession: () => true,
    publish() {},
    getWindowFacts: (id) => (id === 99 ? presence : null),
    env: {},
  });
  projection.updateSnapshot({ generatedAt: 1, sessions: [raw] });
  projection.publishWorkspaceView({
    workspace: { id: 7, is_focused: true },
    sessions: [{ ...raw, cardId: "session:agent", windowId: 44 }],
    focusKind: "neutral",
    focusWindowId: 99,
    focusedCardId: null,
    focusedSessionId: null,
  });
  const read = createRuntimeStatusReader({
    runtimeStatus: { state: "ready", startedAt: 1, windowVisible: true },
    projection,
  });
  const observed = read().ribbonDiagnostics;
  assert.equal(observed.visibilityReason, "eligible-presence-context");
  assert.match(
    formatRibbonDiagnostics(observed).join("\n"),
    /visibility reason: eligible-presence-context/,
  );
});

const observationCases = JSON.parse(
  fs.readFileSync(
    new URL("../native/panel/src/keyboard-observation-fixtures.json", import.meta.url),
    "utf8",
  ),
);
for (const entry of observationCases) {
  test(`Given shared Node/Rust protocol case ${entry.name}, When observing it, Then respect its independent expected validity without authority`, () => {
    const normalized = normalizeKeyboardObservation(entry.event);
    assert.equal(normalized !== null, entry.valid);
    if (normalized) {
      assert.doesNotMatch(JSON.stringify(normalized), /SECRET|query|credential/);
      const f = productionFixture();
      const before = f.projection.diagnostics();
      const status = { state: "ready", startedAt: 1, panelPid: 321 };
      assert.equal(recordNativeKeyboardObservation(status, entry.event, 321), true);
      const observed = createRuntimeStatusReader({
        runtimeStatus: status,
        projection: f.projection,
      })();
      assert.equal(observed.ribbonDiagnostics.captureExpiry, "native-observed");
      assert.deepEqual(f.projection.diagnostics(), before);
      assert.doesNotMatch(JSON.stringify(observed), /SECRET|credential|query/);
    }
  });
}

test("Given the current supervised native clock, When stale request/clock/process observations arrive, Then keep the last valid fact and never touch input authority", () => {
  const event = observationCases[0].event;
  const f = productionFixture();
  const before = f.projection.diagnostics();
  const status = { state: "ready", startedAt: 1, panelPid: 321 };
  assert.equal(recordNativeKeyboardObservation(status, event, 321), true);
  const saved = structuredClone(status.nativeKeyboardObservation);
  for (const patch of [
    { request: 0 },
    { nativeMs: 999 },
    { captured: false },
    { request: "1" },
    { reason: ["acquired"] },
  ]) {
    assert.equal(recordNativeKeyboardObservation(status, { ...event, ...patch }, 321), false);
    assert.deepEqual(status.nativeKeyboardObservation, saved);
  }
  assert.equal(recordNativeKeyboardObservation(status, event, 322), false);
  status.panelPid = 322;
  const read = createRuntimeStatusReader({ runtimeStatus: status, projection: f.projection });
  assert.equal(read().ribbonDiagnostics.captureExpiry, "not-observed");
  status.nativeKeyboardObservation = null; // Production startPanel reset, even if a PID is reused.
  assert.equal(
    recordNativeKeyboardObservation(status, { ...event, nativeMs: 10, deadlineMs: 3010 }, 322),
    true,
  );
  assert.equal(read().ribbonDiagnostics.nativeKeyboardObservation.nativeMs, 10);
  assert.deepEqual(f.projection.diagnostics(), before);
});

test("Scenario: a hidden ribbon cannot report its old expansion as current", () => {
  // Given a delayed expanded report after the surface has hidden,
  // When read-only status is rendered, Then that expansion is explicitly stale, not a cause guess.
  const text = formatBrokerRuntimeStatus({
    ok: true,
    runtimeStatus: { state: "ready", startedAt: 1, windowVisible: false, panelExpanded: true },
  });
  assert.match(text, /expansion: stale \(hidden surface\)/);
});

test("Scenario: broker liveness without overlay metadata is not reported as known readiness", () => {
  // Given legacy/missing overlay metadata, When summarized, Then warn without autostart or repair.
  assert.deepEqual(summarizeBrokerRuntimeStatus({ ok: true }), {
    headline: "Activity strip broker is running; overlay readiness is unknown",
    level: "warning",
  });
});

for (const mode of ["none", "hover", "explicit"])
  test(`Scenario: read-only observation cannot change ${mode} ownership or publisher identity`, () => {
    const f = productionFixture();
    if (mode !== "none") f.claim(mode);
    const before = f.projection.diagnostics();
    const published = f.views.length;
    const runtimeStatus = { state: "ready", startedAt: 1, windowVisible: true, panelPid: null };
    const read = createRuntimeStatusReader({ runtimeStatus, projection: f.projection });
    const first = read();
    const second = read();
    assert.deepEqual(f.projection.diagnostics(), before);
    assert.equal(f.views.length, published, "observation does not publish or advance the epoch");
    assert.deepEqual(first, second);
    assert.equal(first.ribbonDiagnostics.keyboardAuthorization, mode);
    assert.equal(first.ribbonDiagnostics.visibilityReason, "eligible-agent-context");
    assert.equal(first.ribbonDiagnostics.captureExpiry, "not-observed");
    assert.match(first.ribbonDiagnostics.controllerStartupSourceSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(first.ribbonDiagnostics.panelBuild, { state: "unavailable" });
    f.focus(99);
    assert.equal(read().ribbonDiagnostics.visibilityReason, "non-agent-focus");
    f.handlers.onFocusedWorkspace();
    assert.equal(read().ribbonDiagnostics.visibilityReason, "unproven-focus");
  });

test("Given native monotonic expiry evidence, When read-only diagnostics are requested, Then explain the observed hover deadline without wall-clock arithmetic or new authority", () => {
  const f = productionFixture();
  const request = f.claim("hover");
  const before = f.projection.diagnostics();
  const runtimeStatus = {
    state: "ready",
    startedAt: 1,
    windowVisible: true,
    panelPid: 123,
    nativeKeyboardObservation: {
      panelPid: 123,
      request,
      origin: "hover",
      reason: "idle-expired",
      nativeMs: 4000,
      deadlineMs: 4000,
      captured: true,
    },
  };
  const read = createRuntimeStatusReader({ runtimeStatus, projection: f.projection });
  const result = read().ribbonDiagnostics;
  assert.equal(result.captureExpiry, "native-observed");
  assert.deepEqual(result.nativeKeyboardObservation, runtimeStatus.nativeKeyboardObservation);
  const text = formatRibbonDiagnostics(result).join("\n");
  assert.match(text, /native monotonic ms: 4000/);
  assert.match(text, /idle deadline ms: 4000/);
  assert.match(text, /idle-expired/);
  assert.deepEqual(f.projection.diagnostics(), before);
  assert.equal(
    f.projection.ownsKeyboardRequest(request),
    true,
    "observed expiry must not revoke controller authority",
  );
  runtimeStatus.panelPid = 124;
  assert.equal(
    read().ribbonDiagnostics.captureExpiry,
    "not-observed",
    "old child observation cannot survive process generation change",
  );
});

test("Scenario: executable and receipt observations are bounded and do not reveal paths or text", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ak7417-diagnostic-proc-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nativeRoot = fileURLToPath(new URL("../native/bin/linux-x64-gnu/", import.meta.url));
  const artifactRoot = path.join(root, "SECRET_QUERY_PROMPT_CREDENTIAL");
  fs.mkdirSync(artifactRoot);
  const binary = path.join(artifactRoot, "panel");
  fs.copyFileSync(path.join(nativeRoot, "pi-activity-strip-panel"), binary);
  const receiptPath = path.join(artifactRoot, "artifact.json");
  const receipt = JSON.parse(fs.readFileSync(path.join(nativeRoot, "artifact.json"), "utf8"));
  fs.writeFileSync(
    receiptPath,
    JSON.stringify({ ...receipt, query: "SECRET_QUERY_PROMPT_CREDENTIAL" }),
  );
  fs.mkdirSync(path.join(root, "123"));
  fs.writeFileSync(
    path.join(root, "123/stat"),
    `123 (panel) ${["S", "1", ...Array(17).fill("0"), "12345"].join(" ")}`,
  );
  fs.symlinkSync(binary, path.join(root, "123/exe"));
  const observed = await inspectPanelBuild(123, { procRoot: root });
  assert.equal(observed.state, "receipt-matched");
  assert.equal(observed.binarySha256, receipt.sha256);
  assert.equal(observed.privateProtocol, 2);
  assert.doesNotMatch(JSON.stringify(observed), /SECRET|\/home|artifact\.json/);
  fs.writeFileSync(receiptPath, JSON.stringify({ ...receipt, panelProtocol: 1 }));
  assert.equal((await inspectPanelBuild(123, { procRoot: root })).state, "incompatible");
  fs.appendFileSync(binary, "changed");
  fs.writeFileSync(receiptPath, JSON.stringify(receipt));
  assert.equal((await inspectPanelBuild(123, { procRoot: root })).state, "receipt-mismatch");
  fs.unlinkSync(receiptPath);
  const missing = await inspectPanelBuild(123, { procRoot: root });
  assert.equal(missing.state, "unavailable");
  assert.match(
    missing.binarySha256,
    /^[a-f0-9]{64}$/,
    "independent binary evidence survives missing receipt",
  );
  fs.mkdirSync(receiptPath);
  assert.equal(
    (await inspectPanelBuild(123, { procRoot: root })).state,
    "unavailable",
    "nonregular receipts refused",
  );
  fs.rmdirSync(receiptPath);
  fs.writeFileSync(receiptPath, "x".repeat(65537));
  assert.equal(
    (await inspectPanelBuild(123, { procRoot: root })).state,
    "unavailable",
    "oversized receipt refused",
  );
  fs.unlinkSync(receiptPath);
  execFileSync("mkfifo", [receiptPath]);
  assert.equal(
    (await inspectPanelBuild(123, { procRoot: root })).state,
    "unavailable",
    "FIFO cannot wait for a writer",
  );
  fs.unlinkSync(receiptPath);
  fs.writeFileSync(receiptPath, JSON.stringify(receipt));
  const statPath = path.join(root, "123/stat");
  const processStat = (ticks) =>
    `123 (panel) ${["S", "1", ...Array(17).fill("0"), ticks].join(" ")}`;
  fs.writeFileSync(statPath, processStat("12345"));
  const realOpen = fsPromises.open;
  const mockedOpen = t.mock.method(fsPromises, "open", async (file, ...args) => {
    const handle = await realOpen(file, ...args);
    if (file === receiptPath) fs.writeFileSync(statPath, processStat("99999"));
    return handle;
  });
  syncBuiltinESMExports();
  try {
    assert.deepEqual(await inspectPanelBuild(123, { procRoot: root }), {
      state: "changed-during-observation",
    });
  } finally {
    mockedOpen.mock.restore();
    syncBuiltinESMExports();
  }
  fs.writeFileSync(statPath, "malformed");
  assert.deepEqual(await inspectPanelBuild(123, { procRoot: root }), { state: "unavailable" });
  assert.deepEqual(await inspectPanelBuild(0, { procRoot: root }), { state: "unavailable" });
  assert.deepEqual(await inspectPanelBuild(456, { procRoot: root }), { state: "unavailable" });
});

test("Scenario: real CLI reads isolated broker diagnostics without input or compositor effects", async (t) => {
  const fixture = createSocketFixture(t, { prefix: "ak7417-cli-" });
  const { socketDir, socketPath } = fixture;
  const f = productionFixture();
  f.claim("hover");
  const before = f.projection.diagnostics();
  const published = f.views.length;
  await fixture.startBroker({
    store: f.store,
    getRuntimeStatus: createRuntimeStatusReader({
      runtimeStatus: { state: "ready", startedAt: 1, windowVisible: true, panelExpanded: false },
      projection: f.projection,
    }),
  });
  try {
    const cli = fileURLToPath(new URL("../bin/pi-activity-strip.mjs", import.meta.url));
    const { stdout } = await promisify(execFile)(process.execPath, [cli, "status"], {
      timeout: 3000,
      env: {
        ...process.env,
        PI_ACTIVITY_STRIP_SOCKET_DIR: socketDir,
        PI_ACTIVITY_STRIP_SOCKET_PATH: socketPath,
        PI_ACTIVITY_STRIP_AUTO_START: "0",
      },
    });
    assert.match(stdout, /visibility reason: eligible-agent-context/);
    assert.match(stdout, /keyboard authorization: hover \(not proof of capture\)/);
    assert.match(stdout, /capture expiry: not observed/);
    assert.match(stdout, /private protocol: expected 2, receipt unknown/);
    assert.deepEqual(f.projection.diagnostics(), before);
    assert.equal(f.views.length, published);
    assert.deepEqual(f.focused, []);
  } finally {
    await fixture.cleanup();
  }
});

test("Scenario: arbitrary query and credential fields cannot enter diagnostic text", () => {
  const text = formatRibbonDiagnostics({
    visibilityReason: "SECRET_QUERY",
    keyboardAuthorization: "SECRET_PROMPT",
    controllerStartupSourceSha256: "SECRET_CREDENTIAL",
    expectedPrivateProtocol: "SECRET_QUERY",
    captureExpiry: "SECRET_QUERY",
    query: "SECRET_QUERY",
    panelBuild: {
      state: "SECRET_QUERY",
      privateProtocol: "SECRET_QUERY",
      binarySha256: "SECRET_QUERY",
      receiptedSourceSha256: "SECRET_QUERY",
    },
  }).join("\n");
  assert.doesNotMatch(text, /SECRET/);
  assert.match(text, /visibility reason: unknown/);
  assert.match(text, /capture expiry: not observed/);
});
