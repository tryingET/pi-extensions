# Claude physical-history adapter contract

## Qualification and boundaries

`agent.session-recovery.claude.v1` is separate from `pi.session-insights.v2`. `support` declares the tested version/scope separately from `coverage.versions`, reports unknown/unqualified observed versions, and always denies full schema/effective-context coverage.
The Claude adapter has synthetic adversarial checks and metadata-only qualification on five frozen lehrplan-viz transcripts plus four compacted pult transcripts, all reporting Claude Code `2.1.280`. This does not establish every Claude version, record variant, sidecar or effective-context algorithm. No Claude model is invoked.

`lib/claude-session-insights.jq` alone parses Claude JSONL. Node reads a bounded byte snapshot from one open descriptor, hashes those same bytes, supplies them to jq on stdin, checks pre/post file identity and serializes bounded jq output. It never parses source JSONL. Pre/post equality is not a freeze, archive custody or backup proof; a source can still change later.

## Invocation

From the skill directory:

```bash
node ../../bin/pi-session-insights.mjs --format claude --help
node ../../bin/pi-session-insights.mjs --format claude --view leaves --page-size 50 --private-output /private/output/leaves.json /private/source.jsonl
node ../../bin/pi-session-insights.mjs --format claude --view chain --leaf exact-uuid --private-output /private/output/chain.json /private/source.jsonl
```

Options: `--view records|leaves|chain|references|compactions|errors`, `--page`, `--page-size`, `--leaf`, `--max-chain`, `--max-input-bytes`, `--private-output`, `--include-paths`, `--include-text`, `--max-text-chars`, `--sidecar-root`, `--pretty`, `--jq-bin`.

`--attribution` is Pi-only and refused by the Claude adapter. No authority-bearing fields are inferred for Claude.

## Paging and graph

- Each row has a 1-based physical source line and exact UUID when representable (1..256 characters). Invalid IDs are not truncated into misleading locators.
- Views page in physical append order, including `chain`; chain rows retain parent UUIDs. Root-to-leaf effective replay is not provided.
- `pagination.total` covers the selected view; `coverage.physical_lines` covers the input snapshot. `next_page:null` completes that view only. Out-of-range pages return zero rows.
- `coverage` counters cover parsed objects. Decoder-rejected JSON, nonstandard scalar tokens, non-objects and oversized lines appear as machine error records in `records` and `errors` views. A jq-owned lexical screen rejects NaN/Infinity/leading-zero and other nonstandard scalar tokens while preserving complete quoted strings; structural/escape decoding still belongs to jq. This is not a full JSON-schema or numeric-precision certification.
- `graph.last_appended_uuid` is a physical append fact, not an active-leaf claim. `graph.last_prompt_pointer` preserves the latest stored pointer separately.
- `chain_status` can be `not_requested`, `complete`, `missing_parent`, `invalid_parent`, `cycle`, `budget_exhausted` or `ambiguous_duplicate_uuids`. “Complete” describes only a structural parent walk; it does not establish effective post-compaction context or source completeness.
- Compactions identify `system.subtype=compact_boundary`, `isCompactSummary=true`, or legacy `type=summary`. Selected logical-parent/leaf references and numeric pre-token metadata are observations, never summary bodies or effective replay.

## Reference scope

Records expose child/parent tool-use and session IDs, sidechain/agent IDs, peer source-tool/message IDs, queue-operation metadata, task/background IDs, tool call/result IDs and structural error flags when stored in recognized fields. Content and authority are not inferred from them. Other fields are not semantically interpreted.

Candidate sidecars come from selected `toolUseResult` path fields and `/tool-results/` path patterns in string tool-result blocks. These references are not exhaustive. A generic `filePath` may identify a source file rather than external tool output. Paths are untrusted and never executed or read. Default serialization withholds exact sidecar paths, replacing them with a SHA-256 plus physical-line/ordinal reference. Control-character path fields are rejected with an issue. `--include-paths` preserves exact candidate paths only in an explicit `--private-output` artifact, never its stdout receipt. A digest is a reference, not a claim of anonymization.

Without `--sidecar-root`, status is `not_inspected`. An explicit allowed root permits presence checks only: `present_unread`, `missing`, `outside_allowed_root`, `not_regular_file` or `unavailable`. No home expansion or automatic frozen-root remapping occurs. Absolute paths in archived transcripts often point outside the archive; resolve archival mapping through its manifest separately. Lexical and realpath checks deny symlink escape, but presence is a momentary observation, not custody proof.

## Privacy, errors and limits

Full Claude extraction output is an **unredacted private artifact**, not a model-safe projection. Withholding bodies and sidecar paths does not sanitize arbitrary IDs/names/version strings or other metadata. The documented recovery workflow uses `--private-output`: an exclusive mode0600 file inside an owned mode0700 directory, plus a fixed numeric/digest stdout receipt. Text/path opt-ins require this mode. Existing targets are not overwritten; failures and partial files without successful receipts are not completed artifacts.

For model exposure, use only the receipt or `lib/recovery-model-projection.jq`, a fixed numeric/boolean/digest projection of bounded extractor output. It omits arbitrary IDs/names/paths/text/diagnostics for both Pi and Claude. Keep exact mappings private and obtain separate owner-approved sanitization before any text release. `--include-text` is not a sanitizer: visible text can contain private data or pasted tool output. Authorship remains `unknown`.

Defaults/maxima: 64 MiB input, 200,000 physical lines, 8,388,608 characters per line, 2 MiB serialized output, 50 rows/page (max100), 512 parent steps (max4096), 2000 text characters. Smaller input budgets and text caps are supported. Input and output limits fail closed rather than emitting a falsely complete partial result; oversized individual lines remain explicit error rows. Reducing page size can help, but a single oversized metadata row may still fail at page size1.

Metadata strings may be truncated. `record_type_distinct_total` and `version_distinct_total` count distinct raw values before capped display and expose truncation; other supported identifiers retain exact values or null. Content-type display is capped; bodies remain omitted. JSONL memory scales with the bounded single-file snapshot and row count, not just the output page size.

CLI failures emit `{ "ok": false, "error": { "code": "...", "message": "..." } }` with nonzero exit status. jq's raw errors are suppressed to avoid source disclosure. Parse errors within a completed extraction are counted and paged with `ok:true`; inspect coverage and record issues, not just exit status. Invalid UTF-8 is rejected before jq decoding rather than normalized into apparently clean text. Error codes include `PRIVATE_OUTPUT_REQUIRED`, `INVALID_UTF8`, `INVALID_ARGUMENT`, `INPUT_BUDGET_EXCEEDED`, `SOURCE_CHANGED`, `JQ_EXECUTION_FAILED`, `JQ_EXTRACTION_FAILED`, `OUTPUT_BUDGET_EXCEEDED` and `INPUT_OR_EXTRACTION_UNAVAILABLE`. There is no silent fallback to Pi or another provider.
