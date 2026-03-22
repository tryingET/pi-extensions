#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

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

for (const sourcePath of sourceFiles) {
  const source = readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const outputPath = sourcePath.replace(/\.ts$/, ".js");
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, transpiled, "utf8");
  execFileSync(BIOME_BIN, ["format", "--write", "--no-errors-on-unmatched", outputPath], {
    cwd: ROOT,
    stdio: QUIET ? "ignore" : "inherit",
  });
  if (!QUIET) console.log(path.relative(ROOT, outputPath));
}
