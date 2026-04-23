import { homedir } from "node:os";
import path from "node:path";

export interface PeerMessagingPaths {
  runtimeDir: string;
  socketPath: string;
  pidPath: string;
  spawnLockPath: string;
}

export function sanitizePipeSegment(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "default"
  );
}

export function getDefaultPeerMessagingRuntimeDir(homeDir: string = homedir()): string {
  return path.join(homeDir, ".pi", "agent", "peer-messaging");
}

export function resolvePeerMessagingPaths(
  options: { runtimeDir?: string; platform?: NodeJS.Platform; homeDir?: string } = {},
): PeerMessagingPaths {
  const runtimeDir = options.runtimeDir ?? getDefaultPeerMessagingRuntimeDir(options.homeDir);
  const platform = options.platform ?? process.platform;

  return {
    runtimeDir,
    socketPath:
      platform === "win32"
        ? `\\\\.\\pipe\\pi-peer-messaging-${sanitizePipeSegment(runtimeDir)}`
        : path.join(runtimeDir, "broker.sock"),
    pidPath: path.join(runtimeDir, "broker.pid"),
    spawnLockPath: path.join(runtimeDir, "broker.spawn.lock"),
  };
}
