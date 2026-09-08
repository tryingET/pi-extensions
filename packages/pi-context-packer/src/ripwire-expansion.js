/**
summary: "Expand exactly one hash-bound symbol through the pinned ripwire body dialect."
read_when:
  - "Changing source drill-down, stale selection refusal, or body parsing."
*/
import { normalizeCodeRequest } from "./code-request.js";
import { attributes } from "./ripwire-output.js";

export function expansionArguments(root, selection) {
  const request = normalizeCodeRequest({ mode: "expand", selection });
  const x = request.selection;
  return [
    root,
    `--expand=${x.path}:${x.line}:${x.name}`,
    "--top-k=0",
    "--no-cache",
    "--max-file-size=512k",
  ];
}
export async function expandSelected(runtime, root, corpus, selection) {
  normalizeCodeRequest({ mode: "expand", selection });
  if (corpus.files.get(selection.path)?.sha256 !== selection.contentSha256)
    throw new Error("stale_selection");
  return parseExpansion(await runtime.run(expansionArguments(root, selection)), selection);
}
export function parseExpansion(text, selected) {
  if (typeof text !== "string" || Buffer.byteLength(text) > 2 * 1024 * 1024)
    throw new Error("invalid_expansion");
  const envelope =
    /^<ctx[^<>]*>(?:<!--[\s\S]*?-->)?<bodies([^<>]*)>([\s\S]*)<\/bodies><\/ctx>$/u.exec(
      text.trim(),
    );
  if (!envelope) throw new Error("invalid_expansion");
  const header = attributes(envelope[1]);
  if (header.shown !== "1" || header.total !== "1" || header.capped !== "0")
    throw new Error("ambiguous_selection");
  const row = /^<b([^<>]*)>((?:<!\[CDATA\[[\s\S]*?\]\]>)+)([\s\S]*)<\/b>$/u.exec(envelope[2]);
  if (!row) throw new Error("invalid_expansion");
  const attr = attributes(row[1]);
  if (attr.p !== selected.path || attr.n !== selected.name || Number(attr.l) !== selected.line)
    throw new Error("ambiguous_selection");
  if (row[3] && !/^<calls[^<>]*>(?:<c[^<>]*>[^<]*<\/c>)*<\/calls>$/u.test(row[3]))
    throw new Error("invalid_expansion");
  const content = [...row[2].matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/gu)]
    .map((match) => match[1])
    .join("");
  return {
    records: [
      {
        ...selected,
        content,
        canonicalId: `${selected.path}:${selected.line}:${selected.name}`,
        rank: 1,
        score: 0,
        kind: attr.t,
        redacted: attr.redacted === "1",
        scrubbed: attr.scrubbed === "1",
        ancillaryOmitted: Boolean(row[3]),
      },
    ],
    total: 1,
    capped: false,
    weak: false,
    route: "exact_hash_bound_expansion",
  };
}
