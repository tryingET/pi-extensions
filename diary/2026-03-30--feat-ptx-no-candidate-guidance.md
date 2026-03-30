# 2026-03-30 — Make PTX no-candidate warnings actionable

## What I Did
- Added `packages/pi-prompt-template-accelerator/src/ptxNoCandidateMessage.js` to centralize PTX no-candidate warning text.
- Updated `packages/pi-prompt-template-accelerator/extensions/ptx.ts` to reuse those helpers for:
  - live trigger `onNoCandidates`
  - `$$ /...` UI fallback selection
  - `/ptx-select`
- Changed PTX warnings so they distinguish between:
  - prompt-command discovery being unavailable
  - sessions with no prompt-template commands
  - prompt-template commands that exist but are not prefillable because path metadata is missing
- Added regression coverage in `packages/pi-prompt-template-accelerator/tests/ptx-no-candidate-message.test.mjs`.
- Updated package docs/changelog so README troubleshooting matches the new runtime behavior.

## Why
- The prior messages only echoed the raw selection reason, which made empty-picker outcomes harder to diagnose during live PTX verification.
- The new wording points operators toward the right next step, especially `/ptx-debug-commands [query]` in UI sessions.

## Validation
- `cd packages/pi-prompt-template-accelerator && npm run docs:list` ✅
- `cd packages/pi-prompt-template-accelerator && node --test tests/ptx-no-candidate-message.test.mjs` ✅
- `cd packages/pi-prompt-template-accelerator && npm run check` ✅

## Related
- Package: `packages/pi-prompt-template-accelerator`
- Follow-on truth still unchanged: live PTX runtime verification remains the next higher-value package question.
