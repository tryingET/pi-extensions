import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const SESSION_PRESENCE_SCHEMA_VERSION = 1;
const DEFAULT_TITLE_PREFIX = "π - ";
const DEFAULT_TITLE_MODE = "session-short-id";

export type SessionPresenceTitleMode = "session-short-id" | "off";

export interface SessionPresenceOptions {
  presenceDir?: string;
  processId?: number;
  now?: () => string;
  piBin?: string;
  titleMode?: SessionPresenceTitleMode;
}

export interface SessionPresenceState {
  schemaVersion: number;
  source: string;
  pid: number;
  cwd: string;
  cwdLabel: string;
  sessionId: string;
  sessionIdShort: string;
  sessionFile?: string;
  sessionName?: string;
  tty?: string;
  piBin: string;
  resumeArgv?: string[];
  windowTitleBase: string;
  windowTitle?: string;
  publishedAt: string;
}

function resolvePresenceDir(options: SessionPresenceOptions): string {
  if (options.presenceDir) return options.presenceDir;

  const override = process.env.PI_SESSION_PRESENCE_DIR?.trim();
  if (override) return override;

  const runtimeDir = process.env.XDG_RUNTIME_DIR?.trim();
  if (runtimeDir) return path.join(runtimeDir, "pi-session-presence");

  return path.join(os.homedir(), ".local", "state", "pi-session-presence");
}

function resolveTitleMode(options: SessionPresenceOptions): SessionPresenceTitleMode {
  const raw = (
    options.titleMode ??
    process.env.PI_SESSION_PRESENCE_TITLE_MODE ??
    DEFAULT_TITLE_MODE
  )
    .toString()
    .trim()
    .toLowerCase();

  return raw === "off" ? "off" : "session-short-id";
}

function resolvePiBin(options: SessionPresenceOptions): string {
  const configured = options.piBin ?? process.env.PI_SESSION_PRESENCE_PI_BIN?.trim();
  return configured && configured.length > 0 ? configured : "pi";
}

function resolveProcessId(options: SessionPresenceOptions): number {
  return options.processId ?? process.pid;
}

function safeReadLink(candidate: string): string | undefined {
  try {
    return fs.readlinkSync(candidate);
  } catch {
    return undefined;
  }
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonAtomic(filePath: string, payload: unknown): void {
  const dirPath = path.dirname(filePath);
  ensureDir(dirPath);
  const tmpPath = path.join(dirPath, `.${path.basename(filePath)}.tmp`);
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, filePath);
}

function removeFileIfPresent(filePath: string): void {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // Best effort cleanup only.
  }
}

function pruneStalePresenceFiles(dirPath: string, currentPid: number): void {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dirPath);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const stem = entry.slice(0, -5);
    const pid = Number.parseInt(stem, 10);
    if (!Number.isInteger(pid) || pid <= 0 || pid === currentPid) continue;
    if (fs.existsSync(path.join("/proc", String(pid)))) continue;
    removeFileIfPresent(path.join(dirPath, entry));
  }
}

function deriveCwdLabel(cwd: string): string {
  const normalized = cwd.trim();
  if (!normalized) return "session";
  const leaf = path.basename(normalized);
  return leaf || normalized;
}

function buildWindowTitleBase(cwd: string): string {
  return `${DEFAULT_TITLE_PREFIX}${deriveCwdLabel(cwd)}`;
}

function buildWindowTitle(
  baseTitle: string,
  sessionIdShort: string,
  titleMode: SessionPresenceTitleMode,
): string | undefined {
  if (titleMode === "off") return undefined;
  return `${baseTitle} · ${sessionIdShort}`;
}

function buildSessionPresenceState(
  ctx: ExtensionContext,
  options: SessionPresenceOptions,
): SessionPresenceState {
  const cwd = ctx.sessionManager.getCwd();
  const sessionId = ctx.sessionManager.getSessionId();
  const sessionFile = ctx.sessionManager.getSessionFile();
  const sessionName = ctx.sessionManager.getSessionName();
  const sessionIdShort = sessionId.slice(0, 8);
  const windowTitleBase = buildWindowTitleBase(cwd);
  const titleMode = resolveTitleMode(options);
  const windowTitle = buildWindowTitle(windowTitleBase, sessionIdShort, titleMode);
  const piBin = resolvePiBin(options);

  return {
    schemaVersion: SESSION_PRESENCE_SCHEMA_VERSION,
    source: "@tryinget/pi-little-helpers/session-presence",
    pid: resolveProcessId(options),
    cwd,
    cwdLabel: deriveCwdLabel(cwd),
    sessionId,
    sessionIdShort,
    sessionFile,
    sessionName,
    tty: safeReadLink("/proc/self/fd/0"),
    piBin,
    resumeArgv: sessionFile ? [piBin, "--session", sessionFile] : undefined,
    windowTitleBase,
    windowTitle,
    publishedAt: (options.now ?? (() => new Date().toISOString()))(),
  };
}

function publishPresence(ctx: ExtensionContext, options: SessionPresenceOptions) {
  const presenceDir = resolvePresenceDir(options);
  const pid = resolveProcessId(options);
  ensureDir(presenceDir);
  pruneStalePresenceFiles(presenceDir, pid);

  const state = buildSessionPresenceState(ctx, options);
  const filePath = path.join(presenceDir, `${pid}.json`);
  writeJsonAtomic(filePath, state);

  if (ctx.hasUI && state.windowTitle) {
    ctx.ui.setTitle(state.windowTitle);
  }

  return { state, filePath };
}

function clearPresence(options: SessionPresenceOptions): void {
  const filePath = path.join(resolvePresenceDir(options), `${resolveProcessId(options)}.json`);
  removeFileIfPresent(filePath);
}

function emitInfo(ctx: ExtensionContext, message: string): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, "info");
    return;
  }
  console.log(message);
}

function formatStatusMessage(state: SessionPresenceState, filePath: string): string {
  const sessionSurface = state.sessionFile ?? "ephemeral";
  return `session-presence: ${filePath} → ${sessionSurface}`;
}

export function createSessionPresenceExtension(options: SessionPresenceOptions = {}) {
  return function sessionPresenceExtension(pi: ExtensionAPI) {
    const sync = (_event: unknown, ctx: ExtensionContext) => {
      publishPresence(ctx, options);
    };

    pi.on("session_start", sync);
    pi.on("session_shutdown", async () => {
      clearPresence(options);
    });

    pi.registerCommand("session-presence", {
      description: "Publish or inspect the current Pi session presence sidecar",
      handler: async (args, ctx) => {
        const mode = args.trim().toLowerCase();
        const { state, filePath } = publishPresence(ctx, options);

        if (mode === "path") {
          emitInfo(ctx, state.sessionFile ?? "ephemeral");
          return;
        }

        if (mode === "json") {
          emitInfo(ctx, filePath);
          return;
        }

        emitInfo(ctx, formatStatusMessage(state, filePath));
      },
    });

    pi.registerCommand("session-path", {
      description: "Show the exact current Pi session file",
      handler: async (_args, ctx) => {
        emitInfo(ctx, ctx.sessionManager.getSessionFile() ?? "ephemeral");
      },
    });
  };
}

export default createSessionPresenceExtension();
