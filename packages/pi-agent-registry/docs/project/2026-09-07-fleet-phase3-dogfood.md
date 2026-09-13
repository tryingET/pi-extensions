---
summary: "AK5133 live proof: a clean Adoption Steward TUI on promoted Ghostty, correlated ACK/final, immutable launch receipt and validation bounds."
read_when:
  - "Verifying Fleet Phase-3 visible standing-agent launch or its AK5133 closeout."
type: evidence
system4d:
  container: "One exact-task visible standing-agent launch, not general fleet authority."
  compass: "Prove real TUI identity and correlated ACK without confusing admission and completion."
  engine: "Fresh TUI driver -> manifest composition -> Ghostty tab -> ACK/final -> independent runtime observation."
  fog: "A process, receipt, self-report or passing proxy alone cannot prove the whole launch."
---

# Fleet Phase 3 — AK5133 dogfood

## Observed behavior

On 2026-09-07 an explicitly launched **fresh interactive Pi TUI driver** invoked
`standing_agent_spawn` once for exact claimed task **5133**, agent
`agent-adoption-steward`, and a bounded read-only inspection of four launch files.
The driver was not `pi -p`, a scout/fork tool, or an ASC headless dispatch.
The newly installed package was loaded in that fresh process, independently of
the controller's already-loaded extension generation.

The shared little-helpers transport targeted Ghostty singleton PID **4034502**,
D-Bus unique owner **:1.4731373**. The standing agent appeared in a new tab:

| Observation | Value |
| --- | --- |
| Run | `standingagent-mtqmbq5w-aeaf6023` |
| Child session | `01a079af-2ef4-762c-8bfc-228d0b411d4a` |
| Live Pi PID / TTY | `189076` / `/dev/pts/11` |
| Ghostty surface | `0x516815b20d7e09a3` |
| Runtime build | `492300cad104195411d12217dd22f1cd05f31376` |
| Actual version | `1.3.2-main-+492300cad` |
| Agent revision | `dc354723482f0470ad287d1de3e067a72cd99a85` |
| Model | `zai/glm-5.3` |
| Thinking | requested `medium`; Pi recorded supported-level clamp to `high` |
| Effective tool allowlist | `read,bash,intercom` |
| ACK received by controller | `cce92533-53a7-49d0-bc42-0b808408aafe` |
| FINAL received by controller | `44cee2a7-9695-42f8-a76e-d4a08b000752` |

The task title's “1.4.0” is the superseded version-label assumption corrected by
AK5128/5129; acceptance uses actual `+new-tab`/surface-target capability and the
promoted executable, not the label. No retired sidequest broker was resurrected.
An initial Niri readback matched the session-qualified title in Ghostty window
**501**. Later verification found the tab no longer selected and deliberately
**did not steal operator focus**: its live TTY, process ancestry, surface identity
and owning Ghostty compositor windows still matched. Foreground placement is a
separate observation, not inferred from launch acceptance.

## Proof artifacts

All files below are **evidence projections**, not a second task authority:

- [Driver transport result](2026-09-07-fleet-phase3/driver-launch.json)
- [Launch receipt projection](2026-09-07-fleet-phase3/launch-receipt.json)
- [Session integrity inventory](2026-09-07-fleet-phase3/session-inventory.json)
- [Bounded calls/results observation](2026-09-07-fleet-phase3/session-observation.json)
- [Passing real-runtime assertion output](2026-09-07-fleet-phase3/standing-reality.txt)
- [Final validation results](2026-09-07-fleet-phase3/validation-results.txt)

Original immutable receipt:
`~/.pi/agent/visible-launch-receipts/visible-agent-adoption-steward.20260907T022519Z.8fb48fd0.launch-receipt.json`.
Canonical digest (excluding its own digest field):
`6a37b218e3ea7dff14ec0a13e8230920585ddcbf83598d5d949d62828adffd15`.
The repository projection is formatter-normalized; its canonical digest is
identical, not necessarily its raw whitespace bytes. The original remains 0400.

Child JSONL SHA-256:
`848a591f3ec9c4741591e68361f9291c327120339a561f814be3af6071f10c91`.
Driver JSONL SHA-256:
`c223bbed95c06153d441c58bcb150fd9a25e25eb23c70f521b9bf03003a6b389`.
The integrity inventory was complete. The fresh child has one user message,
no parent session, no compaction or branch summary, and a linear unique parent
chain. That user-message digest matches the receipt's boot-prompt digest.

There were **nine tool calls**: ACK first, four reads, three bounded inspection
commands, and FINAL last. Both intercom sends succeeded and both arrived at the
exact controller target. `peer_status` observed ACK=1/FINAL=1, no duplicates and
no protocol violations. The agent's report identified the exact-task gates,
resource composition and admission-versus-completion boundary with source-line
citations, and correctly called out advisory bash/no-sandbox limits. It stopped
with terminal assistant `stop`; no tool call followed FINAL. The agent repository
remained clean. No file or AK mutations were observed in this bounded call record.

The child's `tty` shell command returned `not a tty`: tool subprocess stdout is
piped. That does **not** negate its parent Pi TUI. `/proc/189076/fd/0` and presence
both identify `/dev/pts/11`. Pi rewrites its own process title, so the live
assertion binds retained argv through its exact launcher-shell PPID and same TTY,
not through an assumed unmodified Pi `/proc/cmdline`.

