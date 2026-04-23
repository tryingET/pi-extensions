import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { assessActivityStripCompatibility } from "../common/compatibility.mjs";
import { ACTIVITY_STRIP_START_TIMEOUT_MS } from "../common/constants.mjs";
import { getBrokerStatus } from "./broker-client.mjs";

/** @param {import("../common/contracts.ts").BrokerResponse | null | undefined} result */
function isBrokerReady(result) {
  return Boolean(result?.ok && (!result.runtimeStatus || result.runtimeStatus.state === "ready"));
}

/** @param {import("../common/contracts.ts").BrokerResponse | null | undefined} result */
function describeBrokerWait(result) {
  if (!result?.ok) return "Activity strip broker did not answer.";
  if (!result.runtimeStatus) {
    return "Activity strip broker answered without overlay readiness metadata.";
  }

  const runtime = result.runtimeStatus;
  const warnings =
    Array.isArray(runtime.warnings) && runtime.warnings.length > 0
      ? ` Warnings: ${runtime.warnings.join(" ")}`
      : "";

  if (runtime.state === "error") {
    return runtime.error || `Activity strip overlay reported an error.${warnings}`;
  }

  if (runtime.state === "starting") {
    return `Activity strip broker answered, but the overlay is still starting.${warnings}`;
  }

  return `Activity strip broker is running (state=${runtime.state}).${warnings}`;
}

/**
 * @param {string} binPath
 * @param {{
 *   env?: NodeJS.ProcessEnv;
 *   timeoutMs?: number;
 *   getBrokerStatusImpl?: typeof getBrokerStatus;
 *   assessCompatibilityImpl?: typeof assessActivityStripCompatibility;
 *   spawnProcess?: (binPath: string, env: NodeJS.ProcessEnv) => void;
 * }} [options]
 */
export async function ensureActivityStripRunning(binPath, options = {}) {
  const mergedEnv = {
    ...process.env,
    ...options.env,
  };
  const getStatus = options.getBrokerStatusImpl || getBrokerStatus;
  const assessCompatibility = options.assessCompatibilityImpl || assessActivityStripCompatibility;

  let latestStatus = null;
  try {
    latestStatus = await getStatus({ timeoutMs: 250 });
  } catch {
    latestStatus = null;
  }

  if (isBrokerReady(latestStatus)) {
    return { ok: true, started: false };
  }

  const compatibility = await assessCompatibility({ env: mergedEnv });
  if (!compatibility.ok) {
    return {
      ok: false,
      started: false,
      error: compatibility.blockers.join(" "),
    };
  }

  let started = false;
  if (!latestStatus?.ok) {
    const spawnProcess =
      options.spawnProcess ||
      ((targetBinPath, env) => {
        const child = spawn(process.execPath, [targetBinPath, "open"], {
          detached: true,
          stdio: "ignore",
          env,
        });
        child.unref();
      });
    spawnProcess(binPath, mergedEnv);
    started = true;
  }

  const timeoutMs = options.timeoutMs ?? ACTIVITY_STRIP_START_TIMEOUT_MS;
  const timeoutAt = Date.now() + timeoutMs;
  while (Date.now() < timeoutAt) {
    try {
      latestStatus = await getStatus({ timeoutMs: 250 });
    } catch {
      latestStatus = null;
    }
    if (isBrokerReady(latestStatus)) {
      return { ok: true, started };
    }
    if (latestStatus?.runtimeStatus?.state === "error") {
      return {
        ok: false,
        started,
        error: describeBrokerWait(latestStatus),
      };
    }
    await delay(125);
  }

  return {
    ok: false,
    started,
    error: `${describeBrokerWait(latestStatus)} Timeout: ${timeoutMs}ms.`,
  };
}
