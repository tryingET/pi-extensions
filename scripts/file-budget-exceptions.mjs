/**
 * summary: "Owner-scoped file-budget exceptions policy contract, discovery, and validation."
 * read_when:
 *   - "Changing the exceptions manifest schema, discovery walk, or entry validation rules."
 */
import fs from "node:fs";
import path from "node:path";

export const FILE_BUDGET_EXCEPTIONS_POLICY = Object.freeze({
  // Repo-relative location of the owner-scoped exceptions manifest. Entry
  // paths are resolved relative to the repository root that contains this
  // policy directory, so a single manifest serves both repo-root audits and
  // per-package gate audits that run with --root <package>.
  relativePath: "policy/file-budget-exceptions.json",
  requiredFields: Object.freeze(["owner", "reason", "reopen_trigger"]),
  pathField: "path",
});

const EXCEPTION_ENTRY_KEYS = new Set([
  FILE_BUDGET_EXCEPTIONS_POLICY.pathField,
  ...FILE_BUDGET_EXCEPTIONS_POLICY.requiredFields,
]);

/**
 * Walk up from `startDir` looking for policy/file-budget-exceptions.json.
 * Returns the first existing policy path, or null when none is found.
 */
export function discoverExceptionsPolicyPath(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, ...FILE_BUDGET_EXCEPTIONS_POLICY.relativePath.split("/"));
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Not present at this level; keep walking up.
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * The repository root that exception entry paths resolve against: the parent
 * of the policy directory when the manifest lives under policy/, otherwise
 * the directory containing the manifest.
 */
export function exceptionsPolicyRepoRoot(policyPath) {
  const resolved = path.resolve(policyPath);
  const parent = path.dirname(resolved);
  return path.basename(parent) === "policy" ? path.dirname(parent) : parent;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateExceptionEntryShape(entry, index) {
  const label = `exceptions[${index}]`;
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return { path: label, category: "invalid_entry", message: "entry must be an object" };
  }
  for (const key of Object.keys(entry)) {
    if (!EXCEPTION_ENTRY_KEYS.has(key)) {
      return {
        path: label,
        category: "invalid_entry",
        message: `unknown field "${key}"; allowed fields are ${[...EXCEPTION_ENTRY_KEYS].sort().join(", ")}`,
      };
    }
  }
  for (const field of EXCEPTION_ENTRY_KEYS) {
    if (!Object.hasOwn(entry, field)) {
      return {
        path: label,
        category: "invalid_entry",
        message: `missing required field "${field}"`,
      };
    }
    if (!nonEmptyString(entry[field])) {
      return {
        path: label,
        category: "invalid_entry",
        message: `field "${field}" must be a non-empty string`,
      };
    }
  }
  const entryPath = entry[FILE_BUDGET_EXCEPTIONS_POLICY.pathField];
  if (entryPath.includes("\\")) {
    return { path: label, category: "invalid_entry", message: 'path must use "/" separators' };
  }
  if (entryPath.startsWith("/")) {
    return { path: label, category: "invalid_entry", message: "path must be repository-relative" };
  }
  const segments = entryPath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return {
      path: label,
      category: "invalid_entry",
      message: "path must be a normalized repository-relative path without . or .. segments",
    };
  }
  return null;
}

/**
 * Load and validate the exceptions manifest at `policyPath`.
 * Returns { entries: Array<{path, owner, reason, reopenTrigger}>, errors:
 * Array<{path, category, message}> }. Shape-invalid manifests never yield
 * entries; per-entry errors do not block other valid entries from loading.
 */
export function loadFileBudgetExceptionsPolicy(policyPath) {
  const errors = [];
  const entries = [];
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(path.resolve(policyPath), "utf8"));
  } catch (error) {
    return {
      entries,
      errors: [
        {
          path: policyPath,
          category: "invalid_json",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      entries,
      errors: [{ path: policyPath, category: "invalid_shape", message: "top level must be an object" }],
    };
  }
  const topKeys = Object.keys(parsed);
  if (!topKeys.includes("exceptions")) {
    return {
      entries,
      errors: [
        { path: policyPath, category: "invalid_shape", message: 'missing required "exceptions" array' },
      ],
    };
  }
  for (const key of topKeys) {
    if (key !== "exceptions" && key !== "notes") {
      return {
        entries,
        errors: [
          {
            path: policyPath,
            category: "invalid_shape",
            message: `unknown top-level field "${key}"; allowed fields are exceptions, notes`,
          },
        ],
      };
    }
  }
  if (!Array.isArray(parsed.exceptions)) {
    return {
      entries,
      errors: [{ path: policyPath, category: "invalid_shape", message: '"exceptions" must be an array' }],
    };
  }
  if (topKeys.includes("notes") && !nonEmptyString(parsed.notes)) {
    return {
      entries,
      errors: [
        { path: policyPath, category: "invalid_shape", message: '"notes" must be a non-empty string' },
      ],
    };
  }

  const seen = new Set();
  for (let index = 0; index < parsed.exceptions.length; index += 1) {
    const entry = parsed.exceptions[index];
    const shapeError = validateExceptionEntryShape(entry, index);
    if (shapeError) {
      errors.push(shapeError);
      continue;
    }
    const entryPath = entry[FILE_BUDGET_EXCEPTIONS_POLICY.pathField];
    if (seen.has(entryPath)) {
      errors.push({
        path: `exceptions[${index}]`,
        category: "duplicate",
        message: `duplicate exception path "${entryPath}"`,
      });
      continue;
    }
    seen.add(entryPath);
    entries.push({
      path: entryPath,
      owner: entry.owner,
      reason: entry.reason,
      reopenTrigger: entry.reopen_trigger,
    });
  }

  return { entries, errors };
}
