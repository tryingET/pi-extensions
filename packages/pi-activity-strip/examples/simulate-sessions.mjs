import { setTimeout as delay } from "node:timers/promises";
import { publishSessionSnapshot, removeSession } from "../src/client/broker-client.mjs";
import { createInitialSnapshot } from "../src/common/telemetry.mjs";

function makeSession(label, cwd, state, phase, detail, offset = 0) {
  const snapshot = createInitialSnapshot({ cwd, sessionName: label });
  snapshot.state = state;
  snapshot.phase = phase;
  snapshot.detail = detail;
  snapshot.agentActive = state === "tool" || state === "thinking" || state === "waiting";
  snapshot.agentStartedAt = snapshot.startedAt - offset;
  snapshot.updatedAt = Date.now();
  return snapshot;
}

const sessions = [
  makeSession(
    "api refactor",
    "~/ai-society/softwareco/owned/pi-server",
    "tool",
    "Editing file",
    "src/routes/session.ts",
    18000,
  ),
  makeSession(
    "vault replay",
    "~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client",
    "thinking",
    "Thinking",
    "Replaying execution receipt and comparing current render path",
    9000,
  ),
  makeSession(
    "frontend polish",
    "~/ai-society/softwareco/owned/pi-web",
    "waiting",
    "Waiting for input",
    "interactive form is open",
    22000,
  ),
];

for (const session of sessions) {
  await publishSessionSnapshot(session);
}

await delay(1500);
sessions[0].detail = "tests/session-contract.test.mjs";
sessions[0].updatedAt = Date.now();
await publishSessionSnapshot(sessions[0]);

await delay(1500);
sessions[1].state = "success";
sessions[1].phase = "Done";
sessions[1].detail = "Replay matches stored receipt";
sessions[1].agentActive = false;
sessions[1].agentStartedAt = null;
sessions[1].updatedAt = Date.now();
await publishSessionSnapshot(sessions[1]);

await delay(2000);
for (const session of sessions) {
  await removeSession(session.sessionId);
}
