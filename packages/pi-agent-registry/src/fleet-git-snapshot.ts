// ---
// summary: captures bounded immutable Git objects plus separate worktree-currentness observations for fleet lint.
// read_when:
//   - changing immutable fleet revisions, committed file capture, dirty-state handling, or Git race detection.
// ---

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 15_000;
const MAX_GIT_OUTPUT_BYTES = 8 * 1024 * 1024;
const FULL_GIT_OID = /^[0-9a-f]{40,64}$/u;

export interface CapturedGitFile {
  path: string;
  mode: string;
  blobOid: string;
  bytes: Buffer;
  sha256: string;
}

export interface FleetGitSnapshot {
  root: string;
  commit: string;
  treeOid: string;
  status: "clean_observed" | "dirty";
  statusSha256: string;
  latestActivityAt?: string;
  readFile(path: string, maxBytes?: number): Promise<CapturedGitFile | undefined>;
  finish(): Promise<{ stable: boolean; finalCommit: string; finalStatusSha256: string }>;
}

export class FleetGitSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FleetGitSnapshotError";
  }
}

async function runGit(
  root: string,
  args: string[],
  encoding?: BufferEncoding,
): Promise<string | Buffer> {
  try {
    const result = await execFileAsync(
      "git",
      [
        "--no-pager",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "core.untrackedCache=false",
        "-c",
        "diff.external=",
        "-C",
        root,
        ...args,
      ],
      {
        encoding: encoding ?? "buffer",
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: MAX_GIT_OUTPUT_BYTES,
        windowsHide: true,
        env: {
          PATH: process.env.PATH,
          LC_ALL: "C",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_OPTIONAL_LOCKS: "0",
          GIT_NO_REPLACE_OBJECTS: "1",
          GIT_PAGER: "cat",
          GIT_TERMINAL_PROMPT: "0",
        },
      },
    );
    return result.stdout;
  } catch {
    const operation =
      args[0] === "rev-parse"
        ? "revision query"
        : args[0] === "status"
          ? "worktree status query"
          : args[0] === "log"
            ? "activity query"
            : args[0] === "ls-tree"
              ? "committed tree query"
              : args[0] === "cat-file"
                ? "committed object query"
                : "immutable repository query";
    throw new FleetGitSnapshotError(`Git ${operation} failed`);
  }
}

function oneLine(value: string | Buffer, label: string): string {
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : value;
  if (!text.endsWith("\n") || text.endsWith("\n\n")) {
    throw new FleetGitSnapshotError(`${label} returned malformed line output`);
  }
  const line = text.slice(0, -1);
  if (!line || /[\0\r\n]/u.test(line)) {
    throw new FleetGitSnapshotError(`${label} returned an invalid value`);
  }
  return line;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeRelativePath(root: string, path: string): string {
  if (!path || isAbsolute(path) || /[\0\r\n]/u.test(path)) {
    throw new FleetGitSnapshotError("committed path is not one safe repository-relative path");
  }
  const normalized = relative(resolve(root), resolve(root, path)).split("\\").join("/");
  if (!normalized || normalized.startsWith("../") || normalized === "..") {
    throw new FleetGitSnapshotError("committed path escapes its repository snapshot");
  }
  return normalized;
}

async function captureHead(root: string): Promise<string> {
  const head = oneLine(
    await runGit(root, ["rev-parse", "--verify", "HEAD^{commit}"], "utf8"),
    "HEAD",
  );
  if (!FULL_GIT_OID.test(head)) throw new FleetGitSnapshotError("HEAD is not a full Git object id");
  return head;
}

async function captureStatus(root: string): Promise<Buffer> {
  const output = await runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  return Buffer.isBuffer(output) ? output : Buffer.from(output, "utf8");
}

export async function verifyFleetGitRevision(
  path: string,
  revision: string,
  options: { requiredFiles?: string[] } = {},
): Promise<{ repoRoot: string; commit: string; treeOid: string; sourceRelative: string }> {
  if (!FULL_GIT_OID.test(revision)) {
    throw new FleetGitSnapshotError("template revision is not one full Git object id");
  }
  const canonical = await realpath(path).catch(() => undefined);
  if (!canonical) throw new FleetGitSnapshotError("template source cannot be resolved");
  const topRaw = oneLine(
    await runGit(canonical, ["rev-parse", "--show-toplevel"], "utf8"),
    "template Git top-level",
  );
  const repoRoot = await realpath(topRaw).catch(() => undefined);
  if (!repoRoot) throw new FleetGitSnapshotError("template Git root cannot be resolved");
  const sourceRelative = relative(repoRoot, canonical).split("\\").join("/");
  if (!sourceRelative || sourceRelative.startsWith("../") || isAbsolute(sourceRelative)) {
    throw new FleetGitSnapshotError("template source must be a subdirectory of its Git repository");
  }
  const commit = oneLine(
    await runGit(repoRoot, ["rev-parse", "--verify", `${revision}^{commit}`], "utf8"),
    "template revision",
  );
  if (commit !== revision)
    throw new FleetGitSnapshotError("template revision did not resolve exactly");
  const treeOid = oneLine(
    await runGit(repoRoot, ["rev-parse", `${commit}^{tree}`], "utf8"),
    "template tree",
  );
  if (!FULL_GIT_OID.test(treeOid)) throw new FleetGitSnapshotError("template tree is invalid");
  for (const required of options.requiredFiles ?? []) {
    const pathAtRevision = join(sourceRelative, safeRelativePath(canonical, required))
      .split("\\")
      .join("/");
    const raw = await runGit(repoRoot, ["ls-tree", "-z", commit, "--", pathAtRevision]);
    const listing = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");
    const text = listing.subarray(0, -1).toString("utf8");
    const tab = text.indexOf("\t");
    const metadata = tab >= 0 ? text.slice(0, tab).split(" ") : [];
    if (
      listing.length === 0 ||
      listing[listing.length - 1] !== 0 ||
      text.slice(tab + 1) !== pathAtRevision ||
      (metadata[0] !== "100644" && metadata[0] !== "100755") ||
      metadata[1] !== "blob" ||
      !FULL_GIT_OID.test(metadata[2] ?? "")
    ) {
      throw new FleetGitSnapshotError(`template revision lacks required file: ${required}`);
    }
  }
  return { repoRoot, commit, treeOid, sourceRelative };
}

/** Resolve one exact Git repository root from a working directory (read-only). */
export async function resolveGitRepoRoot(cwd: string): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const stdout = await promisify(execFile)(
    "git",
    ["--no-pager", "-C", cwd, "rev-parse", "--show-toplevel"],
    { timeout: 15_000, windowsHide: true, encoding: "utf8" },
  );
  const root = stdout.stdout.trim();
  if (!root) throw new FleetGitSnapshotError("empty repository root");
  return root;
}

