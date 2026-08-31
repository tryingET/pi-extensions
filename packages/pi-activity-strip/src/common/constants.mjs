// ---
// summary: "defines shared broker paths, timing thresholds, and transport bounds"
// read_when:
//   - "tuning activity-strip runtime defaults or locating shared configuration values"
// ---

import os from "node:os";
import path from "node:path";

export const ACTIVITY_STRIP_NAME = "pi-activity-strip";
export const ACTIVITY_STRIP_SOCKET_DIR =
  process.env.PI_ACTIVITY_STRIP_SOCKET_DIR?.trim() ||
  path.join(os.homedir(), ".pi", "agent", "state", ACTIVITY_STRIP_NAME);
export const ACTIVITY_STRIP_SOCKET_PATH =
  process.env.PI_ACTIVITY_STRIP_SOCKET_PATH?.trim() ||
  path.join(ACTIVITY_STRIP_SOCKET_DIR, "activity-strip.sock");
export const ACTIVITY_STRIP_ORDER_REFRESH_MS = 15_000;
export const ACTIVITY_STRIP_WORKSPACE_SYNC_MS = 1500;
export const ACTIVITY_STRIP_HEARTBEAT_MS = 2500;
export const ACTIVITY_STRIP_STALE_AFTER_MS = 12000;
export const ACTIVITY_STRIP_MAX_SESSIONS = 256;
export const ACTIVITY_STRIP_MAX_MESSAGE_BYTES = 256 * 1024;
export const ACTIVITY_STRIP_CLIENT_IDLE_TIMEOUT_MS = 2000;
export const ACTIVITY_STRIP_BROADCAST_TICK_MS = 1000;
export const ACTIVITY_STRIP_SEND_THROTTLE_MS = 120;
export const ACTIVITY_STRIP_CONNECT_TIMEOUT_MS = 450;
export const ACTIVITY_STRIP_START_TIMEOUT_MS = 5000;
export const ACTIVITY_STRIP_EVENT_STALL_MS = 15 * 60_000;
export const ACTIVITY_STRIP_FLUSH_RETRY_DELAYS_MS = [250, 750];
