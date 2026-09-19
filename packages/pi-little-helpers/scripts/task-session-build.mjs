import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { buildTaskSessionAdapter } from "../../pi-society-orchestrator/scripts/task-session-build.mjs";

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
  "src/task-session/host-entry.ts",
  "src/task-session/viewer-entry.ts",
  "src/task-session/launch.ts",
]);
// Owner-built adapter, compiled with this package's TypeScript (the owner's deps may be absent).
buildTaskSessionAdapter(resolve("node_modules/typescript/bin/tsc"));
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
// Node-API headers ship with the running Node: <prefix>/include/node for official builds
// (setup-node, nvm) and /usr/include/node for distro packages whose binary is /usr/bin/node.
const nodeInclude = resolve(dirname(process.execPath), "..", "include", "node");
if (!existsSync(`${nodeInclude}/node_api.h`))
  throw new Error(`native_headers_unavailable: ${nodeInclude}/node_api.h`);
run("/usr/bin/cc", [
  "-shared",
  "-fPIC",
  "-O2",
  "-Wall",
  "-Wextra",
  "-Werror",
  "-Wno-misleading-indentation",
  `-I${nodeInclude}`,
  "-DNAPI_VERSION=8",
  "-o",
  "dist/task-session/custody-linux-x64.node",
  "src/task-session/native.c",
]);

copyFileSync(
  "../pi-society-orchestrator/dist/task-session/task-session-adapter.js",
  "dist/task-session/producer-adapter.js",
);
copyFileSync(
  "../pi-society-orchestrator/dist/task-session/task-session-protocol-v1.json",
  "dist/task-session/task-session-protocol-v1.json",
);

for (const [source, target] of [
  ["host-entry.js", "host-v1"],
  ["viewer-entry.js", "view-v1"],
]) {
  copyFileSync(`dist/task-session/${source}`, `dist/task-session/${target}`);
  chmodSync(`dist/task-session/${target}`, 0o755);
}
copyFileSync(
  "../pi-society-orchestrator/dist/task-session/task-session-deployment-v1.json",
  "dist/task-session/task-session-deployment-v1.json",
);
writeFileSync("dist/task-session/package.json", JSON.stringify({ type: "module" }));
const { bytesDigest, canonical } = await import("../dist/task-session/json.js");
const files = Object.fromEntries(
  readdirSync("dist/task-session")
    .filter(
      (f) =>
        (/\.(js|json|node)$/.test(f) || f === "host-v1" || f === "view-v1") &&
        f !== "build-identity.json",
    )
    .sort()
    .map((f) => [f, bytesDigest(readFileSync(`dist/task-session/${f}`))]),
);
writeFileSync(
  "dist/task-session/build-identity.json",
  canonical({ schema: "pi.task-session.build.v1", files }),
);
