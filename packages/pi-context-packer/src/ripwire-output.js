/**
summary: "Strict parser for the pinned candidates dialect; no DTDs or external XML entities."
read_when:
  - "Changing the ripwire output contract or normalized symbol identities."
*/
import { safeRelative } from "./ripwire-corpus.js";

function decode(value) {
  if (/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/u.test(value))
    throw new Error("unknown_entity");
  return value.replace(/&([^;]+);/gu, (_, entity) => {
    const known = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (Object.hasOwn(known, entity)) return known[entity];
    const code = entity.startsWith("#x")
      ? Number.parseInt(entity.slice(2), 16)
      : Number(entity.slice(1));
    if (
      !Number.isSafeInteger(code) ||
      code < 1 ||
      code > 0x10ffff ||
      (code >= 0xd800 && code <= 0xdfff)
    )
      throw new Error("invalid_entity");
    return String.fromCodePoint(code);
  });
}
function attributes(text) {
  const out = Object.create(null);
  while (text.trim()) {
    const match = /^\s+([a-z_]+)="([^"<>]*)"/u.exec(text);
    if (!match || Object.hasOwn(out, match[1])) throw new Error("invalid_attributes");
    out[match[1]] = decode(match[2]);
    text = text.slice(match[0].length);
  }
  return out;
}
const integer = (value) =>
  typeof value === "string" && /^\d+$/u.test(value) && Number.isSafeInteger(Number(value));

export function parseRipwireCandidates(stdout, corpus) {
  if (typeof stdout !== "string" || Buffer.byteLength(stdout) > 2 * 1024 * 1024)
    throw new Error("output_limit");
  const xml = stdout.replace(/^<!--[\s\S]*?-->\s*/u, "").trim();
  const match = /^<candidates([^<>]*)>([\s\S]*)<\/candidates>$/u.exec(xml);
  if (!match) throw new Error("invalid_candidates_envelope");
  const header = attributes(match[1]);
  if (
    !integer(header.count) ||
    !integer(header.total) ||
    Number(header.count) > 100 ||
    Number(header.total) < Number(header.count) ||
    !["0", "1"].includes(header.capped) ||
    !header.route
  )
    throw new Error("invalid_candidates_header");
  let body = match[2];
  const records = [];
  while (body.trim()) {
    if (records.length >= 100) throw new Error("candidate_limit");
    const row = /^\s*<cand([^<>]*)>(?:<sig>([^<]*)<\/sig>)?<\/cand>/u.exec(body);
    if (!row) throw new Error("invalid_candidate_row");
    const attr = attributes(row[1]);
    if (
      !integer(attr.r) ||
      Number(attr.r) !== records.length + 1 ||
      !integer(attr.l) ||
      Number(attr.l) < 1 ||
      !safeRelative(attr.p) ||
      !corpus.files.has(attr.p) ||
      !attr.n ||
      !attr.id ||
      !attr.k ||
      typeof attr.s !== "string" ||
      !Number.isFinite(Number(attr.s))
    )
      throw new Error("invalid_candidate_identity");
    records.push({
      path: attr.p,
      line: Number(attr.l),
      name: attr.n,
      canonicalId: attr.id,
      kind: attr.k,
      rank: Number(attr.r),
      score: Number(attr.s),
      signature: decode(row[2] ?? ""),
      contentSha256: corpus.files.get(attr.p).sha256,
    });
    body = body.slice(row[0].length);
  }
  if (records.length !== Number(header.count)) throw new Error("candidate_count_mismatch");
  return {
    records,
    total: Number(header.total),
    capped: header.capped === "1",
    weak: header.weak === "1",
    route: header.route,
  };
}
