// ---
// summary: "Checks root documentation against live release-component inventory and engineering review audit results."
// read_when:
//   - "Updating root package routing, capability docs, or engineering review snapshots."
// ---
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const README = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
const README_TERSE = fs.readFileSync(path.join(ROOT, "README.terse.md"), "utf8");
const ROOT_CAPABILITIES = fs.readFileSync(path.join(ROOT, "docs", "project", "root-capabilities.md"), "utf8");
const TECH_STACK_REVIEW = fs.readFileSync(
  path.join(ROOT, "docs", "project", "engineering-review-surfaces.md"),
  "utf8",
);

function runJson(script, args = []) {
  return JSON.parse(
    execFileSync(process.execPath, [path.join(ROOT, "scripts", script), ...args], {
      cwd: ROOT,
      encoding: "utf8",
    }),
  );
}

function assertContains(haystack, needle, message) {
  assert.equal(haystack.includes(needle), true, message ?? `Expected to find ${needle}`);
}

test("README root routing surfaces mention pi-autoresearch and live inventory commands", () => {
  const components = runJson("release-components.mjs", ["list", "--json"]);
  assert.ok(components.some((entry) => entry.packagePath === "packages/pi-autoresearch"));

  assertContains(README, "`packages/pi-autoresearch`", "README.md should mention pi-autoresearch routing");
  assertContains(
    README,
    "node ./scripts/release-components.mjs list --json",
    "README.md should point operators at live release-component inventory",
  );
  assertContains(
    README_TERSE,
    "| `pi-autoresearch` |",
    "README.terse.md package map should include pi-autoresearch",
  );
});

test("root capabilities points operators to the live inventory and audit helpers", () => {
  assertContains(
    ROOT_CAPABILITIES,
    "scripts/release-components.mjs",
    "root-capabilities.md should reference the live release-component inventory helper",
  );
  assertContains(
    ROOT_CAPABILITIES,
    "scripts/engineering-review-surfaces.mjs",
    "root-capabilities.md should reference the live engineering audit helper",
  );
});

test("engineering review doc snapshot matches the live audit summary and package buckets", () => {
  const audit = runJson("engineering-review-surfaces.mjs", ["--json"]);

  assertContains(
    TECH_STACK_REVIEW,
    `- package entries audited: \`${audit.summary.packageCount}\``,
    "engineering review doc should match live packageCount",
  );
  assertContains(
    TECH_STACK_REVIEW,
    `- legacy-full: \`${audit.summary.legacyFullCount}\``,
    "engineering review doc should match live legacyFullCount",
  );
  assertContains(
    TECH_STACK_REVIEW,
    `- reduced-form: \`${audit.summary.reducedFormCount}\``,
    "engineering review doc should match live reducedFormCount",
  );
  assertContains(
    TECH_STACK_REVIEW,
    `- policy-only: \`${audit.summary.policyOnlyCount}\``,
    "engineering review doc should match live policyOnlyCount",
  );
  assertContains(
    TECH_STACK_REVIEW,
    `- no local surface: \`${audit.summary.noLocalSurfaceCount}\``,
    "engineering review doc should match live noLocalSurfaceCount",
  );

  const legacyFull = audit.packages.filter((entry) => entry.reviewForm === "legacy-full").map((entry) => entry.path);
  const reducedForm = audit.packages.filter((entry) => entry.reviewForm === "reduced-form").map((entry) => entry.path);
  const noLocalSurface = audit.packages.filter((entry) => entry.reviewForm === "none").map((entry) => entry.path);

  for (const packagePath of legacyFull) {
    assertContains(
      TECH_STACK_REVIEW,
      `- \`${packagePath}\``,
      `engineering review doc should list legacy-full package ${packagePath}`,
    );
  }

  for (const packagePath of reducedForm) {
    assertContains(
      TECH_STACK_REVIEW,
      `- \`${packagePath}\``,
      `engineering review doc should list reduced-form package ${packagePath}`,
    );
  }

  for (const packagePath of noLocalSurface) {
    assertContains(
      TECH_STACK_REVIEW,
      `- \`${packagePath}\``,
      `engineering review doc should list no-local-surface package ${packagePath}`,
    );
  }
});
