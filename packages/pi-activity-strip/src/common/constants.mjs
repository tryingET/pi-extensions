import os from "node:os";
import path from "node:path";

export const ACTIVITY_STRIP_NAME = "pi-activity-strip";
export const ACTIVITY_STRIP_SOCKET_DIR = path.join(
  os.homedir(),
  ".pi",
  "agent",
  "state",
  ACTIVITY_STRIP_NAME,
);
export const ACTIVITY_STRIP_SOCKET_PATH = path.join(
  ACTIVITY_STRIP_SOCKET_DIR,
  "activity-strip.sock",
);
export const ACTIVITY_STRIP_WIDTH_PADDING = 16;
export const ACTIVITY_STRIP_HEIGHT = 84;
export const ACTIVITY_STRIP_HEARTBEAT_MS = 2500;
export const ACTIVITY_STRIP_STALE_AFTER_MS = 12000;
export const ACTIVITY_STRIP_BROADCAST_TICK_MS = 1000;
export const ACTIVITY_STRIP_SEND_THROTTLE_MS = 120;
export const ACTIVITY_STRIP_CONNECT_TIMEOUT_MS = 450;
export const ACTIVITY_STRIP_START_TIMEOUT_MS = 5000;
export const DEFAULT_ELECTRON_CANDIDATES = [
  "electron",
  "electron39",
  "electron38",
  "electron37",
  "electron36",
  "electron35",
  "electron34",
  "electron33",
  "electron32",
  "electron31",
];
