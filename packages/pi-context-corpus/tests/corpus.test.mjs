// ---
// summary: "Pins corpus index building, strata classification, content-free outputs, HTML switcher, named jq projections, and CLI fail-closed behavior."
// read_when:
//   - "Changing the index schema, projections dispatch, fixtures, or CLI contract."
// ---
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { renderIndexHtml } from "../lib/corpus-html.mjs";
import { findStrataFiles, topCategories } from "../lib/corpus-index.mjs";

const PKG = fileURLToPath(new URL("..", import.meta.url));
const BIN = join(PKG, "bin", "corpus.mjs");
const JQ = join(PKG, "projections", "corpus.jq");
const FIXTURES = join(PKG, "tests", "fixtures");

const ID_FAULTED = "2026-01-01T00-00-00-000Z_fixture-faulted";
const ID_LINEAR = "2026-01-02T00-00-00-000Z_fixture-linear";
const ID_NOREQS = "2026-01-03T00-00-00-000Z_fixture-noreqs";
const ID_CORRUPT = "corrupt";
const ID_ADDITIVE = "2026-09-01T00-00-00-000Z_fixture-additive";
const ID_UNSUPPORTED = "unsupported"; // id = location: unsupported-major contents are not trusted for identity
const SECRET_MARKER = "SECRETMARKER-zq9";
const ALL_NAMES = ["occupancy", "faults", "spend", "ghosts", "runway", "sessions", "topfiles"];

const run = (args, opts = {}) =>
  execFileSync(process.execPath, [BIN, ...args], { encoding: "utf8", ...opts });
const runStatus = (args, opts = {}) =>
  spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", ...opts });

/** Assemble a fresh corpus dir from the fixtures, build the index, return both. */
function makeFixtureCorpus(t) {
  const corpusDir = mkdtempSync(join(tmpdir(), "pi-context-corpus-test-"));
  t.after(() => rmSync(corpusDir, { recursive: true, force: true }));
  cpSync(join(FIXTURES, "sessions"), join(corpusDir, "sessions"), { recursive: true });
  const out = run(["index", corpusDir]);
  assert.match(out, /sessions \(ok=3 empty=1 failed=1 unsupported=1\)/);
  const index = JSON.parse(readFileSync(join(corpusDir, "corpus", "index.json"), "utf8"));
  return { corpusDir, index };
}

const readIndexHtml = (corpusDir) => readFileSync(join(corpusDir, "corpus", "index.html"), "utf8");
const project = (name, file, cwd) => JSON.parse(run(["project", name, file], { cwd }));

test("index build: linear, faulted, and failed fixtures are all listed, never dropped", (t) => {
  const { index } = makeFixtureCorpus(t);
  assert.deepEqual(
    index.sessions.map((s) => s.id),
    [ID_FAULTED, ID_ADDITIVE, ID_LINEAR, ID_NOREQS, ID_CORRUPT, ID_UNSUPPORTED],
  );
  const byId = Object.fromEntries(index.sessions.map((s) => [s.id, s]));
  assert.equal(byId[ID_CORRUPT].replayStatus, "failed");
  assert.equal(byId[ID_CORRUPT].html, null);
  assert.match(byId[ID_CORRUPT].error, /^invalid JSON:/);
  assert.equal(byId[ID_NOREQS].replayStatus, "empty");
});

test("IR gate: newer schema major is listed as unsupported, never dropped, never fact-indexed", (t) => {
  const { corpusDir, index } = makeFixtureCorpus(t);
  const entry = index.sessions.find((s) => s.id === ID_UNSUPPORTED);
  // distinct state: not "failed" (that would mislabel a producer problem)
  assert.equal(entry.replayStatus, "unsupported");
  assert.match(entry.error, /schemaVersion 2 > supported 1; upgrade the corpus/);
  // no facts consumed from a schema the consumer cannot verify
  assert.equal(entry.requests, undefined);
  assert.equal(entry.onChainCostUsd, undefined);
  // fact projections exclude it; the inventory projection keeps it visible
  const spend = project("spend", "corpus/index.json", corpusDir);
  assert.ok(!spend.some((s) => s.id === ID_UNSUPPORTED));
  const sessions = project("sessions", "corpus/index.json", corpusDir);
  assert.equal(sessions.find((s) => s.id === ID_UNSUPPORTED)?.replayStatus, "unsupported");
  // terminal sort position (with failed), never interleaved with fact-bearing rows
  const ids = index.sessions.map((s) => s.id);
  assert.ok(ids.indexOf(ID_UNSUPPORTED) > ids.indexOf(ID_NOREQS));
});

