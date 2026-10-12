// Content-free ASC event membrane. No ASC runtime imports; bounded private bootstrap metadata only.
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export const ASC_SUBAGENT_TABS_EVENT = "asc:subagent-tabs:request:v1";
export type TabItem = {
  key: string;
  sessionName: string;
  dispatchId: string;
  attemptId: string;
  ticketPath: string;
  viewerExtensionPath: string;
};
export type TabResult = { key: string; status: string; detail?: string };
export type TabSettlement = {
  ok: boolean;
  effectDisposition?: "settled" | "confirmed_no_effects" | "effect_indeterminate";
  detail?: string;
};
export type TabRead = {
  status: string;
  detail?: string;
  viewerPid?: number;
  viewerStartedAt?: number;
  viewerSurfaceId?: string;
};
export type TabRequest = {
  schema: "asc.subagent-tabs.request.v1";
  requestId: string;
  cwd: string;
  parentSessionKey: string;
  parentRepoRoot: string;
  items: TabItem[];
  claim(key: string): { action: "launch" | "reuse" | "blocked"; status: string; detail?: string };
  settle(key: string, result: TabSettlement): void;
  read(key: string): TabRead;
  reply(result: { requestId: string; items: TabResult[] }): void;
};

export function boundedText(value: unknown, max = 256): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  );
}
function record(value: unknown, fields: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return (
    Reflect.ownKeys(value).length === fields.length &&
    fields.every((key) => Object.hasOwn(descriptors, key) && "value" in descriptors[key])
  );
}
function absolute(value: unknown): value is string {
  return boundedText(value, 4096) && isAbsolute(value) && resolve(value) === value;
}
export function parseTabRequest(value: unknown): TabRequest | undefined {
  try {
    return parseDescriptor(value);
  } catch {
    return undefined;
  }
}
function parseDescriptor(value: unknown): TabRequest | undefined {
  if (
    !record(value, [
      "schema",
      "requestId",
      "cwd",
      "parentSessionKey",
      "parentRepoRoot",
      "items",
      "claim",
      "settle",
      "read",
      "reply",
    ])
  )
    return;
  if (
    value.schema !== "asc.subagent-tabs.request.v1" ||
    !boundedText(value.requestId) ||
    !boundedText(value.parentSessionKey) ||
    !absolute(value.cwd) ||
    !absolute(value.parentRepoRoot) ||
    ![value.claim, value.settle, value.read, value.reply].every((fn) => typeof fn === "function") ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 16
  )
    return;
  const keys = new Set<string>();
  const tickets = new Set<string>();
  const attempts = new Set<string>();
  const items: TabItem[] = [];
  for (const item of value.items) {
    if (
      !record(item, [
        "key",
        "sessionName",
        "dispatchId",
        "attemptId",
        "ticketPath",
        "viewerExtensionPath",
      ]) ||
      !boundedText(item.key) ||
      !boundedText(item.sessionName, 128) ||
      !boundedText(item.dispatchId) ||
      !boundedText(item.attemptId) ||
      !absolute(item.ticketPath) ||
      !absolute(item.viewerExtensionPath)
    )
      return;
    const attempt = JSON.stringify([item.dispatchId, item.attemptId]);
    if (keys.has(item.key) || tickets.has(item.ticketPath) || attempts.has(attempt)) return;
    keys.add(item.key);
    tickets.add(item.ticketPath);
    attempts.add(attempt);
    items.push({ ...item } as TabItem);
  }
  // Snapshot descriptor data before claim/await; never use a mutable producer argv.
  return { ...value, items } as TabRequest;
}

function repoRoot(cwd: string): string {
  let current = cwd;
  while (!existsSync(join(current, ".git"))) {
    const parent = dirname(current);
    if (parent === current) return cwd;
    current = parent;
  }
  return current;
}
export function sameTabContext(
  request: TabRequest,
  ctx: ExtensionContext | undefined,
  env: NodeJS.ProcessEnv,
): boolean {
  try {
    if (
      !ctx ||
      ctx.mode !== "tui" ||
      !ctx.hasUI ||
      process.platform !== "linux" ||
      env.TERM_PROGRAM !== "ghostty" ||
      !/^(?:[1-9][0-9]{0,19}|0x[0-9a-fA-F]{1,16})$/u.test(env.GHOSTTY_SURFACE_ID ?? "") ||
      BigInt(env.GHOSTTY_SURFACE_ID ?? "0") === 0n ||
      BigInt(env.GHOSTTY_SURFACE_ID ?? "0") > 18446744073709551615n ||
      ctx.sessionManager.getSessionId() !== request.parentSessionKey ||
      resolve(ctx.cwd) !== request.cwd ||
      repoRoot(request.cwd) !== request.parentRepoRoot
    )
      return false;
    return (
      realpathSync(ctx.cwd) === realpathSync(request.cwd) &&
      realpathSync(request.parentRepoRoot) === request.parentRepoRoot
    );
  } catch {
    return false;
  }
}

