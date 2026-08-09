---
summary: "Evidence spike on agent_vent usage, handoff conversion, review value, and the conditions required before considering automatic capture."
read_when:
  - "Investigating whether agent_vent is unused or whether its explicit capture path is broken."
  - "Changing the self -> toolbox -> agent_vent diagnostic handoff."
  - "Considering automatic vent capture, review nudges, or a persistence-boundary change."
system4d:
  container: "Observed self -> toolbox -> agent_vent usage and review loop."
  compass: "Separate low activity from broken behavior and fix only the demonstrated bottleneck."
  engine: "Inspect local store and source sessions -> dogfood preview-only handoff -> rank hypotheses -> apply decision gate."
  fog: "Sparse records can be mistaken for a failed capture system; increased record volume can be mistaken for diagnostic value."
---

# Evidence spike — `agent_vent` usage and review loop

Status: **evidence collected; bounded compatibility slice implemented and verified; no architecture decision adopted**.

This packet replaces the speculative recapture-loop RFC drafted earlier in the same session. It records observations, bounded hypotheses, and the next decision gate. It does not adopt automatic capture, alter the persistence membrane, create an AK decision/task, or claim that low record volume is a product failure.

## 1. Question

Is `agent_vent` no longer used because the explicit `self -> toolbox -> agent_vent` membrane breaks capture, or is the tool working selectively while its review/value loop remains weak?

The product outcome is not maximum vent count. The useful outcome is:

```text
high-value friction captured
-> recurrence becomes visible
-> human reviews it
-> useful owner action or explicit dismissal follows
```

## 2. Authority and evidence posture

- `agent_vent` local JSONL is advisory diagnostic state, not AK task/evidence/decision truth.
- Pi session JSONL is historical capture, not canonical authority.
- This repo owns the concern-local evidence/RFC artifact; AK owns any later architecture-significant decision row and decision passport ([decision runtime](../../../../docs/project/decision-runtime-and-roadmap.md)).
- The existing persistence boundary remains in force: [self/toolbox/agent_vent boundary](2026-06-05-self-toolbox-agent-vent-diagnostic-boundary.md).

### Evidence ledger

Runtime observations below are reproducible historical pointers, not canonical authority:

| Kind | Observed at | Evidence pointer | Observation |
|---|---|---|---|
| Live runtime observation | 2026-08-08T21:42:51Z | controller session `2026-08-05T14-18-02-988Z_019fd249-d96c-7f23-be9d-75f531aaaa33.jsonl`; jq projection of `~/.pi/agent/agent-vent/vents.jsonl` | Store contained 5 records before concurrent activity. |
| Historical session observation | 2026-08-08T21:43:38Z | same controller session; jq-only scan over 6,654 session files newer than 2026-05-21 | Completed action counts: 30 activation requests, 9 previews, 5 record calls, 1 summary; final unique-session-count stage timed out after these counts. |
| Live runtime observation | 2026-08-08T22:20:58Z | same controller session; `toolbox explain agent_vent` | Bundle exposed only `default(diagnostic: agent_vent)`. |
| Live runtime observation | 2026-08-08T22:21:09Z | same controller session; `toolbox activate`, profile `default` | Activation succeeded. |
| Live runtime observation | 2026-08-08T22:21:19Z | same controller session; `agent_vent review` and `stats` | Store contained 6 records/groups, 5 new and 1 acknowledged; 0 candidate incidents; 0 curation/retention events. |
| Historical session observation | 2026-08-08T22:20:20Z | source session `2026-08-03T05-33-23-119Z_019fc61c-c92f-7170-9d30-b4a6baf60023.jsonl` | Another session previewed and recorded the sixth vent between the 5- and 6-record observations. |
| Live runtime observation | 2026-08-08T22:21:19Z and 22:21:50Z | controller session; two `self` diagnostic calls differing only in constraint wording | `no agent_vent record` suppressed all vent guidance; `do not persist durable state` preserved preview guidance. |
| Live runtime observation | 2026-08-08T22:22:02Z | controller session; `agent_vent action=preview` | Preview was recordable as `medium/other`, reported no quality issues, and explicitly wrote no record. |
| Source-code fact | inspected 2026-08-08 | `diagnostic-review.ts:55-98,132-195,504-587`; `agent-vent.ts:91-104`; `vent-store.js:19-43,99-108` | Producer category/constraint behavior and receiving category vocabulary/normalization support the compatibility findings in §8. |

