import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveSocietyDbPath } from "../src/runtime/society-db-path.ts";

const disposableHome = path.join("disposable", "home");
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const productionRoots = ["extensions", "src"];
const maxProductionTypeScriptFiles = 1_000;
const actualConsumerFiles = [
  "extensions/society-orchestrator.ts",
  "extensions/runtime-footer.ts",
  "extensions/release-evidence-ak-adapter.ts",
  "src/loops/executor.ts",
  "src/runtime/autoresearch-manifest-campaign-supervision.ts",
  "src/runtime/autoresearch-live-supervision.ts",
  "src/runtime/autoresearch-self-hosting-supervision.ts",
];
const resolverOwnerFile = "src/runtime/society-db-path.ts";
const legacySocietyDbFallback =
  /path\.join\((?:[^()]|\([^()]*\))*["']society\.db["'](?:[^()]|\([^()]*\))*\)/;

function listProductionTypeScriptFiles() {
  const files = [];

  function visit(relativeDir) {
    const entries = readdirSync(path.join(packageRoot, relativeDir), { withFileTypes: true }).sort(
      (left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
    );

    for (const entry of entries) {
      const relativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        visit(relativePath);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        files.push(relativePath);
        assert.ok(
          files.length <= maxProductionTypeScriptFiles,
          `production TypeScript scan exceeded ${maxProductionTypeScriptFiles} files`,
        );
      }
    }
  }

  for (const root of productionRoots) visit(root);
  return files;
}

const productionTypeScriptFiles = listProductionTypeScriptFiles();
const productionSources = new Map(
  productionTypeScriptFiles.map((relativePath) => [
    relativePath,
    readFileSync(path.join(packageRoot, relativePath), "utf8"),
  ]),
);

test("society DB no-env fallback matches the installed AK default", () => {
  assert.equal(
    resolveSocietyDbPath({}, disposableHome),
    path.join(disposableHome, "ai-society", "society.v2.db"),
  );
});

test("society DB explicit environment precedence remains SOCIETY_DB then AK_DB", () => {
  assert.equal(
    resolveSocietyDbPath(
      { SOCIETY_DB: "society-explicit.db", AK_DB: "ak-explicit.db" },
      disposableHome,
    ),
    "society-explicit.db",
  );
  assert.equal(resolveSocietyDbPath({ AK_DB: "ak-explicit.db" }, disposableHome), "ak-explicit.db");
});

test("all production TypeScript files reject legacy society.db path fallbacks", () => {
  for (const [relativePath, source] of productionSources) {
    assert.doesNotMatch(
      source,
      legacySocietyDbFallback,
      `${relativePath} must not restore a legacy society.db path fallback`,
    );
  }
});

test("the society.v2.db fallback literal is owned only by the shared resolver", () => {
  const literalOwners = [];
  for (const [relativePath, source] of productionSources) {
    for (const _match of source.matchAll(/society\.v2\.db/g)) literalOwners.push(relativePath);
  }
  assert.deepEqual(literalOwners, [resolverOwnerFile]);
});

test("shipped runtime and release smoke reject stock SQLite and arbitrary society queries", () => {
  const shippedSupportFiles = ["README.md", "package.json", "scripts/release-smoke.mjs"];
  const sources = [
    ...productionSources,
    ...shippedSupportFiles.map((relativePath) => [
      relativePath,
      readFileSync(path.join(packageRoot, relativePath), "utf8"),
    ]),
  ];

  for (const [relativePath, source] of sources) {
    assert.doesNotMatch(source, /\bsqlite3\b/, `${relativePath} must not invoke stock sqlite3`);
    assert.doesNotMatch(
      source,
      /society_query/,
      `${relativePath} must not restore the arbitrary database-query tool`,
    );
  }
  for (const relativePath of ["README.md", "package.json"]) {
    const source = readFileSync(path.join(packageRoot, relativePath), "utf8");
    assert.doesNotMatch(source, /society\.db/, `${relativePath} must use current AK terminology`);
  }
});

test("all seven behaviorally used fallbacks call the shared resolver", () => {
  for (const relativePath of actualConsumerFiles) {
    const source = productionSources.get(relativePath);
    assert.ok(source, `${relativePath} must be included in the production scan`);
    assert.match(
      source,
      /import\s+\{\s*resolveSocietyDbPath\s*\}\s+from/,
      `${relativePath} must import the shared resolver`,
    );
    assert.match(
      source,
      /resolveSocietyDbPath\(\)/,
      `${relativePath} must call the shared resolver`,
    );
  }
});
