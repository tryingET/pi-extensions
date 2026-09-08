import { Buffer } from "node:buffer";

const PROHIBITED_SCI_PATH_PATTERNS = Object.freeze([
  "any .ontology path segment",
  "any .semantic-graph path segment",
  "any .sci path segment",
  ".semantic-code-ignore",
  ".semantic-code-intelligence-config.yaml",
  "index.scip or any *.scip path",
]);

function decodeStraceString(value) {
  return value
    .replace(/\\([0-7]{3})/g, (_match, octal) => String.fromCharCode(Number.parseInt(octal, 8)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function quotedValues(line) {
  const values = [];
  const pattern = /"((?:\\.|[^"\\])*)"/g;
  for (const match of line.matchAll(pattern)) values.push(decodeStraceString(match[1]));
  return values;
}

function normalizedPath(value) {
  return value.replaceAll("\\", "/").replace(/\/+$/u, "");
}

function isKnownSciIndexOrStatePath(value) {
  const itemPath = normalizedPath(value);
  return (
    /(?:^|\/)\.ontology(?:\/|$)/u.test(itemPath) ||
    /(?:^|\/)\.semantic-graph(?:\/|$)/u.test(itemPath) ||
    /(?:^|\/)\.sci(?:\/|$)/u.test(itemPath) ||
    /(?:^|\/)\.semantic-code-ignore$/u.test(itemPath) ||
    /(?:^|\/)\.semantic-code-intelligence-config\.yaml$/u.test(itemPath) ||
    /(?:^|\/)(?:index\.scip|[^/]+\.scip)$/u.test(itemPath)
  );
}

function isGitIndexPath(value) {
  return /(?:^|\/)\.git\/index(?:\.lock)?$/u.test(normalizedPath(value));
}

export function inspectFileAccessTrace(traceBytes, targetRoot, caseId) {
  const trace = new TextDecoder("utf-8", { fatal: true }).decode(traceBytes);
  const lines = trace.split("\n").filter(Boolean);
  const prohibited = [];
  let gitIndexAccessRecordCount = 0;
  let targetGitIndexAccessRecordCount = 0;
  const normalizedTarget = normalizedPath(targetRoot);
  for (const [index, line] of lines.entries()) {
    const values = quotedValues(line);
    if (values.some(isGitIndexPath)) {
      gitIndexAccessRecordCount += 1;
      if (
        values.some((value) => {
          const normalized = normalizedPath(value);
          return (
            normalized === ".git/index" ||
            normalized === ".git/index.lock" ||
            normalized.startsWith(`${normalizedTarget}/.git/index`)
          );
        })
      )
        targetGitIndexAccessRecordCount += 1;
    }
    const badPaths = values.filter(isKnownSciIndexOrStatePath);
    if (badPaths.length > 0) prohibited.push({ line: index + 1, paths: badPaths });
  }
  if (prohibited.length > 0) {
    throw new Error(
      `${caseId}: strace observed prohibited SCI index/state path access at ${JSON.stringify(prohibited.slice(0, 5))}`,
    );
  }
  return {
    schema: "pi-context-packer.sci_file_access_corroboration.v1",
    scope: "subject exporter argv and descendants under strace trace=%file",
    characterization: "bounded-file-access-corroboration-not-authentication",
    syscallRecordCount: lines.length,
    prohibitedSciIndexOrStateAccessCount: 0,
    prohibitedPathClasses: [...PROHIBITED_SCI_PATH_PATTERNS],
    gitIndexAccessRecordCount,
    targetGitIndexAccessRecordCount,
    gitIndexClassification:
      "Git .git/index access is Git clean-state plumbing, not an SCI semantic index; preparation-harness Git index reads occur outside this subject trace.",
    traceByteCount: traceBytes.length,
    approximateTraceTokensCeilBytesDiv4: Math.ceil(traceBytes.length / 4),
  };
}

export function byteAndTokenCost(value) {
  const bytes = Buffer.isBuffer(value) ? value.length : Buffer.byteLength(value, "utf8");
  return { bytes, approximateTokensCeilBytesDiv4: Math.ceil(bytes / 4) };
}
