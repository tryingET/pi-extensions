---
summary: "Renamed the clean Ghostty continuation command to /fresh-handoff and added the model-callable fresh_handoff_spawn tool over the same owner implementation."
read_when:
  - "You are reviewing clean-session handoff naming or tool/command parity."
  - "You are validating Ghostty handoff registration and installed behavior."
type: "implementation"
---

# Fresh handoff command and tool

## Scope

Executed under AK task `#5260` in the `pi-extensions` monorepo.

The existing clean-session continuation behavior already belonged to `@tryinget/pi-little-helpers`, with prompt generation delegated to `@tryinget/pi-session-compaction/handoff-generation` and Ghostty transport owned by little-helpers. No prompt template or skill was added.

## Changes

- renamed `/handoff-tab [optional goal]` to `/fresh-handoff [optional goal]`;
- intentionally retained no compatibility alias;
- added `fresh_handoff_spawn` as the model-callable counterpart;
- kept command and tool on one implementation for Git/AK readback, conversation-grounded prompt generation, model/thinking preservation, clean Pi launch without `--fork`, exactly one auto-submitted initial user message, and fail-closed Ghostty transport;
- updated the capability manifest and tool-to-command projection;
- updated package/root docs, session-compaction consumer wording, registration characterization, installed release smoke, and the real detached-Ghostty reality assertion.

## Boundary

`fresh_handoff_spawn` is continuation transport, not task completion proof. Its prompt snippet limits intended use to explicit operator requests. Generation failure launches nothing; an indeterminate Ghostty launch is not retried automatically.
