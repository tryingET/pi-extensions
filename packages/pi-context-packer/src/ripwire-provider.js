/**
summary: "Read-only ripwire candidate provider over a private approved-corpus snapshot."
read_when:
  - "Changing code discovery, candidate provenance, or explicit failure reporting."
*/
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { boundContextText, defineReadOnlyContextProvider } from "./provider-api.js";
import { cachedRipwireText } from "./ripwire-cache.js";
import { copyApprovedCorpus } from "./ripwire-corpus.js";
import { discoveryArguments, prepareRipwire } from "./ripwire-exec.js";
import { expansionArguments, parseExpansion } from "./ripwire-expansion.js";
import { parseRipwireCandidates } from "./ripwire-output.js";

const PUBLIC_ERRORS = new Set([
  "ripwire_not_configured",
  "ripwire_digest_required",
  "ripwire_digest_mismatch",
  "ripwire_version_unsupported",
  "invalid_root",
  "invalid_objective",
  "invalid_limit",
  "invalid_exclusion_policy",
  "anchored_reads_unavailable",
  "corpus_entry_limit",
  "corpus_size_limit",
  "source_changed",
  "directory_changed",
  "source_path_changed",
  "invalid_code_request",
  "invalid_code_selection",
  "stale_selection",
  "ambiguous_selection",
  "invalid_cache_root",
  "cache_not_private",
]);
export async function collectRipwire(input, options = {}) {
  options.signal?.throwIfAborted();
  const scratch = await mkdtemp(join(tmpdir(), "pi-ripwire-"));
  try {
    const runtime = await prepareRipwire(scratch, options);
    const corpusRoot = join(scratch, "corpus");
    await mkdir(corpusRoot, { mode: 0o700 });
    const corpus = await copyApprovedCorpus(input.root, corpusRoot, options);
    const selection = input.code?.mode === "expand" ? input.code.selection : null;
    if (selection && corpus.files.get(selection.path)?.sha256 !== selection.contentSha256)
      throw new Error("stale_selection");
    const args = selection
      ? expansionArguments(corpusRoot, selection)
      : discoveryArguments(corpusRoot, input.objective, input.limit ?? 20);
    const cached = corpus.files.size
      ? await cachedRipwireText({
          cacheRoot: options.cacheRoot,
          sourceRoot: corpus.root,
          identity: {
            binary: runtime.binarySha256,
            snapshot: corpus.snapshotId,
            args: args.slice(1),
          },
          compute: () => runtime.run(args),
          parse: (text) =>
            selection ? parseExpansion(text, selection) : parseRipwireCandidates(text, corpus),
          signal: options.signal,
        })
      : {
          value: { records: [], total: 0, capped: false, weak: false, route: "empty_corpus" },
          cache: "disabled",
        };
    const parsed = cached.value;
    const omissions = [];
    const omitted = (reason, detail) => omissions.push({ provider: "ripwire", reason, detail });
    if (!parsed.records.length)
      omitted(
        "no_results",
        "No code candidates found in the approved corpus; use Pi read/search tools.",
      );
    if (parsed.capped)
      omitted(
        "candidate_limit",
        "Lower-ranked candidates omitted; narrow the task or request a larger limit.",
      );
    if (parsed.weak)
      omitted("weak_evidence", "Low lexical evidence; verify candidate relevance in source.");
    const skipped = Object.values(corpus.skipped).reduce((a, b) => a + b, 0);
    if (skipped)
      omitted(
        "scope_exclusions",
        `${skipped} entries excluded by code-corpus policy; this is not whole-repository completeness.`,
      );
    return {
      ok: true,
      items: parsed.records.map((record) => {
        const bounded = boundContextText(
          `${record.path}:${record.line}\n${record.content ?? record.signature ?? record.name}`,
          16000,
        );
        const content = bounded.text;
        if (bounded.truncated)
          omitted(
            "body_truncated",
            "Source content exceeded the per-item cap; use a narrower native read for the remainder.",
          );
        if (record.redacted || bounded.redactionCount)
          omitted(
            "redacted",
            "Credential-shaped text was redacted; this projection is not byte-exact source.",
          );
        if (record.scrubbed) omitted("scrubbed", "Upstream reports source-byte scrubbing.");
        if (record.ancillaryOmitted)
          omitted(
            "ancillary_omitted",
            "Callee signature enrichment is omitted from this focused body packet.",
          );
        return {
          id: `ripwire:${record.path}:${record.line}:${record.canonicalId}`,
          kind: "symbol",
          content,
          contentMode: record.content !== undefined ? "body" : "signature",
          bytes: Buffer.byteLength(content),
          estimatedTokens: Math.ceil(Buffer.byteLength(content) / 4),
          provenance: {
            provider: "ripwire",
            path: record.path,
            symbol: record.name,
            truncated: bounded.truncated,
            redacted: record.redacted || bounded.redactionCount > 0,
            line: record.line,
            canonicalId: record.canonicalId,
            rank: record.rank,
            score: record.score,
            route: parsed.route,
            snapshotId: corpus.snapshotId,
            contentSha256: record.contentSha256,
            binarySha256: runtime.binarySha256,
          },
          authority:
            "Heuristic code-discovery evidence; not a complete call graph or edit authorization.",
          rationale:
            "Ranked by ripwire for the requested objective; score is comparable only within this route.",
          freshness:
            "individually stable source reads copied to a private snapshot; not a filesystem transaction",
        };
      }),
      omissions,
      state: {
        snapshotId: corpus.snapshotId,
        analyzedFiles: corpus.files.size,
        analyzedBytes: corpus.totalBytes,
        skipped: corpus.skipped,
        totalRanked: parsed.total,
        route: parsed.route,
        weak: parsed.weak,
        sourceRevision: runtime.sourceRevision,
        sourceProvenance: runtime.sourceProvenance,
        binarySha256: runtime.binarySha256,
        precision: "heuristic",
        cache: cached.cache,
        noSourceWrites: true,
      },
    };
  } catch (error) {
    options.signal?.throwIfAborted();
    const reason = PUBLIC_ERRORS.has(error.message) ? error.message : "provider_failed";
    return {
      ok: false,
      items: [],
      omissions: [
        {
          provider: "ripwire",
          reason,
          detail:
            "Ripwire unavailable or refused; use Pi read/search tools. Raw process diagnostics withheld.",
        },
      ],
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export const ripwireProvider = defineReadOnlyContextProvider({
  id: "ripwire",
  version: "v1",
  collect: collectRipwire,
  authority: "Read-only, operator-provisioned code discovery over an approved corpus.",
});
