---
summary: "Owner decision to reject the v4 positive-evidence treatment after a valid single quality ranking."
read_when:
  - "Deciding whether to implement positive-evidence filtering or automatic source-list invocation."
  - "Planning any successor source-selection experiment after v4."
type: "reference"
system4d:
  container: "Owner disposition of the valid single-run v4 quality-only experiment."
  compass: "Reject a treatment that did not activate or satisfy conjunctive quality gates."
  engine: "Review fixed evidence -> apply preregistered gates -> record owner decision and non-authorizations."
  fog: "Passing precision and omission gates can be mistaken for overall treatment or production readiness."
---

# Positive-evidence source-selection decision — 2026-07-26 v4

## Decision

**REJECT the `source_list_positive` treatment tested in v4.**

Automatic `source-list` invocation, provider registration, and production wiring remain **REJECTED**. No implementation task is authorized.

V4 executed exactly once after two-stage independent pre-run acceptance. The attempt sentinel is permanent and retry is forbidden. Independent post-ranking review `dispatch-1785042159907` accepted the result bindings and arithmetic and recommended `REJECT`.

## Evidence

- Final pre-run manifest: `6e73ac83b4d1a425da390c3faed69877125c9a6f971a00b258d509d0dbf4870e`.
- Attempt sentinel: `4e4a11f9d82ba0b90261bf7dbb507abe3d6b75926bfafe73fb0aebb587c3faef`.
- Fixed result: `d1d592bc7dbb592a1b6d7b3151eefe079bdb41408cc3b02fda4c0f21d70061ca`.
- Independent audit: 250 arm-case records and 1,140 metric fields recomputed with zero discrepancies.
- Population: five declared repositories, three metadata-eligible repositories, 50 cases total, 30 eligible treatment cases.

Primary equal-repository result:

| Gate metric | Result | Threshold | Disposition |
|---|---:|---:|---|
| precision delta vs paths | +0.108333 | >= +0.10 | PASS |
| unnecessary-selection reduction | 13.829787% | >= 20% | **FAIL** |
| omission delta vs paths | -0.433333/case | <= 0 | PASS |
| zero-evidence selections | 0 | 0 | PASS |
| strict improvement over `source_list_full` | none | required | **FAIL** |

Overall: 8/10 conjunctive gates passed; the quality gate failed.

## Interpretation

The treatment was designed to remove zero-evidence backfill. It did not activate on the fresh eligible population: every eligible case had at least five positive-evidence candidates for a four-item budget. Consequently, `source_list_positive` selected exactly the same paths as `source_list_full` in all 30 eligible cases, with identical precision, recall, unnecessary selections, and omissions.

This is not evidence that arbitrary threshold tuning should follow. V4 outcomes are now visible. Any revised threshold, adaptive budget, confidence rule, or abstention policy requires a new experiment identity, a leakage-safe hypothesis not chosen to fit v4 case outcomes, fresh review, and explicit authority.

## Non-authorizations

This decision does not authorize:

- automatic or implicit `source-list` invocation;
- production provider wiring or registration;
- implementation of `source_list_positive`;
- metadata tuning or campaign work;
- rerunning v4;
- using fusion/structural diagnostics to rescue the treatment;
- selecting a new threshold from v4 per-case score or ranking outcomes; or
- creating a successor task without a separately justified, preregistered hypothesis.

Manual or caller-requested use of the existing deterministic `source-list.v1` inventory remains unchanged.
