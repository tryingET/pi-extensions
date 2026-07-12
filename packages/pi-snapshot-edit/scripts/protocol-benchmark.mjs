// ---
// summary: "benchmarks token cost and mutation correctness across five snapshot edit protocols"
// read_when:
//   - "modifying protocol fixtures, transcript envelopes, or token metrics"
// ---
import { getEncoding } from "js-tiktoken";
import { CANONICAL_BASE_ALIAS, lineIds, render } from "./protocol-common.mjs";
import { applyCanonical, executeProtocol } from "./protocol-simulator.mjs";

export { revisionAlias } from "./protocol-common.mjs";
export { executeProtocol } from "./protocol-simulator.mjs";

export const TOKENIZER = Object.freeze({
  implementation: "js-tiktoken@1.0.21",
  encoding: "o200k_base",
  scope: "exact encoding count of the serialized benchmark envelope; not provider-reported usage",
});

const protocols = ["A", "B", "C", "D", "E"];
const tokenizer = getEncoding(TOKENIZER.encoding);
const fixture = (id, workloadClass, lines, edits = [], options = {}) => ({
  id,
  workloadClass,
  lines,
  edits,
  stale: options.stale ?? false,
});
const replace = (startLine, endLine, newLines) => ({ op: "replace", startLine, endLine, newLines });
const insert = (afterLine, newLines) => ({ op: "insert", afterLine, newLines });
const remove = (startLine, endLine) => ({ op: "delete", startLine, endLine, newLines: [] });

export const FIXTURES = Object.freeze([
  fixture("ordinary-read", "read_only", [
    "export const answer = 42;",
    "",
    "export default answer;",
  ]),
  fixture(
    "unique-replacement",
    "unique_replacement",
    ["alpha", "unique target", "omega"],
    [replace(2, 2, ["changed target"])],
  ),
  fixture(
    "duplicate-line",
    "duplicate_targeting",
    ["alpha", "repeat", "repeat", "omega"],
    [replace(3, 3, ["chosen"])],
  ),
  fixture(
    "repeated-block",
    "repeated_block_targeting",
    ["head", "open", "body", "close", "open", "body", "close", "tail"],
    [replace(5, 7, ["open", "revised", "close"])],
  ),
  fixture(
    "blank-lines",
    "blank_lines",
    ["first", "", "middle", "", "last"],
    [replace(4, 4, ["not blank"])],
  ),
  fixture("insert", "insert_delete", ["one", "three"], [insert(1, ["two"])]),
  fixture("delete", "insert_delete", ["keep", "remove one", "remove two", "end"], [remove(2, 3)]),
  fixture(
    "batched",
    "batched_edits",
    ["a", "b", "c", "d", "e"],
    [replace(2, 2, ["B1", "B2"]), replace(4, 4, ["D"])],
  ),
  fixture("stale", "stale_rejection", ["one", "two", "three"], [replace(2, 2, ["changed"])], {
    stale: true,
  }),
]);

function numbered(lines, first = 1) {
  return lines.map((line, index) => `${first + index}│${line}`).join("\n");
}

function json(value) {
  return JSON.stringify(value);
}

function coordinateCall(edit) {
  if (edit.op === "insert") {
    return { op: "insert_after", startLine: edit.afterLine, newText: edit.newLines.join("\n") };
  }
  return {
    op: "replace",
    startLine: edit.startLine,
    endLine: edit.endLine,
    newText: edit.newLines.join("\n"),
  };
}

function occurrences(lines, needle) {
  const starts = [];
  for (let index = 0; index <= lines.length - needle.length; index += 1) {
    if (needle.every((line, offset) => lines[index + offset] === line)) starts.push(index);
  }
  return starts;
}

function occurrenceSelector(lines, edit) {
  if (edit.op === "insert") {
    const anchor = [lines[edit.afterLine - 1]];
    const starts = occurrences(lines, anchor);
    return {
      op: "insert_after",
      anchorText: anchor[0],
      ...(starts.length > 1 ? { occurrence: starts.indexOf(edit.afterLine - 1) + 1 } : {}),
      newText: edit.newLines.join("\n"),
    };
  }
  const oldLines = lines.slice(edit.startLine - 1, edit.endLine);
  const starts = occurrences(lines, oldLines);
  return {
    op: "replace",
    oldText: oldLines.join("\n"),
    ...(starts.length > 1 ? { occurrence: starts.indexOf(edit.startLine - 1) + 1 } : {}),
    newText: edit.newLines.join("\n"),
  };
}

