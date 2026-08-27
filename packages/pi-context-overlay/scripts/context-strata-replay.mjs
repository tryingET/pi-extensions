// ---
// summary: "CLI for the context-strata profiler: reads a Pi session JSONL and emits strata.json, requests.csv, speedscope.json, and the self-contained context-strata.html artifact."
// read_when:
//   - "Changing CLI argument handling, output emission, or HTML template injection."
// ---
// Model lives in scripts/context-strata-lib.mjs; this file is I/O + arg plumbing.
//
// Usage:
//   node context-strata-replay.mjs <session.jsonl> [--out DIR] [--html-out FILE] [--window N]
//     [--children <glob of candidate child session .jsonl files>]

import { globSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { childLinkMatches, rollupChildren } from "./context-strata-forks.mjs";
import { buildStrataModel } from "./context-strata-lib.mjs";

const argv = process.argv.slice(2);
const file = argv[0];
if (!file || file.startsWith("--")) {
  console.error(
    "usage: node context-strata-replay.mjs <session.jsonl> [--out DIR] [--html-out FILE] [--window N]",
  );
  process.exit(1);
}
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const OUT_DIR = resolve(argOf("--out", join(tmpdir(), "context-strata")));
const HTML_OUT = argOf("--html-out", join(OUT_DIR, "context-strata.html"));
mkdirSync(OUT_DIR, { recursive: true });

const sessionText = readFileSync(resolve(file), "utf8");
const { strata, speedscope, requestsCsv } = buildStrataModel(sessionText, {
  contextWindow: Number(argOf("--window", "200000")),
  sourceFile: basename(file),
});
strata.meta.file = basename(file);

// ---------- optional child-arena rollup (attribution only, never modeled) ----------
const childrenGlob = argOf("--children", null);
if (childrenGlob !== null) {
  const files = globSync(childrenGlob).filter((f) => f.endsWith(".jsonl"));
  // The runtime records the parent path as it saw it; canonicalize both spellings so a
  // symlinked invocation still links. Matching stays exact — no inference.
  const resolvedParent = resolve(file);
  let canonicalParent = null;
  try {
    canonicalParent = realpathSync(resolvedParent);
  } catch {
    canonicalParent = null;
  }
  const matchesParent = (header) =>
    childLinkMatches(header, resolvedParent) ||
    (canonicalParent !== null && childLinkMatches(header, canonicalParent));
  const rollup = rollupChildren({ files, matchesParent });
  strata.meta.forks = {
    ...strata.meta.forks,
    children: rollup.children,
    childrenOnChainCostUsd: rollup.childrenOnChainCostUsd,
    childrenScan: rollup.scan,
    childrenDepth: rollup.depth,
  };
  console.log(
    `children: ${rollup.children.length} direct (scan ${rollup.scan.scanned}: matched ${rollup.scan.matched}, unmatched ${rollup.scan.unmatched}, unreadable ${rollup.scan.unreadable}) on-chain $${rollup.childrenOnChainCostUsd.toFixed(2)} — attribution only, not modeled`,
  );
}

writeFileSync(join(OUT_DIR, "strata.json"), JSON.stringify(strata));
writeFileSync(join(OUT_DIR, "requests.csv"), requestsCsv);
writeFileSync(join(OUT_DIR, "speedscope.json"), JSON.stringify(speedscope));

// ---------- generate the visual artifact ----------
const templatePath = fileURLToPath(new URL("./context-strata.template.html", import.meta.url));
let html = readFileSync(templatePath, "utf8");
// escape "<" so embedded labels can never terminate the <script> block
const embedded = JSON.stringify(strata).replaceAll("<", "\\u003c");
if (!html.includes("__STRATA_JSON__")) {
  console.error("template placeholder __STRATA_JSON__ not found");
  process.exit(1);
}
html = html.replace("__STRATA_JSON__", embedded);
writeFileSync(HTML_OUT, html);

const m = strata.meta;
console.log(`session: ${basename(file)}`);
console.log(`requests=${m.requests} turns=${m.turns} faults=${m.faults.length}`);
if (m.excludedBranches.requests > 0) {
  console.log(
    `excluded branches: ${m.excludedBranches.records} records / ${m.excludedBranches.requests} requests / $${m.excludedBranches.costTotal.toFixed(2)} (off-chain, not modeled)`,
  );
}
console.log(
  `cache hit: ${(m.cacheHit * 100).toFixed(1)}%  total $${m.costTotal.toFixed(2)} (warm $${m.costCacheRead.toFixed(2)})`,
);
console.log(`waste: ${(m.wasteRatio * 100).toFixed(1)}% of pathed tool token-turns are mined-dead`);
console.log(`calibration: est tokens x ${m.calibrationFactor.toFixed(3)} = last measured request`);
console.log(`out: ${OUT_DIR}`);
console.log(`html: ${HTML_OUT}`);
