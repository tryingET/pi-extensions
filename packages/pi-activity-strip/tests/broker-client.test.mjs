import assert from "node:assert/strict";
import test from "node:test";
import { ActivityStripBroker } from "../src/broker/server.mjs";
import { sendBrokerMessage } from "../src/client/broker-client.mjs";
import { makeMessage } from "../src/common/protocol.mjs";
import { createInitialSnapshot } from "../src/common/telemetry.mjs";

test("broker accepts upsert and answers ping", async () => {
  const socketDir = `/tmp/pi-activity-strip-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const socketPath = `${socketDir}/activity-strip.sock`;
  const broker = new ActivityStripBroker({
    socketDir,
    socketPath,
  });

  await broker.start();

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

  await broker.stop();
});