function hashEdit(edit, ids) {
  if (edit.op === "insert")
    return {
      op: "insert_after",
      afterId: ids[edit.afterLine - 1],
      newText: edit.newLines.join("\n"),
    };
  return {
    op: "replace",
    startId: ids[edit.startLine - 1],
    endId: ids[edit.endLine - 1],
    newText: edit.newLines.join("\n"),
  };
}

// Protocol E accepts only these generated, headered hunks: exact @@ ranges and body lines
// beginning with one space, +, or -. File headers and all other patch syntax are rejected.
function patchFor(lines, edits) {
  return edits
    .map((edit) => {
      const insertion = edit.op === "insert";
      const start = insertion ? edit.afterLine + 1 : edit.startLine;
      const end = insertion ? edit.afterLine : edit.endLine;
      const beforeIndex = start - 2;
      const afterIndex = end;
      const before = beforeIndex >= 0 ? [lines[beforeIndex]] : [];
      const removed = insertion ? [] : lines.slice(start - 1, end);
      const after = afterIndex < lines.length ? [lines[afterIndex]] : [];
      const oldStart = before.length ? start - 1 : start;
      const oldCount = before.length + removed.length + after.length;
      const newCount = before.length + edit.newLines.length + after.length;
      return [
        `@@ -${oldStart},${oldCount} +${oldStart},${newCount} @@`,
        ...before.map((line) => ` ${line}`),
        ...removed.map((line) => `-${line}`),
        ...edit.newLines.map((line) => `+${line}`),
        ...after.map((line) => ` ${line}`),
      ].join("\n");
    })
    .join("\n");
}

