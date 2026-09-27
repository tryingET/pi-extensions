// Emit isolated TypeScript sources with the exactly pinned TypeScript 7 CLI.
// --noCheck replaces the removed classic transpileModule API; typecheck remains
// a separate mandatory tsc --noEmit gate.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
export function emitTypeScript(files, outDir) {
  if (files.length === 0) return;
  execFileSync(
    process.execPath,
    [
      join(packageRoot, "node_modules/typescript/bin/tsc"),
      "--ignoreConfig",
      "--noCheck",
      "--noResolve",
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--rootDir",
      packageRoot,
      "--outDir",
      outDir,
      ...files,
    ],
    { cwd: packageRoot, stdio: "inherit" },
  );
}
