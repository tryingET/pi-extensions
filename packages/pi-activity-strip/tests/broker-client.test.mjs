// summary: "Tests broker-client upserts and ping replies with session and runtime status data."
// read_when:
//   - "Changing activity-strip broker messaging, snapshots, or ping responses."

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ActivityStripBroker } from "../src/broker/server.mjs";
import { sendBrokerMessage } from "../src/client/broker-client.mjs";
import { makeMessage } from "../src/common/protocol.mjs";
import { createInitialSnapshot } from "../src/common/telemetry.mjs";

test("broker accepts upsert and answers ping", async () => {
  const socketDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-activity-strip-test-"));
  const socketPath = path.join(socketDir, "activity-strip.sock");
  const broker = new ActivityStripBroker({
    socketDir,
    socketPath,
    getRuntimeStatus() {
      return {
        state: "ready",
        startedAt: 1,
        readyAt: 2,
        displayServer: "wayland",
        windowManager: "niri",
        displayCount: 2,
        alignmentMode: "niri",
        warnings: ["Detected 2 displays; the strip currently renders on the primary display only."],
      };
    },
  });
  let started = false;

  try {
    await broker.start();
    started = true;

    const session = createInitialSnapshot({ cwd: "/tmp/demo", sessionName: "demo" });
    await sendBrokerMessage(makeMessage("upsert", { session }), {
      socketPath,
      timeoutMs: 500,
    });

    const result = await sendBrokerMessage(makeMessage("ping"), {
      socketPath,
      timeoutMs: 500,
      expectReply: true,
    });

    assert.equal(result.ok, true);
    assert.equal(result.snapshot.sessions.length, 1);
    assert.equal(result.snapshot.sessions[0].repoLabel, "demo");
    assert.equal(result.runtimeStatus?.state, "ready");
    assert.equal(result.runtimeStatus?.displayCount, 2);
  } finally {
    if (started) {
      await broker.stop();
    }
    fs.rmSync(socketDir, { recursive: true, force: true });
  }
});
