import assert from "node:assert/strict";
import test from "node:test";
import { validExplorePayload } from "../src/explore-result-validator.ts";

const EMPTY_SECTION = {
  count: 0,
  emitted: 0,
  omitted: 0,
  truncated: false,
  items: [],
  shapeFailures: { invalid: 0, outsideWorkspace: 0 },
};

function location(path = "src/target.ts") {
  return { path, line: 4, character: 2, kind: "function", symbol: "Target" };
}

function provenance(present: boolean) {
  return {
    present,
    ...(present ? { backend: "layer1+layer2" } : {}),
    sources: [],
    fields: present ? ["query"] : [],
    fieldCount: present ? 1 : 0,
    fieldCountExact: true,
    fieldsTruncated: false,
  };
}

function standardDetails() {
  const details = {
    schemaVersion: 2,
    mode: "standard",
    evidence: {
      definitions: { observed: 1, usable: 1, items: [location()] },
      graph: {
        observedImpact: true,
        usableImpact: false,
        observedItems: 1,
        usableItems: 0,
        edges: {
          exports: { observed: 1, usable: 0, omitted: 1 },
        },
      },
    },
    provenance: { definitionLookup: provenance(true) },
    omissions: [{ section: "graph.exports", reason: "invalid_shape", count: 1 }],
    disclosure: {
      packetByteBudget: 49_152,
      byteBudget: 24_576,
      emittedBytes: 0,
      truncated: true,
      byteTruncated: false,
      omittedItems: 1,
    },
  };
  return withByteReceipt(details);
}

function debugDetails() {
  const invalidGraphSection = {
    count: 1,
    emitted: 0,
    omitted: 1,
    truncated: true,
    items: [],
    shapeFailures: { invalid: 1, outsideWorkspace: 0 },
  };
  const details = {
    schemaVersion: 1,
    mode: "debug",
    definitions: structuredClone(EMPTY_SECTION),
    declarations: structuredClone(EMPTY_SECTION),
    references: structuredClone(EMPTY_SECTION),
    graph: {
      hasImpactEvidence: false,
      observedImpact: true,
      usableImpact: false,
      observedItems: 1,
      usableItems: 0,
      edges: {
        exports: invalidGraphSection,
        callers: structuredClone(EMPTY_SECTION),
        imports: structuredClone(EMPTY_SECTION),
        callees: structuredClone(EMPTY_SECTION),
      },
    },
    provenance: {
      definitionLookup: provenance(false),
      symbolMap: provenance(false),
      graph: provenance(false),
    },
    counts: {
      definitions: { observed: 0, emitted: 0 },
      declarations: { observed: 0, emitted: 0 },
      references: { observed: 0, emitted: 0 },
      "graph.exports": { observed: 1, emitted: 0 },
      "graph.callers": { observed: 0, emitted: 0 },
      "graph.imports": { observed: 0, emitted: 0 },
      "graph.callees": { observed: 0, emitted: 0 },
    },
    omissions: [{ section: "graph.exports", reason: "invalid_shape", count: 1 }],
    limitations: [
      "Graph impact was reported, but no graph item was usable after bounded normalization.",
    ],
    disclosure: {
      packetByteBudget: 49_152,
      byteBudget: 36_864,
      emittedBytes: 0,
      itemBudgetPerSection: 12,
      analyzedItemBudgetPerSection: 4_096,
      textCharacterBudget: 200,
      truncated: true,
      byteTruncated: false,
      omittedItems: 1,
      omittedRawFragments: 0,
      truncatedRawFragments: 0,
      packetOmissions: { impactFiles: 0, nextReads: 0, limitations: 0 },
    },
    diagnostics: {
      timingsMs: { total: 1.25 },
      subcalls: [
        subcall("find_definition"),
        subcall("build_symbol_map"),
        subcall("graph_expand", [
          { code: "invalid_item_shape", section: "graph.exports", count: 1 },
        ]),
      ],
      redaction: {
        policy: "bounded-allowlisted-shape-and-sensitive-value-redaction",
        absolutePaths: "workspace-relative-or-redacted",
        secrets: "redacted",
        environment: "redacted-or-not-collected",
        stackTraces: "redacted",
        connectionCredentials: "redacted",
      },
      rawFragmentBudgetBytes: 768,
    },
  };
  return withByteReceipt(details);
}

function subcall(name: string, shapeValidationFailures: unknown[] = []) {
  const text = "{}";
  return {
    name,
    status: "ok",
    input: { symbol: "Target" },
    backendDiagnostics: {},
    shapeValidationFailures,
    rawFragments: [
      {
        sourcePath: "$",
        encoding: "json",
        text,
        sampledSourceBytes: 2,
        sourceMeasurementTruncated: false,
        emittedBytes: Buffer.byteLength(text, "utf8"),
        truncated: false,
        omissions: { arrayItems: 0, objectFields: 0, depthNodes: 0, nodeBudget: 0, textValues: 0 },
        redactedValues: 0,
      },
    ],
  };
}

function withByteReceipt<T extends { disclosure: { emittedBytes: number } }>(details: T): T {
  for (let index = 0; index < 10; index++) {
    details.disclosure.emittedBytes = Buffer.byteLength(JSON.stringify(details), "utf8");
  }
  return details;
}

