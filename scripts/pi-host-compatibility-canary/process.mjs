// ---
// summary: "Runs canary subprocesses with isolated npm configuration and identity-safe sandbox cleanup."
// read_when:
//   - "Changing canary subprocess stdio, npm environment isolation, or sandbox cleanup."
// ---
import { spawn } from "node:child_process";
import { lstatSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  errorMessage,
  identityOf,
  isIntegrityError,
  IntegrityError,
  removeDirectoryByHandle,
} from "./integrity.mjs";

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

  return { env, cleanup: () => removeDirectoryByHandle(sandboxDir, sandboxIdentity) };
}

function spawnCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd, env: options.env, stdio: options.stdio ?? "inherit",
    });
    let stdout = "";
    let stderr = "";
    if (Array.isArray(options.stdio)) {
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => { stdout += chunk; });
      child.stderr?.on("data", (chunk) => { stderr += chunk; });
    }
    child.on("error", (error) => resolve({
      ok: false, exitCode: 1, signal: null, stdout, stderr, error: error.message,
    }));
    child.on("close", (code, signal) => resolve({
      ok: code === 0, exitCode: code ?? 1, signal: signal ?? null, stdout, stderr,
    }));
  });
}

export async function spawnWithNeutralNpmEnv(command, args, options) {
  let npmEnv;
  let result;
  let cleanupError;
  try {
    npmEnv = createNeutralNpmEnv(options.baseEnv ?? process.env);
    result = await spawnCommand(command, args, {
      cwd: options.cwd, env: npmEnv.env, stdio: options.stdio,
    });
  } catch (error) {
    result = {
      ok: false, exitCode: 1, signal: null, stdout: "", stderr: "",
      error: errorMessage(error), integrityFailure: isIntegrityError(error),
    };
  } finally {
    try { npmEnv?.cleanup(); }
    catch (error) { cleanupError = errorMessage(error); }
  }
  if (!cleanupError) return result;
  return {
    ...result,
    ok: false,
    cleanupError,
    integrityFailure: true,
    error: [result?.error, `npm environment cleanup failed: ${cleanupError}`].filter(Boolean).join("; "),
  };
}
