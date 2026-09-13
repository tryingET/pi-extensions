---
summary: "AK5540: preserve baseline adapter aliases; package and installed-Pi tool/effort proofs, with original empty-argument failure still unproven."
read_when:
  - "Diagnosing Aeon effort errors, ignored thinking-off controls, or empty Pi tool arguments."
  - "Reviewing the baseline alias-routing correction and its live verification limits."
system4d:
  container: "Pi workstation provider implementation record."
  compass: "Preserve adapter-owned effort and budget semantics."
  engine: "Alias routing correction, regression tests, and installed-Pi probes."
  fog: "Small live probes do not establish long-session empty-argument recovery."
---

# Aeon adapter alias routing — AK5540

## Finding and bounded change

The provider selected `upstream_model` as the HTTP model even for workstation's
`family: baseline-text` contracts. Those contracts export adapter aliases as
`pi_model_id`; the underlying model is provenance. Sending the raw model ID
bypassed the workstation semantic adapter's alias normalization, including
thinking-off defaults, native effort translation, and thinking-token budgets.
Direct probes reproduced HTTP 400 for raw-model `reasoning_effort: high`, while
the alias route accepted the same effort.

`extensions/workstation-inference-stream.ts` now keeps the selected model ID for
ordinary baseline-text requests only. Other contract families and attached,
claim-governed audio retain their upstream-model routing. No model-native effort
map or budget policy was duplicated into Pi. The existing contract's exposed
levels remain unchanged; this does not add adapter-only `max` to the Pi catalog.

No workstation source, services, GPU allocations, model artifacts, DNS settings,
Pi core parser, or unrelated extensions were modified.

## Validation

- New routing tests failed on the old raw-ID routing, then passed after the fix.
- `node --experimental-strip-types --test tests/workstation-inference-routing.test.mjs`:
  **11/11 passed**. Covers off/minimal/low/medium/high/xhigh, visible and canary
  aliases, legacy/other-family routing, inherited payload hooks, fragmented SSE
  tool arguments and tool-result continuation using the real Pi transport.
- `npm run check`: **85/85 tests passed**, plus typecheck, lint, structure,
  file-budget and packaging checks. The release dry-run encountered the existing
  registry-version guard for 0.5.0, which its declared script accepts; nothing
  was published. Governed audio tests passed hermetically, not via live audio.
- Independent review found no blockers; its focused rerun passed 11/11.

## Installed-Pi live proof

Installed Pi **0.84.4**, actual provider extension, unchanged canonical contract,
local adapter and Aeon backend. Fresh isolated print-mode sessions loaded an
inert `bash` tool with a required string `command`; no generated shell executed.
Only a 1,024-output-token per-request safety cap was added. No alias, thinking
field, or tool choice was overridden. Raw SSE and request payloads were captured
for synthetic prompts only in private scratch.

| Selection | HTTP status, both turns | Exact command arguments and continuation | Thinking output |
|---|---|---|---|
| baseline-text / off | 200 / 200 | pass | none |
| baseline-text / minimal | 200 / 200 | pass | present |
| baseline-text / low | 200 / 200 | pass | present |
| baseline-text / medium | 200 / 200 | pass | present |
| baseline-text / high | 200 / 200 | pass | present |
| baseline-text / xhigh | 200 / 200 | pass | present |
| baseline-text-visible / off | 200 / 200 | pass | none |

All tool calls assembled exactly `{"command":"printf AEON_TOOL_PROBE"}` and the
next request retained complete arguments and the tool result. Thinking-enabled
final responses included two leading newlines before the expected receipt;
these are present in server SSE. Consequently exact final-string compliance
failed for those five runs even though routing/tool/continuation checks passed.

`pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-workstation-inference-provider`
completed and preserved the existing configured local package path. A further
fresh installed-Pi `post-install-high` run sent the alias and `high`, executed the
inert tool successfully, and ended with `toolUse` then `stop`.

Existing already-running Pi sessions still need `/reload` (or restart) to load
changed extension code. Fresh-process proof is not proof of hot reloading this
controller or every other active session.

## Evidence references

- Live tester dispatch: `dispatch-1788822353692`.
- Independent reviewer dispatch: `dispatch-1788822611969`.
- Private synthetic probe artifacts:
  `/home/tryinget/.local/state/pi-quests/tmp/ak5540-pi-cli-proof.y5zYCr`.
  `run.sh` records exact invocations, `verified-matrix.json` separates transport
  and strict-output outcomes, and each setting contains `request-{1,2}.json`,
  `response-{1,2}.sse`, and parsed event/tool logs. Scratch is local evidence,
  not a portable runtime requirement.
- Verified stream source SHA-256:
  `9dae69c54f9ca9ca2cf1984f57e867fcf06eb2ade759a6ba4943b9abef676b07`.

## Remaining uncertainty

The original session's repeated empty `{}` tool calls were not reproduced.
That remaining investigation is tracked in AK task 5542.
Earlier session records preserve parsed calls, not the failing raw stream.
These tests do not prove correctness for large context, parallel tool calls,
malformed/truncated streams, or sustained agent sessions. Budget exhaustion and
all normal ambient extensions were not exercised. Do not claim all inference
failures are fixed or blame the remaining empty calls on a parser without a
correlated failing request, raw SSE, and parsed result.

Changes were left uncommitted rather than switching or committing onto the
shared checkout's pre-existing unrelated `feat/activity-ribbon-agent-tabs`
branch. AK records execution and verification; this note does not claim merge
or release promotion.
