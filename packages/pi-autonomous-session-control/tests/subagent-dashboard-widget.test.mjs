import "./subagent-cockpit-ui-loader.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { writeStatus } from "./subagent-dashboard-data-harness.mjs";

const { createWidgetSnapshot, buildDashboardLinesFromSnapshot } = await import(
  "../extensions/self/subagent-dashboard.ts"
);
const theme = { fg: (_name, value) => value };
const scope = { parentSessionKey: "parent", parentRepoRoot: "/repo" };
function telemetry(extras = {}) {
  return {
    sessionName: "worker",
    status: "running",
    steeringSupported: true,
    dispatchId: "PRIVATE_DISPATCH",
    attemptId: "PRIVATE_ATTEMPT",
    objective: "PRIVATE_OBJECTIVE",
    events: [{ id: "PRIVATE_EVENT", text: "PRIVATE_TEXT", detail: "PRIVATE_RESULT" }],
    receipts: [{ message: "PRIVATE_GUIDANCE" }],
    unavailableReason: "PRIVATE_HINT",
    ...extras,
  };
}
async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), "dashboard-widget-projection-"));
  globalThis.__ascUiReadCalls = [];
  globalThis.__ascUiReadSnapshots = new Map();
  try {
    await run(dir, Date.now());
  } finally {
    delete globalThis.__ascUiReadCalls;
    delete globalThis.__ascUiReadSnapshots;
    await rm(dir, { recursive: true, force: true });
  }
}

test("running slim rows expose only elapsed/tool/observed activity and render performs no reads", async () => {
  await fixture(async (dir, now) => {
    await writeStatus(
      dir,
      "worker",
      "running",
      new Date(now - 4 * 3600000).toISOString(),
      "PRIVATE_SIDE_OBJECTIVE",
      scope,
    );
    globalThis.__ascUiReadSnapshots.set(
      "worker",
      telemetry({ elapsedMs: 65000, latestTool: "read\x1b[31m\n", lastActivityAt: now - 59000 }),
    );
    const snapshot = createWidgetSnapshot(dir, "parent", "/repo", now);
    assert.equal(globalThis.__ascUiReadCalls.length, 1);
    assert.deepEqual(globalThis.__ascUiReadCalls[0].options, {
      currentSessionKey: "parent",
      currentRepoRoot: "/repo",
    });
    const lines = buildDashboardLinesFromSnapshot(180, theme, snapshot, "parent");
    assert.equal(lines.length, 2);
    assert.match(lines[1], /worker.*elapsed 1m 5s.*read.*activity 59s ago/);
    assert.doesNotMatch(lines.join("\n"), /PRIVATE_|quiet|Monitor|resume|Retry/);
    for (const width of [1, 2, 8, 40, 80, 180]) {
      for (const line of buildDashboardLinesFromSnapshot(width, theme, snapshot, "parent"))
        assert.ok(visibleWidth(line) <= width);
    }
    assert.equal(globalThis.__ascUiReadCalls.length, 1);
    globalThis.__ascUiReadSnapshots.set("worker", telemetry({ lastActivityAt: now - 60000 }));
    const quiet = createWidgetSnapshot(dir, "parent", "/repo", now);
    assert.match(buildDashboardLinesFromSnapshot(180, theme, quiet, "parent")[1], /quiet 1m ago/);
    assert.equal(quiet.counts.running, 1); // Quiet is observation age, never a lifecycle inference.
  });
});

test("legacy, missing, invalid and future activity do not invent quiet/activity or elapsed", async () => {
  await fixture(async (dir, now) => {
    await writeStatus(
      dir,
      "worker",
      "running",
      new Date(now - 4 * 3600000).toISOString(),
      "PRIVATE_OBJECTIVE",
      scope,
    );
    for (const value of [undefined, 0, Number.NaN, Number.POSITIVE_INFINITY, now + 1]) {
      globalThis.__ascUiReadSnapshots.set(
        "worker",
        telemetry({ lastActivityAt: value, elapsedMs: Number.NaN }),
      );
      const snapshot = createWidgetSnapshot(dir, "parent", "/repo", now);
      const lines = buildDashboardLinesFromSnapshot(180, theme, snapshot, "parent");
      assert.equal(lines.length, 2);
      assert.match(lines[1], /updated 4h ago.*activity unavailable/);
      assert.doesNotMatch(lines[1], /quiet|elapsed|activity \d/);
      assert.equal(snapshot.counts.running, 1);
    }
    globalThis.__ascUiReadSnapshots.clear(); // Reader unavailable / legacy fallback.
    const snapshot = createWidgetSnapshot(dir, "parent", "/repo", now);
    assert.match(
      buildDashboardLinesFromSnapshot(180, theme, snapshot, "parent")[1],
      /activity unavailable/,
    );
  });
});

test("refresh reads only four visible running children, overflow is one line and terminal history is never parsed", async () => {
  await fixture(async (dir, now) => {
    for (let i = 0; i < 7; i++) {
      await writeStatus(
        dir,
        `worker-${i}`,
        "running",
        new Date(now - i * 1000).toISOString(),
        "PRIVATE_OBJECTIVE",
        scope,
      );
      globalThis.__ascUiReadSnapshots.set(
        `worker-${i}`,
        telemetry({ latestTool: "bash", elapsedMs: 1000 }),
      );
    }
    for (let i = 0; i < 12; i++)
      await writeStatus(
        dir,
        `terminal-${i}`,
        "done",
        new Date(now).toISOString(),
        "PRIVATE_OBJECTIVE",
        scope,
      );
    await writeStatus(dir, "foreign", "running", new Date(now).toISOString(), "PRIVATE_OBJECTIVE", {
      ...scope,
      parentSessionKey: "other",
    });
    const snapshot = createWidgetSnapshot(dir, "parent", "/repo", now);
    assert.equal(snapshot.rows.length, 4);
    assert.equal(globalThis.__ascUiReadCalls.length, 4);
    assert.deepEqual(
      globalThis.__ascUiReadCalls.map((call) => call.sessionName),
      ["worker-0", "worker-1", "worker-2", "worker-3"],
    );
    const lines = buildDashboardLinesFromSnapshot(180, theme, snapshot, "parent");
    assert.equal(lines.length, 6); // Header + four rows + one overflow line.
    assert.match(lines[0], /running=7.*done=12/);
    assert.equal(lines[5], "+3 more running · /subagents");
    assert.doesNotMatch(lines.join("\n"), /terminal-|foreign|PRIVATE_/);
    for (let i = 0; i < 7; i++)
      await writeStatus(
        dir,
        `worker-${i}`,
        "done",
        new Date(now).toISOString(),
        "PRIVATE_OBJECTIVE",
        scope,
      );
    globalThis.__ascUiReadCalls.length = 0;
    const terminal = createWidgetSnapshot(dir, "parent", "/repo", now);
    assert.equal(globalThis.__ascUiReadCalls.length, 0);
    const terminalLines = buildDashboardLinesFromSnapshot(180, theme, terminal, "parent");
    assert.equal(terminalLines.length, 1);
    assert.match(
      terminalLines[0],
      /\/subagents.*done=19.*error=0.*timeout=0.*aborted=0.*abandoned=0/,
    );
    assert.doesNotMatch(terminalLines[0], /worker-|terminal-|PRIVATE_|more running/);
  });
});
