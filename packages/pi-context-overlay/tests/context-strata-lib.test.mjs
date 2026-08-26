// ---
// summary: "Tests context-strata model invariants: conservation, inclusive residency, warmth, liveness boundaries, branch-chain exclusion, fault/era handling."
// read_when:
//   - "Changing context-strata-lib.mjs replay or allocation modeling."
// ---
import assert from "node:assert/strict";
import test from "node:test";

import { buildActiveChain, buildStrataModel } from "../scripts/context-strata-lib.mjs";

const line = (obj) => JSON.stringify(obj);
const session = (id, parentId) => ({ type: "session", id, parentId: parentId ?? null });
const userMsg = (id, parentId, text) => ({
  type: "message",
  id,
  parentId,
  timestamp: "2026-01-01T00:00:00Z",
  message: { role: "user", content: [{ type: "text", text }] },
});
const assistant = (id, parentId, usage, content) => ({
  type: "message",
  id,
  parentId,
  timestamp: "2026-01-01T00:01:00Z",
  message: { role: "assistant", content, usage },
});
const toolResult = (id, parentId, toolCallId, text) => ({
  type: "message",
  id,
  parentId,
  timestamp: "2026-01-01T00:02:00Z",
  message: { role: "toolResult", toolName: "read", toolCallId, content: [{ type: "text", text }] },
});
const compact = (id, parentId, summary) => ({
  type: "compaction",
  id,
  parentId,
  timestamp: "2026-01-01T00:03:00Z",
  summary,
});

const callRead = (toolCallId, path) => ({
  type: "toolCall",
  id: toolCallId,
  name: "read",
  arguments: { path },
});

// linear 2-request session: u1 -> a1(read /x/a.ts) -> t1 -> a2(mentions a.ts)
const LINEAR = [
  line(session("root")),
  line(userMsg("u1", "root", "look at things")),
  line(
    assistant("a1", "u1", { input: 1000, cacheRead: 0, output: 10, cost: { total: 0.01 } }, [
      { ...callRead("tc1", "/x/a.ts") },
    ]),
  ),
  line(toolResult("t1", "a1", "tc1", "file body ".repeat(50))),
  line(
    assistant("a2", "t1", { input: 200, cacheRead: 1100, output: 5, cost: { total: 0.02 } }, [
      { type: "text", text: "the file a.ts says hello" },
    ]),
  ),
].join("\n");

test("linear session: conservation holds for every request", () => {
  const { strata } = buildStrataModel(LINEAR);
  const cats = strata.cats.map((c) => c.id);
  assert.equal(strata.requests.length, 2);
  for (let r = 0; r < strata.requests.length; r++) {
    const sum = cats.reduce((acc, c) => acc + (strata.series[c]?.[r] ?? 0), 0);
    assert.equal(sum, strata.requests[r].residentEst, `series vs residentEst at request ${r}`);
  }
});

test("linear session: warmth model matches unchanged prefix", () => {
  const { strata } = buildStrataModel(LINEAR);
  // request 1 sees the identical window of request 0 plus new tail
  assert.equal(strata.requests[1].warmModelTokens, strata.requests[0].residentEst);
});

test("linear session: bedrock residual-calibrates and sits below first user msg", () => {
  const { strata } = buildStrataModel(LINEAR);
  // a1 input 1000 minus est(u1)=~3 tokens => bedrock ~997
  assert.ok(strata.meta.bedrockTokens > 900 && strata.meta.bedrockTokens <= 1000);
});

test("liveness boundary: same-request mention (r == birthR) counts as live", () => {
  const { strata } = buildStrataModel(LINEAR);
  // toolResult born at b=1; assistant at r=1 mentions a.ts => must NOT be dead
  const resultItem = strata.items.find(
    (it) => it.c === "toolResult" && it.p === undefined && it.l === "read",
  );
  assert.ok(resultItem, "toolResult item exists");
  // toolResult has no own path; instead verify the toolCall item is live via the a.ts mention
  const callItem = strata.items.find((it) => it.c === "toolCall" && it.p === "/x/a.ts");
  assert.ok(callItem);
  assert.ok(callItem.r >= 1); // refs recorded
  assert.notEqual(callItem.d, 1); // mentioned later => live
  assert.equal(strata.meta.wasteRatio, 0);
});

test("liveness boundary: creating toolCall self-mention at birthR-1 does not revive", () => {
  const lines = [
    line(session("root")),
    line(userMsg("u1", "root", "go")),
    line(
      assistant("a1", "u1", { input: 500, cacheRead: 0, output: 1, cost: { total: 0 } }, [
        { ...callRead("tc1", "/x/lonely.ts") },
      ]),
    ),
    line(toolResult("t1", "a1", "tc1", "content")),
  ].join("\n");
  const { strata } = buildStrataModel(lines);
  const callItem = strata.items.find((it) => it.c === "toolCall" && it.p === "/x/lonely.ts");
  assert.equal(callItem.d, 1); // never mentioned after birth => mined-dead
  // born at lastR + 1: never entered any billed request => zero input-billed residency.
  // (Its tokens were billed once as output; tokenTurns measures input-window residency.)
  assert.equal(callItem.tt, 0);
});