test("IR gate: unknown additive fields are ignored (unknown-field tolerance)", (t) => {
  const { index } = makeFixtureCorpus(t);
  const entry = index.sessions.find((s) => s.id === ID_ADDITIVE);
  assert.equal(entry.replayStatus, "ok");
  assert.equal(entry.requests, 1);
  assert.equal(entry.onChainCostUsd, 0.04);
  // no unknown-field content leaks into the index beyond the pinned contract
  assert.deepEqual(Object.keys(entry).sort(), [
    "cacheHitShare",
    "childrenCount",
    "childrenOnChainCostUsd",
    "contextWindow",
    "cwd",
    "faults",
    "forks",
    "ghostShareOfToolTokenTurns",
    "html",
    "id",
    "lastFaultR",
    "lastResidentEst",
    "models",
    "onChainCostUsd",
    "replayStatus",
    "requests",
    "runwayRequestsRemaining",
    "source",
    "sourceSession",
    "topCategories",
    "turns",
    "warmthAgreementMae",
  ]);
});

test("index ordering: build-time, cost-descending, failed sessions last, stable ties", (t) => {
  const { index } = makeFixtureCorpus(t);
  // fixture costs: faulted 0.09 > linear 0.03 > noreqs 0; corrupt is failed (terminal position)
  // fixture costs: faulted 0.09 > additive 0.04 > linear 0.03 > noreqs 0;
  // corrupt (failed) and future (unsupported) take terminal positions
  assert.deepEqual(
    index.sessions.map((s) => s.id),
    [ID_FAULTED, ID_ADDITIVE, ID_LINEAR, ID_NOREQS, ID_CORRUPT, ID_UNSUPPORTED],
  );
  const costs = index.sessions
    .filter((s) => s.replayStatus !== "failed")
    .map((s) => s.onChainCostUsd);
  assert.deepEqual(
    [...costs].sort((a, b) => b - a),
    costs,
    "ok rows must be cost-descending",
  );
});

test("index build: linear entry matches the pinned data contract exactly", (t) => {
  const { index } = makeFixtureCorpus(t);
  const linear = index.sessions.find((s) => s.id === ID_LINEAR);
  assert.deepEqual(linear, {
    id: ID_LINEAR,
    source: "sessions/linear/strata.json",
    sourceSession: null,
    cwd: "/home/op/x",
    replayStatus: "ok",
    html: "../sessions/linear/context-strata.html",
    models: ["anthropic/claude-sonnet-4-5"],
    requests: 2,
    turns: 1,
    faults: 0,
    lastFaultR: null,
    onChainCostUsd: 0.03,
    cacheHitShare: 0.6666666666666666,
    warmthAgreementMae: 0.05,
    forks: 0,
    childrenCount: null,
    childrenOnChainCostUsd: null,
    lastResidentEst: 1200,
    contextWindow: 200000,
    runwayRequestsRemaining: 1988,
    ghostShareOfToolTokenTurns: 0,
    topCategories: [
      { id: "toolResult", share: 0.75 },
      { id: "agents", share: 0.15 },
      { id: "toolCall", share: 0.08 },
      { id: "assistantText", share: 0.01 },
      { id: "user", share: 0.01 },
    ],
  });
  const faulted = index.sessions.find((s) => s.id === ID_FAULTED);
  assert.equal(faulted.faults, 1);
  assert.equal(faulted.lastFaultR, 1);
  assert.equal(faulted.runwayRequestsRemaining, null);
  assert.deepEqual(faulted.models, ["anthropic/claude-sonnet-4-5", "openai/gpt-5.2"]);
  assert.deepEqual(faulted.topCategories, [
    { id: "system", share: 0.48 },
    { id: "assistantText", share: 0.2 },
    { id: "toolCall", share: 0.2 },
    { id: "toolResult", share: 0.08 },
    { id: "summary", share: 0.04 },
  ]);
});

