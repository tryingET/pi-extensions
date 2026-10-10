// Read-only isolation preflight for new observer tab trials, not execution authority.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";

function busId(address) {
  const result = spawnSync(
    "busctl",
    [
      `--address=${address}`,
      "call",
      "org.freedesktop.DBus",
      "/org/freedesktop/DBus",
      "org.freedesktop.DBus",
      "GetId",
    ],
    { encoding: "utf8", timeout: 2000 },
  );
  if (result.status !== 0) return undefined;
  return result.stdout.match(/^s "([a-f0-9]{32})"\s*$/)?.[1];
}

export function observerIsolationRefusal({
  env = process.env,
  read = (path) => readFileSync(path, "utf8"),
  readLink = readlinkSync,
  list = readdirSync,
  getBusId = busId,
} = {}) {
  if (env.PI_ASC_OBSERVER_LIVE_ISOLATED !== "1") return "explicit isolation opt-in is absent";
  const statePath = env.PI_ASC_OBSERVER_LIVE_NESTED_STATE;
  if (!statePath || !isAbsolute(statePath)) return "nested compositor identity is absent";
  try {
    const text = read(statePath);
    if (Buffer.byteLength(text) > 4096) return "nested compositor identity is oversized";
    const state = JSON.parse(text);
    if (!Number.isSafeInteger(state.pid) || state.pid <= 1 || !state.outer_socket)
      return "nested compositor identity is malformed";
    if (basename(readLink(`/proc/${state.pid}/exe`)) !== "niri")
      return "recorded compositor executable is not niri";
    const cmdline = read(`/proc/${state.pid}/cmdline`).split("\0");
    const config = join(dirname(statePath), "config.kdl");
    if (!cmdline.includes("-c") || cmdline[cmdline.indexOf("-c") + 1] !== config)
      return "nested compositor process identity changed";
    const nestedEnv = Object.fromEntries(
      read(join(dirname(statePath), "nested.env"))
        .trim()
        .split("\n")
        .map((line) => {
          const split = line.indexOf("=");
          return [line.slice(0, split), line.slice(split + 1)];
        }),
    );
    if (
      !env.NIRI_SOCKET ||
      env.NIRI_SOCKET === state.outer_socket ||
      env.NIRI_SOCKET !== nestedEnv.NIRI_SOCKET ||
      !env.WAYLAND_DISPLAY ||
      env.WAYLAND_DISPLAY !== nestedEnv.WAYLAND_DISPLAY
    )
      return "client display is not the recorded nested compositor";
    if (!env.XDG_RUNTIME_DIR || !isAbsolute(env.XDG_RUNTIME_DIR) || !env.DBUS_SESSION_BUS_ADDRESS)
      return "private session bus identity is absent";
    // Bind both named listening sockets to that live compositor's open descriptors.
    const sockets = read("/proc/net/unix")
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/\s+/));
    const fds = new Set(
      list(`/proc/${state.pid}/fd`).map((fd) => {
        try {
          return readLink(`/proc/${state.pid}/fd/${fd}`);
        } catch {
          return "";
        }
      }),
    );
    const displayPath = isAbsolute(env.WAYLAND_DISPLAY)
      ? env.WAYLAND_DISPLAY
      : join(env.XDG_RUNTIME_DIR, env.WAYLAND_DISPLAY);
    for (const path of [env.NIRI_SOCKET, displayPath]) {
      const inode = sockets.find((row) => row[7] === path)?.[6];
      if (!inode || !fds.has(`socket:[${inode}]`))
        return "client sockets are not owned by recorded niri";
    }
    const privateId = getBusId(env.DBUS_SESSION_BUS_ADDRESS);
    const publicId = getBusId(`unix:path=${join(env.XDG_RUNTIME_DIR, "bus")}`);
    if (!privateId || !publicId || privateId === publicId)
      return "private bus is unproved or aliases the operator bus";
  } catch {
    return "nested compositor or private bus inspection failed";
  }
  return undefined;
}
