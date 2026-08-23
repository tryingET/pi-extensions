import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_MAX_BYTES, SessionManager } from "@earendil-works/pi-coding-agent";
import {
  createExplorePresentation,
  EXPLORE_MODEL_BUDGET_BYTES,
  EXPLORE_OPERATOR_ENTRY_TYPE,
  EXPLORE_RESTORE_VISIT_LIMIT,
  restoreExploreOperatorEntries,
  restoreExploreOperatorEntry,
} from "../src/explore-presentation.ts";
import {
  type BoundedAsciiText,
  renderExploreCall,
  renderExploreOperatorEntry,
  renderExploreResult,
} from "../src/explore-renderer.ts";

const EMPTY_SECTION = {
  count: 0,
  emitted: 0,
  omitted: 0,
  truncated: false,
  items: [],
  shapeFailures: { invalid: 0, outsideWorkspace: 0 },
};

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
      graph: {
        observedImpact: true,
        usableImpact: false,
        observedItems: 1,
        usableItems: 0,
        edges: { exports: { observed: 1, usable: 0, omitted: 1 } },
      },
    },
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
  const fragmentText = '{"operatorOnly":"fragment-marker"}';
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
      timingsMs: { total: 2.5 },
      subcalls: [
        {
          name: "graph_expand",
          status: "ok",
          input: { symbol: "Target" },
          elapsedMs: 1.5,
          backendDiagnostics: { hasImpactEvidence: true },
          shapeValidationFailures: [
            { code: "invalid_item_shape", section: "graph.exports", count: 1 },
          ],
          rawFragments: [
            {
              sourcePath: "$",
              encoding: "json",
              text: fragmentText,
              sampledSourceBytes: Buffer.byteLength(fragmentText, "utf8"),
              sourceMeasurementTruncated: false,
              emittedBytes: Buffer.byteLength(fragmentText, "utf8"),
              truncated: false,
              omissions: {
                arrayItems: 0,
                objectFields: 0,
                depthNodes: 0,
                nodeBudget: 0,
                textValues: 0,
              },
              redactedValues: 0,
            },
          ],
        },
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

function unconfirmedPacket(details?: unknown) {
  return {
    schemaVersion: 1,
    workflow: "explore_symbol_impact",
    ok: false,
    symbol: "Target",
    status: "indeterminate",
    degraded: true,
    message: "Definition was not confirmed; do not plan edits.",
    evidence: { references: 0, graphImpact: false, partial: false },
    nextReads: [
      {
        action: "locate_confirm_definition",
        arguments: { symbol: "Target", precise: true },
        reason: "Confirm spelling and request precise definition evidence.",
      },
    ],
    limitations: [
      "Graph impact was reported, but no graph item was usable after bounded normalization.",
    ],
    ...(details === undefined ? {} : { details }),
  };
}

function withByteReceipt<T extends { disclosure: { emittedBytes: number } }>(details: T): T {
  for (let index = 0; index < 10; index++) {
    details.disclosure.emittedBytes = Buffer.byteLength(JSON.stringify(details), "utf8");
  }
  return details;
}

function assertWidth(component: BoundedAsciiText, width: number): string {
  const lines = component.render(width);
  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.ok(line.length <= Math.max(1, width));
    assert.match(line, /^[\x20-\x7e]*$/);
  }
  return lines.join("\n");
}

test("standard projection is decision-first, smaller than operator detail, and preserves recovery args", () => {
  const packet = unconfirmedPacket(standardDetails());
  const presentation = createExplorePresentation(packet, "standard", "call-standard");
  assert.ok(presentation);
  const model = JSON.parse(presentation.modelText);

  assert.equal(model.schema, "pi.sci_explore_model.v1");
  assert.equal(model.requestedMode, "standard");
  assert.equal(model.decision.definitionConfirmed, false);
  assert.equal(model.decision.editPlanning, "blocked_until_definition_confirmed");
  assert.deepEqual(model.nextAction, packet.nextReads[0]);
  assert.deepEqual(model.normalizedEvidence.graph, {
    observedImpact: true,
    usableImpact: false,
    observedItems: 1,
    usableItems: 0,
    edges: { exports: { observed: 1, usable: 0, omitted: 1 } },
  });
  assert.ok(presentation.modelBytes <= EXPLORE_MODEL_BUDGET_BYTES);
  assert.ok(
    presentation.modelBytes < presentation.operatorEntry.producerBytes,
    `model=${presentation.modelBytes} operator=${presentation.operatorEntry.producerBytes}`,
  );
  assert.deepEqual(presentation.operatorEntry.packet.details, packet.details);
  assert.doesNotMatch(presentation.modelText, /shapeFailures|backendDiagnostics|rawFragments/);

  const restored = restoreExploreOperatorEntry(presentation.operatorEntry, "/workspace/repo");
  assert.deepEqual(restored, presentation.operatorEntry);
  const falseReceipt = structuredClone(presentation.operatorEntry);
  falseReceipt.producerBytes += 1;
  assert.equal(restoreExploreOperatorEntry(falseReceipt, "/workspace/repo"), undefined);
  const unsafeEntry = structuredClone(presentation.operatorEntry);
  unsafeEntry.packet.message = `producer note xoxb-${"S".repeat(24)}`;
  unsafeEntry.producerBytes = Buffer.byteLength(JSON.stringify(unsafeEntry.packet), "utf8");
  assert.equal(restoreExploreOperatorEntry(unsafeEntry, "/workspace/repo"), undefined);

  const circularEntry = structuredClone(presentation.operatorEntry);
  const circularDetails = circularEntry.packet.details as Record<string, unknown>;
  circularDetails.self = circularDetails;
  assert.equal(restoreExploreOperatorEntry(circularEntry, "/workspace/repo"), undefined);

  const bigintEntry = structuredClone(presentation.operatorEntry);
  const bigintDetails = bigintEntry.packet.details as Record<string, unknown>;
  const bigintDisclosure = bigintDetails.disclosure as Record<string, unknown>;
  bigintDisclosure.emittedBytes = 1n;
  assert.equal(restoreExploreOperatorEntry(bigintEntry, "/workspace/repo"), undefined);

  const oversizedEntry = structuredClone(presentation.operatorEntry);
  oversizedEntry.producerBytes = DEFAULT_MAX_BYTES + 1;
  assert.equal(restoreExploreOperatorEntry(oversizedEntry, "/workspace/repo"), undefined);
});

