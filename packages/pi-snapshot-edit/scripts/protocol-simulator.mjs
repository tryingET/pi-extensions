import { lineIds, revisionAlias } from "./protocol-common.mjs";

const insert = (afterLine, newLines) => ({ op: "insert", afterLine, newLines });
const replace = (startLine, endLine, newLines) => ({ op: "replace", startLine, endLine, newLines });

function occurrences(lines, needle) {
  const starts = [];
  for (let index = 0; index <= lines.length - needle.length; index += 1) {
    if (needle.every((line, offset) => lines[index + offset] === line)) starts.push(index);
  }
  return starts;
}

function splitText(text) {
  return text === "" ? [] : text.split("\n");
}

function validateCanonical(lines, edit) {
  if (edit.op === "insert") {
    if (!Number.isInteger(edit.afterLine) || edit.afterLine < 0 || edit.afterLine > lines.length)
      throw new Error("invalid insert range");
    return;
  }
  if (edit.op !== "replace" && edit.op !== "delete") throw new Error("unknown canonical operation");
  if (
    !Number.isInteger(edit.startLine) ||
    !Number.isInteger(edit.endLine) ||
    edit.startLine < 1 ||
    edit.endLine < edit.startLine ||
    edit.endLine > lines.length
  )
    throw new Error("invalid replace range");
}

export function applyCanonical(lines, edits) {
  for (const edit of edits) validateCanonical(lines, edit);
  const spans = edits
    .map((edit) =>
      edit.op === "insert"
        ? [edit.afterLine + 0.5, edit.afterLine + 0.5]
        : [edit.startLine, edit.endLine],
    )
    .sort((a, b) => a[0] - b[0]);
  for (let index = 1; index < spans.length; index += 1)
    if (spans[index][0] <= spans[index - 1][1]) throw new Error("overlapping operations");
  const result = [...lines];
  const ordered = [...edits].sort(
    (left, right) =>
      (right.op === "insert" ? right.afterLine + 0.5 : right.startLine) -
      (left.op === "insert" ? left.afterLine + 0.5 : left.startLine),
  );
  for (const edit of ordered) {
    if (edit.op === "insert") result.splice(edit.afterLine, 0, ...edit.newLines);
    else result.splice(edit.startLine - 1, edit.endLine - edit.startLine + 1, ...edit.newLines);
  }
  return result;
}

function executeB(lines, calls) {
  const canonical = calls.map((call) => {
    if (call.op === "insert_after") {
      if (typeof call.anchorText !== "string") throw new Error("missing anchor selector");
      const starts = occurrences(lines, [call.anchorText]);
      if (starts.length !== 1 && call.occurrence === undefined)
        throw new Error("ambiguous selector requires occurrence");
      if (
        call.occurrence !== undefined &&
        (!Number.isInteger(call.occurrence) || call.occurrence < 1)
      )
        throw new Error("invalid occurrence");
      const index = starts[(call.occurrence ?? 1) - 1];
      if (index === undefined) throw new Error("selector not found");
      return insert(index + 1, splitText(call.newText));
    }
    if (call.op !== "replace") throw new Error("unknown occurrence operation");
    if (typeof call.oldText !== "string") throw new Error("missing oldText selector");
    const oldLines = call.oldText.split("\n");
    const starts = occurrences(lines, oldLines);
    if (starts.length !== 1 && call.occurrence === undefined)
      throw new Error("ambiguous selector requires occurrence");
    if (
      call.occurrence !== undefined &&
      (!Number.isInteger(call.occurrence) || call.occurrence < 1)
    )
      throw new Error("invalid occurrence");
    const index = starts[(call.occurrence ?? 1) - 1];
    if (index === undefined) throw new Error("selector not found");
    return replace(index + 1, index + oldLines.length, splitText(call.newText));
  });
  return applyCanonical(lines, canonical);
}

function executeCoordinates(lines, calls) {
  const canonical = calls.map((call) => {
    if (call.op === "insert_after") {
      if (call.endLine !== undefined) throw new Error("insert_after cannot have endLine");
      return insert(call.startLine, splitText(call.newText));
    }
    if (call.op !== "replace") throw new Error("unknown coordinate operation");
    return replace(call.startLine, call.endLine, splitText(call.newText));
  });
  return applyCanonical(lines, canonical);
}

