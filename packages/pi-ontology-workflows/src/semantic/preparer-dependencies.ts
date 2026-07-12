import path from "node:path";
import type { DevelopmentDependencyPackage, DevelopmentSourcePin } from "./preparer.ts";
import {
  escapeRegex,
  fail,
  isNative,
  type Material,
  normalizeDistribution,
  openRelativeDirectory,
  openRelativeUnknown,
  readOpenedFile,
  requireOwnerSafe,
  type SafeDirectory,
  stableDirectoryNames,
  validateRelative,
} from "./preparer-safe-fs.ts";

const FILE_CAP = 1_048_576;

export async function collectStandardLibrary(
  root: SafeDirectory,
  version: string,
): Promise<Map<string, Material>> {
  const output = new Map<string, Material>();
  const requiredDirectories = new Set([
    "collections",
    "encodings",
    "html",
    "importlib",
    "json",
    "logging",
    "re",
    "urllib",
  ]);
  for (const name of await stableDirectoryNames(root, "Python standard library")) {
    if (!name.endsWith(".py") && !requiredDirectories.has(name)) continue;
    await walk(
      root,
      name,
      `lib/python${version}/${name}`,
      output,
      new Set(["__pycache__", "test", "tests"]),
    );
  }
  return output;
}

export async function collectDependencies(
  sitePackages: SafeDirectory,
  packages: readonly DevelopmentDependencyPackage[],
): Promise<Map<string, Material>> {
  const output = new Map<string, Material>();
  for (const dependency of packages) {
    const root = await openRelativeDirectory(
      sitePackages,
      dependency.path,
      `dependency ${dependency.distribution}`,
    );
    try {
      await walk(root, "", dependency.path, output, new Set(["__pycache__"]), dependency);
    } finally {
      await root.handle.close();
    }
    if (dependency.optionalNativeFallback === "pyyaml") {
      const init = output.get(`${dependency.path}/__init__.py`)?.bytes.toString("utf8") ?? "";
      if (!init.includes("__with_libyaml__ = False") || !init.includes("from .cyaml import *"))
        fail("PyYAML pure-Python fallback proof failed");
    }
  }
  return output;
}

export async function walk(
  root: SafeDirectory,
  sourceRelative: string,
  outputRelative: string,
  output: Map<string, Material>,
  excludedNames: ReadonlySet<string>,
  dependency?: DevelopmentDependencyPackage,
): Promise<void> {
  const opened = sourceRelative
    ? await openRelativeUnknown(root, sourceRelative, outputRelative)
    : { handle: root.handle, stat: await root.handle.stat({ bigint: true }), borrowed: true };
  try {
    requireOwnerSafe(opened.stat, outputRelative);
    if (opened.stat.isDirectory()) {
      const directory = {
        handle: opened.handle,
        absolute: sourceRelative
          ? path.join(root.absolute, ...sourceRelative.split("/"))
          : root.absolute,
      };
      for (const name of await stableDirectoryNames(directory, outputRelative)) {
        if (excludedNames.has(name) || name.endsWith(".pyc")) continue;
        const childSource = sourceRelative ? `${sourceRelative}/${name}` : name;
        await walk(
          root,
          childSource,
          `${outputRelative}/${name}`,
          output,
          excludedNames,
          dependency,
        );
      }
      return;
    }
    if (!opened.stat.isFile()) fail(`non-regular preparation material rejected: ${outputRelative}`);
    if (isNative(outputRelative) && dependency) {
      if (
        dependency.optionalNativeFallback === "pyyaml" &&
        dependency.distribution === "pyyaml" &&
        new RegExp(`^${escapeRegex(dependency.path)}/_yaml\\.cpython-[A-Za-z0-9_-]+\\.so$`).test(
          outputRelative,
        )
      )
        return;
      fail(`native dependency requires explicit support: ${outputRelative}`);
    }
    const bytes = await readOpenedFile(opened.handle, FILE_CAP, outputRelative, opened.stat);
    output.set(outputRelative, { bytes, mode: isNative(outputRelative) ? 0o755 : 0o644 });
  } finally {
    if (!opened.borrowed) await opened.handle.close();
  }
}

