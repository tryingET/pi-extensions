---
summary: "AK7403 REDACTED public historical derivative of AK7207 research and AK7208 proposed design; provenance and limits."
read_when:
  - "Reading or checking the public sidequest-cache research artifacts."
---

# REDACTED historical research — public derivative

**REDACTED historical derivative. Not byte-identical original evidence. No current implementation/adoption or live proof.**

AK7403 prepares a public derivative of the 15 historical AK7207/AK7208 files. The full originals, including original manifests, are preserved byte-for-byte in the owner's private archive, separately from this public derivative. Original evidence references (including AK task numbers, evidence16099/16100 and source-code references) retain their historical meaning. This directory does not replace those original evidence identities or authorize runtime work.

## Reading the record

- [AK7207 diagnosis](report.md): observed first-child miss followed by reuse; causal limits, alternatives and historical offline assertions.
- [Measurements](measurements.json): persisted usage observations with redacted identifiers and relative chronology.
- [Offline reconstruction](offline-serialization.json): historical structural comparison, not historical final-wire capture and not a new execution.
- [AK7208 design](design/README.md): proposals and future tests, not implemented behavior, adopted architecture or fresh authorization.
- [Historical inspection](design/inspection.md) and [reference-check output](design/reference-check.json): historical checks, not new verification of the derivative.

“Current”, “today”, “this session”, completed-check statements and authority/HOLD readbacks in the historical documents refer to their original investigation. They do not describe today's runtime or new admission. Historical conclusions and their uncertainty are retained, not independently re-proved here.

## Redaction strategy

- Home, installation, scratch and session-file locations become non-resolving role labels (`WORKSPACE`, `PI_PACKAGE`, `PRIVATE_SESSION`, `PRIVATE_FIXTURES`). Repository/package-relative source references remain for provenance.
- Exact session, entry, dispatch and process identifiers are removed or consistently pseudonymized. A shared entry label still indicates the same historical entry, including inherited entries. Labels are not usable source IDs or authority receipts.
- Exact wall-clock times become `T+…s`, seconds from the historical parent session header. JSON `timestamp` fields become `relativeTime`; relative intervals/order are preserved. These strings are not UTC timestamps and must not be lexically sorted as times. Document dates and coarse historical dates remain for provenance.
- Raw request, content, tool-schema, cache-key and section hashes become consistent `content-equality-NNN` labels. JSON uses `redactedEquality`, not `sha256`, for these labels. Labels preserve equality/inequality within this derivative only; they are neither hashes nor fresh cryptographic proof. Original byte lengths, common-prefix measurements, usage/cost numbers, booleans and conclusions remain unchanged.
- Public source-code/catalog digests remain under `sourceDigests`; the report also retains a bundled-adapter digest and checkout commit. These identify historically inspected source, not today's loaded code.

Retained measurements, document dates, tool names and equality relationships can still be linkable. This is targeted owner-selected metadata minimization, **not anonymity**.

## Scripts and private inputs

[measurements.sh](measurements.sh) and [offline-serialization.mjs](offline-serialization.mjs) are **historical offline templates needing private originals**, not runnable public proofs. Neither was executed for this redaction; private sessions/fixtures were not accessed.

- The shell template requires explicit admitted session files and original window bounds; no home-directory discovery remains. It emits a JSON stream: `jq -s .` is required to collect an array. Its output still contains private metadata and requires separate redaction before publication.
- The JavaScript template deliberately refuses execution. A separately admitted private copy would need restored entry IDs, private extracted fixtures and the historically pinned package supplied via `PI_HISTORICAL_PACKAGE`. The retained recipe's hashes/IDs/times are sensitive output, not inherently sanitized evidence.
- [scratch-path.txt](scratch-path.txt) is a redacted explanatory pointer, not a private location or usable command argument.

## Integrity of this derivative

Both `SHA256SUMS` files are regenerated for **public derivative bytes**, not original evidence. The design README's report digest likewise identifies the redacted report. Original hashes remain private; none is relabelled as a current artifact hash.

From the repository root, these checks do not execute either historical recipe:

```bash
sha256sum -c docs/project/2026-10-18-sidequest-cache/SHA256SUMS
sha256sum -c docs/project/2026-10-18-sidequest-cache/design/SHA256SUMS
bash -n docs/project/2026-10-18-sidequest-cache/measurements.sh
node --check docs/project/2026-10-18-sidequest-cache/offline-serialization.mjs
```

The root manifest covers top-level public files and the design manifest; the design manifest covers its seven content files. Neither manifest includes itself. Checksums prove local byte consistency, not historical causality or runtime behavior. JSON parsing, redaction scans and internal-link checks similarly check the publication artifacts only. The redaction checks themselves did not reconstruct private inputs, run package CI, activate runtime behavior, mutate AK, commit or push. Subsequent commit and landing checks are separate AK7403 evidence, not a re-run of the historical experiment.
