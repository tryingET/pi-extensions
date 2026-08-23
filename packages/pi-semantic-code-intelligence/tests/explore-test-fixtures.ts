export function fakeExploreDetails(mode: "standard" | "debug") {
  if (mode === "standard") {
    const details = {
      schemaVersion: 2,
      mode,
      evidence: {
        definitions: {
          observed: 1,
          usable: 1,
          items: [{ path: "src/target.ts", line: 1, kind: "function", symbol: "Target" }],
        },
      },
      disclosure: {
        packetByteBudget: 49_152,
        byteBudget: 24_576,
        emittedBytes: 0,
        truncated: false,
        byteTruncated: false,
        omittedItems: 0,
      },
    };
    updateByteReceipt(details);
    return details;
  }

  const emptySection = () => ({
    count: 0,
    emitted: 0,
    omitted: 0,
    truncated: false,
    items: [],
    shapeFailures: { invalid: 0, outsideWorkspace: 0 },
  });
  const definitionSection = {
    count: 1,
    emitted: 1,
    omitted: 0,
    truncated: false,
    items: [{ path: "src/target.ts", line: 1, kind: "function", symbol: "Target" }],
    shapeFailures: { invalid: 0, outsideWorkspace: 0 },
  };
  const emptyProvenance = () => ({
    present: false,
    sources: [],
    fields: [],
    fieldCount: 0,
    fieldCountExact: true,
    fieldsTruncated: false,
  });
  const details = {
    schemaVersion: 1,
    mode,
    definitions: definitionSection,
    declarations: emptySection(),
    references: emptySection(),
    graph: {
      hasImpactEvidence: false,
      observedImpact: false,
      usableImpact: false,
      observedItems: 0,
      usableItems: 0,
      edges: {
        exports: emptySection(),
        callers: emptySection(),
        imports: emptySection(),
        callees: emptySection(),
      },
    },
    provenance: {
      definitionLookup: {
        present: true,
        backend: "layer1+layer2",
        sources: [],
        fields: ["query"],
        fieldCount: 1,
        fieldCountExact: true,
        fieldsTruncated: false,
      },
      symbolMap: emptyProvenance(),
      graph: emptyProvenance(),
    },
    counts: {
      definitions: { observed: 1, emitted: 1 },
      declarations: { observed: 0, emitted: 0 },
      references: { observed: 0, emitted: 0 },
      "graph.exports": { observed: 0, emitted: 0 },
      "graph.callers": { observed: 0, emitted: 0 },
      "graph.imports": { observed: 0, emitted: 0 },
      "graph.callees": { observed: 0, emitted: 0 },
    },
    omissions: [],
    limitations: [],
    disclosure: {
      packetByteBudget: 49_152,
      byteBudget: 36_864,
      emittedBytes: 0,
      itemBudgetPerSection: 12,
      analyzedItemBudgetPerSection: 4_096,
      textCharacterBudget: 200,
      truncated: false,
      byteTruncated: false,
      omittedItems: 0,
      omittedRawFragments: 0,
      truncatedRawFragments: 0,
      packetOmissions: { impactFiles: 0, nextReads: 0, limitations: 0 },
    },
    diagnostics: {
      timingsMs: {},
      subcalls: [],
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
  updateByteReceipt(details);
  return details;
}

export function standardObservedUnusableDetails() {
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
  updateByteReceipt(details);
  return details;
}

export function unconfirmedExplorePacket(details?: unknown) {
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

function updateByteReceipt<T extends { disclosure: { emittedBytes: number } }>(details: T): void {
  for (let index = 0; index < 8; index++) {
    details.disclosure.emittedBytes = Buffer.byteLength(JSON.stringify(details), "utf8");
  }
}