export async function captureFleetGitSnapshot(repoRoot: string): Promise<FleetGitSnapshot> {
  const root = await realpath(repoRoot).catch(() => undefined);
  if (!root) throw new FleetGitSnapshotError("repository root cannot be resolved");
  const topRaw = oneLine(
    await runGit(root, ["rev-parse", "--show-toplevel"], "utf8"),
    "Git top-level",
  );
  const top = await realpath(topRaw).catch(() => undefined);
  if (top !== root) {
    throw new FleetGitSnapshotError("candidate is not one exact Git repository root");
  }

  const commit = await captureHead(root);
  const treeOid = oneLine(
    await runGit(root, ["rev-parse", `${commit}^{tree}`], "utf8"),
    "Git tree",
  );
  if (!FULL_GIT_OID.test(treeOid))
    throw new FleetGitSnapshotError("tree is not a full Git object id");
  const statusBytes = await captureStatus(root);
  const statusSha256 = sha256(statusBytes);
  const activityRaw = await runGit(
    root,
    ["log", "-1", "--format=%cI", commit, "--", "diary", "docs/learnings"],
    "utf8",
  );
  const latestActivityAt = String(activityRaw).trim() || undefined;
  const fileCache = new Map<string, CapturedGitFile | undefined>();

  return {
    root,
    commit,
    treeOid,
    status: statusBytes.length === 0 ? "clean_observed" : "dirty",
    statusSha256,
    ...(latestActivityAt ? { latestActivityAt } : {}),
    async readFile(path: string, maxBytes = 1024 * 1024) {
      const relativePath = safeRelativePath(root, path);
      if (fileCache.has(relativePath)) {
        const cached = fileCache.get(relativePath);
        if (cached && cached.bytes.length > maxBytes) {
          throw new FleetGitSnapshotError(
            `committed blob exceeds ${maxBytes} bytes: ${relativePath}`,
          );
        }
        return cached;
      }
      const listingRaw = await runGit(root, ["ls-tree", "-z", commit, "--", relativePath]);
      const listing = Buffer.isBuffer(listingRaw) ? listingRaw : Buffer.from(listingRaw, "utf8");
      if (listing.length === 0) {
        fileCache.set(relativePath, undefined);
        return undefined;
      }
      const records = listing
        .subarray(0, listing.length - 1)
        .toString("utf8")
        .split("\0");
      if (!listing.subarray(-1).equals(Buffer.from([0])) || records.length !== 1) {
        throw new FleetGitSnapshotError(`committed path is ambiguous: ${relativePath}`);
      }
      const separator = records[0]?.indexOf("\t") ?? -1;
      const metadata = separator >= 0 ? records[0]?.slice(0, separator).split(" ") : [];
      const listedPath = separator >= 0 ? records[0]?.slice(separator + 1) : undefined;
      const [mode, type, blobOid] = metadata;
      if (
        listedPath !== relativePath ||
        type !== "blob" ||
        !mode ||
        !blobOid ||
        !FULL_GIT_OID.test(blobOid)
      ) {
        throw new FleetGitSnapshotError(`committed path is not one exact blob: ${relativePath}`);
      }
      if (mode !== "100644" && mode !== "100755") {
        fileCache.set(relativePath, undefined);
        return undefined;
      }
      const size = Number.parseInt(
        oneLine(
          await runGit(root, ["cat-file", "-s", blobOid], "utf8"),
          `blob size ${relativePath}`,
        ),
        10,
      );
      if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) {
        throw new FleetGitSnapshotError(
          `committed blob exceeds ${maxBytes} bytes: ${relativePath}`,
        );
      }
      const raw = await runGit(root, ["cat-file", "blob", blobOid]);
      const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");
      if (bytes.length !== size) {
        throw new FleetGitSnapshotError(
          `committed blob size changed during capture: ${relativePath}`,
        );
      }
      const captured = { path: relativePath, mode, blobOid, bytes, sha256: sha256(bytes) };
      fileCache.set(relativePath, captured);
      return captured;
    },
    async finish() {
      const [finalCommit, finalStatus] = await Promise.all([
        captureHead(root),
        captureStatus(root),
      ]);
      const finalStatusSha256 = sha256(finalStatus);
      return {
        stable: finalCommit === commit && finalStatusSha256 === statusSha256,
        finalCommit,
        finalStatusSha256,
      };
    },
  };
}
