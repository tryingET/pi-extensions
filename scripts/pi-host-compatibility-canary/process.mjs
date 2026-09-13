// ---
// summary: "Runs canary subprocesses with isolated npm configuration and identity-safe sandbox cleanup."
// read_when:
//   - "Changing canary subprocess stdio, npm environment isolation, or sandbox cleanup."
// ---
import { spawn } from "node:child_process";
import { executeSdk, isSdkExecution } from "./sdk-execution.mjs";
import { existsSync, lstatSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  errorMessage,
  identityOf,
  isIntegrityError,
  IntegrityError,
  removeDirectoryByHandle,
} from "./integrity.mjs";
import { processIdentity } from "./state-files.mjs";
import { processGroupState, receiptCollector, wrapperCompletion } from "./completion.mjs";

const COMMAND_WRAPPER = fileURLToPath(new URL("./command-wrapper.mjs", import.meta.url));

function createNeutralNpmEnv(baseEnv = process.env) {
  const sandboxDir = mkdtempSync(path.join(tmpdir(), "pi-host-compat-npm-"));
  const userConfig = path.join(sandboxDir, "user.npmrc");
  const globalConfig = path.join(sandboxDir, "global.npmrc");
  const sandboxIdentity = identityOf(lstatSync(sandboxDir, { bigint: true }));
  try {
    writeFileSync(userConfig, "");
    writeFileSync(globalConfig, "");
  } catch (error) {
    try { removeDirectoryByHandle(sandboxDir, sandboxIdentity); }
    catch (cleanupError) {
      throw new IntegrityError(`npm environment setup failed: ${errorMessage(error)}; cleanup failed: ${errorMessage(cleanupError)}`);
    }
    throw error;
  }

  const env = {
    ...baseEnv, NPM_CONFIG_USERCONFIG: userConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig,
    npm_config_userconfig: userConfig, npm_config_globalconfig: globalConfig,
  };

  delete env.NPM_CONFIG_BEFORE;
  delete env.npm_config_before;
  delete env.NPM_CONFIG_MIN_RELEASE_AGE;
  delete env.npm_config_min_release_age;

  return { env, sandboxDir, sandboxIdentity };
}

function spawnCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const requestedStdio = options.stdio ?? "inherit";
    const stdio = Array.isArray(requestedStdio)
      ? [...requestedStdio, "ipc"]
      : ["inherit", "inherit", "inherit", "ipc"];
    const child = spawn(
      process.execPath,
      [COMMAND_WRAPPER, JSON.stringify([command, ...args])],
      {
        cwd: options.cwd,
        env: options.env,
        stdio,
        detached: process.platform !== "win32",
      },
    );
    let stdout = "";
    let stderr = "";
    const receipts = receiptCollector();
    let releaseStarted = false;
    if (Array.isArray(requestedStdio)) {
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => { stdout += chunk; });
      child.stderr?.on("data", (chunk) => { stderr += chunk; });
    }
    child.on("message", async (message) => {
      if (message?.type === "result") {
        receipts.add(message.result);
        return;
      }
      if (message?.type !== "ready" || releaseStarted) return;
      releaseStarted = true;
      try {
        const identity = {
          ...processIdentity(child.pid),
          ...(process.platform !== "win32" ? { processGroupId: child.pid } : {}),
        };
        await options.beforeRelease?.(identity);
        child.send({ type: "run" });
      } catch (error) {
        child.send({ type: "abort", error: errorMessage(error) });
      }
    });
    child.once("error", (error) => resolve({
      ok: false, exitCode: 1, signal: null, stdout, stderr, error: error.message,
      wrapperLaunchFailed: !child.pid, integrityFailure: true,
      ...(child.pid ? { effectMayBeActive: true } : {}),
    }));
    child.once("close", (code, signal) => {
      // Always observe the group, including with a normal receipt. Never kill it.
      const result = wrapperCompletion(receipts, code, signal, processGroupState(child.pid));
      resolve({ ...result, stdout, stderr });
    });
  });
}

export async function spawnWithNeutralNpmEnv(command, args, options) {
  let npmEnv;
  let sdkStarted = false;
  try {
    npmEnv = createNeutralNpmEnv(options.baseEnv ?? process.env);
    if (options.sdkExecution) {
      if (!isSdkExecution(options.sdkExecution)) throw new IntegrityError("unbound SDK execution");
      sdkStarted = true; // after this point no exceptional path may clean the sandbox
      const result = await executeSdk(options.sdkExecution, npmEnv.sandboxDir, options);
      Object.defineProperty(result, "deferredCleanup", { value: () =>
        removeDirectoryByHandle(npmEnv.sandboxDir, npmEnv.sandboxIdentity) });
      return result;
    }
    const env = {
      ...npmEnv.env,
      PI_HOST_COMPAT_RUNNER_PID: String(process.pid),
      PI_HOST_COMPAT_WRAPPER_CLEANUP: JSON.stringify({
        path: npmEnv.sandboxDir,
        identity: npmEnv.sandboxIdentity,
      }),
    };
    const result = await spawnCommand(command, args, {
      cwd: options.cwd,
      env,
      stdio: options.stdio,
      beforeRelease: options.beforeRelease,
    });
    if (result.wrapperLaunchFailed && existsSync(npmEnv.sandboxDir)) {
      removeDirectoryByHandle(npmEnv.sandboxDir, npmEnv.sandboxIdentity);
    }
    return result.cleanupError
      ? { ...result, ok: false, integrityFailure: true }
      : result;
  } catch (error) {
    if (sdkStarted) return { ok: false, exitCode: 125, signal: null, stdout: "", stderr: "",
      error: errorMessage(error), integrityFailure: true, effectMayBeActive: true };
    if (npmEnv) {
      try { removeDirectoryByHandle(npmEnv.sandboxDir, npmEnv.sandboxIdentity); }
      catch (cleanupError) {
        return {
          ok: false, exitCode: 1, signal: null, stdout: "", stderr: "",
          error: `${errorMessage(error)}; cleanup failed: ${errorMessage(cleanupError)}`,
          integrityFailure: true,
        };
      }
    }
    return {
      ok: false, exitCode: 1, signal: null, stdout: "", stderr: "",
      error: errorMessage(error), integrityFailure: isIntegrityError(error),
    };
  }
}