Reconstructed persisted-record source-session basenames:

- `2026-05-21T16-03-45-267Z_019e4b47-4ff3-765e-ad4a-4e79d1da1ce0.jsonl`
- `2026-06-05T19-44-55-277Z_019e9951-2fed-761a-a8e3-0726c3408f8b.jsonl`
- `2026-08-03T08-47-42-589Z_019fc6ce-b1fd-771e-a305-5d0bba0df057.jsonl`
- `2026-08-04T01-15-53-751Z_019fca57-6817-7aa7-84ad-f264eb8772fa.jsonl`
- `2026-08-03T05-33-23-119Z_019fc61c-c92f-7170-9d30-b4a6baf60023.jsonl`

The remaining `sendUserMessage` vent has no source-session reference.

## 3. Observed runtime state

On 2026-08-08:

- the package path was configured in Pi settings;
- the `agent_vent` tool was live-registered;
- the `agent_vent` toolbox bundle was catalogued but inactive before this spike;
- the bundle exposes only `profile=default` (`risk=diagnostic`), not `profile=read`;
- default-profile activation succeeded;
- `agent_vent review`, `stats`, and `preview` worked live;
- no `record`, `set_review`, curation, retention, AK, evidence, issue, or incident mutation was performed by this spike.

Configuration, registration, catalog presence, activation, and invocation are distinct states. The earlier analysis incorrectly collapsed them.

## 4. Local store snapshot

The live `stats` projection reported:

| Surface | Observed state |
|---|---:|
| Vent records | 6 |
| Active recurrence groups | 6 |
| Groups with more than one occurrence | 0 |
| Candidate incidents | 0 |
| Review events | 1 |
| Review state: new | 5 |
| Review state: acknowledged | 1 |
| Review state: dismissed | 0 |
| Review state: escalation drafted | 0 |
| Curation events | 0 |
| Retention events | 0 |
| Malformed/invalid/oversized entries | 0 |

The store grew from five to six records during this investigation because another session explicitly previewed and recorded a new observability-friction vent. This spike did not write it. That concurrent event directly falsifies the statement that the tool is "not used anymore."

All six current groups are singletons. The store therefore acts primarily as a small diagnostic inbox today; it has not yet demonstrated recurrence grouping or candidate-incident value.

## 5. Historical activity snapshot

A jq-only scan of 6,654 Pi session files newer than 2026-05-21 completed the following counts before its final unique-session-count stage timed out:

| Historical call | Count before the live spike |
|---|---:|
| Toolbox calls requesting `agent_vent` activation | 30 |
| `agent_vent preview` | 9 |
| `agent_vent record` (explicit or summary-default record) | 5 |
| `agent_vent summary` | 1 |

Caveats:

- activation-call counts include failed attempts, tests, repeated status work, and sessions that may not proceed to capture;
- calls are not equivalent to successful effects unless confirmed by tool results/store state;
- the scan proves sparse use, not why use is sparse;
- the store and current session changed after this baseline: another session added one preview+record and this spike added one preview-only call.

## 6. Reconstructed persisted-record paths

Five of the six records name a source session. Their source-session tool-call sequences show:

| Vent | Observed path |
|---|---|
| Naming mismatch during initial live verification | toolbox activation/status -> direct `agent_vent` record -> later summary; no preview |
| `sendUserMessage` discoverability friction | source session absent; conversion path cannot be reconstructed |
| Many-of-the-greats analysis remained session-only | `self` self-evolution diagnostic -> toolbox activation -> preview -> record |
| Broad session-JSONL audit timeout | `self` progress check -> failed `profile=read` activation -> toolbox explain -> default activation -> preview -> record |
| Read-only subagent timeout | `self` diagnostic candidate -> default activation -> preview -> record |
| Fork-peer final-only observability gap | `self` diagnostic candidate -> failed `profile=read` activation -> toolbox explain -> default activation -> preview -> record |