function safeFile(path: string, max: number, privateMode: boolean): number {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid?.() ||
      stat.nlink !== 1 ||
      stat.size < 1 ||
      stat.size > max ||
      (privateMode ? (stat.mode & 0o777) !== 0o600 : (stat.mode & 0o022) !== 0)
    )
      throw new Error("unsafe file");
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}
export function safeTabPaths(item: TabItem, request: TabRequest): boolean {
  try {
    // ASC remains the nonce/generation/process/attempt authority. Never log the ticket or read child JSONL.
    const dir = dirname(item.ticketPath);
    const root = dirname(dir);
    if (
      !/^[a-f0-9]{64}$/u.test(item.key) ||
      basename(dir) !== item.key ||
      basename(root) !== ".asc-attachments" ||
      !/^ticket-[a-f0-9-]{36}\.json$/u.test(basename(item.ticketPath))
    )
      return false;
    for (const path of [dir, root]) {
      const stat = lstatSync(path);
      if (
        !stat.isDirectory() ||
        stat.uid !== process.getuid?.() ||
        (stat.mode & 0o777) !== 0o700 ||
        realpathSync(path) !== path
      )
        return false;
    }
    const ticketFd = safeFile(item.ticketPath, 16384, true);
    try {
      const buffer = Buffer.alloc(16385);
      const bytes = readSync(ticketFd, buffer, 0, buffer.length, 0);
      if (bytes > 16384) return false;
      const ticket = JSON.parse(buffer.subarray(0, bytes).toString());
      if (
        ticket?.schema !== "asc.subagent-attachment.ticket.v1" ||
        ticket.key !== item.key ||
        ticket.cwd !== request.cwd ||
        ticket.parentSessionKey !== request.parentSessionKey ||
        ticket.parentRepoRoot !== request.parentRepoRoot ||
        ticket.sessionName !== item.sessionName ||
        ticket.dispatchId !== item.dispatchId ||
        ticket.attemptId !== item.attemptId ||
        ticket.ticketPath !== item.ticketPath ||
        ticket.viewerExtensionPath !== item.viewerExtensionPath ||
        !absolute(ticket.sessionsDir) ||
        join(ticket.sessionsDir, ".asc-attachments", item.key) !== dir ||
        ticket.ownerPid !== process.pid ||
        !Number.isFinite(ticket.ownerStartedAt) ||
        !boundedText(ticket.nonce, 128) ||
        !boundedText(ticket.generation, 128) ||
        basename(item.ticketPath) !== `ticket-${ticket.generation}.json` ||
        JSON.stringify(ticket.argv) !== JSON.stringify(nativeViewerArgs(item))
      )
        return false;
    } finally {
      closeSync(ticketFd);
    }
    if (
      !/^subagent-attachment-viewer\.(ts|js)$/u.test(basename(item.viewerExtensionPath)) ||
      realpathSync(item.viewerExtensionPath) !== item.viewerExtensionPath
    )
      return false;
    closeSync(safeFile(item.viewerExtensionPath, 512 * 1024, false));
    // Both source and installed package shapes must have the actual ASC owner manifest.
    let ownerRoot = dirname(item.viewerExtensionPath);
    for (let depth = 0; depth < 4; depth++, ownerRoot = dirname(ownerRoot)) {
      const manifest = join(ownerRoot, "package.json");
      if (!existsSync(manifest)) continue;
      const fd = safeFile(manifest, 65536, false);
      try {
        const buffer = Buffer.alloc(65537);
        const bytes = readSync(fd, buffer, 0, buffer.length, 0);
        if (bytes > 65536) return false;
        return (
          JSON.parse(buffer.subarray(0, bytes).toString()).name ===
            "@tryinget/pi-autonomous-session-control" &&
          [
            join(ownerRoot, "extensions", "self", basename(item.viewerExtensionPath)),
            join(ownerRoot, "dist", "extensions", "self", basename(item.viewerExtensionPath)),
          ].includes(item.viewerExtensionPath)
        );
      } finally {
        closeSync(fd);
      }
    }
  } catch {
    /* Invalid paths never become launch arguments. */
  }
  return false;
}

export function nativeViewerArgs(item: TabItem): string[] {
  return [
    "--no-session",
    "--no-extensions",
    "--no-tools",
    "--no-mcp",
    "--no-skills",
    "--no-prompt-templates",
    "--no-context-files",
    "--offline",
    "-e",
    item.viewerExtensionPath,
    "--asc-subagent-view-ticket",
    item.ticketPath,
  ];
}

export function tabDetail(value: unknown): string | undefined {
  return typeof value === "string"
    ? Array.from(value.slice(0, 512))
        .map((char) => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? " " : char))
        .join("")
    : undefined;
}
