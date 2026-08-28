// summary: governed runtime materialization module (split from governed-runtime-materialization.ts).
// read_when:
//   - changing governed runtime fs-integrity verification.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  GOVERNED_RUNTIME_CODING_AGENT_SHRINKWRAP_PACKAGES,
  GOVERNED_RUNTIME_HOST_VERSION,
} from "./governed-runtime-constants.ts";
import { GovernedRuntimeMaterializationError } from "./governed-runtime-proofs.ts";

export function readRegularFileNoFollow(
  filePath: string,
  failureClass = "materialization_regular_file_invalid",
): Buffer {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile()) {
      throw new GovernedRuntimeMaterializationError(
        failureClass,
        `Governed input must be a regular non-symlink file: ${filePath}.`,
      );
    }
    return readFileSync(descriptor);
  } catch (error) {
    if (error instanceof GovernedRuntimeMaterializationError) throw error;
    throw new GovernedRuntimeMaterializationError(
      failureClass,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function readJsonNoFollow<T>(filePath: string, failureClass: string): T {
  try {
    return JSON.parse(readRegularFileNoFollow(filePath, failureClass).toString("utf8")) as T;
  } catch (error) {
    if (error instanceof GovernedRuntimeMaterializationError) throw error;
    throw new GovernedRuntimeMaterializationError(
      failureClass,
      `Governed JSON input is invalid at ${filePath}: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

export function verifyGovernedRuntimeFileIntegrity(
  filePath: string,
  integrity: string,
): { integrity: string; byteLength: number } {
  const separator = integrity.indexOf("-");
  const algorithm = separator > 0 ? integrity.slice(0, separator) : "";
  const expected = separator > 0 ? integrity.slice(separator + 1) : "";
  if (algorithm !== "sha512" || !expected) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_tarball_integrity_invalid",
      `Unsupported governed tarball integrity: ${integrity}.`,
    );
  }
  const bytes = readRegularFileNoFollow(filePath, "materialization_tarball_file_invalid");
  const observed = createHash(algorithm).update(bytes).digest("base64");
  if (observed !== expected) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_tarball_integrity_mismatch",
      `Governed tarball bytes do not match ${integrity}: ${filePath}.`,
    );
  }
  return { integrity, byteLength: bytes.length };
}

export function assertNoEscapingSymlinks(root: string): void {
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const target = realpathSync(absolutePath);
        if (!pathInside(root, target)) {
          throw new GovernedRuntimeMaterializationError(
            "materialization_closure_symlink_escape",
            `Governed runtime closure symlink escapes its root: ${absolutePath} -> ${target}.`,
          );
        }
      } else if (entry.isDirectory()) {
        visit(absolutePath);
      }
    }
  };
  visit(root);
}

export function codingAgentShrinkwrapPackageName(lockPath: string): string | undefined {
  const prefix = "node_modules/@earendil-works/pi-coding-agent/node_modules/";
  if (!lockPath.startsWith(prefix)) return undefined;
  const packageName = lockPath.slice(prefix.length);
  return GOVERNED_RUNTIME_CODING_AGENT_SHRINKWRAP_PACKAGES.find(
    (candidate) => candidate === packageName,
  );
}

export function isExactCodingAgentShrinkwrapEntry(
  lockPath: string,
  entry: { version?: string; resolved?: string },
): boolean {
  const packageName = codingAgentShrinkwrapPackageName(lockPath);
  if (!packageName || entry.version !== GOVERNED_RUNTIME_HOST_VERSION) return false;
  const tarballName = packageName.slice(packageName.indexOf("/") + 1);
  return (
    entry.resolved ===
    `https://registry.npmjs.org/${packageName}/-/${tarballName}-${GOVERNED_RUNTIME_HOST_VERSION}.tgz`
  );
}

export function gitRaw(
  sourceRoot: string,
  args: string[],
  env: Record<string, string> = {},
): string {
  try {
    return execFileSync("git", ["-C", sourceRoot, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_git_inspection_failed",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function git(sourceRoot: string, args: string[]): string {
  return gitRaw(sourceRoot, args).trim();
}

export function ownerPackageRoot(modulePath: string): {
  root: string;
  name: string;
  version?: string;
} {
  let cursor = lstatSync(modulePath).isDirectory()
    ? realpathSync(modulePath)
    : dirname(realpathSync(modulePath));
  for (;;) {
    const manifestPath = resolve(cursor, "package.json");
    if (existsSync(manifestPath)) {
      const parsed = readJsonNoFollow<{ name?: string; version?: string }>(
        manifestPath,
        "materialization_owner_manifest_invalid",
      );
      if (typeof parsed.name === "string" && parsed.name) {
        return { root: realpathSync(cursor), name: parsed.name, version: parsed.version };
      }
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_owner_not_found",
        `Cannot find owning package for ${modulePath}.`,
      );
    }
    cursor = parent;
  }
}

export function digestDirectory(root: string, excludedRelativePaths = new Set<string>()): string {
  const hash = createHash("sha256");
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const absolutePath = resolve(directory, entry.name);
      const relativePath = relative(root, absolutePath);
      if (excludedRelativePaths.has(relativePath.split(sep).join("/"))) continue;
      const stat = lstatSync(absolutePath);
      const mode = (stat.mode & 0o7777).toString(8);
      if (entry.isSymbolicLink()) {
        hash.update(`link\0${relativePath}\0${mode}\0${readlinkSync(absolutePath)}\0`);
      } else if (entry.isDirectory()) {
        hash.update(`dir\0${relativePath}\0${mode}\0`);
        visit(absolutePath);
      } else if (entry.isFile()) {
        hash.update(`file\0${relativePath}\0${mode}\0`);
        hash.update(
          readRegularFileNoFollow(absolutePath, "materialization_runtime_tree_file_invalid"),
        );
        hash.update("\0");
      } else {
        throw new GovernedRuntimeMaterializationError(
          "materialization_typebox_tree_invalid",
          `Unsupported filesystem entry in pinned Typebox tree: ${absolutePath}.`,
        );
      }
    }
  };
  visit(root);
  return hash.digest("hex");
}

export function pathInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return (
    rel === "" ||
    (Boolean(rel) && !rel.startsWith("..") && !rel.includes(`..${sep}`) && !isAbsolute(rel))
  );
}

export function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
