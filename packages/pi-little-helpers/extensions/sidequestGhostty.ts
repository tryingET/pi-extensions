// summary: "pure Ghostty resolution and launch-command construction: bin selection, surface-id parsing, D-Bus target resolution, and arg builders"
// read_when:
//   - "changing ghostty binary discovery, version/surface-id gating, dbus endpoint selection, or ghostty/pi launch argv construction"

import { existsSync, readFileSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { GhosttyWindowLaunchHandshake } from "./sidequestDetachedWindow.ts";

export const GHOSTTY_PROBE_TIMEOUT_MS = 4000;

const GHOSTTY_BIN_NAME = "ghostty";
export const LOCAL_GHOSTTY_WRAPPER = join(homedir(), ".local", "bin", "ghostty-sidequest");
const LOCAL_GHOSTTY_OPT_DIR = join(homedir(), ".local", "opt");
const LOCAL_GHOSTTY_BIN = join(LOCAL_GHOSTTY_OPT_DIR, "ghostty-sidequest", "bin", "ghostty");
const LOCAL_GHOSTTY_ORIGIN_MAIN_DIR = join(LOCAL_GHOSTTY_OPT_DIR, "ghostty-origin-main");
const NORMAL_GHOSTTY_DBUS_ENDPOINT = {
  wellKnownName: "com.mitchellh.ghostty",
  objectPath: "/com/mitchellh/ghostty",
} as const;
// Transitional compatibility only while legacy controller surfaces remain alive.
const LEGACY_SIDEQUEST_DBUS_ENDPOINT = {
  wellKnownName: "com.tryinget.ghosttysidequest",
  objectPath: "/com/tryinget/ghosttysidequest",
} as const;

export type LaunchMode = "tab" | "window";

export type ExecOptions = {
  cwd?: string;
  timeout?: number;
};

export type ExecResult = {
  code: number;
  stdout?: string;
  stderr?: string;
  killed?: boolean;
};

export type ExecRunner = (
  command: string,
  args: string[],
  options?: ExecOptions,
) => Promise<ExecResult>;

export type LaunchEffectDisposition = "settled" | "confirmed_no_effects" | "effect_indeterminate";

export type LaunchResult = {
  ok: boolean;
  effectDisposition: LaunchEffectDisposition;
  code: number;
  stdout: string;
  stderr: string;
  killed: boolean;
};

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function buildPiShellCommand(
  titleBase: string | undefined,
  cwd: string,
  launchHandshake?: GhosttyWindowLaunchHandshake,
): string {
  const titleSetup = titleBase
    ? [
        `export PI_SESSION_PRESENCE_TITLE_BASE=${shellSingleQuote(titleBase)}`,
        'printf "\\033]0;%s\\007" "$PI_SESSION_PRESENCE_TITLE_BASE"',
      ]
    : [];

  return [
    `cd ${shellSingleQuote(cwd)}`,
    "status=$?",
    'if [ "$status" -ne 0 ]; then echo; echo "[sidequest] failed to enter working directory"; echo "[sidequest] leaving an interactive shell open for debugging"; exec "$' +
      '{SHELL:-/bin/bash}" -i; fi',
    ...titleSetup,
    'cmd="$1"',
    "shift",
    ...(launchHandshake
      ? [
          'if ! command -v "$cmd" >/dev/null 2>&1; then echo "[sidequest] Pi command is unavailable: $cmd"; exit 127; fi',
          `launch_handshake_tmp=${shellSingleQuote(launchHandshake.path)}.tmp.$$`,
          `if ! (umask 077; printf '%s\\n' ${shellSingleQuote(launchHandshake.token)} > "$launch_handshake_tmp" && mv -f -- "$launch_handshake_tmp" ${shellSingleQuote(launchHandshake.path)}); then rm -f -- "$launch_handshake_tmp"; echo "[sidequest] launch handshake failed"; exit 125; fi`,
        ]
      : []),
    '"$cmd" "$@"',
    "status=$?",
    'if [ "$status" -ne 0 ]; then echo; echo "[sidequest] pi exited with status $status"; echo "[sidequest] leaving an interactive shell open for debugging"; exec "$' +
      '{SHELL:-/bin/bash}" -i; fi',
  ].join("; ");
}

export function isGhosttySession(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TERM_PROGRAM?.trim().toLowerCase() === "ghostty";
}

function getCurrentGhosttyBin(
  env: NodeJS.ProcessEnv = process.env,
  pathExists: (path: string) => boolean = existsSync,
): string | undefined {
  if (!isGhosttySession(env)) return undefined;
  const binDir = env.GHOSTTY_BIN_DIR?.trim();
  if (!binDir) return undefined;
  const candidate = join(binDir, GHOSTTY_BIN_NAME);
  return pathExists(candidate) ? candidate : undefined;
}

export function getGhosttySurfaceId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.GHOSTTY_SURFACE_ID?.trim();
  if (!value) return undefined;
  return /^\d+$/.test(value) || /^0x[0-9a-f]+$/i.test(value) ? value : undefined;
}

