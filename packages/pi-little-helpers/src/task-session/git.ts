import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { refuse } from "./json.js";
/** Filesystem-only Git identity, no git process, no hooks, no DB. */
export function commonGit(cwd: string): string {
  const dot = join(cwd, ".git");
  const s = lstatSync(dot);
  if (s.isSymbolicLink()) refuse("git_identity_ambiguous");
  let gitDir = dot;
  if (s.isFile()) {
    if (s.size > 4096) refuse("git_identity_ambiguous");
    const m = /^gitdir: ([^\r\n]+)\n?$/.exec(
      new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(dot)),
    );
    if (!m) refuse("git_identity_ambiguous");
    gitDir = realpathSync(resolve(cwd, m[1]));
  } else if (!s.isDirectory()) refuse("git_identity_ambiguous");
  const path = join(gitDir, "commondir");
  let stat: import("node:fs").Stats;
  try {
    stat = lstatSync(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return realpathSync(gitDir);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) refuse("git_identity_ambiguous");
  const value = new TextDecoder("utf-8", { fatal: true })
    .decode(readFileSync(path))
    .replace(/\n$/u, "");
  if (!value || /[\r\n]/u.test(value)) refuse("git_identity_ambiguous");
  return realpathSync(resolve(gitDir, value));
}
