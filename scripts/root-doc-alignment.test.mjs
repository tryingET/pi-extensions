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

function packagePathsInSection(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const headingIndexes = lines.flatMap((line, index) => (line === heading ? [index] : []));
  assert.equal(headingIndexes.length, 1, `Expected to find section heading exactly once: ${heading}`);

  const headingLevel = heading.match(/^(#+) /)?.[1].length;
  assert.ok(headingLevel, `Expected a Markdown heading: ${heading}`);

  const headingIndex = headingIndexes[0];
  let sectionEnd = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const nextHeadingLevel = lines[index].match(/^(#+) /)?.[1].length;
    if (nextHeadingLevel && nextHeadingLevel <= headingLevel) {
      sectionEnd = index;
      break;
    }
  }

  const entries = lines.slice(headingIndex + 1, sectionEnd).filter((line) => line.trim().length > 0);
  assert.ok(entries.length > 0, `${heading} must declare package paths or exactly "- none"`);

  const packagePaths = [];
  let noneCount = 0;
  for (const entry of entries) {
    if (entry === "- none") {
      noneCount += 1;
      continue;
    }

    const packageMatch = entry.match(/^- `(packages\/[^`]+)`(?: \(`[^`]+`\))?$/);
    assert.ok(packageMatch, `${heading} contains an invalid bucket entry: ${entry}`);
    packagePaths.push(packageMatch[1]);
  }

  if (packagePaths.length === 0) {
    assert.deepEqual(entries, ["- none"], `${heading} must represent an empty bucket as exactly "- none"`);
  } else {
    assert.equal(noneCount, 0, `${heading} must not mix "- none" with package paths`);
  }

  return packagePaths;
}

test("engineering review bucket parser is exact and fail-closed", () => {
  const heading = "### Bucket";
  assert.deepEqual(
    packagePathsInSection(
      `${heading}\n\n- \`packages/inside\`\n\n# Outside\n\n- \`packages/outside\``,
      heading,
    ),
    ["packages/inside"],
  );
  assert.throws(
    () => packagePathsInSection(`${heading} with suffix\n\n- \`packages/wrong\``, heading),
    /section heading exactly once/,
  );
  assert.throws(() => packagePathsInSection(`${heading}\n\n## Next`, heading), /must declare package paths/);
  assert.throws(
    () => packagePathsInSection(`${heading}\n\n- none\n- \`packages/mixed\``, heading),
    /must not mix/,
  );
  assert.throws(
    () => packagePathsInSection(`${heading}\n\n- packages\/unquoted`, heading),
    /invalid bucket entry/,
  );
});

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

  const bucketSections = [
    [
      "legacy-full",
      "### Legacy full surface (`docs/engineering.local.md` + `policy/engineering-lane.json`)",
    ],
    ["reduced-form", "### Reduced-form package-local surface (`docs/engineering.local.md` only)"],
    ["policy-only", "### Policy-only package-local surface (`policy/engineering-lane.json` only)"],
    ["none", "### No package-local engineering review surface today"],
  ];

  for (const [reviewForm, heading] of bucketSections) {
    const expected = audit.packages
      .filter((entry) => entry.reviewForm === reviewForm)
      .map((entry) => entry.path)
      .sort();
    const documented = packagePathsInSection(TECH_STACK_REVIEW, heading).sort();

    assert.deepEqual(
      documented,
      expected,
      `engineering review doc ${reviewForm} section should exactly match the live audit bucket`,
    );
  }
});