const commonReadSchema = { path: "string", offset: "integer>=1?", limit: "integer>=1?" };
const coordinateEditSchema = {
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

function contract(protocol) {
  if (protocol === "A")
    return {
      instructions:
        "Read returns revision:<opaque alias> then 1-indexed lines as N│text. Edit against that alias. replace uses inclusive startLine/endLine; empty replacement deletes. insert_after uses startLine (0 means file start) and omits endLine.",
      tools: { read: commonReadSchema, edit: coordinateEditSchema },
    };
  if (protocol === "B")
    return {
      instructions:
        "Read returns raw text and an opaque revision alias. Select exact old or anchor text. occurrence is optional only when the selector occurs exactly once and is otherwise required (1-indexed). Empty replacement deletes.",
      tools: {
        read: commonReadSchema,
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
        read: commonReadSchema,
        read_range: { path: "string", base: "alias", offset: "integer>=1", limit: "integer>=1" },
        edit: coordinateEditSchema,
      },
    };
  if (protocol === "D")
    return {
      instructions:
        "Read returns each line as uniqueID│text under an opaque revision alias. Replace selects ordered inclusive startId/endId; insert_after selects afterId. IDs must resolve uniquely.",
      tools: {
        read: commonReadSchema,
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
      read: commonReadSchema,
      edit: { path: "string", base: "alias", patch: "narrow validated hunk grammar" },
    },
  };
}

export function protocolTranscript(protocol, item) {
  if (!protocols.includes(protocol)) throw new Error("unknown protocol");
  const base = CANONICAL_BASE_ALIAS;
  const path = `${item.id}.txt`;
  const events = [];
  events.push({ type: "tool_call", tool: "read", arguments: { path } });
  const rawResult = `revision:${base}\n${render(item.lines)}`;
  if (protocol === "A")
    events.push({
      type: "tool_result",
      tool: "read",
      content: `revision:${base}\n${numbered(item.lines)}`,
    });
  else if (protocol === "D") {
    const ids = lineIds(item.lines, base);
    events.push({
      type: "tool_result",
      tool: "read",
      content: `revision:${base}\n${item.lines.map((line, index) => `${ids[index]}│${line}`).join("\n")}`,
    });
  } else events.push({ type: "tool_result", tool: "read", content: rawResult });

  if (protocol === "C" && item.edits.length) {
    const touched = item.edits.flatMap((edit) =>
      edit.op === "insert" ? [edit.afterLine] : [edit.startLine, edit.endLine],
    );
    const low = Math.max(1, Math.min(...touched) - 1);
    const high = Math.min(item.lines.length, Math.max(...touched) + 1);
    events.push({
      type: "tool_call",
      tool: "read_range",
      arguments: { path, base, offset: low, limit: high - low + 1 },
    });
    events.push({
      type: "tool_result",
      tool: "read_range",
      content: `revision:${base}\n${numbered(item.lines.slice(low - 1, high), low)}`,
    });
  }

  let editCall = null;
  if (item.edits.length) {
    if (protocol === "A" || protocol === "C")
      editCall = { path, base, edits: item.edits.map(coordinateCall) };
    else if (protocol === "B")
      editCall = {
        path,
        base,
        edits: item.edits.map((edit) => occurrenceSelector(item.lines, edit)),
      };
    else if (protocol === "D") {
      const ids = lineIds(item.lines, base);
      editCall = { path, base, edits: item.edits.map((edit) => hashEdit(edit, ids)) };
    } else editCall = { path, base, patch: patchFor(item.lines, item.edits) };
    events.push({ type: "tool_call", tool: "edit", arguments: editCall });
    events.push({
      type: "tool_result",
      tool: "edit",
      content: item.stale ? "error: stale revision" : "applied; new revision issued",
    });
  }
  return { ...contract(protocol), events, editCall };
}

export function validateMutation(protocol, item, transcript) {
  if (!transcript.editCall) return { outcome: "read_only", correct: true };
  const current = item.stale ? ["external change", ...item.lines] : [...item.lines];
  if (item.stale) {
    try {
      executeProtocol(protocol, current, transcript.editCall, {
        expectedBase: "external-revision",
      });
    } catch (error) {
      if (error.message === "wrong base revision")
        return { outcome: "stale_rejected", correct: true };
      throw error;
    }
    throw new Error("stale revision accepted");
  }
  const actual = executeProtocol(protocol, current, transcript.editCall, {
    expectedBase: CANONICAL_BASE_ALIAS,
  });
  const expected = applyCanonical(item.lines, item.edits);
  if (json(actual) !== json(expected)) throw new Error("wrong target or output");
  return { outcome: "mutated", correct: true };
}

export function runBenchmark() {
  const rows = [];
  for (const protocol of protocols) {
    for (const item of FIXTURES) {
      const transcript = protocolTranscript(protocol, item);
      const serializedEnvelope = json({
        benchmarkSemantics:
          "oracle-authored canonical-correct transcript cost; model selection is not measured",
        instructions: transcript.instructions,
        tools: transcript.tools,
        events: transcript.events,
      });
      const tokenCount = tokenizer.encode(serializedEnvelope).length;
      const result = validateMutation(protocol, item, transcript);
      rows.push({
        protocol,
        fixtureId: item.id,
        workloadClass: item.workloadClass,
        tokenCount,
        outcome: result.outcome,
      });
    }
  }
  const aggregate = {
    schemaVersion: 2,
    tokenizer: TOKENIZER,
    envelope:
      "oracle-authored canonical-correct compact JSON transcript of protocol instructions, tool schemas, and ordered separate tool_call/tool_result events for every protocol",
    fixtureCount: FIXTURES.length,
    protocols: Object.fromEntries(
      protocols.map((protocol) => {
        const selected = rows.filter((row) => row.protocol === protocol);
        const successful = selected.filter((row) => row.outcome === "mutated");
        const classes = [...new Set(selected.map((row) => row.workloadClass))].sort();
        return [
          protocol,
          {
            totalTokens: selected.reduce((sum, row) => sum + row.tokenCount, 0),
            tokensPerCorrectMutationCase: Number(
              (
                successful.reduce((sum, row) => sum + row.tokenCount, 0) / successful.length
              ).toFixed(3),
            ),
            correctMutationCases: successful.length,
            staleRejections: selected.filter((row) => row.outcome === "stale_rejected").length,
            byWorkloadClass: Object.fromEntries(
              classes.map((name) => {
                const grouped = selected.filter((row) => row.workloadClass === name);
                return [
                  name,
                  {
                    cases: grouped.length,
                    tokens: grouped.reduce((sum, row) => sum + row.tokenCount, 0),
                  },
                ];
              }),
            ),
          },
        ];
      }),
    ),
  };
  return { aggregate, rows };
}
