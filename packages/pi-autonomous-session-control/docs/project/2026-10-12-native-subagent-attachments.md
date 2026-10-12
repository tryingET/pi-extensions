---
summary: "AK7039 ASC native attached-view contract, launch generations, and bounded source-test proof limits."
read_when:
  - "Implementing or inspecting native subagent attachment tabs."
  - "Investigating duplicate/indeterminate viewer launch or view-only controls."
---
# Native original-child attachment views (AK7039)

## Owner membrane

ASC emits `asc:subagent-tabs:request:v1`, schema `asc.subagent-tabs.request.v1`.
`attachments.ts` / public `./attachments` expose the content-free item/read/claim/settlement types
and durable registry API separately from `./execution`. No LH dependency or execution-contract
expansion. LH consumes the event independently and owns same-window native Ghostty placement.

The fixed request has `requestId`, `cwd`, `parentSessionKey`, `parentRepoRoot`, at most 16 `items`,
and synchronous `claim(key)`, `settle(key,result)`, `read(key)`, `reply(result)` callbacks. Each item
contains only `key`, `sessionName`, `dispatchId`, `attemptId`, `ticketPath`, `viewerExtensionPath`.
No prompt, environment, child file content, arbitrary argv, or control nonce in the event.

`/subagents` and the configurable shortcut default to running children of the current session/repo.
`/subagents <name>` requests one original attempt, including terminal read-only history.
`/subagents status` stays read-only; `--name <exact name>` escapes reserved child names.
The sole controller registration is `/subagents`; separate inspect/dashboard/cancel/status/clear/
cleanup/observer commands and the legacy overlay implementation are removed. Advanced maintenance
is nested under `/subagents diagnose`, never performed automatically. Older qualification sections
below record the pre-consolidation historical command surface, not currently supported aliases.
No UI picker or overlay is opened by the native command route. Duplicate blocked/pending mirror
replies cannot finish a request whose owner record still has an admitted pending launch. The
producer polls owner readiness instead; only owner-confirmed readiness is reported as ready.
Final uncertain replies and watchdog warnings preserve owner status and never imply no effects.
Missing helpers are reported after
one second without a claim/reply. Once admitted, the command allows one minute per item plus five
seconds for serial transport/ready polling before reporting a missing reply, without retrying.

## Durable generation registry

Records live at `<sessionsDir>/.asc-attachments/<sha256-identity>/channel.json`, with immutable
`ticket-<generation UUID>.json` tickets. Directories are 0700, files 0600; bounded reads reject
symlinks, hardlinks, foreign ownership, and non-private ticket storage. Publications fsync the
file and directory. Identity includes cwd, session storage, parent session/repo, name, dispatch,
attempt; tickets additionally bind the original controller PID-start, original child PID-start,
private nonce, viewer extension, and exact fixed argv. The child control nonce never leaves the
existing backend. Same-UID processes remain trusted; this is not a sandbox.

Synchronous exclusive-file locks have no stale-lock takeover. A crashed writer blocks attachment
rather than risking duplicate launch. `prepared -> claimed` is persisted before LH awaits or
transports. A second listener/reload sees blocked; only a verified live ready viewer returns reuse.
Before contending for the shared ACK lock, the viewer durably registers its exact PID-start/argv
in an immutable private `bootstrap-<generation>.json` receipt. This reports `bootstrapping`, **not
ready**. ACK retries shared-lock contention asynchronously for at most three seconds (bounded
attempts, abortable), with no stale takeover or transport retry. If ACK exhausts its budget and the
viewer exits, the registration supplies death proof for a later explicit reopen; unknown launch
PIDs remain blocked. ACK still requires installed native input handlers. Each attempt admits at
most 32 ticket generations, including orphan ticket files; reaching the cap refuses another
reopen without deleting any uncertain retained state.

Transport `settled` means `awaiting_ready`, never native readiness. Failure without explicit
`confirmed_no_effects` is `effect_indeterminate`, including a success lacking a disposition.
Pending/indeterminate generations never retry automatically, even after a long timeout.