## Receipt/evidence continuity with Phase 2

The Phase-2 semantics are preserved: exact claimed-task/repo/lease admission,
committed agent/persona digests, bounded observation, write-once 0400 receipt with
canonical self-digest, followed by controller-recorded AK evidence. Its original
`pi-agent-registry.dispatch-receipt/1` predecessor for AK5132 was reread and its
settled digest verified:
`7eb7e467010340fb7d2112a431f08e5ab09b81d1b85d366eab046a6a6374f3e3`
(AK evidence8091).

**Schema adaptation is explicit:** this visible launch uses
`pi-agent-registry.visible-launch-receipt/1`, not a fabricated Phase-2 ASC dispatch
receipt. No ASC identity, headless execution or lifetime settlement is asserted
for this TUI. The original Phase-2 pipeline remains unchanged. One live-dogfood AK
row binds the new receipt and this observation to task5133; independent review is
a separate evidence class. The launch receipt itself permanently says startup,
ACK and task completion are `unproven`; later observations never rewrite it.

A durable per-agent/task reservation remains. It is **not** automatically removed
on completion, cancellation, failure or age. Do not repeat this launch. Explicit
owner disposition is required before any subsequent attempt for this pair.

## Validation and review

- Registry `npm run check`: **134/134** tests, structure, typecheck, budgets,
  formatter and packed quick check pass (two existing unused-variable warnings).
- Little-helpers `npm run check`: **430/430** tests and declared gate pass.
- Both packages' full `npm run release:check`: pass, including isolated tarball
  installation and actual package-loader/packed smoke. Registry additionally
  exercises Phase-3 registration and fail-closed transport/origin admission.
- `just loop-verify-fast` and `just loop-impact-run`, scoped to the two packages
  and manifest convention: passed (including root smoke).
- New `standing-agent-identity.reality.live.mjs`: **pass** on the real child,
  no stubs, no launches/retries during verification; raw output retained above.
- Broad `npm run reality:check` also ran. An unrelated old Pi process **2187405**
  still names retired Ghostty **9d8fbd15** and fails the all-controller observer
  assertion. The promoted normal-broker check and terminal-binding check pass;
  the custom detached-window test skips without its explicit environment. This
  slice did not restart or mutate another session to hide that workstation drift.

Reviewer `dispatch-1788745489285` initially withheld approval, then approved one
supervised dogfood contingent on explicit `--offline`; that fix was applied and
focused tests rerun **before** launch. Tester `dispatch-1788747999662` verified the
baseline cause and later the evidence/test repairs independently. The live
verifier was hardened to reject non-linear/cyclic chains and calls after FINAL;
its final real-runtime pass is retained above.

Validation uncovered and fixed two packed-test defects: missing shipped
`src/companyContextProvenance.ts` (part of the exported transport closure), and a
stale smoke expectation of two notifications despite two existing fresh-handoff
progress messages. Assertions now check the precise four notifications and load
the version-1 transport from the installed tarball.

The real-fleet fixture originally failed identically on **unchanged HEAD code**:
engineering-core advanced from `51fc387` to docs-only commit `9225dd6` (AK5428).
Profile bytes/blob, all four agent revisions, diagnostics and counts were
unchanged. The reviewed refresh changes only observation time, profile commit,
and the two resulting hashes; no assertions or fleet lint code were weakened.
The unhealthy fleet remains unhealthy, with seven errors/seven warnings.

## Bounds and follow-on work

- Read-only is an advisory task contract; `bash` is not a filesystem sandbox.
  Ignored files, external surfaces and modify-and-restore intervals are unobserved.
- Clean means fresh conversation plus explicit external extension/skill selection,
  not an empty system prompt: applicable AGENTS, operator auth/models/settings,
  Pi internal factories and normal runtime bookkeeping remain. Entry/manifest
  hashes are not transitive-import or whole-runtime attestation.
- Phase 3 does not implement Decision151's ordinary-task sealed host or Phase 4
  candidate permits. AK5134 remains a separate, unclaimed-by-this-work phase.
- Local installed behavior is verified; no package publication is claimed.
  Release little-helpers' version-1 transport before advertising npm enablement.
- Work stayed uncommitted in the shared checkout. Another owner changed it to
  `feat/activity-ribbon-agent-tabs`; this task neither switched branches nor
  merged, reset, staged unrelated work or altered that owner's commits.

## Recheck while the observed child is still alive

From the monorepo root (read-only; does not launch or request new work):

```bash
PI_STANDING_AGENT_LIVE_RECEIPT="$HOME/.pi/agent/visible-launch-receipts/visible-agent-adoption-steward.20260907T022519Z.8fb48fd0.launch-receipt.json" \
PI_STANDING_AGENT_LIVE_SESSION="$HOME/.pi/agent/sessions/--home-tryinget-ai-society-softwareco-owned-pi-extensions--/2026-09-07T02-25-19-092Z_01a079af-2ef4-762c-8bfc-228d0b411d4a.jsonl" \
node --test packages/pi-little-helpers/tests/live/standing-agent-identity.reality.live.mjs
```

A later dead PID cannot recreate this point-in-time proof. With no explicit
receipt/session environment, the reality assertion skips rather than spawning.
