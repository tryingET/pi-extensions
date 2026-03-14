import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const HELPERS_DIR = fileURLToPath(new URL(".", import.meta.url));
export const PACKAGE_ROOT = path.resolve(HELPERS_DIR, "..", "..");
const PACKAGE_TMP_ROOT = path.join(PACKAGE_ROOT, ".tmp-test");

export function createPackageTempDir(prefix) {
  mkdirSync(PACKAGE_TMP_ROOT, { recursive: true });
  return mkdtempSync(path.join(PACKAGE_TMP_ROOT, prefix));
}

function linkPackageDependency(tempDir, packageName, packageRoot) {
  const destination = path.join(tempDir, "node_modules", ...packageName.split("/"));
  mkdirSync(path.dirname(destination), { recursive: true });
  symlinkSync(packageRoot, destination, "dir");
}

export function createTranspiledModuleHarness({ prefix, files, linkedPackages = [] }) {
  const tempDir = createPackageTempDir(prefix);

  for (const linkedPackage of linkedPackages) {
    linkPackageDependency(tempDir, linkedPackage.packageName, linkedPackage.packageRoot);
  }

  for (const relativePath of files) {
    const sourcePath = path.join(PACKAGE_ROOT, relativePath);
    const source = readFileSync(sourcePath, "utf8");
    const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
    mkdirSync(path.dirname(outputPath), { recursive: true });

    if (relativePath.endsWith(".ts")) {
      const transpiled = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
        fileName: sourcePath,
      }).outputText;
      writeFileSync(outputPath, transpiled, "utf8");
      continue;
    }

    writeFileSync(outputPath, source, "utf8");
  }

  return {
    tempDir,
    async importModule(relativePath) {
      return import(
        `${pathToFileURL(path.join(tempDir, relativePath)).href}?t=${Date.now()}-${Math.random()}`
      );
    },
    cleanup() {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

export async function withTranspiledModuleHarness(options, run) {
  const harness = createTranspiledModuleHarness(options);
  try {
    return await run(harness);
  } finally {
    harness.cleanup();
  }
}
