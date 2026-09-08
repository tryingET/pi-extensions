/** Hash fixture state, including symlinks, without following them or retaining content. */
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, readlink } from "node:fs/promises";
import { join } from "node:path";
export async function fixtureDigest(directory) {
  const rows = [];
  async function walk(path, prefix = "") {
    for (const name of (await readdir(path)).sort()) {
      const file = join(path, name),
        rel = prefix ? `${prefix}/${name}` : name;
      const stat = await lstat(file);
      if (stat.isSymbolicLink()) rows.push([rel, "symlink", await readlink(file)]);
      else if (stat.isDirectory()) {
        rows.push([rel, "directory", stat.mode]);
        await walk(file, rel);
      } else
        rows.push([
          rel,
          "file",
          stat.mode,
          createHash("sha256")
            .update(await readFile(file))
            .digest("hex"),
        ]);
    }
  }
  await walk(directory);
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
