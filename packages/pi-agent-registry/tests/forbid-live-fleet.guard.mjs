// summary: Regression tripwire for accidental live fleet/profile reads; not a security sandbox.
import childProcess from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { homedir } from "node:os";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const workspace = resolve(homedir(), "ai-society");
const forbidden = [resolve(workspace, "agents"), resolve(workspace, "core/engineering-core")];
const append = fs.appendFileSync;
let violated = false;
function failExit() {
  if (violated) process.exitCode = 1;
}
process.on("beforeExit", failExit);
process.on("exit", failExit);
function check(value) {
  if (value instanceof URL) {
    if (value.protocol !== "file:") return;
    value = fileURLToPath(value);
  }
  if (Buffer.isBuffer(value)) value = value.toString();
  if (typeof value !== "string") return;
  const absolute = resolve(value);
  if (forbidden.some((root) => absolute === root || absolute.startsWith(`${root}${sep}`))) {
    violated = true;
    if (process.env.PI_AGENT_REGISTRY_TEST_VIOLATIONS) {
      append(
        process.env.PI_AGENT_REGISTRY_TEST_VIOLATIONS,
        `${JSON.stringify({ pid: process.pid, path: absolute })}\n`,
      );
    }
    throw new Error(`commit-gate live fleet/profile access forbidden: ${absolute}`);
  }
}
function callbackGuard(original) {
  return function (file, ...args) {
    try {
      check(file);
    } catch (error) {
      const callback = args.at(-1);
      if (typeof callback !== "function") throw error;
      queueMicrotask(() => callback(error));
      return;
    }
    return original.call(this, file, ...args);
  };
}
for (const name of [
  "access",
  "lstat",
  "open",
  "opendir",
  "readFile",
  "readdir",
  "readlink",
  "realpath",
  "stat",
]) {
  const original = fsp[name];
  fsp[name] = async function (file, ...args) {
    check(file);
    return original.call(this, file, ...args);
  };
  const callbackOriginal = fs[name];
  fs[name] = callbackGuard(callbackOriginal);
  if (callbackOriginal.native) fs[name].native = callbackGuard(callbackOriginal.native);
  const syncName = `${name}Sync`;
  const syncOriginal = fs[syncName];
  fs[syncName] = function (file, ...args) {
    check(file);
    return syncOriginal.call(this, file, ...args);
  };
  if (syncOriginal.native) {
    fs[syncName].native = function (file, ...args) {
      check(file);
      return syncOriginal.native.call(this, file, ...args);
    };
  }
}
for (const name of ["existsSync", "createReadStream"]) {
  const original = fs[name];
  fs[name] = function (file, ...args) {
    check(file);
    return original.call(this, file, ...args);
  };
}
const exists = fs.exists;
fs.exists = (file, callback) => {
  try {
    check(file);
  } catch {
    queueMicrotask(() => callback(false));
    return;
  }
  return exists(file, callback);
};
fs.exists[promisify.custom] = async (file) => {
  try {
    check(file);
  } catch {
    return false;
  }
  return exists[promisify.custom](file);
};
function checkCommand(args, options) {
  if (Array.isArray(args)) for (const arg of args) check(arg);
  if (options?.cwd) check(options.cwd);
}
for (const name of ["execFile", "execFileSync", "spawn", "spawnSync"]) {
  const original = childProcess[name];
  childProcess[name] = function (command, args, options, ...rest) {
    checkCommand(args, options);
    return original.call(this, command, args, options, ...rest);
  };
  if (original[promisify.custom]) {
    childProcess[name][promisify.custom] = function (command, args, options, ...rest) {
      try {
        checkCommand(args, options);
      } catch (error) {
        return Promise.reject(error);
      }
      return original[promisify.custom].call(this, command, args, options, ...rest);
    };
  }
}
syncBuiltinESMExports();