Observed conclusion:

- four persisted records followed a `self -> activation/recovery -> preview -> record` path;
- one followed toolbox activation/status -> direct record without preview;
- one lacks a source session and cannot be reconstructed;
- these persisted successes show that the handoff can work, but do not measure the non-converting population;
- the historical evidence does **not** establish that the membrane prevents high-quality candidates from being recorded.

The records also appear intentionally selective: each describes concrete, non-routine friction with evidence, expected/actual behavior, and a named tool/package facet.

## 7. Live preview-only dogfood

The spike used this concrete diagnostic:

> Sparse `agent_vent` usage data was prematurely treated as proof of a broken capture loop, leading to an over-scoped cross-package auto-capture RFC before the conversion path was measured.

Observed sequence:

1. `self` produced a typed, execution-ready diagnostic/evolution candidate with `evidenceSufficiency=host_observed_friction`.
2. Toolbox default activation made `agent_vent` callable.
3. `agent_vent preview` accepted the minimized payload as `recordable`, with no quality issues or warnings.
4. The preview normalized to category `other` and wrote no record.

The core path therefore works live without weakening the membrane.

## 8. Concrete integration defects exposed

### 8.1 Resolved — category vocabulary mismatch

When a caller supplies a context summary, ASC diagnostic-review derives category `context_alignment`. The bounded receiver-side fix adds `context_alignment` to the `agent_vent` input alias vocabulary and normalizes it deterministically to canonical category `other`; it does not create a new canonical category.

Schema, store-normalization, filter, tool-preview, package, and fresh-session tests now cover the contract.

### 8.2 Resolved — preview and record permissions were conflated

ASC now exposes separate `agentVentSuggestionAllowed` and `agentVentRecordAllowed` fields. Plain `no agent_vent` / `no-agent_vent` remains fail-closed and suppresses activation, preview, and record guidance. Record-only `no agent_vent record` / `no-agent_vent-record` preserves preview guidance while marking durable recording forbidden.

The parser normalizes underscore/hyphen forms and evaluates clause-local constraints, avoiding false disallows from unrelated clauses such as `agent_vent is allowed but AK writes are forbidden`. Reflection-guard precedence still forces both permissions false when an external check is required.

### 8.3 Nonexistent read profile repeatedly attempted

This spike and at least two reconstructed sessions attempted `profile=read`; the bundle exposes only `profile=default`. Each recovered through `toolbox explain` and default activation.

The evidence supports correcting guidance/callers so they do not invent a read profile. It does not by itself justify adding a new profile, because profiles expose tools rather than action-level subsets and the existing tool combines read and mutation actions.

## 9. Ranked hypotheses

### H1 — Review/value loop is the largest unresolved evidence gap

Evidence for:

- five of six groups remain `new`;
- every group is a singleton;
- no group is a candidate incident;
- no curation, escalation-draft, or retention lifecycle exists.

Implication: review and disposition of the current queue should precede capture-volume automation, because present evidence does not establish either review value or review failure.

### H2 — Handoff compatibility caused avoidable friction

Observed outcomes:

- category vocabulary mismatch: resolved and tested;
- preview/record constraint conflation: resolved and tested;
- repeated invalid `profile=read` attempts: documented; the bundle remains default-profile only.

Implication: bounded compatibility work improved the existing membrane without changing persistence authority.

### H3 — Explicit capture membrane is the principal bottleneck

Evidence for: manual capture has additional steps.

Evidence against:

- multiple clear `self -> activation -> preview -> record` successes;
- a new record appeared during this spike;
- no sampled population of high-quality self candidates that failed solely at manual record has been measured.

Status: **not supported strongly enough for architecture work**.

### H4 — Sparse capture is intentional selectivity

Evidence for:

- all persisted records are concrete and evidence-rich;
- preview/anti-junk guidance explicitly rejects ordinary progress updates and single-use complaints;
- low record count is compatible with the package's exceptional-friction product intent.