function unconfirmedPacket(details?: unknown) {
  return {
    schemaVersion: 1,
    workflow: "explore_symbol_impact",
    ok: false,
    symbol: "Target",
    status: "unconfirmed",
    degraded: false,
    message: "Definition not confirmed.",
    evidence: { references: 0, graphImpact: false, partial: false },
    nextReads: [
      {
        action: "locate_confirm_definition",
        arguments: { symbol: "Target", precise: true },
        reason: "Confirm spelling and request precise definition evidence.",
      },
    ],
    limitations: [],
    ...(details === undefined ? {} : { details }),
  };
}

test("accepts current owner compact, sparse standard-v2, and debug-v1 packets", () => {
  assert.equal(validExplorePayload(unconfirmedPacket(), "compact"), true);
  assert.equal(validExplorePayload(unconfirmedPacket(standardDetails()), "standard"), true);
  assert.equal(validExplorePayload(unconfirmedPacket(debugDetails()), "debug"), true);
});

test("accepts debug emergency graph receipts without the optional item-counter pair", () => {
  const details = debugDetails();
  delete (details.graph as Record<string, unknown>).observedItems;
  delete (details.graph as Record<string, unknown>).usableItems;
  for (const summary of Object.values(details.provenance)) summary.fieldsTruncated = true;
  withByteReceipt(details);
  assert.equal(validExplorePayload(unconfirmedPacket(details), "debug"), true);
});

test("rejects wrong detail modes, versions, keys, unsafe counters, and false sparse receipts", () => {
  const cases: Array<{ details: ReturnType<typeof standardDetails>; mode: "standard" | "debug" }> =
    [];

  const standardV1 = standardDetails();
  standardV1.schemaVersion = 1;
  cases.push({ details: withByteReceipt(standardV1), mode: "standard" });

  const wrongMode = standardDetails();
  wrongMode.mode = "debug";
  cases.push({ details: withByteReceipt(wrongMode), mode: "standard" });

  const unknown = standardDetails() as ReturnType<typeof standardDetails> & {
    diagnostics?: unknown;
  };
  unknown.diagnostics = {};
  cases.push({ details: withByteReceipt(unknown), mode: "standard" });

  const badObserved = standardDetails();
  badObserved.evidence.graph.observedItems = 2;
  cases.push({ details: withByteReceipt(badObserved), mode: "standard" });

  const badOmission = standardDetails();
  badOmission.omissions[0].count = 2;
  cases.push({ details: withByteReceipt(badOmission), mode: "standard" });

  const unsafe = standardDetails();
  unsafe.disclosure.omittedItems = Number.MAX_SAFE_INTEGER + 1;
  cases.push({ details: withByteReceipt(unsafe), mode: "standard" });

  for (const { details, mode } of cases) {
    assert.equal(validExplorePayload(unconfirmedPacket(details), mode), false);
  }

  const debugV2 = debugDetails();
  debugV2.schemaVersion = 2;
  withByteReceipt(debugV2);
  assert.equal(validExplorePayload(unconfirmedPacket(debugV2), "debug"), false);

  const unpaired = debugDetails();
  delete (unpaired.graph as Record<string, unknown>).usableItems;
  withByteReceipt(unpaired);
  assert.equal(validExplorePayload(unconfirmedPacket(unpaired), "debug"), false);

  const wrongRedaction = debugDetails();
  wrongRedaction.diagnostics.redaction.secrets = "visible";
  withByteReceipt(wrongRedaction);
  assert.equal(validExplorePayload(unconfirmedPacket(wrongRedaction), "debug"), false);

  const wrongOmissionReason = debugDetails();
  wrongOmissionReason.omissions[0].reason = "item_budget";
  withByteReceipt(wrongOmissionReason);
  assert.equal(validExplorePayload(unconfirmedPacket(wrongOmissionReason), "debug"), false);
});

test("requires the exact symbol-matched unconfirmed recovery action", () => {
  const accepted = unconfirmedPacket();
  assert.equal(validExplorePayload(accepted, "compact"), true);

  const mutations = [
    (packet: ReturnType<typeof unconfirmedPacket>) => {
      packet.nextReads = [];
    },
    (packet: ReturnType<typeof unconfirmedPacket>) => {
      delete (packet.nextReads[0] as Record<string, unknown>).arguments;
    },
    (packet: ReturnType<typeof unconfirmedPacket>) => {
      (packet.nextReads[0].arguments as Record<string, unknown>).symbol = "Other";
    },
    (packet: ReturnType<typeof unconfirmedPacket>) => {
      (packet.nextReads[0].arguments as Record<string, unknown>).precise = false;
    },
    (packet: ReturnType<typeof unconfirmedPacket>) => {
      (packet.nextReads[0].arguments as Record<string, unknown>).file = "src/target.ts";
    },
    (packet: ReturnType<typeof unconfirmedPacket>) => {
      (packet.nextReads[0] as Record<string, unknown>).extra = true;
    },
    (packet: ReturnType<typeof unconfirmedPacket>) => {
      packet.nextReads = [{ path: "src/target.ts", reason: "Read it." }] as never;
    },
  ];

  for (const mutate of mutations) {
    const packet = structuredClone(accepted);
    mutate(packet);
    assert.equal(validExplorePayload(packet, "compact"), false);
  }
});
