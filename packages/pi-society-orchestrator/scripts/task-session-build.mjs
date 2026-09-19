// Build the exported task-session adapter (package.json "./task-session-adapter").
// Owned here so this package's own prepack emits what its files[] and exports promise;
// pi-little-helpers calls the same function with its TypeScript when it embeds the adapter.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = `${root}dist/task-session`;

export function buildTaskSessionAdapter(tsc = `${root}node_modules/typescript/bin/tsc`) {
  // Dev-only compiler; an omit=dev or hoisted install must fail with the missing path named.
  if (!existsSync(tsc)) throw new Error(`task_session_adapter_tsc_unavailable: ${tsc}`);
  mkdirSync(outDir, { recursive: true });
  const r = spawnSync(
    process.execPath,
    [
      tsc,
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
      "--outDir",
      outDir,
      `${root}src/runtime/task-session-adapter.ts`,
    ],
    { stdio: "inherit" },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
  // TypeScript reformats imported JSON. Restore owner contract bytes before hashing/packing.
  for (const name of ["protocol", "deployment"])
    copyFileSync(
      `${root}src/runtime/task-session-${name}-v1.json`,
      `${outDir}/task-session-${name}-v1.json`,
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) buildTaskSessionAdapter();
