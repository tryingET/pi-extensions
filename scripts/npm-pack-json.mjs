#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { runNpmPackJsonCli } from "../packages/pi-eval-kernel/scripts/npm-pack-json.mjs";

export {
  normalizeNpmPackJson,
  parseNpmPackJson,
} from "../packages/pi-eval-kernel/scripts/npm-pack-json.mjs";

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runNpmPackJsonCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
