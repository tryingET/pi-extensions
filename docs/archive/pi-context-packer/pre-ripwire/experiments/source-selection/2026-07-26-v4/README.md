---
summary: "Final evidence index for the single-run v4 quality experiment and rejected positive-evidence treatment."
read_when:
  - "Reviewing v4 quality evidence, one-shot integrity, or the treatment rejection."
type: "reference"
system4d:
  container: "New quality-only experiment identity after v3 failed its pre-run integrity gate."
  compass: "Test the treatment once without reviving invalid cost evidence or production authority."
  engine: "Preregister reuse -> review -> prepare new bytes -> review -> sentinel -> rank once -> decide."
  fog: "Reusing unranked observations can be confused with relabeling invalid v3 confirmatory evidence."
---

# Source-selection positive-evidence quality experiment — 2026-07-26 v4

## Current state

**Complete. V4 executed exactly once; independent review accepted the result arithmetic; the owner decision is `REJECT`. Retry is permanently forbidden.**

Prepared evidence:

- gzip SHA-256 `c8802e5bdfb5936fde8f31cc8b8469622df378af4fd5ca4eefd3dacbddd0402b`;
- uncompressed SHA-256 `286373698b4a41596a7076d5c296fbc60985e5900acbaf142b32927d407114ae`;
- reused trace bundle SHA-256 `48270861e414bb2f92fc9963e4dc87dad7c7d44919473708fd25740d363639a8`;
- all five source-list artifacts and 50 SCI receipts retained;
- the complete v3 cost study excluded; and
- `SHA256SUMS.pre-review` binds 28 files, including all 12 `source-selection-experiment*.js` closure files.

Executed evidence:

- final pre-run manifest `6e73ac83b4d1a425da390c3faed69877125c9a6f971a00b258d509d0dbf4870e`;
- permanent attempt sentinel `4e4a11f9d82ba0b90261bf7dbb507abe3d6b75926bfafe73fb0aebb587c3faef`;
- fixed result `d1d592bc7dbb592a1b6d7b3151eefe079bdb41408cc3b02fda4c0f21d70061ca`;
- post-ranking review `dispatch-1785042159907` — arithmetic ACCEPT, treatment REJECT;
- owner decision: `../../../docs/project/2026-07-26-source-selection-positive-evidence-decision.md`.

Canonical preregistration:

- `../../../docs/project/2026-07-26-source-selection-positive-evidence-quality-preregistration.md`
- independent review: `preregistration-review.md` — ACCEPT for preparation only

V3 remains frozen and unranked after independent pre-run rejection `dispatch-1785039595040`. V4 is a new quality-only identity under AK task `4207`.

## Frozen inputs

- five exact repository commits and 50 unranked reviewed cases;
- case-source SHA-256 `d2a19efd67058d54d250371860a2ec08af07eebc744a393dff00600b9f6cd6e5`;
- exact pre-ranking source-list artifacts and 50 SCI receipts extracted from the rejected v3 prepared input under accepted reuse review;
- no v3 cost observations or cost gates.

## Result

The primary precision and omission gates passed, but unnecessary-selection reduction was `13.829787%` versus the required `20%`. The treatment also selected exactly the same paths as `source_list_full` in all 30 eligible cases, so the strict-improvement gate failed. Overall: 8/10 gates passed and the conjunctive quality gate failed.

Automatic invocation, production wiring, and the tested positive-evidence treatment are rejected. No implementation is authorized.