test("content-free: secret-marker text in fixture strata labels never reaches index.json or index.html", (t) => {
  const { corpusDir, index } = makeFixtureCorpus(t);
  const indexText = JSON.stringify(index);
  const htmlText = readIndexHtml(corpusDir);
  const sourceText = readFileSync(join(FIXTURES, "sessions", "linear", "strata.json"), "utf8");
  assert.ok(sourceText.includes(SECRET_MARKER), "fixture must actually contain the marker");
  assert.ok(!indexText.includes(SECRET_MARKER), "marker must not appear in index.json");
  assert.ok(!htmlText.includes(SECRET_MARKER), "marker must not appear in index.html");
});

test("html switcher: ok rows link to per-session html; failed rows carry no link; embed escapes <", (t) => {
  const { corpusDir } = makeFixtureCorpus(t);
  const html = readIndexHtml(corpusDir);
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...links].sort(), [
    "../sessions/faulted/context-strata.html",
    "../sessions/linear/context-strata.html",
  ]);
  assert.ok(!html.includes('href="../sessions/corrupt'));
  assert.ok(!html.includes('href="../sessions/noreqs'));

  // embed escaping unit: raw `<` in any id/label can never terminate the JSON script block
  const hostile = renderIndexHtml({
    generatedAt: 0,
    corpusDir: "x",
    sessions: [
      {
        id: "<script>alert(1)</script>",
        source: "s/strata.json",
        replayStatus: "ok",
        html: null,
        models: [],
        requests: 1,
        turns: 1,
        faults: 0,
        lastFaultR: null,
        onChainCostUsd: 0,
        cacheHitShare: 0,
        warmthAgreementMae: 0,
        forks: 0,
        lastResidentEst: 0,
        contextWindow: 0,
        runwayRequestsRemaining: null,
        ghostShareOfToolTokenTurns: 0,
        topCategories: [],
      },
    ],
  });
  assert.ok(!hostile.includes("<script>alert"), "raw <script> must be escaped in the embed");
  assert.ok(hostile.includes("\\u003cscript>alert(1)\\u003c/script>"));
});

test("projection: sessions — compact overview of every session", (t) => {
  const { corpusDir } = makeFixtureCorpus(t);
  const out = project("sessions", "corpus/index.json", corpusDir);
  assert.deepEqual(out, [
    { id: ID_FAULTED, replayStatus: "ok", requests: 3, turns: 2, onChainCostUsd: 0.09 },
    {
      id: ID_ADDITIVE,
      replayStatus: "ok",
      requests: 1,
      turns: 1,
      onChainCostUsd: 0.04,
    },
    { id: ID_LINEAR, replayStatus: "ok", requests: 2, turns: 1, onChainCostUsd: 0.03 },
    { id: ID_NOREQS, replayStatus: "empty", requests: 0, turns: 1, onChainCostUsd: 0 },
    { id: ID_CORRUPT, replayStatus: "failed", requests: null, turns: null, onChainCostUsd: null },
    {
      id: ID_UNSUPPORTED,
      replayStatus: "unsupported",
      requests: null,
      turns: null,
      onChainCostUsd: null,
    },
  ]);
});

test("projection: occupancy — per-session last resident + window", (t) => {
  const { corpusDir } = makeFixtureCorpus(t);
  const out = project("occupancy", "corpus/index.json", corpusDir);
  assert.deepEqual(out, [
    { id: ID_FAULTED, lastResidentEst: 400, contextWindow: 200000 },
    { id: ID_ADDITIVE, lastResidentEst: 20, contextWindow: 200000 },
    { id: ID_LINEAR, lastResidentEst: 1200, contextWindow: 200000 },
    { id: ID_NOREQS, lastResidentEst: 0, contextWindow: 200000 },
  ]);
});