function uniqueIdIndex(ids, id) {
  const matches = ids.flatMap((candidate, index) => (candidate === id ? [index] : []));
  if (matches.length !== 1)
    throw new Error(matches.length ? "line id collision" : "line id not found");
  return matches[0];
}

function executeD(lines, calls, base, idsOverride) {
  const ids = idsOverride ?? lineIds(lines, base);
  if (ids.length !== lines.length) throw new Error("invalid id table");
  const canonical = calls.map((call) => {
    if (call.op === "insert_after")
      return insert(uniqueIdIndex(ids, call.afterId) + 1, splitText(call.newText));
    if (call.op !== "replace") throw new Error("unknown hash operation");
    const startLine = uniqueIdIndex(ids, call.startId) + 1;
    const endLine = uniqueIdIndex(ids, call.endId) + 1;
    if (endLine < startLine) throw new Error("reversed id range");
    return replace(startLine, endLine, splitText(call.newText));
  });
  return applyCanonical(lines, canonical);
}

function executePatch(lines, patch) {
  if (typeof patch !== "string" || patch === "") throw new Error("empty patch");
  const patchLines = patch.split("\n");
  const canonical = [];
  for (let cursor = 0; cursor < patchLines.length; ) {
    const match = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/.exec(patchLines[cursor]);
    if (!match) throw new Error("invalid hunk header");
    const oldStart = Number(match[1]);
    const oldExpected = Number(match[2]);
    const newStart = Number(match[3]);
    const newExpected = Number(match[4]);
    if (oldStart < 1 || newStart !== oldStart) throw new Error("invalid hunk coordinates");
    cursor += 1;
    let oldCursor = oldStart;
    let oldCount = 0;
    let newCount = 0;
    let changeStart = null;
    let changeClosed = false;
    const removed = [];
    const added = [];
    while (cursor < patchLines.length && !patchLines[cursor].startsWith("@@ ")) {
      const row = patchLines[cursor];
      if (row.length === 0) throw new Error("invalid patch marker");
      const marker = row[0];
      const text = row.slice(1);
      if (marker === " ") {
        if (lines[oldCursor - 1] !== text) throw new Error("patch context mismatch");
        if (changeStart !== null) changeClosed = true;
        oldCursor += 1;
        oldCount += 1;
        newCount += 1;
      } else if (marker === "-") {
        if (changeClosed) throw new Error("multiple change groups in hunk");
        if (lines[oldCursor - 1] !== text) throw new Error("patch removal mismatch");
        if (changeStart === null) changeStart = oldCursor;
        removed.push(text);
        oldCursor += 1;
        oldCount += 1;
      } else if (marker === "+") {
        if (changeClosed) throw new Error("multiple change groups in hunk");
        if (changeStart === null) changeStart = oldCursor;
        added.push(text);
        newCount += 1;
      } else throw new Error("invalid patch marker");
      cursor += 1;
    }
    if (oldCount !== oldExpected || newCount !== newExpected)
      throw new Error("hunk count mismatch");
    if (changeStart === null || (removed.length === 0 && added.length === 0))
      throw new Error("empty patch hunk");
    canonical.push(
      removed.length === 0
        ? insert(changeStart - 1, added)
        : replace(changeStart, changeStart + removed.length - 1, added),
    );
  }
  return applyCanonical(lines, canonical);
}

export function executeProtocol(protocol, lines, editCall, options = {}) {
  const expectedBase = options.expectedBase ?? revisionAlias(lines);
  if (!editCall || editCall.base !== expectedBase) throw new Error("wrong base revision");
  if (protocol === "B") return executeB(lines, editCall.edits);
  if (protocol === "D") return executeD(lines, editCall.edits, editCall.base, options.lineIds);
  if (protocol === "E") return executePatch(lines, editCall.patch);
  if (protocol === "A" || protocol === "C") return executeCoordinates(lines, editCall.edits);
  throw new Error("unknown protocol");
}