Only an explicit operator request creates a new generation after an explicit no-effects refusal,
or positively proven viewer death (ESRCH, or a different proc-start identity). Missing procfs,
permissions, or unknown launch PIDs are not death proof. Detach marks the view detached but does
not release its live process claim. Old tickets/callbacks cannot acknowledge or settle a new
generation. Terminal children can remain in existing views; terminal viewing never resurrects them.
A different controller PID is not silently substituted for the original owner.

## Isolated native bootstrap

The fixed viewer argv is:

```text
--no-session --no-extensions --no-tools --no-mcp --no-skills
--no-prompt-templates --no-context-files --offline
-e <ASC/extensions/self/subagent-attachment-viewer.ts-or-js>
--asc-subagent-view-ticket <private-ticket-path>
```

No `--session`, dispatch, resume, model prompt, nonce flag, child environment, or child JSONL writes.
The viewer registers an inert provider with no network implementation and selects it before ACK.
It installs public Pi `CustomEditor` with an owned submit callback **before** Pi's built-in command,
file/skill/template expansion and bash routing. Only `/cancel` and `/detach` are viewer commands;
other operator text, including slash-looking text, `@path`, and `!text`, is literal child guidance.
A separate input handler consumes all prompt input; non-operator/image input is rejected. Tools,
`user_bash`, cache warming, compaction, session switch/fork/tree, and model execution paths are
blocked/inert. Native clear/exit and safe display handlers survive host callback copying; copied
external-editor, model/session and follow-up actions are swallowed. Ctrl+D detaches this viewer
only. Inert selection verifies the provider, ID and custom API, rejecting `models.json` API overrides.
`before_agent_start` defensively restores inert selection; it is **not** a veto and does not use
`ctx.abort()` as one. Input consumption and the throwing inert stream are the no-model boundary.
No execution tools or second child agent are registered.

One native custom transcript message holds mutable native `Container`/`Text`/`Markdown` children,
keyed by event ID. Streaming changes update those components and request a native render rather
than appending delta messages. The display window is at most 160 events, 32 receipts, and bounded
text/detail budgets, newest events favored; clipping is labelled. This is bounded observer history,
not a resumed child transcript. Guidance receipts truthfully distinguish queued, delivered,
expired and rejected; delivered means committed to original child context, not complied with.
Cancel uses Pi's native confirmation then the existing exact name/attempt/parent/repo cancellation
API. Closing or `/detach` shuts down only the viewer. Replacement/unavailable bindings freeze the
last observed history read-only. No lifecycle reconciliation/capacity/reservation changes occur.

A private `ready` record proves validated startup and installed input handlers, with viewer PID-start
and argv bound to the ticket. It does **not** prove pixels, actual tab creation, surface placement,
window identity, guidance delivery, task effects, or settlement. Surface metadata is diagnostic only.

## Private viewer safety observations

The exact ready viewer can publish optional `channel.json#viewerSafety` (schema
`asc.subagent-attachment.safety.v1`). No request/read callback fields or native argv change.
Publication rechecks ticket/generation, original owner/attempt, viewer PID-start and verified argv
under the private registry lock. Controllers/other viewers cannot publish it. Shape checks reject
payload text/extra fields and invalid counters; snapshots carry a monotonically increasing
revision and observation timestamp, bounded counts, and saturation indication.

`viewerSafety.sdk` contains observed `noSession`, `activeToolsCount`, and `inertModelSelected`.
Missing, throwing, or unexpected SDK API results are **null**, not asserted zero/true.
`instrumented` records successful hook registrations; `attempts` is null for an unregistered
monitor. Registered counters are `modelStartAttempts` (`before_agent_start`),
`inertProviderStreamAttempts` (the throwing inert `streamSimple`), `toolCallAttempts`, and
`userBashAttempts`. These count attempted paths, not successful execution, and do **not** cover
arbitrary unknown/nested SDK APIs or every possible provider implementation.

Snapshots are attempted at readiness, before/after native input (including rejected input), on
counter changes and shutdown. `inputObservations.before/after` counts survive later snapshots
without retaining operator text. Shared-lock contention retains the latest snapshot for retry
by existing polling; it never lets a blocked tool/shell/provider path execute. Missing/stale
metadata or a failed/unflushed publication is not proof of zero later attempts: values are only
as of `observedAt`/`revision`. Read fresh post-input metadata while the exact viewer remains live.
No prompts, tool names/arguments/results, shell commands, or secrets are included.