test("projection: faults — count + last fault request", (t) => {
  const { corpusDir } = makeFixtureCorpus(t);
  const out = project("faults", "corpus/index.json", corpusDir);
  assert.deepEqual(out, [{ id: ID_FAULTED, faults: 1, lastFaultR: 1 }]);
});

test("projection: spend — on-chain $ (sum-of-reported) + cache-hit share", (t) => {
  const { corpusDir } = makeFixtureCorpus(t);
  const out = project("spend", "corpus/index.json", corpusDir);
  assert.deepEqual(out, [
    {
      id: ID_FAULTED,
      onChainCostUsd: 0.09,
      childrenCount: 1,
      childrenOnChainCostUsd: 7.5,
      inclusiveOnChainCostUsd: 7.59,
      cacheHitShare: 0.6,
    },
    {
      id: ID_ADDITIVE,
      onChainCostUsd: 0.04,
      childrenCount: 0,
      childrenOnChainCostUsd: 0,
      inclusiveOnChainCostUsd: 0.04,
      cacheHitShare: 0.5,
    },
    {
      id: ID_LINEAR,
      onChainCostUsd: 0.03,
      childrenCount: 0,
      childrenOnChainCostUsd: 0,
      inclusiveOnChainCostUsd: 0.03,
      cacheHitShare: 0.6666666666666666,
    },
    {
      id: ID_NOREQS,
      onChainCostUsd: 0,
      childrenCount: 0,
      childrenOnChainCostUsd: 0,
      inclusiveOnChainCostUsd: 0,
      cacheHitShare: 0,
    },
  ]);
});

test("projection: ghosts — ranked by mined-dead share (stable desc)", (t) => {
  const { corpusDir } = makeFixtureCorpus(t);
  const out = project("ghosts", "corpus/index.json", corpusDir);
  assert.deepEqual(out, [
    { id: ID_FAULTED, ghostShareOfToolTokenTurns: 0.5 },
    // jq sort_by is stable; `reverse` flips ties too (noreqs, linear, additive)
    { id: ID_NOREQS, ghostShareOfToolTokenTurns: 0 },
    { id: ID_LINEAR, ghostShareOfToolTokenTurns: 0 },
    { id: ID_ADDITIVE, ghostShareOfToolTokenTurns: 0 },
  ]);
});

test("projection: runway — ranked by requests-until-fault, nulls excluded", (t) => {
  const { corpusDir } = makeFixtureCorpus(t);
  const out = project("runway", "corpus/index.json", corpusDir);
  assert.deepEqual(out, [
    { id: ID_ADDITIVE, runwayRequestsRemaining: 100, lastResidentEst: 20, contextWindow: 200000 },
    { id: ID_LINEAR, runwayRequestsRemaining: 1988, lastResidentEst: 1200, contextWindow: 200000 },
  ]);
});

