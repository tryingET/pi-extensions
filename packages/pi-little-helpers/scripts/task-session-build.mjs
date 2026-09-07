import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
function run(command, args) {
  const r = spawnSync(command, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
mkdirSync("dist/task-session", { recursive: true });
run(process.execPath, [
  "node_modules/typescript/bin/tsc",
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
  "--outDir",
  "dist/task-session",
  "--rootDir",
  "src/task-session",
  "src/task-session/core.ts",
  "src/task-session/bin.ts",
  "src/task-session/pi-tool.ts",
  "src/task-session/host.ts",
  "src/task-session/channel.ts",
  "src/task-session/ui.ts",
]);
run(process.execPath, [
  "node_modules/typescript/bin/tsc",
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
  "../pi-society-orchestrator/dist/task-session",
  "../pi-society-orchestrator/src/runtime/task-session-adapter.ts",
]);
run(process.execPath, [
  "node_modules/typescript/bin/tsc",
  "--noEmit",
  "--allowImportingTsExtensions",
  "--strict",
  "--skipLibCheck",
  "--target",
  "ES2023",
  "--module",
  "NodeNext",
  "extensions/sidequestGhostty.ts",
]);
// Same existing transport source, emitted without its erased TS-only handshake type import.
writeFileSync(
  "dist/task-session/shared-ghostty.js",
  ts.transpileModule(
    readFileSync("extensions/sidequestGhostty.ts", "utf8").replace(
      "../src/taskSessionTransport.ts",
      "./restricted-transport.js",
    ),
    {
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
    },
  ).outputText,
);
writeFileSync(
  "dist/task-session/restricted-transport.js",
  ts.transpileModule(readFileSync("src/taskSessionTransport.ts", "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText,
);
if (process.platform !== "linux" || process.arch !== "x64")
  throw new Error("native_platform_unsupported");
// Build-time only. No install scripts/download/compiler fallback in emitted runtime.
run("/usr/bin/cc", [
  "-shared",
  "-fPIC",
  "-O2",
  "-Wall",
  "-Wextra",
  "-Werror",
  "-Wno-misleading-indentation",
  "-I/usr/include/node",
  "-DNAPI_VERSION=8",
  "-o",
  "dist/task-session/custody-linux-x64.node",
  "src/task-session/native.c",
]);
