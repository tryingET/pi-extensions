// ---
// summary: "Runs canary subprocesses with isolated npm configuration and identity-safe sandbox cleanup."
// read_when:
//   - "Changing canary subprocess stdio, npm environment isolation, or sandbox cleanup."
// ---
import { spawn } from "node:child_process";
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

function processGroupActive(processGroupId) {
  if (process.platform === "win32") return false;
  try { process.kill(-processGroupId, 0); return true; }
  catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

async function stopProcessGroup(processGroupId) {
  if (!processGroupActive(processGroupId)) return true;
  try { process.kill(-processGroupId, "SIGTERM"); } catch {}
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (!processGroupActive(processGroupId)) return true;
  }
  try { process.kill(-processGroupId, "SIGKILL"); } catch {}
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (!processGroupActive(processGroupId)) return true;
  }
  return false;
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
    let wrapperResult;
    let groupStopPromise = Promise.resolve(true);
    let releaseStarted = false;
    if (Array.isArray(requestedStdio)) {
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => { stdout += chunk; });
      child.stderr?.on("data", (chunk) => { stderr += chunk; });
    }
    child.on("message", async (message) => {
      if (message?.type === "result") {
        wrapperResult = message.result;
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
      wrapperLaunchFailed: true,
    }));
    child.once("exit", () => {
      if (!wrapperResult && process.platform !== "win32") {
        groupStopPromise = stopProcessGroup(child.pid);
      }
    });
    child.once("close", async (code, signal) => {
      const effectMayBeActive = !wrapperResult && !(await groupStopPromise);
      const result = wrapperResult ?? {
        ok: code === 0 && !effectMayBeActive,
        exitCode: code ?? 1,
        signal: signal ?? null,
        wrapperCleanupNeeded: true,
        integrityFailure: true,
        ...(signal ? { error: `command wrapper terminated by ${signal}` } : {}),
        ...(effectMayBeActive ? {
          effectMayBeActive: true,
          error: "command process group could not be proven stopped",
        } : {}),
      };
      resolve({ ...result, stdout, stderr });
    });
  });
}

export async function spawnWithNeutralNpmEnv(command, args, options) {
  let npmEnv;
  try {
    npmEnv = createNeutralNpmEnv(options.baseEnv ?? process.env);
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
    if ((result.wrapperLaunchFailed || result.wrapperCleanupNeeded) && existsSync(npmEnv.sandboxDir)) {
      removeDirectoryByHandle(npmEnv.sandboxDir, npmEnv.sandboxIdentity);
    }
    return result.cleanupError
      ? { ...result, integrityFailure: true }
      : result;
  } catch (error) {
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
