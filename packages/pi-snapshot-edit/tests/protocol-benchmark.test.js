// summary: "Validates protocol benchmark coverage, deterministic aggregates, simulators, and mutation correctness gates."
// read_when:
//   - "Changing benchmark protocols, transcripts, fixtures, or mutation validation."

import assert from "node:assert/strict";
import test from "node:test";
import {
  executeProtocol,
  FIXTURES,
  protocolTranscript,
  revisionAlias,
  runBenchmark,
  TOKENIZER,
  validateMutation,
} from "../scripts/protocol-benchmark.mjs";

const call = (lines, edits) => ({ path: "case.txt", base: revisionAlias(lines), edits });

test("benchmarks every protocol on the same complete fixture corpus", () => {
  const { aggregate, rows } = runBenchmark();
  assert.equal(TOKENIZER.encoding, "o200k_base");
  assert.match(TOKENIZER.scope, /not provider-reported usage/);
  assert.equal(aggregate.fixtureCount, 9);
  assert.deepEqual(Object.keys(aggregate.protocols), ["A", "B", "C", "D", "E"]);
  for (const protocol of Object.keys(aggregate.protocols)) {
    const protocolRows = rows.filter((row) => row.protocol === protocol);
    assert.deepEqual(
      protocolRows.map((row) => row.fixtureId),
      FIXTURES.map((fixture) => fixture.id),
    );
    assert.equal(aggregate.protocols[protocol].correctMutationCases, 7);
    assert.equal(aggregate.protocols[protocol].staleRejections, 1);
    assert.ok(aggregate.protocols[protocol].totalTokens > 0);
  }
});

test("aggregate is deterministic and content-free", () => {
  const first = runBenchmark().aggregate;
  const second = runBenchmark().aggregate;
  assert.deepEqual(first, second);
  const serialized = JSON.stringify(first);
  for (const fixture of FIXTURES) {
    assert.ok(!serialized.includes(JSON.stringify(fixture.id)));
    for (const line of fixture.lines)
      if (line.length > 3) assert.ok(!serialized.includes(JSON.stringify(line)));
  }
  assert.ok(!serialized.includes(".txt"));
});

test("protocol A remains a deterministic retired-schema benchmark", () => {
  const insertion = protocolTranscript(
    "A",
    FIXTURES.find((fixture) => fixture.id === "insert"),
  );
  assert.match(insertion.events[1].content, /^revision:amber\n1│one\n2│three$/);
  for (const protocol of ["A", "B", "C", "D", "E"])
    assert.equal(protocolTranscript(protocol, FIXTURES[1]).editCall.base, "amber");
  assert.deepEqual(insertion.editCall.edits, [
    { op: "insert_after", startLine: 1, newText: "two" },
  ]);
  const deletion = protocolTranscript(
    "A",
    FIXTURES.find((fixture) => fixture.id === "delete"),
  );
  assert.deepEqual(deletion.editCall.edits, [
    { op: "replace", startLine: 2, endLine: 3, newText: "" },
  ]);
});

test("canonical envelope separates calls/results and C performs an explicit second read", () => {
  const transcript = protocolTranscript(
    "C",
    FIXTURES.find((fixture) => fixture.id === "duplicate-line"),
  );
  assert.deepEqual(
    transcript.events.map((event) => `${event.type}:${event.tool}`),
    [
      "tool_call:read",
      "tool_result:read",
      "tool_call:read_range",
      "tool_result:read_range",
      "tool_call:edit",
      "tool_result:edit",
    ],
  );
  assert.doesNotMatch(transcript.events[1].content, /range:/);
  assert.match(transcript.events[3].content, /2│repeat\n3│repeat\n4│omega/);
});

test("B rejects ambiguous selectors without occurrence", () => {
  const lines = ["repeat", "repeat"];
  assert.throws(
    () =>
      executeProtocol(
        "B",
        lines,
        call(lines, [{ op: "replace", oldText: "repeat", newText: "x" }]),
      ),
    /ambiguous selector requires occurrence/,
  );
});

test("coordinate simulator rejects invalid ranges and unknown operations", () => {
  const lines = ["one", "two"];
  assert.throws(
    () =>
      executeProtocol(
        "A",
        lines,
        call(lines, [{ op: "replace", startLine: 2, endLine: 1, newText: "x" }]),
      ),
    /invalid replace range/,
  );
  assert.throws(
    () =>
      executeProtocol(
        "A",
        lines,
        call(lines, [{ op: "replace", startLine: 1, endLine: 3, newText: "x" }]),
      ),
    /invalid replace range/,
  );
  assert.throws(
    () => executeProtocol("A", lines, call(lines, [{ op: "insert", startLine: 1, newText: "x" }])),
    /unknown coordinate operation/,
  );
});

test("D rejects ID collisions and reversed ranges", () => {
  const lines = ["one", "two", "three"];
  const base = revisionAlias(lines);
  assert.throws(
    () =>
      executeProtocol(
        "D",
        lines,
        {
          path: "case.txt",
          base,
          edits: [{ op: "replace", startId: "same", endId: "last", newText: "x" }],
        },
        { lineIds: ["same", "same", "last"] },
      ),
    /line id collision/,
  );
  assert.throws(
    () =>
      executeProtocol(
        "D",
        lines,
        {
          path: "case.txt",
          base,
          edits: [{ op: "replace", startId: "three", endId: "one", newText: "x" }],
        },
        { lineIds: ["one", "two", "three"] },
      ),
    /reversed id range/,
  );
});

test("E validates its narrow patch headers, counts, and context", () => {
  const lines = ["one", "two", "three"];
  const base = revisionAlias(lines);
  const edit = (patch) => executeProtocol("E", lines, { path: "case.txt", base, patch });
  assert.deepEqual(edit("@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three"), ["one", "TWO", "three"]);
  assert.throws(
    () => edit("--- a/file\n+++ b/file\n@@ -1,1 +1,1 @@\n-one\n+ONE"),
    /invalid hunk header/,
  );
  assert.throws(() => edit("@@ -1,2 +1,3 @@\n one\n-two\n+TWO"), /hunk count mismatch/);
  assert.throws(
    () => edit("@@ -1,3 +1,3 @@\n wrong\n-two\n+TWO\n three"),
    /patch context mismatch/,
  );
  const separatedLines = ["a", "b", "c"];
  assert.throws(
    () =>
      executeProtocol("E", separatedLines, {
        path: "case.txt",
        base: revisionAlias(separatedLines),
        patch: "@@ -1,3 +1,3 @@\n-a\n+A\n b\n-c\n+C",
      }),
    /multiple change groups in hunk/,
  );
});

test("correctness gate rejects wrong base, wrong target, and wrong output", () => {
  const item = FIXTURES.find((fixture) => fixture.id === "duplicate-line");
  const valid = protocolTranscript("A", item);
  assert.throws(
    () => executeProtocol("A", item.lines, { ...valid.editCall, base: "wrong-alias" }),
    /wrong base revision/,
  );

  const wrongTarget = structuredClone(valid);
  wrongTarget.editCall.edits[0].startLine = 2;
  wrongTarget.editCall.edits[0].endLine = 2;
  assert.throws(() => validateMutation("A", item, wrongTarget), /wrong target or output/);

  const wrongOutput = structuredClone(valid);
  wrongOutput.editCall.edits[0].newText = "incorrect";
  assert.throws(() => validateMutation("A", item, wrongOutput), /wrong target or output/);
});