Pi 1.1.0's installed `@earendil-works/pi-coding-agent/dist/cli/setup.js` assigns
`process.title = APP_NAME` (line 4). The parent observed Linux `/proc/<pid>/cmdline` losing its
flag text after this title rewrite. Bootstrap flag proof therefore uses logical `process.argv`,
exactly checked at ACK and retained as private `viewerArgv`, plus actual PID-start/TTY observation;
OS cmdline text is not a reliable flag inventory for this Pi process.

Safety tests use direct blocked-handler unit invocations, mocked SDK observations and a real
isolated registry-publisher process. They make no SDK model requests and do not replace the
parent's actual native SDK/Pi/TTY and Ghostty proof.

## Source proof and remaining integration proof

Focused tests cover fixed callbacks/current scope/bounds/no-fallback, durable cross-module reload
claims, indeterminate/no-effects semantics, old generations, unsafe storage/held locks, real isolated
**registry-fixture** PID-start ACK/reuse/death/reopen, native installed Editor/component rendering,
literal input interception, mutable delta updates, clipping, receipts, control identity, confirmation,
terminal read-only handling and detach. Added ACK-vs-lock/exhaustion/PID-registration, generation
cap/orphan retention, safe copied CustomEditor action/exit, API override, and duplicate mirror tests.
A source integration test runs the actual ASC producer and two actual LH consumers on one event
bus, with a fake transport and isolated registry ACK process (not actual Ghostty or Pi).
Viewer control tests use mocked registry/backend API seams;
the registry subprocess is not a real Pi/Ghostty viewer. These are not GUI or live-model proofs.

## Parent-executed bounded native qualification

Source qualification: `$TMPDIR/ak7039-native-tabs-exact.bUJRWR/proof/proof.json`.
`npm run reality:check --prefix packages/pi-little-helpers -- --only=subagent-attachments.reality.live.mjs`
passed one real assertion, zero skipped. The assertion requires explicit `ASC_TABS_LIVE=1`,
a fresh root, an explicit child provider, and the nested-compositor/private-bus guard. The
controller provider is deterministic; two original ASC children used `openai-codex/gpt-6.1-sol`.

Observed: same niri/Ghostty window, two distinct viewer surfaces; original dispatch/attempt/PID-start
identities unchanged; repeated command reuses both viewers; unavailable zero target refuses without
fallback. Native clipboard paste + Return produced exactly one request and exactly one committed
`asc.subagent-guidance.v1` entry per original child, with exact UTF-8 equality (91/90 bytes).
Delivered receipts precede real child answers following those particular instructions. Fresh native
SDK observations after input report no session, zero active tools, inert provider and zero counts
for all four instrumented attempted paths. These are hook observations, not exhaustive execution
or network absence proof. Beta viewer closure leaves its original child and alpha viewer running;
explicit reopen creates one replacement viewer after proven death. Terminal views remain; controller
ANSI observes `done=2`; idle extension reload reuses alpha. Both native screenshots are retained,
not a pixel/layout fitness certification. Source widget tests prove count-only rendering; native
count observation alone is not a negative assertion about every controller row.

Independent inspection (`dispatch-1791836721096`) checked receipts, child transcripts and all 17
recorded source hashes. Production work-product inspection (`dispatch-1791834849684`) found an
abnormal-exit debug-shell fallback in the shared transport. Attachment-only fail-closed shell policy
now exits on cwd failure and `exec`s Pi, preserving ordinary sidequest defaults. The extracted shell
module and task-session build/packaged inclusion passed affected source tests and LH package CI.

Retained attempts are not erased or reclassified:
- `ak7039-native-tabs-paste.BNFmlD`: close confirmation prevented viewer-death proof.
- `ak7039-native-tabs-close.Hqvehj` / `ak7039-native-tabs-qualified.YRPgwU`: native virtual-key close
  also detached the sibling. Cause in those Pi trials is unproved.