function readProcParentPid(pid: number): number | undefined {
  try {
    const value = readFileSync(join("/proc", String(pid), "stat"), "utf8");
    const lastParenIndex = value.lastIndexOf(")");
    if (lastParenIndex === -1) return undefined;
    const tail = value
      .slice(lastParenIndex + 2)
      .trim()
      .split(/\s+/);
    const ppid = Number.parseInt(tail[1] || "", 10);
    return Number.isInteger(ppid) && ppid > 0 ? ppid : undefined;
  } catch {
    return undefined;
  }
}

function readProcCommand(pid: number): string | undefined {
  try {
    return readFileSync(join("/proc", String(pid), "comm"), "utf8").trim();
  } catch {
    return undefined;
  }
}

function readProcExecutable(pid: number): string | undefined {
  try {
    return readlinkSync(join("/proc", String(pid), "exe"));
  } catch {
    return undefined;
  }
}

export type GhosttyAncestor = {
  pid: number;
  exe?: string;
};

export function findGhosttyAncestor(processId = process.pid): GhosttyAncestor | undefined {
  let pid = processId;
  for (let depth = 0; depth < 12; depth += 1) {
    pid = readProcParentPid(pid) ?? 0;
    if (pid <= 0) return undefined;
    const command = readProcCommand(pid)?.toLowerCase();
    if (command === "ghostty") {
      return { pid, exe: readProcExecutable(pid) };
    }
  }
  return undefined;
}

export function findGhosttyAncestorBin(processId = process.pid): string | undefined {
  return findGhosttyAncestor(processId)?.exe;
}

export function resolveGhosttyBin({
  env = process.env,
  pathExists = existsSync,
  currentSessionGhosttyBin,
}: {
  env?: NodeJS.ProcessEnv;
  pathExists?: (path: string) => boolean;
  currentSessionGhosttyBin?: string;
} = {}): string {
  const override = env.PI_SIDEQUEST_GHOSTTY_BIN?.trim();
  if (override) {
    return override;
  }

  const wrapperExists = pathExists(LOCAL_GHOSTTY_WRAPPER);
  const normalizedCurrentSessionGhosttyBin = currentSessionGhosttyBin?.trim();
  if (normalizedCurrentSessionGhosttyBin && pathExists(normalizedCurrentSessionGhosttyBin)) {
    if (isLocalGhosttySidequestBin(normalizedCurrentSessionGhosttyBin) && wrapperExists) {
      return LOCAL_GHOSTTY_WRAPPER;
    }
    return normalizedCurrentSessionGhosttyBin;
  }

  if (wrapperExists) {
    return LOCAL_GHOSTTY_WRAPPER;
  }

  const currentGhosttyBin = getCurrentGhosttyBin(env, pathExists);
  if (currentGhosttyBin) {
    return currentGhosttyBin;
  }

  if (pathExists(LOCAL_GHOSTTY_BIN)) {
    return LOCAL_GHOSTTY_BIN;
  }
  return GHOSTTY_BIN_NAME;
}

