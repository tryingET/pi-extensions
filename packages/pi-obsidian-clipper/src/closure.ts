// AK6872 native dependency-closure admission (contract C1-C3) and the runtime permission
// arguments (C4/C5). See docs/project/2026-10-10-ak6872-native-closure-contract.md.
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const CLOSURE_LIMITS = { entries: 50000, depth: 64 };
export const NETWORK_GUARD = fileURLToPath(new URL("./native-guard.cjs", import.meta.url));
const CANCELLED = "Native capture cancelled or deadline exceeded";
const uid = () => process.getuid?.();
const owned = (s: { uid: number }) => [0, uid()].includes(s.uid);
// Permission flags take one path each; refuse paths Node could read as a list or wildcard.
export function flagSafe(path: string) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are refused
  if (!isAbsolute(path) || /[,*\u0000-\u001f\u007f]/u.test(path))
    throw new Error("Native closure path contains characters unsafe for permission flags");
  return path;
}
const inside = (root: string, path: string) => path === root || path.startsWith(root + sep);

export async function admitNative(path: string, signal?: AbortSignal, limits = CLOSURE_LIMITS) {
  if (!isAbsolute(path) || basename(path) !== "cli.cjs")
    throw new Error("Native CLI must be an absolute owner-installed cli.cjs");
  let cli: string;
  try {
    cli = await realpath(path);
  } catch {
    throw new Error(
      "Native Clipper CLI missing. Provision the pinned owner artifact; no runtime build/download is performed.",
    );
  }
  const file = await stat(cli);
  if (!file.isFile() || file.size < 1 || file.size > 50 * 1024 * 1024)
    throw new Error("Invalid native artifact");
  // C1: <root>/dist/cli.cjs with a regular <root>/package.json.
  const root = dirname(dirname(cli));
  const manifest = await lstat(join(root, "package.json")).catch(() => undefined);
  if (basename(dirname(cli)) !== "dist" || !manifest?.isFile())
    throw new Error("Native closure layout must be <root>/dist/cli.cjs with <root>/package.json");
  flagSafe(root);
  // C2: unchanged ancestry rule, from the closure root up to the filesystem root.
  for (let p = root; ; p = dirname(p)) {
    const s = await stat(p);
    if (s.mode & 0o022 || !owned(s))
      throw new Error("Native artifact ancestry is not owner-installed/private");
    if (dirname(p) === p) break;
  }
  // C3: every closure entry, links not followed; symlinks must resolve inside the root.
  let entries = 0;
  const walk = async (path: string, depth: number): Promise<void> => {
    if (signal?.aborted) throw new Error(CANCELLED);
    const name = relative(root, path) || ".";
    if (++entries > limits.entries || depth > limits.depth)
      throw new Error("Native dependency closure exceeds entry/depth budget");
    const s = await lstat(path);
    if (!owned(s)) throw new Error(`Native dependency closure has a foreign owner: ${name}`);
    if (s.isSymbolicLink()) {
      const target = await realpath(path).catch(() => undefined);
      if (!target || !inside(root, target))
        throw new Error(
          `Native dependency closure symlink is dangling or leaves the root: ${name}`,
        );
      return;
    }
    if (!s.isDirectory() && !s.isFile())
      throw new Error(`Native dependency closure has a special file: ${name}`);
    if (s.mode & 0o022)
      throw new Error(`Native dependency closure is not owner-installed/private: ${name}`);
    if (s.isDirectory())
      for (const child of (await readdir(path)).sort()) await walk(join(path, child), depth + 1);
  };
  await walk(root, 0);
  return { cli, root, entries };
}
// C4/C5: read-only grants; network denied by the runtime where supported, else by the guard.
export function permissionArgs(root: string, dir: string) {
  const flags = process.allowedNodeEnvironmentFlags;
  if (!flags.has("--permission"))
    throw new Error("Native capture requires a Node runtime with the permission model");
  const runtimeNet = flags.has("--allow-net");
  const reads = [root, dir, ...(runtimeNet ? [] : [NETWORK_GUARD])].map(flagSafe);
  return {
    args: [
      "--permission",
      ...reads.map((p) => `--allow-fs-read=${p}`),
      ...(runtimeNet ? [] : ["--require", NETWORK_GUARD]),
    ],
    boundary: {
      permissionModel: "node-permission-read-only",
      network: runtimeNet ? "runtime-permission" : "in-process-guard",
      osSandbox: false,
    },
  };
}
