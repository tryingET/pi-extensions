---
summary: "Evidence that agy 1.5.11 writes in-flight step statuses to its conversation store (RUNNING during a command, GENERATING while the model writes); review M3 of AK8809."
read_when:
  - "Changing how pi-activity-strip reads agy step status, or doubting that agy rows are current."
type: "evidence"
---

# agy store in-flight statuses (2026-11-18, AK8809 review M3)

Probe: `agy -p 'Run exactly this shell command and wait for it: sleep 45; echo done. ...' --mode auto
--dangerously-skip-permissions` in a scratch directory; the newest conversation stores were read
read-only with `sqlite3 -readonly 'select idx,step_type,status from steps order by idx desc limit 4'`
at about 8, 18, 30 and 42 s. `step_type|status` per row, newest first:

| t | store | rows |
|---|---|---|
| 8 s | `c183abaf-...` (the probe) | `2:132/2` `1:15/3` `0:14/3` |
| 18 s | `c183abaf-...` | `2:132/2` `1:15/3` `0:14/3` |
| 30 s | `1c742b78-...` (another live agy turn) | `49:132/2` `48:15/3` `47:132/3` `46:15/3` |
| 42 s | `1c742b78-...` | `50:15/8` `49:132/3` `48:15/3` `47:132/3` |

Reading: the tool step (132 GENERIC) stays RUNNING (2) for the whole command, then becomes DONE (3);
the next planner step (15) is GENERATING (8) while the model writes. At rest (40 stores, reviewer
count) only 3, 5, 6 and 7 remain, as expected once steps settle. WAITING (9) was seen once live
(an `ask_question` of pid 2672060, 2026-11-18 morning) but no row dump was kept; it stays mapped
from the enum until a sample is kept.