Status: plausible; review usefulness must still be tested.

## 10. Evidence-based recommendation

This evidence does not justify implementing the earlier D+A+E proposal. Preserve the existing membrane unless and until an authorized AK decision changes it.

For now:

1. preserve the existing explicit persistence membrane;
2. treat low volume as an observation, not a defect;
3. retain the verified vocabulary/constraint fixes and default-profile guidance;
4. review the five `new` singleton groups before attempting to increase capture;
5. sample non-converting diagnostic candidates before claiming a conversion bottleneck.

## 11. Gate before automatic capture can be reconsidered

Automatic capture may be proposed only through an AK decision because changing the durable-capture consent boundary is architecture-significant ([decision runtime](../../../../docs/project/decision-runtime-and-roadmap.md)). Before advancing that decision beyond problem/evidence framing, establish:

- a bounded sample contains high-quality, review-worthy `self` candidates that do not become records;
- the dropout occurs specifically at explicit capture, not candidate quality, category mismatch, activation failure, or operator judgment;
- reviewed records produce useful acknowledgement, dismissal, recurrence recognition, or owner handoff;
- the exact executor, operator authorization surface, provenance contract, rate-limit owner, schema behavior, and rollback path are identified.

No ADR is adopted by this packet. A repo-local RFC/ADR would be an artifact attached to AK decision truth, not decision authority itself.

## 12. Bounded implementation outcome

Implemented without changing the durable-capture membrane:

1. `context_alignment` is an accepted input alias normalized to canonical `other`.
2. `self` distinguishes suggestion/preview permission from durable-record permission.
3. Spaced and hyphenated constraint forms are covered.
4. Mixed positive/negative clauses avoid cross-clause false disallows.
5. Reflection guard remains fail-closed over both permissions.
6. Boundary guidance states that the bundle has only its default profile; callers keep operations read-only by action.

Remaining proposals, not performed here:

- human disposition of the five `new` local groups;
- a bounded non-conversion sample of `self.diagnostic_candidate.v1` outputs;
- any automatic capture or persistence-boundary change.

### Verification

- Focused ASC diagnostic/reflection tests: 18 passed, 0 failed.
- Full `pi-autonomous-session-control` package gate: 453 passed, 0 failed; release check completed.
- Full `pi-agent-vent` package gate: 86 passed, 0 failed; release check completed.
- Adversarial tester: READY after hyphenated, mixed-clause, visible-suggestion, and reflection-precedence coverage.
- Both local packages were reinstalled through `pi install`.
- Fresh one-shot Pi dogfood returned `agentVentSuggestionAllowed=true`, `agentVentRecordAllowed=false`, retained preview, accepted `category=context_alignment`, and normalized the preview to `other`.
- Vent store remained at 6 lines with an unchanged SHA-256 hash; no record or review-state mutation occurred.

### File-budget posture

Scoped brownfield exception for this slice:

- `diagnostic-review.ts` remains above the 500-LOC code budget after adding cohesive constraint parsing and focused coverage; extracting the parser into a package-local helper is an owner-scoped refactor candidate, not required to prove this behavior.
- `vent-store.js` and `agent-vent.ts` were already substantially over budget and each grew by one alias line. Splitting either large owner file for a one-line compatibility alias would be disproportionate and increase unrelated risk.
- No broad refactor is claimed or authorized here. Any future split should be a separately scoped behavior-preserving owner task.

## 13. Falsifiers

This packet is wrong if any of these are later observed:

- source-session reconstruction shows most high-quality candidates fail specifically because explicit recording is too costly;
- review of the current queue demonstrates strong owner value and a large population of known missing events;
- the implemented category or constraint compatibility contracts regress under focused or fresh-session tests;
- a lawful existing execution surface already provides operator-authorized, agent_vent-owned capture without relaxing consent or adding cross-package state.

Until then, the smallest truthful conclusion is: **`agent_vent` is live and selectively used; the capture membrane and bounded compatibility path are verified; review value and non-conversion evidence remain unresolved before capture automation is justified.**