test("faulted session: conservation holds across compaction and residency is inclusive", () => {
  const FAULTED = [
    LINEAR,
    line(compact("c1", "a2", "summary of everything")),
    line(userMsg("u2", "c1", "continue")),
    line(
      assistant("a3", "u2", { input: 300, cacheRead: 100, output: 1, cost: { total: 0.03 } }, []),
    ),
  ].join("\n");
  const { strata } = buildStrataModel(FAULTED);
  const cats = strata.cats.map((c) => c.id);
  assert.equal(strata.requests.length, 3);
  assert.equal(strata.meta.faults.length, 1);
  assert.equal(strata.meta.faults[0].r, 1, "fault lands between requests 1 and 2");
  for (let r = 0; r < strata.requests.length; r++) {
    const sum = cats.reduce((acc, c) => acc + (strata.series[c]?.[r] ?? 0), 0);
    assert.equal(sum, strata.requests[r].residentEst, `conservation at request ${r}`);
  }
  // pre-fault items were resident through request 1 inclusive => tokenTurns includes it
  const preFault = strata.items.find((it) => it.l.startsWith("look at things"));
  assert.equal(preFault.f - preFault.b + 1, Math.round(preFault.tt / preFault.t));
  // post-fault window is small: bedrock residual + summary + new allocations only
  assert.ok(strata.requests[2].residentEst < strata.requests[1].residentEst);
});

test("empty-summary compaction still records a fault", () => {
  const EMPTY_FAULT = [
    LINEAR,
    line(compact("c1", "a2", "")),
    line(userMsg("u2", "c1", "again")),
    line(assistant("a3", "u2", { input: 300, cacheRead: 0, output: 1, cost: { total: 0 } }, [])),
  ].join("\n");
  const { strata } = buildStrataModel(EMPTY_FAULT);
  assert.equal(strata.meta.faults.length, 1);
  assert.equal(strata.requests[2].residentEst > 0, true);
});

test("branched session: abandoned branch excluded from model but accounted", () => {
  const BRANCHED = [
    line(session("root")),
    line(userMsg("u1", "root", "start")),
    line(assistant("b1", "u1", { input: 700, cacheRead: 0, output: 1, cost: { total: 0.05 } }, [])), // abandoned side branch
    line(
      assistant("a1", "u1", { input: 500, cacheRead: 0, output: 1, cost: { total: 0.01 } }, [
        { ...callRead("tc1", "/x/a.ts") },
      ]),
    ),
    line(toolResult("t1", "a1", "tc1", "body")),
    line(
      assistant("a2", "t1", { input: 100, cacheRead: 600, output: 1, cost: { total: 0.02 } }, []),
    ),
  ].join("\n");
  const { strata } = buildStrataModel(BRANCHED);
  // active chain ends at a2: root -> u1 -> a1 -> t1 -> a2 ; b1 is off-chain
  assert.equal(strata.requests.length, 2);
  assert.deepEqual(strata.meta.excludedBranches, { records: 1, requests: 1, costTotal: 0.05 });
  // no phantom warm/cold from comparing across the branch switch
  assert.equal(strata.requests[1].warmModelTokens, strata.requests[0].residentEst);
});

test("session without any measured request yields an empty-but-valid ledger", () => {
  const NO_REQ = [line(session("root")), line(userMsg("u1", "root", "hi"))].join("\n");
  const { strata } = buildStrataModel(NO_REQ);
  assert.equal(strata.requests.length, 0);
  assert.equal(strata.meta.runway.residentLast, 0);
  assert.equal(strata.meta.cacheHit, 0);
});

test("buildActiveChain walks parent links from the tail", () => {
  const recs = [
    { type: "session", id: "root", parentId: null },
    { type: "message", id: "m1", parentId: "root" },
    { type: "message", id: "side", parentId: "m1" },
    { type: "message", id: "m2", parentId: "m1" },
  ];
  const chain = buildActiveChain(recs);
  assert.deepEqual(
    chain.map((r) => r.id),
    ["root", "m1", "m2"],
  );
});

test("reference mining ignores version strings and abbreviation stopwords", () => {
  const lines = [
    line(session("root")),
    line(userMsg("u1", "root", "go")),
    line(
      assistant("a1", "u1", { input: 400, cacheRead: 0, output: 1, cost: { total: 0 } }, [
        { ...callRead("tc1", "/x/pkg.ts") },
      ]),
    ),
    line(toolResult("t1", "a1", "tc1", "export const v = 1;")),
    line(
      assistant("a2", "t1", { input: 100, cacheRead: 500, output: 1, cost: { total: 0 } }, [
        {
          type: "text",
          text: "upgrade to version 1.2.3, e.g. soon, i.e. later, see example.com/pkg.ts",
        },
      ]),
    ),
  ].join("\n");
  const { strata } = buildStrataModel(lines);
  const callItem = strata.items.find((it) => it.c === "toolCall" && it.p === "/x/pkg.ts");
  // pkg.ts basename IS referenced => live despite noise words around it
  assert.equal(callItem.d, 0);
});