test("compact and debug remain distinguishable without sending debug raw fragments to the model", () => {
  const compact = createExplorePresentation(unconfirmedPacket(), "compact", "call-compact");
  const debug = createExplorePresentation(unconfirmedPacket(debugDetails()), "debug", "call-debug");
  assert.ok(compact);
  assert.ok(debug);
  const compactModel = JSON.parse(compact.modelText);
  const debugModel = JSON.parse(debug.modelText);

  assert.equal(compactModel.requestedMode, "compact");
  assert.equal("normalizedEvidence" in compactModel, false);
  assert.equal("debugDiagnostics" in compactModel, false);
  assert.equal(debugModel.requestedMode, "debug");
  assert.equal(debugModel.normalizedEvidence.graph.observedImpact, true);
  assert.equal(debugModel.normalizedEvidence.graph.usableImpact, false);
  assert.equal(debugModel.debugDiagnostics.label, "bounded debug diagnostics");
  assert.equal(debugModel.debugDiagnostics.subcalls[0].rawFragmentsOmittedFromModel, 1);
  assert.doesNotMatch(debug.modelText, /fragment-marker|sourcePath|sampledSourceBytes/);
  assert.match(JSON.stringify(debug.operatorEntry.packet), /fragment-marker/);
  assert.ok(debug.modelBytes <= EXPLORE_MODEL_BUDGET_BYTES);
});

test("durable operator entries are excluded from SessionManager model context", () => {
  const presentation = createExplorePresentation(
    unconfirmedPacket(debugDetails()),
    "debug",
    "call-session-context",
  );
  assert.ok(presentation);
  const session = SessionManager.inMemory("/workspace/repo");
  session.appendCustomEntry(EXPLORE_OPERATOR_ENTRY_TYPE, presentation.operatorEntry);

  assert.match(JSON.stringify(session.getEntries()), /fragment-marker/);
  assert.doesNotMatch(JSON.stringify(session.buildSessionContext()), /fragment-marker/);
});

test("operator restoration caps total branch entries visited", () => {
  const presentation = createExplorePresentation(
    unconfirmedPacket(standardDetails()),
    "standard",
    "call-restore-window",
  );
  assert.ok(presentation);
  const entries: unknown[] = Array.from({ length: EXPLORE_RESTORE_VISIT_LIMIT + 200 }, () => ({
    type: "message",
  }));
  entries[entries.length - 1] = {
    type: "custom",
    customType: EXPLORE_OPERATOR_ENTRY_TYPE,
    data: presentation.operatorEntry,
  };
  let numericReads = 0;
  const branch = new Proxy(entries, {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) numericReads += 1;
      return Reflect.get(target, property, receiver);
    },
  });

  const restored = restoreExploreOperatorEntries(branch, "/workspace/repo");
  assert.equal(restored.length, 1);
  assert.equal(restored[0]?.toolCallId, "call-restore-window");
  assert.ok(numericReads <= EXPLORE_RESTORE_VISIT_LIMIT);
});

test("call, result, and durable operator renderers wrap safely without raw single-line fallback", () => {
  const presentation = createExplorePresentation(
    unconfirmedPacket(debugDetails()),
    "debug",
    "call-render",
  );
  assert.ok(presentation);
  const retained = new Map([["call-render", presentation.operatorEntry]]);
  const result = {
    content: [{ type: "text", text: presentation.modelText }],
    details: {
      explorePresentation: {
        ...presentation.summary,
        modelBytes: presentation.modelBytes,
        operatorBytes: presentation.operatorEntry.producerBytes,
      },
    },
  };

  const call = renderExploreCall({ symbol: "Target\u001b[31m", mode: "debug" });
  const collapsed = renderExploreResult(
    result,
    { expanded: false, isPartial: false },
    "call-render",
    retained,
  );
  const expanded = renderExploreResult(
    result,
    { expanded: true, isPartial: false },
    "call-render",
    retained,
  );
  const durable = renderExploreOperatorEntry(presentation.operatorEntry, true);

  for (const width of [1, 8, 20, 80]) {
    assertWidth(call, width);
    const collapsedText = assertWidth(collapsed, width);
    assert.doesNotMatch(collapsedText, /\{"schemaVersion"/);
    assertWidth(expanded, width);
    assertWidth(durable, width);
  }
  assert.match(assertWidth(expanded, 120), /Operator packet .*TUI-only/);
  assert.match(assertWidth(durable, 120), /Validated sanitized producer packet/);
});
