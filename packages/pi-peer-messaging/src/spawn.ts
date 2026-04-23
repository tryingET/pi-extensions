import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type PeerMessagingPaths, resolvePeerMessagingPaths } from "./paths.ts";

export interface PeerMessagingSpawnOptions {
  runtimeDir?: string;
  paths?: PeerMessagingPaths;
  packageRoot?: string;
  platform?: NodeJS.Platform;
  nodePath?: string;
  idleShutdownMs?: number;
  spawnTimeoutMs?: number;
}

type BrokerLaunchSpec =
  | {
      kind: "direct";
      command: string;
      args: string[];
    }
  | {
      kind: "windows-launcher";
      command: string;
      args: string[];
      launcherPath: string;
      launcherCommandLine: string;
    };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function getPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function getBrokerEntryPath(packageRoot: string = getPackageRoot()): string {
  return path.join(packageRoot, "src", "broker-entry.ts");
}

export function getTsxCliPath(packageRoot: string = getPackageRoot()): string {
  return path.join(packageRoot, "node_modules", "tsx", "dist", "cli.mjs");
}

function quoteWindowsArg(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function getWindowsHiddenLauncherPath(runtimeDir: string): string {
  return path.join(runtimeDir, "broker-launch.vbs");
}

export function getWindowsBrokerCommandLine(
  brokerEntryPath: string,
  packageRoot: string = getPackageRoot(),
  nodePath: string = process.execPath,
): string {
  return [
    quoteWindowsArg(nodePath),
    quoteWindowsArg(getTsxCliPath(packageRoot)),
    quoteWindowsArg(brokerEntryPath),
  ].join(" ");
}

export function getWindowsHiddenLauncherScript(commandLine: string): string {
  return [
    'Set WshShell = CreateObject("WScript.Shell")',
    `WshShell.Run "${commandLine.replace(/"/g, '""')}", 0, False`,
    "Set WshShell = Nothing",
    "",
  ].join("\r\n");
}

function writeWindowsHiddenLauncher(commandLine: string, launcherPath: string): string {
  fs.mkdirSync(path.dirname(launcherPath), { recursive: true });
  fs.writeFileSync(launcherPath, getWindowsHiddenLauncherScript(commandLine), "utf8");
  return launcherPath;
}

export function getBrokerLaunchSpec(options: {
  runtimeDir: string;
  packageRoot?: string;
  platform?: NodeJS.Platform;
  brokerEntryPath?: string;
  nodePath?: string;
}): BrokerLaunchSpec {
  const platform = options.platform ?? process.platform;
  const packageRoot = options.packageRoot ?? getPackageRoot();
  const brokerEntryPath = options.brokerEntryPath ?? getBrokerEntryPath(packageRoot);
  const nodePath = options.nodePath ?? process.execPath;

  if (platform === "win32") {
    const launcherPath = getWindowsHiddenLauncherPath(options.runtimeDir);
    return {
      kind: "windows-launcher",
      command: "wscript.exe",
      args: [launcherPath],
      launcherPath,
      launcherCommandLine: getWindowsBrokerCommandLine(brokerEntryPath, packageRoot, nodePath),
    };
  }

  return {
    kind: "direct",
    command: nodePath,
    args: [getTsxCliPath(packageRoot), brokerEntryPath],
  };
}

export function getBrokerSpawnOptions(options: {
  packageRoot?: string;
  runtimeDir: string;
  idleShutdownMs?: number;
}): {
  detached: true;
  stdio: "ignore";
  cwd: string;
  env: NodeJS.ProcessEnv;
  windowsHide: true;
} {
  const packageRoot = options.packageRoot ?? getPackageRoot();
  return {
    detached: true,
    stdio: "ignore",
    cwd: packageRoot,
    env: {
      ...process.env,
      NODE_NO_WARNINGS: "1",
      PI_PEER_MESSAGING_RUNTIME_DIR: options.runtimeDir,
      PI_PEER_MESSAGING_IDLE_SHUTDOWN_MS: String(options.idleShutdownMs ?? 5_000),
    },
    windowsHide: true,
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function checkSocketConnectable(paths: PeerMessagingPaths): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(paths.socketPath);
    const finish = (connected: boolean) => {
      clearTimeout(timeout);
      socket.off("connect", onConnect);
      socket.off("error", onError);
      resolve(connected);
    };
    const onConnect = () => {
      socket.end();
      finish(true);
    };
    const onError = () => {
      socket.destroy();
      finish(false);
    };
    const timeout = setTimeout(() => {
      socket.destroy();
      finish(false);
    }, 500);

    socket.on("connect", onConnect);
    socket.on("error", onError);
  });
}

