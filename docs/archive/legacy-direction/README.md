---
summary: "Archive of the pi-extensions root's retired SG/TG/OP direction markdown (last edited 2026-05-14), moved out of docs/project/ on 2026-09-26 so `ak direction import` cannot overwrite AK-native direction."
read_when:
  - "You meet a link to docs/project/strategic_goals.md, tactical_goals.md or operating_plan.md in an older pi-extensions document."
  - "You are tempted to restore or refresh the legacy root direction files."
system4d:
  container: "Retired legacy root direction markdown for pi-extensions; historical only."
  compass: "Keep the history readable while `ak direction import`, which treats these files as the complete root direction, cannot run."
  engine: "Current direction is read from AK (`ak direction export`, `ak direction check`); these files are never restored to docs/project/."
  fog: "Restoring all three files re-arms the import; older documents and diaries still link to the former paths."
---

# Legacy root direction (retired)

These three files were the pi-extensions root's direction chain: strategic goals (SG), tactical goals (TG) and operating slices (OP). They were last edited on 2026-05-14. Since then root direction has been AK-native. The active frame is SF7, "Converge the AI Society prompt operating system from governed direction to measured execution", and its active wave is IW8. Both exist only in AK.

## Why the files moved

`ak direction import` reads the three files from `docs/project/` and treats them as the complete root direction. While they were still there, one import would have:

- deleted the AK-native frames SF3–SF7 and waves IW1–IW8, together with their task links;
- reset the imported goals and slices to the May text.

With the files gone from `docs/project/`, the import stops with a missing-file error. AK task 5959 adds a guard in AK itself that refuses the import whenever AK-native direction exists. The move itself is AK task 5958 (Agent Kernel review of 2026-09-26, finding DIR-1).

## Reading current direction

```bash
ak direction export --repo . -F json   # through agent-kernel/scripts/ak-runtime-gate.sh
ak direction check --repo . --machine
```

## Older links

Diaries and dated documents from March to May 2026 still name `docs/project/strategic_goals.md`, `tactical_goals.md` and `operating_plan.md`. They are records of their time and were left unchanged; the files they mean are here. Package-level `docs/project/*_goals.md` files inside `packages/` are separate and unaffected.
