// ---
// summary: "Defines repository-root paths and canonical containment checks for the Pi host compatibility canary."
// read_when:
//   - "Changing canary manifest path resolution or repository containment behavior."
// ---
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_MANIFEST_PATH = path.join(ROOT, "policy", "pi-host-compatibility-canary.json");
export const CANONICAL_ROOT = realpathSync(ROOT);

export function resolveContainedRepoPath(declaredPath, fieldName) {
  const resolved = path.resolve(ROOT, declaredPath);
  if (!existsSync(resolved)) throw new Error(`${fieldName} does not exist: ${declaredPath}`);
  const canonical = realpathSync(resolved);
  const relativePath = path.relative(CANONICAL_ROOT, canonical);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`${fieldName} must stay within repository root: ${declaredPath}`);
  }
  return canonical;
}
