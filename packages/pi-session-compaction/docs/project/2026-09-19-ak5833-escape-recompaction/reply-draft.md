---
summary: "Superseded local draft (AK5833). The reviewed reply was posted under AK5837 on 2026-09-19 as https://github.com/earendil-works/pi/issues/9783#issuecomment-5744803460 (tracker key pi-mono-upstream/compaction-stop-boundaries)."
read_when:
  - "Tracing how the posted Pi #9783 clarification evolved from the AK5833 reproduction."
---

> Status (AK6854, 2026-10-10): already posted in reviewed form by AK5837 (comment 5744803460 on earendil-works/pi#9783, public gist with the repro and recording). Do not post this draft again.

What I'm trying to do: use a custom `session_before_compact` summary with `keepRecentTokens: 0` and `reserveTokens: 15000`. My prompt produces a self-contained checkpoint so I can continue without much verbatim history. The attached 20-line hook reduces that setup to the relevant cancellation path; the offline harness is separate.

On `4d38031fb` (contains `de2de549b`), I can reproduce this sequence:

1. A large tool result triggers automatic compaction before the next answer.
2. I press Escape while the custom summary is running. It receives the abort signal and returns `{ cancel: true }`.
3. Pi requests another answer, then starts another automatic compaction before returning idle. I need to press Escape again.

This happens with both my actual handler and the reduced hook. It also happens with retention `1`, so my initial assumption that zero retention caused it was wrong as a necessary-cause explanation.

I see why it happens: compaction Escape calls `abortCompaction()`, leaving the run active and the context above the threshold. My expectation is that Escape during **automatic** compaction stops the current run and returns control, so I can change direction without another answer/compaction first. Is cancelling only the current summary attempt the intended interaction?

The reproduction uses a faux provider and synthetic tool output, with real InteractiveMode and Escape input. It shows two compaction attempts, not an infinite loop, and does not prove what happened in my original session. I should have led with this concrete behavior rather than the broader queue/input claims in the issue.

This draft was prepared with AI assistance and has not been posted.