test("projection: topfiles — path-qualified, ranked, bounded (input: one strata.json)", () => {
  const out = project("topfiles", join(FIXTURES, "strata-topfiles.json"), process.cwd());
  assert.deepEqual(out, [
    {
      path: "/repo/docs/long-guide.md",
      cat: "toolResult",
      label: "read",
      tokens: 2000,
      birthR: 0,
      freedR: 3,
      tokenTurns: 8000,
      dead: true,
    },
    {
      path: "/repo/notes.md",
      cat: "toolResult",
      label: "read",
      tokens: 500,
      birthR: 0,
      freedR: 2,
      tokenTurns: 1500,
      dead: false,
    },
    {
      path: "/repo/src/main.ts",
      cat: "toolCall",
      label: "read",
      tokens: 100,
      birthR: 1,
      freedR: 3,
      tokenTurns: 300,
      dead: false,
    },
    {
      path: "/repo/src/util.ts",
      cat: "toolCall",
      label: "read",
      tokens: 100,
      birthR: 2,
      freedR: 3,
      tokenTurns: 200,
      dead: false,
    },
  ]);
  // bounded even if more than 10 path-qualified items exist
  const many = {
    items: Array.from({ length: 15 }, (_, i) => ({
      c: "toolResult",
      l: "read",
      p: `/f/${i}`,
      t: 1,
      b: 0,
      f: 0,
      tt: i + 1,
      d: 0,
      r: 0,
    })),
  };
  const root = mkdtempSync(join(tmpdir(), "pi-context-corpus-top-"));
  try {
    const file = join(root, "many.json");
    writeFileSync(file, JSON.stringify(many));
    const bounded = project("topfiles", file, process.cwd());
    assert.equal(bounded.length, 10);
    assert.deepEqual(
      bounded.map((x) => x.tokenTurns),
      [15, 14, 13, 12, 11, 10, 9, 8, 7, 6],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI: unknown projection fails closed with the listing; jq dispatch and CLI stay in sync", () => {
  const missing = runStatus(["project", "nope", join(FIXTURES, "strata-topfiles.json")]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, new RegExp(`available: ${ALL_NAMES.join(", ")}`));
  const noName = runStatus(["project"]);
  assert.notEqual(noName.status, 0);
  assert.match(noName.stderr, /available projections/);

  const jqText = readFileSync(JQ, "utf8");
  const dispatched = [...jqText.matchAll(/\$p == "([a-z]+)"/g)].map((m) => m[1]);
  const binText = readFileSync(BIN, "utf8");
  const declaredMatch = /PROJECTION_NAMES = \[([\s\S]*?)\]/.exec(binText);
  assert.ok(declaredMatch, "bin/corpus.mjs must declare PROJECTION_NAMES");
  const declared = [...declaredMatch[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(dispatched, declared, "jq dispatch names must equal CLI PROJECTION_NAMES");
  const listingMatch = /def projection_names:\s*\[([\s\S]*?)\];/.exec(jqText);
  assert.ok(listingMatch, "projections/corpus.jq must declare projection_names");
  const listed = [...listingMatch[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(listed, dispatched, "projection_names listing must equal dispatched names");
});

test("CLI: missing corpus dir and bad batch flags fail closed", () => {
  const missing = runStatus(["index", "/nonexistent/pi-context-corpus-dir"]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /corpus dir not found/);
  const noReplay = runStatus(["index", process.cwd(), "--sessions", "*.jsonl"]);
  assert.notEqual(noReplay.status, 0);
  assert.match(noReplay.stderr, /--sessions requires --replay-script/);
  const emptyGlob = runStatus([
    "index",
    process.cwd(),
    "--sessions",
    "no-such-dir/*.jsonl",
    "--replay-script",
    BIN,
  ]);
  assert.notEqual(emptyGlob.status, 0);
  assert.match(emptyGlob.stderr, /matched no \.jsonl files/);
});

test("batch orchestration: shells out to the replay script; failed replays stay listed", (t) => {
  const root = mkdtempSync(join(tmpdir(), "pi-context-corpus-batch-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "a.jsonl"), "{}\n");
  writeFileSync(join(root, "src", "broken.jsonl"), "{}\n");
  const stub = join(root, "stub-replay.mjs");
  writeFileSync(
    stub,
    `import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
const argv = process.argv.slice(2);
const outDir = argv[argv.indexOf("--out") + 1];
const sessionFile = argv[0];
if (basename(sessionFile).startsWith("broken")) process.exit(3);
mkdirSync(outDir, { recursive: true });
const strata = {
  meta: {
    file: basename(sessionFile), requests: 1, turns: 1, costTotal: 0.01, cacheHit: 0.5,
    faults: [], runway: { residentLast: 10, contextWindow: 100, requestsRemaining: 90 },
    warmthAgreement: { n: 1, mae: 0 }, forks: { count: 0 },
    modelChanges: [{ r: 0, model: "stub/model" }], tokenTurns: 10, wasteRatio: 0,
  },
  requests: [{}],
  items: [{ c: "user", l: "u", t: 10, b: 0, f: 0, tt: 10, d: 0, r: 0 }],
};
writeFileSync(join(outDir, "strata.json"), JSON.stringify(strata));
writeFileSync(join(outDir, "context-strata.html"), "<!doctype html><title>stub</title>");
`,
  );

  const out = run(
    ["index", ".", "--sessions", "src/*.jsonl", "--replay-script", "stub-replay.mjs"],
    {
      cwd: root,
    },
  );
  assert.match(out, /sessions \(ok=1 empty=0 failed=1 unsupported=0\)/);
  const index = JSON.parse(readFileSync(join(root, "corpus", "index.json"), "utf8"));
  assert.deepEqual(
    index.sessions.map((s) => s.id),
    ["a", "broken"],
  );
  assert.deepEqual(index.sessions[0], {
    id: "a",
    source: "a/strata.json",
    sourceSession: "src/a.jsonl",
    cwd: null,
    replayStatus: "ok",
    html: "../a/context-strata.html",
    models: ["stub/model"],
    requests: 1,
    turns: 1,
    faults: 0,
    lastFaultR: null,
    childrenCount: null,
    childrenOnChainCostUsd: null,
    onChainCostUsd: 0.01,
    cacheHitShare: 0.5,
    warmthAgreementMae: 0,
    forks: 0,
    lastResidentEst: 10,
    contextWindow: 100,
    runwayRequestsRemaining: 90,
    ghostShareOfToolTokenTurns: 0,
    topCategories: [{ id: "user", share: 1 }],
  });
  assert.deepEqual(index.sessions[1], {
    id: "broken",
    source: null,
    sourceSession: "src/broken.jsonl",
    cwd: null,
    replayStatus: "failed",
    html: null,
    error: "replay exited non-zero",
  });
});

test("discovery: node_modules and generated corpus dirs are skipped", (t) => {
  const root = mkdtempSync(join(tmpdir(), "pi-context-corpus-scan-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ["sessions/keep", "node_modules/pkg", "corpus"]) {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, "strata.json"), "{}");
  }
  assert.deepEqual(findStrataFiles(root), [join(root, "sessions", "keep", "strata.json")]);
});

test("topCategories: bounded to 5, deterministic ties, zero-turn items ignored", () => {
  const items = [];
  for (let i = 0; i < 7; i++) items.push({ c: `cat${i}`, tt: 10 });
  items.push({ c: "zero", tt: 0 }, { c: "neg", tt: -5 }, { c: "missing" });
  assert.deepEqual(
    topCategories({ items }).map((c) => c.id),
    ["cat0", "cat1", "cat2", "cat3", "cat4"],
  );
  assert.deepEqual(topCategories({ items: [] }), []);
});

test("incremental batch runs carry forward previously recorded session provenance", (t) => {
  const root = mkdtempSync(join(tmpdir(), "pi-context-corpus-incr-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src"), { recursive: true });
  for (const name of ["one", "two"]) writeFileSync(join(root, "src", `${name}.jsonl`), "{}\n");
  const stub = join(root, "stub-replay.mjs");
  writeFileSync(
    stub,
    `import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
const argv = process.argv.slice(2);
const outDir = argv[argv.indexOf("--out") + 1];
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "strata.json"), JSON.stringify({
  meta: { file: basename(argv[0]), requests: 1, turns: 1, costTotal: 0.01, cacheHit: 0.5,
    faults: [], runway: { residentLast: 10, contextWindow: 100, requestsRemaining: 90 },
    warmthAgreement: { n: 1, mae: 0 }, forks: { count: 0 }, modelChanges: [], tokenTurns: 10, wasteRatio: 0 },
  requests: [{}], items: [],
}));
`,
  );

  // run 1: index session one only
  run(["index", ".", "--sessions", "src/one.jsonl", "--replay-script", "stub-replay.mjs"], {
    cwd: root,
  });
  // run 2: incremental batch for session two; must not drop one's provenance
  run(["index", ".", "--sessions", "src/two.jsonl", "--replay-script", "stub-replay.mjs"], {
    cwd: root,
  });
  const index = JSON.parse(readFileSync(join(root, "corpus", "index.json"), "utf8"));
  const byId = Object.fromEntries(index.sessions.map((s) => [s.id, s]));
  assert.equal(byId.one.sourceSession, "src/one.jsonl");
  assert.equal(byId.two.sourceSession, "src/two.jsonl");
  // a plain re-index without --sessions also preserves prior provenance
  run(["index", "."], { cwd: root });
  const again = JSON.parse(readFileSync(join(root, "corpus", "index.json"), "utf8"));
  assert.equal(
    Object.fromEntries(again.sessions.map((s) => [s.id, s])).one.sourceSession,
    "src/one.jsonl",
  );
});

test("projection: compaction — P3 tradeoff summary from one strata.json, bound attached", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-context-corpus-p3-"));
  try {
    const file = join(root, "strata.json");
    writeFileSync(
      file,
      JSON.stringify({
        meta: {
          compactionTradeoff: {
            available: true,
            freedTokensPerRequest: 5000,
            continueCostPerRequestUsd: 0.6,
            compactPenaltyOnceUsd: 2.9,
            savedPerRequestUsd: 0.5,
            breakEvenRequests: 6,
            horizonRequests: 50,
            verdict: "compaction pays: horizon 50 > break-even 6",
            warmEstimateDegraded: false,
            warmthBound: { mae: 0.01, p95: 0.02, max: 0.9 },
          },
        },
        items: [],
      }),
    );
    const out = project("compaction", file, process.cwd());
    assert.deepEqual(out, {
      available: true,
      reason: null,
      breakEvenRequests: 6,
      horizonRequests: 50,
      verdict: "compaction pays: horizon 50 > break-even 6",
      freedTokensPerRequest: 5000,
      continueCostPerRequestUsd: 0.6,
      compactPenaltyOnceUsd: 2.9,
      savedPerRequestUsd: 0.5,
      warmEstimateDegraded: false,
      warmthBound: { mae: 0.01, p95: 0.02, max: 0.9 },
    });
    // legacy strata without the field fails closed (no invented tradeoff)
    const legacy = join(root, "legacy.json");
    writeFileSync(legacy, JSON.stringify({ meta: {}, items: [] }));
    const missing = runStatus(["project", "compaction", legacy]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /carries no compactionTradeoff/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fork-spend labeling: own-cost sum-invariance holds and inclusive is never a stored column", (t) => {
  const { index } = makeFixtureCorpus(t);
  // invariant: sum(onChainCostUsd) == corpus own-total regardless of fork attribution.
  // the child's own spend lives only in the child's own row if it were indexed; the parent's
  // row carries its own spend only. No stored column may be an inclusive total.
  const ownSum = index.sessions
    .filter((s) => s.replayStatus === "ok")
    .reduce((a, s) => a + s.onChainCostUsd, 0);
  assert.ok(Math.abs(ownSum - (0.09 + 0.04 + 0.03 + 0)) < 1e-12);
  // no stored inclusive column anywhere in the index
  const flat = JSON.stringify(index);
  assert.ok(
    !flat.includes('"inclusiveOnChainCostUsd"'),
    "inclusive spend must be computed at query time only",
  );
  // fork attribution present as its own quantity on the parent row
  const faulted = index.sessions.find((s) => s.id === ID_FAULTED);
  assert.equal(faulted.childrenCount, 1);
  assert.equal(faulted.childrenOnChainCostUsd, 7.5);
  // fork-free session: children fields are null (absent from IR), not zero
  const linear = index.sessions.find((s) => s.id === ID_LINEAR);
  assert.equal(linear.childrenOnChainCostUsd, null);
  assert.equal(linear.childrenCount, null);
});
