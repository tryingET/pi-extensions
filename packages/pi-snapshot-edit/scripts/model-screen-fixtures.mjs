import { CANONICAL_BASE_ALIAS, lineIds, render } from "./protocol-common.mjs";
import { applyCanonical } from "./protocol-simulator.mjs";

export const PROTOCOLS = Object.freeze(["A", "B", "C", "D", "E"]);
export const WORKLOADS = Object.freeze([
  "duplicate_targeting",
  "repeated_block_targeting",
  "batched_edits",
]);

const replace = (startLine, endLine, newLines) => ({
  op: "replace",
  startLine,
  endLine,
  newLines,
});
const fixtures = Object.freeze({
  duplicate_targeting: {
    lines: ["alpha", "repeat", "repeat", "omega"],
    edits: [replace(3, 3, ["chosen"])],
  },
  repeated_block_targeting: {
    lines: ["head", "open", "body", "close", "open", "body", "close", "tail"],
    edits: [replace(5, 7, ["open", "revised", "close"])],
  },
  batched_edits: {
    lines: ["a", "b", "c", "d", "e"],
    edits: [replace(2, 2, ["B1", "B2"]), replace(4, 4, ["D"])],
  },
});
const intents = Object.freeze({
  duplicate_targeting:
    "In screen.txt, replace only the second consecutive line whose text is 'repeat' with 'chosen'.",
  repeated_block_targeting:
    "In screen.txt, change only the second open/body/close block so its middle line is 'revised'.",
  batched_edits:
    "In screen.txt, make both changes atomically: replace line 'b' with two lines 'B1' and 'B2', and replace line 'd' with 'D'.",
});
const readSchema = { path: "string", offset: "integer>=1?", limit: "integer>=1?" };
const coordinateEdit = {
  path: "string",
  base: "revision alias from read",
  edits: [
    {
      op: "replace|insert_after",
      startLine: "integer>=0",
      endLine: "integer>=1?",
      newText: "string",
    },
  ],
};

export function fixtureFor(workload) {
  const item = fixtures[workload];
  if (!item) throw new Error(`unknown workload: ${workload}`);
  return item;
}

function contract(protocol) {
  if (protocol === "A")
    return {
      instructions:
        "Read returns revision:<opaque alias> then 1-indexed lines as N│text. Edit against that alias. replace uses inclusive startLine/endLine; empty replacement deletes. insert_after uses startLine (0 means file start) and omits endLine.",
      tools: { read: readSchema, edit: coordinateEdit },
    };
  if (protocol === "B")
    return {
      instructions:
        "Read returns raw text and an opaque revision alias. Select exact old or anchor text. occurrence is optional only when the selector occurs exactly once and is otherwise required (1-indexed). Empty replacement deletes.",
      tools: {
        read: readSchema,
        edit: {
          path: "string",
          base: "alias",
          edits: [
            {
              op: "replace|insert_after",
              oldText: "string?",
              anchorText: "string?",
              occurrence: "integer>=1?",
              newText: "string",
            },
          ],
        },
      },
    };
  if (protocol === "C")
    return {
      instructions:
        "First read raw text, then make a separate numbered range-read request around the target. Edit uses coordinates from that explicit range result and the original opaque revision alias.",
      tools: {
        read: readSchema,
        read_range: {
          path: "string",
          base: "alias",
          offset: "integer>=1",
          limit: "integer>=1",
        },
        edit: coordinateEdit,
      },
    };
  if (protocol === "D")
    return {
      instructions:
        "Read returns each line as uniqueID│text under an opaque revision alias. Replace selects ordered inclusive startId/endId; insert_after selects afterId. IDs must resolve uniquely.",
      tools: {
        read: readSchema,
        edit: {
          path: "string",
          base: "alias",
          edits: [
            {
              op: "replace|insert_after",
              startId: "string?",
              endId: "string?",
              afterId: "string?",
              newText: "string",
            },
          ],
        },
      },
    };
  return {
    instructions:
      "Read returns raw text and an opaque revision alias. Patch grammar is only one or more exact '@@ -start,count +start,count @@' hunks followed by lines prefixed with space, +, or -. Headers/counts, context, removals, and non-overlapping target ranges are validated; file headers and other patch syntax are invalid.",
    tools: {
      read: readSchema,
      edit: { path: "string", base: "alias", patch: "narrow validated hunk grammar" },
    },
  };
}

function readInteraction(protocol, item) {
  let content = `revision:${CANONICAL_BASE_ALIAS}\n${render(item.lines)}`;
  if (protocol === "A")
    content = `revision:${CANONICAL_BASE_ALIAS}\n${item.lines
      .map((line, index) => `${index + 1}│${line}`)
      .join("\n")}`;
  if (protocol === "D") {
    const ids = lineIds(item.lines, CANONICAL_BASE_ALIAS);
    content = `revision:${CANONICAL_BASE_ALIAS}\n${item.lines
      .map((line, index) => `${ids[index]}│${line}`)
      .join("\n")}`;
  }
  return [
    { type: "tool_call", tool: "read", arguments: { path: "screen.txt" } },
    { type: "tool_result", tool: "read", content },
  ];
}

export function buildScreenPrompt(protocol, workload) {
  if (!PROTOCOLS.includes(protocol)) throw new Error(`unknown protocol: ${protocol}`);
  const item = fixtureFor(workload);
  const protocolContract = contract(protocol);
  const approximation =
    protocol === "C"
      ? "One-response screening approximation, not a real multi-turn tool loop: choose the numbered range you would request, then emit the edit call you would make after that range read."
      : undefined;
  return JSON.stringify({
    taskIntent: intents[workload],
    protocol: { ...protocolContract, ...(approximation ? { approximation } : {}) },
    readInteraction: readInteraction(protocol, item),
    responseSchema:
      protocol === "C"
        ? {
            range: { offset: "integer>=1", limit: "integer>=1" },
            edit: protocolContract.tools.edit,
          }
        : protocolContract.tools.edit,
    responseRule: "Return exactly one JSON object and no markdown or prose.",
  });
}

export function expectedLines(workload) {
  const item = fixtureFor(workload);
  return applyCanonical(item.lines, item.edits);
}

export function simulatorOptions(protocol, workload) {
  const item = fixtureFor(workload);
  return {
    expectedBase: CANONICAL_BASE_ALIAS,
    ...(protocol === "D" ? { lineIds: lineIds(item.lines, CANONICAL_BASE_ALIAS) } : {}),
  };
}

export function coordinateTargets(workload) {
  return fixtureFor(workload).edits.flatMap((edit) => [edit.startLine, edit.endLine]);
}

export function fixtureByteString(lines) {
  return render(lines);
}
