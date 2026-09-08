---
summary: "Independent acceptance of exact v4 prepared bytes and one-shot quality-ranking control surface."
read_when:
  - "Checking whether the first v4 ranking may proceed."
type: "reference"
system4d:
  container: "Independent pre-run integrity gate over exact v4 quality-only bytes."
  compass: "Authorize one ranking only after closure, reuse, pooled totals, and crash-durable retry refusal are verified."
  engine: "Verify pre-review manifest -> audit bytes and runner -> accept final inclusion."
  fog: "A correct treatment can still be invalidated by incomplete closure or a retryable execution path."
---

# V4 independent pre-run integrity review

Decision: **ACCEPT**

```text
review: dispatch-1785041363845
reviewed commit: 6843d33ea87b1fc059c825bec55b1f17ce793664
rankingExecuted: false
attemptSentinelAbsent: true
resultAbsent: true
preReviewManifestSha256: 13010ddd34139db6303847ff13f2ff36d647413608142c6dda19be66c8b39d42
```

The exact first v4 ranking may proceed only after this review is included in the final strict manifest and the reviewer resumes to verify that final manifest while the sentinel and result remain absent.

## Verified invariants

- All 28 pre-review entries passed and were regular non-symlink files.
- Prepared gzip SHA-256: `c8802e5bdfb5936fde8f31cc8b8469622df378af4fd5ca4eefd3dacbddd0402b`.
- Uncompressed input SHA-256: `286373698b4a41596a7076d5c296fbc60985e5900acbaf142b32927d407114ae`.
- Trace bundle SHA-256: `48270861e414bb2f92fc9963e4dc87dad7c7d44919473708fd25740d363639a8`.
- Five repository and 50 case arrays exactly matched the never-ranked v3 producer evidence and accepted case source.
- All five source-list artifacts, 50 SCI receipts/observations, trace records, cleanup records, and staleness bindings validated.
- No `costStudy`, pair, tax, reduction, or policy-cost evidence exists in v4 prepared input.
- The complete 18-file transitive local import closure is manifest-bound, including all 12 `src/source-selection-experiment*.js` files.
- Pooled totals cover every arm over available eligible cases; all ten preregistered quality gates are explicit and conjunctive.
- No arbitrary-input/output v4 ranking CLI exists.
- The fixed runner exclusively creates and fsyncs the attempt sentinel and parent directory before decompression or evaluation; the sentinel is never removed and makes retry unauthorized.

No evaluator, treatment selection, ranking, or score derivation was executed during review.
