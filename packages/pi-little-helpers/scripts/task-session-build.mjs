import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  "--ignoreConfig",
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
  "--types",
  "node",
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
  "--ignoreConfig",
  "--noEmit",
  "--allowImportingTsExtensions",
  "--strict",
  "--skipLibCheck",
  "--types",
  "node",
  "--target",
  "ES2023",
  "--module",
  "NodeNext",
  "extensions/sidequestGhostty.ts",
]);
// Emit the transport sources with the same TypeScript 7 CLI, without the
// classic transpileModule API. The temporary source preserves the restricted
// handshake import rewrite, and --noCheck only applies to this isolated emit.
const emitRoot = mkdtempSync(resolve(tmpdir(), "pi-task-session-emit-"));
try {
  writeFileSync(
    resolve(emitRoot, "shared-ghostty.ts"),
    readFileSync("extensions/sidequestGhostty.ts", "utf8").replace(
      "../src/taskSessionTransport.ts",
      "./restricted-transport.js",
    ),
  );
  copyFileSync("src/taskSessionTransport.ts", resolve(emitRoot, "restricted-transport.ts"));
  run(process.execPath, [
    "node_modules/typescript/bin/tsc",
    "--ignoreConfig",
    "--noCheck",
    "--noResolve",
    "--target",
    "ES2023",
    "--module",
    "ESNext",
    "--outDir",
    "dist/task-session",
    resolve(emitRoot, "shared-ghostty.ts"),
    resolve(emitRoot, "restricted-transport.ts"),
  ]);
} finally {
  rmSync(emitRoot, { recursive: true, force: true });
}
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
