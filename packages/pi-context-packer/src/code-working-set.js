/**
summary: "Deduplicate only code keys present in active, uncompacted tool results."
read_when:
  - "Changing working-set identity, refresh behavior, or active-session inspection."
*/
import { digest } from "./ripwire-corpus.js";

const KEY = /^[a-f0-9]{64}$/u;
export function codeContentKey(root, record, content) {
  return digest(
    JSON.stringify([
      "code-content-v1",
      root,
      record.path,
      record.line,
      record.contentSha256,
      record.mode,
      digest(content),
    ]),
  );
}
export function workingSetFromEntries(entries) {
  const keys = new Set();
  if (!Array.isArray(entries)) return { available: false, keys: [] };
  let remainingBytes = 2 * 1024 * 1024;
  for (const entry of entries.slice(-2000).reverse()) {
    const m = entry?.type === "message" ? entry.message : null;
    if (
      m?.role !== "toolResult" ||
      m.toolName !== "context_pack" ||
      m.isError ||
      m.details?.ok !== true
    )
      continue;
    if (remainingBytes <= 0) return { available: true, keys: [...keys], bounded: true };
    const content = Array.isArray(m.content)
      ? m.content
          .slice(0, 8)
          .filter((x) => x?.type === "text" && typeof x.text === "string")
          .map((x) => {
            const text = x.text.slice(
              0,
              Math.max(0, Math.min(300000, Math.floor(remainingBytes / 4))),
            );
            remainingBytes -= Buffer.byteLength(text);
            return text;
          })
          .join("\n")
      : "";
    const sections = Array.isArray(m.details.sections) ? m.details.sections.slice(0, 16) : [];
    for (const section of sections) {
      if (section?.provider !== "ripwire" || !Array.isArray(section.items)) continue;
      for (const item of section.items.slice(0, 100)) {
        const key = item?.provenance?.contentKey;
        if (
          ["body", "signature"].includes(item?.contentMode) &&
          typeof key === "string" &&
          KEY.test(key) &&
          content.includes(`context key: ${key}`)
        )
          keys.add(key);
        if (keys.size >= 256) return { available: true, keys: [...keys], bounded: true };
      }
    }
  }
  return { available: true, keys: [...keys], bounded: entries.length > 2000 };
}
export function activeCodeWorkingSet(context) {
  try {
    return workingSetFromEntries(context?.sessionManager?.buildContextEntries?.());
  } catch {
    return { available: false, keys: [] };
  }
}
export function dedupeCodeItems(items, workingSet, refresh = false) {
  const keys = new Set(
    Array.isArray(workingSet?.keys)
      ? workingSet.keys.slice(0, 256).filter((x) => typeof x === "string" && KEY.test(x))
      : [],
  );
  let duplicates = 0;
  const selected = items.map((item) => {
    if (refresh || workingSet?.available !== true || !keys.has(item.provenance?.contentKey))
      return item;
    duplicates++;
    const content =
      "Already loaded in active Pi context; unchanged content omitted. Use code.refresh=true to serve it again.";
    return {
      ...item,
      content,
      contentMode: "metadata",
      bytes: Buffer.byteLength(content),
      estimatedTokens: Math.ceil(Buffer.byteLength(content) / 2),
      duplicateOf: "active_pi_context",
      duplicateTokensAvoided: item.estimatedTokens,
    };
  });
  return {
    items: selected,
    duplicates,
    workingSetStatus: workingSet?.available === true ? "active_context" : "unavailable",
  };
}
