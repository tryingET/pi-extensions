---
summary: "Pi consumer publication and post-landing TUI observation; AK producer/deployment remain deferred for shared dev custody."
system4d:
  container: "Consumer deployment evidence, separate from producer publication and task lifecycle."
  compass: "Report only the executed and independently inspected proof scope."
  engine: "Exact gated push -> all CI -> canonical landing -> native TUI -> retain receipts."
  fog: "Normal controller settlement does not prove arbitrary descendant containment."
read_when:
  - "Checking what was actually deployed for AK6391 and what blocks AK6392/AK6396."
---
# Society context consumer deployment receipt

## Publication observed

Implementation commit: `5e29ac9ef9379c46c9a9a57bf394ca7dcca9ac2a`.
Independent source acceptance: `dispatch-1790850568341`; candidate behavior and preservation inspection: `dispatch-1790865721436`.

Full checked-in pre-push passed under heavy-job task 6391 with pinned Node 22.23.3/npm 12.0.2, exact locked installs, explicit gate-build preparation, and no hook/package bypass. Candidate stayed clean. All six head-specific GitHub runs completed successfully:

| Workflow | Run ID |
| --- | --- |
| immutable-extension-generations | 36881973019 |
| compatibility-canary | 36881972867 |
| release-check | 36881972933 |
| ci | 36881972896 |
| release-please | 36881972826 |
| node-next | 36881972966 |

Canonical `scripts/land-canonical.sh origin/main` fast-forwarded from `ae74c876dda4fb16c544e51411ec4e4e837c1e36`, installed the changed package, and passed install health/real Pi extension-load smoke. The unrelated tracked binary diff and dirty-path listing were identical before/after. The canonical local package was reinstalled with `pi install`.

Logs: `$TMPDIR/ak6391-gated-push.log`, `$TMPDIR/ak6391-canonical-landing.log`, `$TMPDIR/ak6391-pi-reinstall.log`. AK evidence 12058 binds publication; this receipt does not itself complete an AK task.

## Post-landing native TUI observation

Run `8f391900-cd3b-45eb-8ee7-5b6bf7ecf2fa` exercised the canonical source in a fresh Ghostty tab, registered canonical cwd, unchanged HOME, isolated private configuration and normal installed AK. No transport proxy, PATH shim, syscall tracer, collector mock or timeout override was used.

Prelaunch scope inspection: `dispatch-1790872686469`. Independent actual-evidence inspection: `dispatch-1790873386347`, **PASS for the declared lean behavior scope**.

- First prompt callback: **252.183 ms**; replacement prompt callback: **1.422 ms**. Submission-to-agent-start was approximately 254.793/2.761 ms, not a network/model latency promise.
- Two idle native editors showed full/healthy/fresh/complete context with **zero Society source warnings**.
- Native `/reload` produced a distinct factory with exactly one Society startup handler/command. Capture timestamps changed from `16:43:35.564Z` to `16:43:46.593Z`; replacement prompt injection matched the replacement editor.
- Direct Pi and externally observed driver naturally exited **0**. Retained pidfds settled, no fallback signal/error was recorded, and the final original controller group returned kernel ESRCH.
- Exercised source hashes match final inspected consumer hashes in the [inspection ledger](2026-10-01-context-reliability-inspection.md).
- Installed AK pin had independently advanced to `8f4da87b56cd7ff9d5da49fc50ed42ef9b2ff9e9` before this run. It is **not** the unpublished AK6392 candidate. Binary SHA-256: `2a416864d950948a40209833a3264712dd058216e72b7c679d55e34eb2a8612f`.

### Probe findings and dispositions

The initial overbuilt promoted probe was held before execution: cleanup/evidence ordering, optimization bypass, tracing completeness and arbitrary-tree coverage were not sufficient. Its evidence was preserved; it is not a passing runtime proof. A separately inspected lean probe instead verifies native behavior and known direct-controller settlement without pretending to attest arbitrary descendants. This scope change does not weaken the production cleanup tests or erase the failed protocol.

An initial Ghostty request used process argv where the action expects Ghostty CLI argv; no probe process/artifact was observed. The corrected request added `--working-directory` and `-e`, after which the actual TUI run was observed.

The lean run's original verifier rejected the host builtin `<inline:llama.cpp>` command. A separate post-run verifier accepts only that exact hash-pinned host helper plus the exact Society owner; arbitrary extras remain rejected. It also fixes catching its own `SystemExit(0)` as failure. Original harness files, raw receipts, manifest and the first invalid verifier output remain unchanged. Independent inspection confirmed the correction did not weaken lifecycle criteria, and twelve focused in-memory negatives rejected wrong owners/extras, duplicate registrations, active tools, forced cleanup and missing proof.

The terminal contains a custom-model catalog warning for `gpt-6.1-sol`. **The entire TUI was not warning-free**; zero-warning Society editors are the proved claim. Private configuration and credential removal were receipt-backed, not independently inspected by the tester.

## Retention and limits

Named proof artifacts are retained outside TMPDIR at:
`/home/tryinget/.local/state/pi-quests/evidence/ak6391/8f391900-cd3b-45eb-8ee7-5b6bf7ecf2fa`.

The explicit allowlist includes original harness/manifest, raw events/inputs/terminal, source/runtime observations, exits, both verifier outputs and the separate corrected verifier. No agent/cache directory, credentials or session export was copied. SHA256SUMS was checked before files/directory became read-only. Manifest SHA-256:
`cb0a1fe922661db17c708056753cd9a9d3a652b22cde658d847673c255b917b2`.
Corrected verifier SHA-256:
`190c54e6d74399ececd79918cb9a4a9e76c284f8ac4dfc84dca6f435ba76a09c`.
Same-account immutability remains cooperative, not independent backup/tamper-proof custody.

Final labels are explicitly separate: behavior observation passed; observed direct-controller settlement proved; **descendant coverage unproven**; **AK6392 producer deployment unproved**. No arbitrary-tree/no-leftover-AK, capacity, complete AK field-semantic, internal generation-counter or physical-pixel proof is implied.

Post-landing observation did not repeat TTL/fault injection. The independently accepted [candidate dogfood](2026-10-01-context-reliability-dogfood.md) separately observed default timeout degradation, demand recovery, native reload, default TTL expiry without idle AK calls and expiry recovery. Production deterministic tests cover owned-reader cleanup, unresolved receipt retention across factories, malformed payloads and concurrency/config/cancellation races. Preserve those distinct proof scopes.

## Producer and deployment still blocked

AK6392 candidate `dbffd0dee72c2d9c264dfdb56a3f9298eae0b4f6` is preserved with passing focused/fast/full gates (evidence 12059). Exact immutable candidate binary, shared ak-dev proof/rollback, source publication, policy rotation and activation are not performed by this controller.

AK evidence 12060 records the missing verified dev custodian/slot. Claims for AK6392/AK6396 were released before expiry; first-class until-event deferrals **492/493**, review 2026-10-02, require operator-confirmed shared ak-dev custody and sequenced publication. An idle peer or externally changed installed pin is not slot authorization. Direction-projection refresh is explicitly deferred outside these paused scopes.

Pi source deployment and native behavior are observed; the cross-owner optimization rollout and AK task lifecycle closeout are not claimed complete.
