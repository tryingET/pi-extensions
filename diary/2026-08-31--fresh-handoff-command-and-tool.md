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
- added `fresh_handoff_spawn` to the toolbox-discovery foundational active set and peer-spawn bundle so ordinary installed sessions expose it without a direct `-e` override.

## Live dogfood

First, a credential-normal installed-source session with an explicit extension load invoked `fresh_handoff_spawn` exactly once. Ghostty accepted a same-window tab launch in `clean` session mode, and the spawned session replied `FRESH_HANDOFF_DOGFOOD_OK`.

After adding the tool to toolbox-discovery's foundational active set, an ordinary installed Pi session invoked `fresh_handoff_spawn` without `-e`. The spawned session JSONL (`01a05948-ec41-7c1f-93e1-f93d9294f4a2`) had `parentSession: null`, exactly one generated initial user message, no tool calls, and replied `FRESH_HANDOFF_GENERAL_OK`; no repository or authority mutation occurred. The package reality suite also ran: controller-family assertions passed; the legacy detached custom-window assertion skipped truthfully because `PI_SIDEQUEST_GHOSTTY_BIN` was not configured.

## Boundary

`fresh_handoff_spawn` is continuation transport, not task completion proof. Its prompt snippet limits intended use to explicit operator requests. Generation failure launches nothing; an indeterminate Ghostty launch is not retried automatically.
