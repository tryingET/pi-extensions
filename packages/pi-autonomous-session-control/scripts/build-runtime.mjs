// Build the Node-runnable public execution graph and transport helper from one TS source tree.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(packageRoot, "dist");
const tsgo = join(packageRoot, "node_modules", "@typescript", "native-preview", "bin", "tsgo.js");

rmSync(distDir, { recursive: true, force: true });
execFileSync(process.execPath, [tsgo, "-p", join(packageRoot, "tsconfig.runtime.json")], {
  cwd: packageRoot,
  stdio: "inherit",
});

for (const required of [
  join(distDir, "execution.js"),
  join(distDir, "execution.d.ts"),
  join(distDir, "extensions", "self", "subagent-pi-json-filter.js"),
  join(distDir, "extensions", "self", "subagent-pi-json-filter-v2.js"),
  join(distDir, "extensions", "self", "subagent-raw-supervisor-v1.js"),
  join(distDir, "extensions", "self", "subagent-protocol-v2.js"),
]) {
  if (!existsSync(required)) {
    throw new Error(`ASC runtime build did not emit required artifact: ${required}`);
  }
}
