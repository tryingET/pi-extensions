import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  EVIDENCE_MARKER,
  MIN_GH,
  buildEvidenceBody,
  buildGhAttachArgs,
  discoverPackages,
  expectedGifFor,
  ghMeetsMinimum,
  parseGhVersion,
} from "./release-evidence.mjs";

test("parseGhVersion reads real gh --version output", () => {
  assert.deepEqual(parseGhVersion("gh version 2.99.0 (2026-09-02)\nhttps://github.com/cli/cli/releases/tag/v2.99.0\n"), {
    major: 2, minor: 99, patch: 0,
  });
  assert.equal(parseGhVersion("some other tool 1.2.3"), null);
  assert.equal(parseGhVersion(undefined), null);
});

test("ghMeetsMinimum enforces the --attach floor", () => {
  assert.equal(ghMeetsMinimum(parseGhVersion("gh version 2.98.0 (2026-08-21)")), false);
  assert.equal(ghMeetsMinimum(parseGhVersion(`gh version ${MIN_GH.major}.${MIN_GH.minor}.0 (x)`)), true);
  assert.equal(ghMeetsMinimum(parseGhVersion("gh version 3.0.1 (x)")), true);
  assert.equal(ghMeetsMinimum(null), false);
});

test("discoverPackages lists only directories holding tapes", () => {
  const root = mkdtempSync(join(tmpdir(), "evidence-tapes-"));
  try {
    mkdirSync(join(root, "pi-alpha"));
    writeFileSync(join(root, "pi-alpha", "demo.tape"), "Output out/demo.gif\n");
    mkdirSync(join(root, "pi-beta")); // no tape
    writeFileSync(join(root, "notes.md"), "not a package");
    assert.deepEqual(discoverPackages(root), ["pi-alpha"]);
    assert.deepEqual(discoverPackages(join(root, "missing")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("expectedGifFor follows the conventions layout", () => {
  assert.equal(expectedGifFor("tapes/pkg/demo.tape"), join("tapes", "pkg", "out", "demo.gif"));
});

function sampleItems() {
  return [
    { pkg: "pi-agent-registry", gif: "tapes/pi-agent-registry/out/fleet-lint-demo.gif", alt: "pi-agent-registry fleet-lint-demo — behavior at HEAD" },
    { pkg: "pi-agent-registry", gif: "tapes/pi-agent-registry/out/before/fleet-lint-demo.gif", alt: "pi-agent-registry fleet-lint-demo — behavior at origin/main (abc1234)" },
  ];
}

test("buildEvidenceBody carries marker, table, and inline refs with alt text", () => {
  const body = buildEvidenceBody({
    items: sampleItems(),
    baseRef: "origin/main",
    headRef: "main", headSha: "def5678",
    generatedAt: "2026-09-02T07:00:00.000Z",
    command: "just evidence 180",
  });
  assert.ok(body.includes(EVIDENCE_MARKER));
  assert.ok(body.includes("![pi-agent-registry fleet-lint-demo — behavior at HEAD](tapes/pi-agent-registry/out/fleet-lint-demo.gif)"));
  assert.ok(body.includes("| pi-agent-registry | fleet-lint-demo.gif | behavior at HEAD |"));
  assert.ok(body.includes("- head: `main (def5678)`"));
  assert.ok(body.includes("`just evidence 180`"));
});

test("attach args and body refs stay path-identical so gh rewrites in place", () => {
  const items = sampleItems();
  const body = buildEvidenceBody({ items, headRef: "main", generatedAt: "x", command: "just evidence 180" });
  const args = buildGhAttachArgs(items);
  assert.deepEqual(args.slice(0, 2), ["--attach", "tapes/pi-agent-registry/out/fleet-lint-demo.gif#pi-agent-registry fleet-lint-demo — behavior at HEAD"]);
  for (let i = 1; i < args.length; i += 2) {
    const gifPath = args[i].split("#")[0];
    assert.ok(body.includes(`](${gifPath})`), `attach path missing inline ref: ${gifPath}`);
  }
});
