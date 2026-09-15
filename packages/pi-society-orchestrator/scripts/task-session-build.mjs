/** Build the producer adapter in its owning package before packing either consumer. */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

export function buildTaskSessionAdapter({
  compilerPath = require.resolve("typescript/bin/tsc"),
  compilerCwd = root,
} = {}) {
  const output = join(root, "dist/task-session");
  mkdirSync(output, { recursive: true });
  const result = spawnSync(
    process.execPath,
    [
      compilerPath,
      "--target",
      "ES2023",
      "--lib",
      "ES2024,DOM",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--strict",
      "--skipLibCheck",
      "--resolveJsonModule",
      "--rootDir",
      join(root, "src/runtime"),
      "--outDir",
      output,
      join(root, "src/runtime/task-session-adapter.ts"),
    ],
    { cwd: compilerCwd, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`task_session_adapter_build_failed: ${result.status ?? result.signal}`);
  // Imported JSON is reformatted by tsc. Preserve the owner contract bytes for hashing.
  for (const name of ["protocol", "deployment"]) {
    const file = `task-session-${name}-v1.json`;
    copyFileSync(join(root, "src/runtime", file), join(output, file));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildTaskSessionAdapter();
}
