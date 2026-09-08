---
summary: "Independent post-ranking review and gate arithmetic for the 2026-07-25 source-selection adoption experiment."
read_when:
  - "Reviewing the source-list automatic-invocation decision or benchmark arithmetic."
type: "reference"
system4d:
  container: "Post-ranking owner-review evidence for one frozen source-selection experiment."
  compass: "Apply conjunctive adoption gates without rounding or population substitution."
  engine: "Verify hashes and populations -> recompute metrics -> review costs -> recommend decision."
  fog: "Near-threshold results, ineligible controls, or diagnostic arms can be misrepresented as adoption proof."
---

# Independent post-ranking review

## Verdict

**REFINE. Automatic source-list invocation remains REJECTED. No production-wiring task is lawful from this result.**

Independent reviewer: `scoutpeer-ms0bhtu6-52277a97` / peer session review completed after the one ranking execution.

The frozen source-list treatment improves precision, recall, and omissions across the three eligible repositories, but it fails the required 20% unnecessary-selection/read-proxy reduction. Structural and fusion results are diagnostics and cannot substitute for this failed source-list gate.

## Integrity and population

- Pre-run commit: `357af5667343de532b013bcd738fc6c14f32cf19`.
- Result SHA-256: `5421fd6a29329263f9922b7e2ce4eac20a010434c7cd04c6d2630df641c6b275`.
- Prepared gzip SHA-256: `9ab2503b27abae9fccb9d196f4fc6c3e19a3254eb8972fb38d140f7bd11a2c4a`.
- Prepared uncompressed/input SHA-256: `257ee6ac37dfd146d445971b9783a840de68a7d770ef1ffeb4a804320046f2b8`.
- Canonical case source SHA-256: `7badfe24d8d951c06fcf0bc34c573bf564c39e0aad3e1db52ccc1692543fe8fb`.
- Pre-run manifest: all 19 entries verified before execution.
- Result input hash equals the decompressed prepared input hash.
- Cases: 40 total, exactly 10 per repository, with unique case/question/intent/target identities.
- No hidden population or budget change was found.

Eligible source-list population:

| Repository | Coverage | Cases |
|---|---:|---:|
| agent-scripts | 100% | 10 |
| engineering-core | 90.48% | 10 |
| DSPx | 92.13% | 10 |

`pi-extensions` remains an honest ineligible control at 18.33% coverage. Its 10 cases do not enter source-list or fusion evidence.

## Conjunctive source-list gate

Equal-repository macro, `source_list` versus `paths`, 3 repositories / 30 cases:

| Metric | Paths | Source-list | Delta / reduction | Gate | Result |
|---|---:|---:|---:|---:|---|
| Precision | 0.338333 | 0.445000 | +0.106667 | ≥ +0.10 | PASS |
| Recall | 0.644444 | 0.855556 | +0.211111 | reported | improvement |
| Unnecessary selections per case | 2.700000 | 2.266667 | 16.0494% reduction | ≥ 20% | **FAIL** |
| Omissions per case | 0.733333 | 0.300000 | -0.433333 | no increase | PASS |

The exact unnecessary-selection formula is:

```text
(2.7 - 2.2666666667) / 2.7 = 0.1604938272
```

The result is 3.9506 percentage points below the gate. Totals fall from 81 to 68 unnecessary selections. The precision gate passes by only 0.006667.

Per-repository unnecessary-selection reductions are uneven:

- agent-scripts: 8.00%;
- engineering-core: 14.8148%;
- DSPx: 24.1379%.

Only DSPx independently clears 20%.

## Structural and fusion diagnostics

All actual SCI receipts were available and complete:

- `paths`: 40/40 available;
- `structural`: 40/40 available;
- `source_list`: 30/30 eligible and available;
- `fusion`: 30/30 eligible and available.

Across the three source-list-eligible repositories, structural ranking is worse than paths: precision delta -0.093333, unnecessary +0.4 per case, and omissions +0.4 per case. The separate four-repository structural improvement is driven by the pi-extensions control and cannot be substituted into the adoption population.

Fusion improves eligible-repository precision by +0.115 and reduces unnecessary selections by 17.2840%, but fusion is not the source-list gate and also remains below 20%.

## Staleness and cost

Independent pre-ranking metadata review sampled 10 metadata-present paths in each repository: 40 sampled, zero judged stale. This deterministic first-UTF-8 sample is bounded evidence, not proof of full or future freshness.

Eligible source-list producer cost observed during preparation:

| Repository | Duration | Raw bytes | Approx. bytes/4 tokens |
|---|---:|---:|---:|
| agent-scripts | 40.876 ms | 19,770 | 4,943 |
| engineering-core | 40.976 ms | 21,592 | 5,398 |
| DSPx | 84.573 ms | 254,178 | 63,545 |
| **Eligible total** | **166.425 ms** | **295,540** | **73,886** |

The ineligible pi-extensions control still required 113.973 ms and emitted 345,214 bytes (~86,304 bytes/4 tokens) before coverage eligibility was known. This is relevant to automatic-invocation cost and large-repository behavior.

SCI was separately observed across 40 cases with 69.015 seconds traced duration, 212,035 producer-I/O bytes, and complete receipts. Trace timings include instrumentation overhead and are not production latency. Bytes/4 estimates are not tokenizer measurements.

Hashes and strace evidence establish bounded integrity/corroboration, not producer authentication. Metadata freshness, executable identity, known state-path classifications, and provider maintenance remain review obligations.

## Decision consequence

The benchmark is valid and near threshold, but the gate is conjunctive. The correct owner posture is:

1. retain manual/caller-requested source-list use;
2. keep automatic invocation and production wiring rejected;
3. do not tune metadata or ranking against this visible result in place;
4. if further work is justified, create a **new** preregistered non-production experiment focused on unnecessary-selection reduction and eligibility/cost behavior across small and large repositories; and
5. treat any changed cases, inputs, ranking policy, metadata, or producer versions as a new experiment.
