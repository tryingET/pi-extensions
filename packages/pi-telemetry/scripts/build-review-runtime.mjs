// ---
// summary: builds the Node-runnable telemetry review-snapshot API from the canonical TypeScript sources.
// read_when:
//   - changing review-snapshot exports, build output, or package prepack behavior.
// ---

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(packageRoot, "dist");
const tsgo = join(packageRoot, "node_modules", "@typescript", "native-preview", "bin", "tsgo.js");

rmSync(distDir, { recursive: true, force: true });
execFileSync(process.execPath, [tsgo, "-p", join(packageRoot, "tsconfig.review-runtime.json")], {
  cwd: packageRoot,
  stdio: "inherit",
});

for (const required of [
  join(distDir, "review-snapshot.js"),
  join(distDir, "review-snapshot.d.ts"),
  join(distDir, "review-snapshot-build.js"),
  join(distDir, "review-snapshot-validate.js"),
]) {
  if (!existsSync(required)) {
    throw new Error(`Telemetry review runtime build did not emit required artifact: ${required}`);
  }
}