export function proveDependencyClosure(
  lock: Buffer,
  packages: readonly DevelopmentDependencyPackage[],
): void {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(lock);
  } catch {
    fail("dependency lock is not UTF-8");
  }
  const graph = new Map<string, string[]>();
  for (const raw of text.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const name = raw.match(/^name = "([a-zA-Z0-9._-]+)"$/m)?.[1];
    if (!name) fail("dependency lock package has no valid name");
    const dependencyBlock = raw.match(/^dependencies = \[\n([\s\S]*?)^\]$/m)?.[1] ?? "";
    const dependencies = [
      ...dependencyBlock.matchAll(/^\s*\{ name = "([a-zA-Z0-9._-]+)"(?:,.*)? \},$/gm),
    ].map((x) => normalizeDistribution(x[1] ?? ""));
    graph.set(normalizeDistribution(name), dependencies);
  }
  if (!graph.has("rocs-cli")) fail("dependency lock has no rocs-cli package");
  const closure = new Set<string>();
  const pending = [...(graph.get("rocs-cli") ?? [])];
  while (pending.length) {
    const name = pending.pop();
    if (!name || closure.has(name)) continue;
    const dependencies = graph.get(name);
    if (!dependencies) fail(`dependency lock closure is incomplete: ${name}`);
    closure.add(name);
    pending.push(...dependencies);
  }
  const selected = new Set(packages.map((value) => normalizeDistribution(value.distribution)));
  if (
    selected.size !== packages.length ||
    selected.size !== closure.size ||
    [...closure].some((name) => !selected.has(name))
  )
    fail("selected pure-Python dependency closure is incomplete or has extras");
}

export function validatePin(pin: DevelopmentSourcePin): void {
  if (
    !pin ||
    typeof pin !== "object" ||
    !Array.isArray(pin.files) ||
    !Array.isArray(pin.dependencyPackages)
  )
    fail("invalid development source pin");
  const paths = new Set<string>();
  for (const entry of pin.files) {
    if (!Array.isArray(entry) || entry.length !== 2) fail("invalid source pin entry");
    validateRelative(entry[0], "source pin path");
    if (
      !entry[0].startsWith("src/rocs_cli/") ||
      !/^[0-9a-f]{40}$/.test(entry[1]) ||
      paths.has(entry[0])
    )
      fail("invalid, duplicate, or extra source pin path");
    paths.add(entry[0]);
  }
  validateRelative(pin.lock.path, "lock pin path");
  if (!/^[0-9a-f]{40}$/.test(pin.lock.blob) || paths.has(pin.lock.path)) fail("invalid lock pin");
  const dependencyPaths = new Set<string>();
  for (const dependency of pin.dependencyPackages) {
    const keys = Object.keys(dependency).sort().join(",");
    if (
      keys !==
      (dependency.optionalNativeFallback
        ? "distribution,optionalNativeFallback,path,purePython"
        : "distribution,path,purePython")
    )
      fail("dependency pin has unknown or missing fields");
    validateRelative(dependency.path, "dependency package path");
    if (
      dependency.purePython !== true ||
      normalizeDistribution(dependency.distribution) !== dependency.distribution
    )
      fail("dependency package is not a normalized pure-Python pin");
    if (
      dependency.optionalNativeFallback &&
      (dependency.optionalNativeFallback !== "pyyaml" ||
        dependency.distribution !== "pyyaml" ||
        dependency.path !== "yaml")
    )
      fail("unsupported optional native fallback");
    if (
      [...dependencyPaths].some(
        (value) =>
          value === dependency.path ||
          value.startsWith(`${dependency.path}/`) ||
          dependency.path.startsWith(`${value}/`),
      )
    )
      fail("dependency package paths overlap");
    dependencyPaths.add(dependency.path);
  }
}

export function parsePythonConfiguration(cfg: Buffer): {
  version: string;
  majorMinor: string;
  home: string;
} {
  const text = cfg.toString("utf8");
  const version = text.match(/^version_info = (3\.12\.\d+)$/m)?.[1];
  const home = text.match(/^home = ([^\r\n\0]+)$/m)?.[1];
  if (!version || !home || !path.isAbsolute(home))
    fail("ROCS virtualenv is not pinned canonical Python 3.12");
  return { version, majorMinor: version.split(".").slice(0, 2).join("."), home };
}
export function addMaterial(
  target: Map<string, Material>,
  relative: string,
  bytes: Buffer,
  mode: number,
): void {
  validateRelative(relative, "published material path");
  if (target.has(relative)) fail(`published material path collision: ${relative}`);
  target.set(relative, { bytes, mode });
}
