import { EVIDENCE_KIND_ORDER } from "./source-selection-experiment-structural.js";
import { compareUtf8 } from "./source-selection-experiment-utils.js";

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "its",
  "with",
  "change",
  "focused",
  "test",
  "tests",
  "behavior",
]);

function words(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? [],
  );
}

function queryTokens(question) {
  return [...words(question)]
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .sort(compareUtf8);
}

function matchingTokenCount(text, tokens) {
  const available = words(text);
  return tokens.reduce((count, token) => count + Number(available.has(token)), 0);
}

export function buildRankingRows(caseDefinition, repository, structuralEvidence) {
  const tokens = queryTokens(caseDefinition.question);
  return repository.records.map((record) => {
    const structural = structuralEvidence.stats.get(record.path);
    return {
      path: record.path,
      pathScore: matchingTokenCount(record.path, tokens) * 2,
      metadataScore:
        record.metadataStatus === "present"
          ? matchingTokenCount([record.summary ?? "", ...record.readWhen].join(" "), tokens)
          : 0,
      directEvidenceCount: structural.directCount,
      relatedEvidenceCount: structural.relatedCount,
      structuralKindCounts: structural.kindCounts,
    };
  });
}

function structuralOrder(left, right) {
  const totalOrder =
    right.directEvidenceCount - left.directEvidenceCount ||
    right.relatedEvidenceCount - left.relatedEvidenceCount;
  if (totalOrder !== 0) return totalOrder;
  for (const kind of EVIDENCE_KIND_ORDER) {
    const kindOrder = right.structuralKindCounts[kind] - left.structuralKindCounts[kind];
    if (kindOrder !== 0) return kindOrder;
  }
  return 0;
}

export function selectArm(rows, arm, maxItems) {
  const ordered = [...rows];
  ordered.sort((left, right) => {
    if (arm === "structural" || arm === "fusion") {
      const structural = structuralOrder(left, right);
      if (structural !== 0) return structural;
    }
    if (arm === "source_list" || arm === "fusion") {
      const total = right.pathScore + right.metadataScore - (left.pathScore + left.metadataScore);
      if (total !== 0) return total;
      const metadata = right.metadataScore - left.metadataScore;
      if (metadata !== 0) return metadata;
    }
    if (arm !== "structural") {
      const path = right.pathScore - left.pathScore;
      if (path !== 0) return path;
    }
    return compareUtf8(left.path, right.path);
  });
  return ordered.slice(0, maxItems).map(({ path }) => path);
}

export function metrics(selected, truth) {
  const truthSet = new Set(truth);
  const hits = selected.filter((path) => truthSet.has(path));
  return {
    selected,
    hits: hits.length,
    precision: selected.length === 0 ? 0 : hits.length / selected.length,
    recall: truth.length === 0 ? 0 : hits.length / truth.length,
    unnecessary: selected.filter((path) => !truthSet.has(path)),
    omittedTruth: truth.filter((path) => !selected.includes(path)),
  };
}
