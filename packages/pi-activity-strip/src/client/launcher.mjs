import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { ACTIVITY_STRIP_START_TIMEOUT_MS } from "../common/constants.mjs";
import { isBrokerAlive } from "./broker-client.mjs";

export async function ensureActivityStripRunning(binPath, options = {}) {
  if (await isBrokerAlive()) {
    return { ok: true, started: false };
  }

  const child = spawn(process.execPath, [binPath, "open"], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ...options.env,
    },
  });
  child.unref();

  const timeoutAt = Date.now() + (options.timeoutMs ?? ACTIVITY_STRIP_START_TIMEOUT_MS);
  while (Date.now() < timeoutAt) {
    if (await isBrokerAlive({ timeoutMs: 250 })) {
      return { ok: true, started: true };
    }
    await delay(125);
  }

  return {
    ok: false,
    started: true,
    error: `Activity strip did not answer within ${options.timeoutMs ?? ACTIVITY_STRIP_START_TIMEOUT_MS}ms`,
  };
}