function isLocalGhosttySidequestBin(path: string): boolean {
  const normalizedPath = resolve(path);
  if (normalizedPath === LOCAL_GHOSTTY_BIN) return true;

  const relativePath = relative(LOCAL_GHOSTTY_OPT_DIR, normalizedPath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return false;
  const [installDir, binDir, binName, ...rest] = relativePath.split(sep);
  return Boolean(
    rest.length === 0 &&
      installDir?.startsWith("ghostty-sidequest") &&
      binDir === "bin" &&
      binName === GHOSTTY_BIN_NAME,
  );
}

type GhosttyDbusEndpoint = {
  wellKnownName: string;
  objectPath: string;
};

function isLocalGhosttyOriginMainBin(path: string): boolean {
  const relativePath = relative(LOCAL_GHOSTTY_ORIGIN_MAIN_DIR, resolve(path));
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return false;
  const [release, binDir, binName, ...rest] = relativePath.split(sep);
  return Boolean(release && rest.length === 0 && binDir === "bin" && binName === GHOSTTY_BIN_NAME);
}

function resolveGhosttyDbusEndpoint(executable: string): GhosttyDbusEndpoint | undefined {
  if (isLocalGhosttySidequestBin(executable)) return LEGACY_SIDEQUEST_DBUS_ENDPOINT;
  if (resolve(executable) === "/usr/bin/ghostty" || isLocalGhosttyOriginMainBin(executable)) {
    return NORMAL_GHOSTTY_DBUS_ENDPOINT;
  }
  return undefined;
}

export async function supportsGhosttyNewTab(
  execRunner: ExecRunner,
  ghosttyBin: string,
): Promise<boolean> {
  try {
    const result = await execRunner(ghosttyBin, ["+help"], {
      timeout: GHOSTTY_PROBE_TIMEOUT_MS,
    });
    return !result.killed && result.code === 0 && String(result.stdout || "").includes("+new-tab");
  } catch {
    return false;
  }
}

export function ghosttyVersionSupportsSurfaceId(output: string): boolean {
  const match =
    output.match(/Ghostty\s+(\d+)\.(\d+)\.(\d+)/) ??
    output.match(/version:\s*(\d+)\.(\d+)\.(\d+)/i);
  if (!match) return false;
  const major = Number.parseInt(match[1] || "", 10);
  const minor = Number.parseInt(match[2] || "", 10);
  if (!Number.isInteger(major) || !Number.isInteger(minor)) return false;
  return major > 1 || (major === 1 && minor >= 4);
}

export function ghosttySurfaceIdProbeIndicatesSupport(output: string): boolean {
  // A build that recognizes the +new-tab --surface-id flag fails argument
  // parsing on a deliberately invalid value BEFORE creating any tab
  // ("Error parsing args: error.InvalidCharacter"). A build without the
  // +new-tab action reports an unknown-action error instead, and a build
  // that would silently ignore the flag produces no parse error at all,
  // so only the explicit parse-failure signature counts as support.
  return /Error parsing args:\s*error\./i.test(output);
}

export const SURFACE_ID_CAPABILITY_PROBE_VALUE = "zz-invalid-surface-id-capability-probe";

export async function supportsGhosttySurfaceId(
  execRunner: ExecRunner,
  ghosttyBin: string,
): Promise<boolean> {
  // Probe the actual flag capability instead of trusting only the version
  // string: origin/main snapshots carry the surface-id flag while still
  // reporting pre-1.4 dev versions (e.g. 1.3.2-main-+<sha>), so a pure
  // version gate would silently downgrade targeting to untargeted tabs
  // after every rebuild. The invalid probe value fails argument parsing
  // before any tab is created on builds that recognize the flag; a killed,
  // empty, or errored probe is inconclusive and falls through to the
  // legacy version-string gate instead of failing closed.
  try {
    const probe = await execRunner(
      ghosttyBin,
      ["+new-tab", `--surface-id=${SURFACE_ID_CAPABILITY_PROBE_VALUE}`],
      { timeout: GHOSTTY_PROBE_TIMEOUT_MS },
    );
    const probeOutput = `${probe?.stdout || ""}\n${probe?.stderr || ""}`;
    if (
      probe &&
      !probe.killed &&
      probe.code !== 0 &&
      ghosttySurfaceIdProbeIndicatesSupport(probeOutput)
    ) {
      return true;
    }
  } catch {
    // Inconclusive probe (exec failure, stub mismatch, or timeout): fall
    // through to the version-string gate below.
  }
  try {
    const result = await execRunner(ghosttyBin, ["+version"], {
      timeout: GHOSTTY_PROBE_TIMEOUT_MS,
    });
    return (
      !result.killed &&
      result.code === 0 &&
      ghosttyVersionSupportsSurfaceId(String(result.stdout || ""))
    );
  } catch {
    return false;
  }
}

export function buildGhosttyExecArgs({
  cwd,
  title,
  piArgs,
  launchHandshake,
}: {
  cwd: string;
  title: string;
  piArgs: string[];
  launchHandshake?: GhosttyWindowLaunchHandshake;
}): string[] {
  return [
    `--working-directory=${cwd}`,
    "-e",
    "/bin/sh",
    "-lc",
    buildPiShellCommand(title, cwd, launchHandshake),
    "sidequest-pi",
    ...piArgs,
  ];
}

export function buildGhosttyArgs({
  cwd,
  title,
  launchMode,
  surfaceId,
  piArgs,
  launchHandshake,
}: {
  cwd: string;
  title: string;
  launchMode: LaunchMode;
  surfaceId?: string;
  piArgs: string[];
  launchHandshake?: GhosttyWindowLaunchHandshake;
}): string[] {
  const args = launchMode === "tab" ? ["+new-tab"] : [];
  if (launchMode === "tab" && surfaceId) {
    args.push(`--surface-id=${surfaceId}`);
  }
  args.push(...buildGhosttyExecArgs({ cwd, title, piArgs, launchHandshake }));
  return args;
}

export { launchRestrictedTaskSessionWindow } from "../src/taskSessionTransport.ts";

function normalizeGhosttySurfaceIdUint64(surfaceId: string): string | undefined {
  try {
    const value = BigInt(surfaceId);
    return value >= 0n && value <= 18_446_744_073_709_551_615n ? value.toString(10) : undefined;
  } catch {
    return undefined;
  }
}

type ControllerGhosttyDbusTarget = {
  busName: string;
  ownerPid: number;
  surfaceId: string;
  wellKnownName: string;
  objectPath: string;
};

export async function resolveControllerGhosttyDbusTarget({
  execRunner, controllerGhostty, surfaceId, readProcessExecutable = readProcExecutable,
}: {
  execRunner: ExecRunner;
  controllerGhostty: GhosttyAncestor | undefined;
  surfaceId: string | undefined;
  readProcessExecutable?: (pid: number) => string | undefined;
}): Promise<ControllerGhosttyDbusTarget | undefined> {
  // Absence of a bus name is evidence only after controller identity is independently readable.
  const pid = controllerGhostty?.pid;
  const exe = controllerGhostty?.exe;
  if (!Number.isSafeInteger(pid) || !pid || pid < 1 || !exe || !isAbsolute(exe)) return undefined;
  if (!surfaceId || !/^(?:[0-9]+|0x[0-9a-f]+)$/i.test(surfaceId)) return undefined;
  const endpoint = resolveGhosttyDbusEndpoint(exe);
  const normalizedSurfaceId = normalizeGhosttySurfaceIdUint64(surfaceId);
  // Receiver zero means no target; even a nonzero ID can be stale (Describe cannot prove existence).
  if (!endpoint || normalizedSurfaceId === undefined || normalizedSurfaceId === "0") return undefined;
  const matches = (owner: number) => {
    const actual = readProcessExecutable(owner);
    return Boolean(actual && isAbsolute(actual) && resolve(actual) === resolve(exe));
  };
  try {
    if (!matches(pid)) return undefined;
    const result = await execRunner("busctl", ["--user", "list", "--no-pager", "--no-legend"], {
      timeout: GHOSTTY_PROBE_TIMEOUT_MS,
    });
    if (result.killed || result.code !== 0 || typeof result.stdout !== "string") return undefined;
    if (!result.stdout.trim() || result.stdout.length > 1_048_576) return undefined;
    const unique = /^:[0-9]+\.[0-9]+$/;
    const named = /^[A-Za-z_-][A-Za-z0-9_-]*(?:\.[A-Za-z_-][A-Za-z0-9_-]*)+$/;
    const rows = new Map<string, { pid: number | null; connection: string }>();
    for (const line of result.stdout.trim().split("\n")) {
      const fields = line.trim().split(/\s+/);
      const [name, rawPid, , , connection] = fields;
      if (fields.length < 5 || !name || !connection || rows.has(name)) return undefined;
      if (!unique.test(name) && !named.test(name)) return undefined;
      // Activatable, currently unowned names are not process-identity evidence.
      if (rawPid === "-" && connection === "-" && named.test(name)) {
        rows.set(name, { pid: null, connection });
        continue;
      }
      if (!rawPid || !/^[1-9][0-9]*$/.test(rawPid)) return undefined;
      const owner = Number(rawPid);
      if (!Number.isSafeInteger(owner)) return undefined;
      // The bus driver itself can lack a connection name; it is never a Ghostty target.
      if (connection === "-" && name === "org.freedesktop.DBus") {
        rows.set(name, { pid: owner, connection });
        continue;
      }
      if (!unique.test(connection) || (unique.test(name) && connection !== name)) return undefined;
      rows.set(name, { pid: owner, connection });
    }
    for (const row of rows.values()) {
      if (row.pid !== null && row.connection !== "-" && rows.get(row.connection)?.pid !== row.pid)
        return undefined;
    }
    const namesFor = (owner: number) => [...rows].filter(([name, row]) => unique.test(name) && row.pid === owner);
    const originating = namesFor(pid);
    if (originating.length > 1) return undefined;
    let ownerPid = pid;
    if (originating.length === 0) {
      const daemon = rows.get(endpoint.wellKnownName);
      if (!daemon?.pid || daemon.pid === pid) return undefined;
      ownerPid = daemon.pid;
    }
    const names = namesFor(ownerPid);
    if (names.length !== 1 || !matches(ownerPid) || !matches(pid) || !matches(ownerPid)) return undefined;
    return {
      busName: names[0]![0], ownerPid, surfaceId: normalizedSurfaceId,
      wellKnownName: endpoint.wellKnownName, objectPath: endpoint.objectPath,
    };
  } catch {
    // Failed/throwing readback is refusal, never proof of a nameless launcher stub.
    return undefined;
  }
}

export function buildControllerGhosttyDbusArgs({
  target,
  execArgs,
}: {
  target: ControllerGhosttyDbusTarget;
  execArgs: string[];
}): string[] {
  return [
    "--user",
    "call",
    "--expect-reply=no",
    target.busName,
    target.objectPath,
    "org.gtk.Actions",
    "Activate",
    "sava{sv}",
    "new-tab",
    "1",
    "(tas)",
    target.surfaceId,
    String(execArgs.length),
    "--",
    ...execArgs,
    "0",
  ];
}