- `ak7039-native-tabs-f12.YQgPl0`: isolation preflight refused before controller/child startup.
- `ak7039-native-tabs-failclosed.6krcmv`: refused the leftover test window before child dispatch.
- `ak7039-native-tabs-busclose.Nx5EjV`: well-known bus name absent; stopped before child dispatch.
- `ak7039-native-tabs-reality.xPo7pJ`: immediate count assertion raced the 2-second widget refresh.
- `ak7039-native-tabs-refresh.C4dmRa`: old substring-based assertion passed despite two concatenated
  copies of each guidance message; independent inspection rejected byte-fidelity qualification.

A sleep-only diagnostic (`ak7039-close-keytrace.576mszly/RESULTS.md`) demonstrated a virtual-key
remapping/repeat hazard, not the historical Pi root cause. The successful exact-byte fixture uses
only the owned nested configuration's 5000 ms repeat delay / rate 1, with production config untouched.
Native close uses private unique-owner PID readback, `present-surface(t)`, then window
`close-tab("this")`, with exact focused-title/window/live-PID and sibling checks. This is a
focus-dependent sequence valid only in the exclusively controlled, unsplit fixture, not an atomic
close-by-surface API or general placement-race guarantee. A separate diagnostic helper ran two
`ghostty +new-tab --help` probes outside isolation; possible operator-tab effects are unverified,
the helper stopped, and the incident was disclosed. No outer-window inspection or undo was attempted.

ASC and LH package CI passed. Full fleet CI is blocked by missing installs in unrelated worktree
packages; root control CI passed with the declared `PI_SKIP_PACKAGES=1`,
`PI_SKIP_PACKAGE_RELEASE_CONTRACTS=1`, `PI_SKIP_GOVERNED_DEEP_REVIEW=1` selections, paired with both
changed-package CI gates. This is not a full fleet/registry-consumer-canary pass.

## Installed canonical qualification

Guarded landing of `f9f7bae797c436470e9735dc12ed51c181275252` succeeded through
`scripts/land-canonical.sh`, including both changed-package installs, host links/install-health
and the normal-extension no-model smoke. Both local packages were reinstalled with `pi install`.
All 39 pre-existing canonical `dist/task-session` file hashes remained unchanged. The standalone
worktree build separately required a lower-case `shared-ghostty-shell.js` emission name to satisfy
its sealed build-identity filename grammar; after that correction, final package CI logs report
ASC 713/713 and LH 955/955 tests passing, zero skipped. No canonical task-session rebuild or
standalone task-session runtime qualification is claimed.

Normally installed qualification: `$TMPDIR/ak7039-native-tabs-installed.RZDIcU/proof/proof.json`.
One real assertion passed, zero skipped, in a fresh canonical TUI with normal extensions enabled.
The fixture skipped substitute delegation/dashboard registrations; startup lists canonical
`self.ts` / `sidequest.ts`. It proves the same bounded workflow above through installed discovery,
including exact single 91/90-byte queued-and-committed guidance, followed by real original-child
responses, same-window native surfaces, close/reopen sibling safety, terminal counts and idle reload
reuse. Private viewer hooks remain zero. Independent inspection (`dispatch-1791836721096`) checked
all 17 source hashes against canonical files **and HEAD blobs**, the installed registration paths,
receipts/transcripts and screenshots. Ghostty's retained protocol log reports `repeat_info(1, 5000)`,
matching the retained test configuration; this is not a normal-repeat-settings qualification.

The installed alpha fixture child appended the instruction sentence's period to the supplied bash
command, causing an extra `.` in its output. Exact command/output equality was not asserted. This
limits exact fixture-command conformance, not the separately checked guidance bytes or original
execution continuity. No source implementation fix is inferred from test-specific repeat settings.

No automatic indeterminate launch retry is acceptable. Character-by-character typing, Unicode,
normal-repeat virtual-key delivery, malformed native input/cancellation, competing focus/splits/
multiple windows, and broader platform checks remain outside this bounded native trial. Existing
controller sessions require `/reload` to replace their already-loaded legacy command closures.