async function isBrokerRunning(paths: PeerMessagingPaths): Promise<boolean> {
  if (await checkSocketConnectable(paths)) {
    return true;
  }

  if (!fs.existsSync(paths.pidPath)) {
    return false;
  }

  try {
    const pid = Number.parseInt(fs.readFileSync(paths.pidPath, "utf8").trim(), 10);
    if (!Number.isFinite(pid)) {
      return false;
    }

    process.kill(pid, 0);
    return checkSocketConnectable(paths);
  } catch {
    return false;
  }
}

function isSpawnLockStale(spawnLockPath: string): boolean {
  if (!fs.existsSync(spawnLockPath)) {
    return false;
  }

  try {
    const [pidLine = "", createdAtLine = "0"] = fs
      .readFileSync(spawnLockPath, "utf8")
      .trim()
      .split("\n");
    const pid = Number.parseInt(pidLine, 10);
    const createdAt = Number.parseInt(createdAtLine, 10);
    const ageMs = Date.now() - createdAt;

    if (Number.isFinite(pid)) {
      try {
        process.kill(pid, 0);
      } catch {
        return true;
      }
    }

    return !Number.isFinite(createdAt) || ageMs > 10_000;
  } catch {
    return true;
  }
}

function acquireSpawnLock(spawnLockPath: string): boolean {
  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      fs.writeFileSync(spawnLockPath, `${process.pid}\n${Date.now()}\n`, { flag: "wx" });
      return true;
    } catch (error) {
      const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code !== "EEXIST") {
        throw error;
      }

      if (isSpawnLockStale(spawnLockPath)) {
        try {
          fs.unlinkSync(spawnLockPath);
        } catch {
          // Another process cleaned it up already.
        }
        continue;
      }

      return false;
    }
  }

  return false;
}

function releaseSpawnLock(spawnLockPath: string): void {
  try {
    fs.unlinkSync(spawnLockPath);
  } catch {
    // Another cleanup path already removed the lock.
  }
}

async function waitForBroker(paths: PeerMessagingPaths, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkSocketConnectable(paths)) {
      return;
    }

    await sleep(100);
  }

  throw new Error("Peer-messaging broker failed to start within timeout.");
}

export async function spawnBrokerIfNeeded(options: PeerMessagingSpawnOptions = {}): Promise<void> {
  const paths =
    options.paths ??
    resolvePeerMessagingPaths({ runtimeDir: options.runtimeDir, platform: options.platform });
  fs.mkdirSync(paths.runtimeDir, { recursive: true });

  if (await isBrokerRunning(paths)) {
    return;
  }

  const ownsLock = acquireSpawnLock(paths.spawnLockPath);
  if (!ownsLock) {
    await waitForBroker(paths, options.spawnTimeoutMs ?? 5_000);
    return;
  }

  try {
    if (await isBrokerRunning(paths)) {
      return;
    }

    const launchSpec = getBrokerLaunchSpec({
      runtimeDir: paths.runtimeDir,
      packageRoot: options.packageRoot,
      platform: options.platform,
      nodePath: options.nodePath,
    });
    if (launchSpec.kind === "windows-launcher") {
      writeWindowsHiddenLauncher(launchSpec.launcherCommandLine, launchSpec.launcherPath);
    }

    const child = spawn(
      launchSpec.command,
      launchSpec.args,
      getBrokerSpawnOptions({
        packageRoot: options.packageRoot,
        runtimeDir: paths.runtimeDir,
        idleShutdownMs: options.idleShutdownMs,
      }),
    );
    child.unref();

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        child.off("error", onError);
        child.off("exit", onExit);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(
          new Error(`Failed to spawn peer-messaging broker: ${error.message}`, { cause: error }),
        );
      };
      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        if (launchSpec.kind === "windows-launcher" && code === 0 && signal === null) {
          return;
        }

        cleanup();
        reject(
          new Error(
            signal
              ? `Peer-messaging broker exited before startup with signal ${signal}.`
              : `Peer-messaging broker exited before startup with code ${code ?? "unknown"}.`,
          ),
        );
      };

      child.once("error", onError);
      child.once("exit", onExit);
      waitForBroker(paths, options.spawnTimeoutMs ?? 5_000).then(
        () => {
          cleanup();
          resolve();
        },
        (error) => {
          cleanup();
          reject(toError(error));
        },
      );
    });
  } finally {
    releaseSpawnLock(paths.spawnLockPath);
  }
}
