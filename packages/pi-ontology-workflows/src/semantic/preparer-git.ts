import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { DevelopmentSourcePin } from "./preparer.ts";
import {
  DevelopmentPreparationError,
  fail,
  message,
  type SafeDirectory,
} from "./preparer-safe-fs.ts";

const GIT_CAP = 1_048_576;
const GIT_TIMEOUT_MS = 5_000;
const LOGICAL_PATH = /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)(?!.*\\)[A-Za-z0-9._/+~-]+$/;

export interface CheckoutEvidence {
  tree: string;
  lockTree: string;
}
export async function verifyPinnedCheckout(
  root: SafeDirectory,
  pin: DevelopmentSourcePin,
  previous?: CheckoutEvidence,
): Promise<CheckoutEvidence> {
  if (!/^[0-9a-f]{40}$/.test(pin.commit)) fail("invalid pinned ROCS commit");
  const head = (await runGit(root, ["rev-parse", "--verify", "HEAD^{commit}"]))
    .toString("ascii")
    .trim();
  if (head !== pin.commit) fail("ROCS source is not at the package-pinned commit");
  const status = await runGit(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--ignore-submodules=none",
  ]);
  if (status.length !== 0) fail("ROCS pinned checkout is not clean");
  const treeBytes = await runGit(root, [
    "ls-tree",
    "-r",
    "-z",
    "--full-tree",
    "HEAD",
    "--",
    "src/rocs_cli",
  ]);
  const lockTreeBytes = await runGit(root, [
    "ls-tree",
    "-z",
    "--full-tree",
    "HEAD",
    "--",
    pin.lock.path,
  ]);
  const records = parseGitTree(treeBytes);
  const expected = new Map(pin.files);
  if (records.length !== expected.size || records.some((record) => !expected.has(record.path)))
    fail("ROCS source pin set is incomplete or has path extras");
  for (const record of records) {
    if (
      record.type !== "blob" ||
      !["100644", "100755"].includes(record.mode) ||
      expected.get(record.path) !== record.object
    )
      fail(`ROCS source tree identity mismatch: ${record.path}`);
  }
  const lockRecords = parseGitTree(lockTreeBytes);
  if (
    lockRecords.length !== 1 ||
    lockRecords[0]?.path !== pin.lock.path ||
    lockRecords[0].object !== pin.lock.blob
  )
    fail("ROCS lock pin is incomplete or has path extras");
  const evidence = { tree: treeBytes.toString("hex"), lockTree: lockTreeBytes.toString("hex") };
  if (previous && (previous.tree !== evidence.tree || previous.lockTree !== evidence.lockTree))
    fail("ROCS checkout identity changed during preparation");
  return evidence;
}

export async function runGit(root: SafeDirectory, args: string[]): Promise<Buffer> {
  const gitArgs = [
    "-c",
    "core.fsmonitor=false",
    "-c",
    "core.untrackedCache=false",
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "core.pager=cat",
    "-c",
    "color.ui=false",
    ...args,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/git", gitArgs, {
      cwd: "/proc/self/fd/3",
      env: {
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_OPTIONAL_LOCKS: "0",
        HOME: "/nonexistent",
        XDG_CONFIG_HOME: "/nonexistent",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
      },
      shell: false,
      detached: true,
      stdio: ["ignore", "pipe", "pipe", root.handle.fd],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(Buffer.concat(chunks, total));
    };
    const append = (raw: Buffer | string) => {
      const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      total += bytes.length;
      if (total > GIT_CAP) {
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch {}
        finish(new DevelopmentPreparationError("git output cap exceeded"));
      } else chunks.push(bytes);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.once("error", (error) => finish(new DevelopmentPreparationError(message(error))));
    child.once("close", (code, signal) => {
      if (code !== 0)
        finish(
          new DevelopmentPreparationError(
            `git verification failed (${code ?? signal ?? "unknown"})`,
          ),
        );
      else finish();
    });
    const timer = setTimeout(() => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {}
      finish(new DevelopmentPreparationError("git verification timed out"));
    }, GIT_TIMEOUT_MS);
    timer.unref();
  });
}

export function parseGitTree(
  bytes: Buffer,
): Array<{ mode: string; type: string; object: string; path: string }> {
  if (bytes.length === 0) return [];
  return bytes
    .subarray(0, bytes.at(-1) === 0 ? -1 : undefined)
    .toString("utf8")
    .split("\0")
    .map((entry) => {
      const match = entry.match(/^(\d{6}) ([a-z]+) ([0-9a-f]{40})\t(.+)$/);
      if (!match?.[1] || !match[2] || !match[3] || !match[4] || !LOGICAL_PATH.test(match[4]))
        fail("invalid git tree evidence");
      return { mode: match[1], type: match[2], object: match[3], path: match[4] };
    });
}

export function gitBlobDigest(bytes: Buffer): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}
