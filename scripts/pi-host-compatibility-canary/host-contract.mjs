import path from "node:path";
import { loadManifest, validateManifestDefinition } from "./manifest.mjs";
import { DEFAULT_MANIFEST_PATH } from "./paths.mjs";

// Read-only admission validates the full definition, not runtime execution readiness.
// Lexical cwd containment deliberately does not stat/dereference unrelated scenarios.
export function currentHostVersion(manifest, manifestPath) {
  const definition = validateManifestDefinition(manifest, manifestPath);
  for (const [index, scenario] of definition.scenarios.entries()) {
    const cwd = scenario.cwd;
    if (path.posix.isAbsolute(cwd) || path.win32.isAbsolute(cwd) || /[\\\0]/u.test(cwd)) {
      throw new Error(`scenarios[${index}].cwd must be a repository-relative directory`);
    }
    const normalized = path.posix.normalize(cwd);
    if (normalized === ".." || normalized.startsWith("../")) {
      throw new Error(`scenarios[${index}].cwd must stay within repository root`);
    }
  }
  // Never substitute a literal, environment candidate, or scaffold hostBaseline.
  const version = definition.profiles.current?.host.version;
  if (typeof version !== "string" || !version) {
    throw new Error("profiles.current.host.version must bind an exact current host version");
  }
  return version;
}

export function loadCurrentHostVersion(manifestPath = DEFAULT_MANIFEST_PATH) {
  return currentHostVersion(loadManifest(manifestPath), manifestPath);
}
