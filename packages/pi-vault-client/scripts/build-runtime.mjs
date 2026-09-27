#!/usr/bin/env node
// summary: transpile maintained TypeScript runtime sources into formatted JavaScript artifacts.
// read_when:
//   - rebuilding extension runtime files before package checks or publication.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { emitTypeScript } from "./emit-typescript.mjs";

const ROOT = process.cwd();
const RUNTIME_ROOTS = ["extensions", "src"];
const QUIET = process.argv.includes("--quiet");
const BIOME_BIN = path.join(
  ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "biome.cmd" : "biome",
);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

const sourceFiles = RUNTIME_ROOTS.flatMap((relativeRoot) => {
  const fullRoot = path.join(ROOT, relativeRoot);
  try {
    return walk(fullRoot);
  } catch {
    return [];
  }
}).sort();

emitTypeScript(sourceFiles, ROOT);

for (const sourcePath of sourceFiles) {
  const outputPath = sourcePath.replace(/\.ts$/, ".js");
  mkdirSync(path.dirname(outputPath), { recursive: true });
  execFileSync(BIOME_BIN, ["check", "--write", "--no-errors-on-unmatched", outputPath], {
    cwd: ROOT,
    stdio: QUIET ? "ignore" : "inherit",
  });
  if (!QUIET) console.log(path.relative(ROOT, outputPath));
}
