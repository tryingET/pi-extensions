// summary: "pure Ghostty resolution and launch-command construction: bin selection, surface-id parsing, D-Bus target resolution, and arg builders"
// read_when:
//   - "changing ghostty binary discovery, version/surface-id gating, dbus endpoint selection, or ghostty/pi launch argv construction"

import { existsSync, readFileSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

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

export type LaunchResult = {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
  killed: boolean;
};

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function buildPiShellCommand(titleBase: string | undefined, cwd: string): string {
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
    return result.code === 0 && String(result.stdout || "").includes("+new-tab");
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

export async function supportsGhosttySurfaceId(
  execRunner: ExecRunner,
  ghosttyBin: string,
): Promise<boolean> {
  try {
    const result = await execRunner(ghosttyBin, ["+version"], {
      timeout: GHOSTTY_PROBE_TIMEOUT_MS,
    });
    return result.code === 0 && ghosttyVersionSupportsSurfaceId(String(result.stdout || ""));
  } catch {
    return false;
  }
}

export function buildGhosttyExecArgs({
  cwd,
  title,
  piArgs,
}: {
  cwd: string;
  title: string;
  piArgs: string[];
}): string[] {
  return [
    `--working-directory=${cwd}`,
    "-e",
    "/bin/sh",
    "-lc",
    buildPiShellCommand(title, cwd),
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
}: {
  cwd: string;
  title: string;
  launchMode: LaunchMode;
  surfaceId?: string;
  piArgs: string[];
}): string[] {
  const args = launchMode === "tab" ? ["+new-tab"] : [];
  if (launchMode === "tab" && surfaceId) {
    args.push(`--surface-id=${surfaceId}`);
  }
  args.push(...buildGhosttyExecArgs({ cwd, title, piArgs }));
  return args;
}

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
  execRunner,
  controllerGhostty,
  surfaceId,
  readProcessExecutable = readProcExecutable,
}: {
  execRunner: ExecRunner;
  controllerGhostty: GhosttyAncestor | undefined;
  surfaceId: string | undefined;
  readProcessExecutable?: (pid: number) => string | undefined;
}): Promise<ControllerGhosttyDbusTarget | undefined> {
  if (!controllerGhostty?.exe || !surfaceId) return undefined;
  const endpoint = resolveGhosttyDbusEndpoint(controllerGhostty.exe);
  if (!endpoint) return undefined;
  const normalizedSurfaceId = normalizeGhosttySurfaceIdUint64(surfaceId);
  if (!normalizedSurfaceId) return undefined;

  try {
    const result = await execRunner("busctl", ["--user", "list", "--no-pager", "--no-legend"], {
      timeout: GHOSTTY_PROBE_TIMEOUT_MS,
    });
    if (result.code !== 0) return undefined;
    const rows = String(result.stdout || "")
      .split("\n")
      .map((line) => line.trim().split(/\s+/));

    // A --gtk-single-instance server owns its executable family's well-known D-Bus name and every
    // surface/window in that family. Per-session launcher processes can expose stub windows, so the
    // nearest Ghostty ancestor PID is not a reliable action target. Select the endpoint from the
    // controller executable family first, then resolve only that well-known owner; never cross-fall
    // back between the normal and transitional legacy brokers.
    const wellKnownOwnerPid = rows
      .filter((fields) => fields[0] === endpoint.wellKnownName)
      .map((fields) => Number.parseInt(fields[1] || "", 10))
      .find((pid) => Number.isInteger(pid) && pid > 0);
    if (!wellKnownOwnerPid) return undefined;

    // The well-known name must be owned by the exact controller build, not merely another
    // executable in the same identity family. This prevents a stale packaged singleton or a
    // same-user bus-name claimant from receiving the controller surface ID and embedded argv.
    const ownerExecutable = readProcessExecutable(wellKnownOwnerPid);
    if (!ownerExecutable || resolve(ownerExecutable) !== resolve(controllerGhostty.exe)) {
      return undefined;
    }

    const ownerUniqueNames = rows
      .filter(
        (fields) =>
          fields.length >= 2 &&
          fields[0]?.startsWith(":") &&
          Number.parseInt(fields[1] || "", 10) === wellKnownOwnerPid,
      )
      .map((fields) => fields[0] as string);
    if (ownerUniqueNames.length !== 1) return undefined;
    return {
      busName: ownerUniqueNames[0] as string,
      ownerPid: wellKnownOwnerPid,
      surfaceId: normalizedSurfaceId,
      wellKnownName: endpoint.wellKnownName,
      objectPath: endpoint.objectPath,
    };
  } catch {
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
