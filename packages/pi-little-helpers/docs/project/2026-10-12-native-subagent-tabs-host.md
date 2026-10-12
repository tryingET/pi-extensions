---
summary: "AK7039 LH host membrane for explicit native read-only existing ASC child tabs; bounded source proof and parent-owned reality limits."
read_when:
  - "Changing ASC native attachment tab requests, identity/path guards, launch settlement or shutdown fencing."
  - "Proving /subagents native tabs in the actual controller Ghostty window."
type: "contract"
system4d:
  container: "Pi-native attached-view tab transport for existing ASC child execution."
  compass: "Expose existing children without duplicate execution or controller overlays."
  engine: "ASC exact-attempt request -> LH controller-tab transport -> ASC native-ready readback."
  fog: "Transport acceptance and viewer readiness do not establish placement or child effects."
---

# Native existing-child tab host

## Owner boundary

ASC owns the `/subagents` producer (current-session running children by default), native viewer,
tickets, durable atomic claim, readiness readback, guidance/cancellation and original execution.
LH owns only the content-free request consumer and Ghostty transport. The standard `sidequest`
projection registers it on `session_start`; toolbox-only projections do not. The old detached
read-only observer remains manual troubleshooting by default, unchanged by this host.

No event API deviations: `asc:subagent-tabs:request:v1`, schema
`asc.subagent-tabs.request.v1`, the fixed descriptor plus synchronous `claim`, `settle`, `read`,
`reply` callbacks. No ASC runtime/private imports or dependency. Replies are request-correlated,
ordered per descriptor; statuses include `ready`, `reuse`, `blocked`, `failed`, `unconfirmed`,
or bounded owner read status. ASC `read.status === 'ready'` is the native ACK authority.

## Admission and bootstrap

Before any callback or launch: exact TUI/hasUI/Linux/Ghostty, nonzero uint64 controller surface
(decimal or hexadecimal), current session ID, normalized same cwd and nearest `.git` repo root.
Non-Git cwd uses cwd as repo root, matching ASC. Root must be canonical; symlink ambiguity fails
closed. Descriptor data is snapshotted, strict (no extra command/argv/env fields or accessors),
1–16 items, unique key/ticket/dispatch-attempt, bounded strings and normalized absolute paths.

ASC bootstrap file shape independently checked by LH:

- `<sessionsDir>/.asc-attachments/<64 lowercase hex key>/ticket-<generation UUID>.json`;
- root and key directory: owned, real non-symlink directories, exactly 0700;
- ticket: opened no-follow/nonblocking, owned regular single-link file, exactly 0600, 1–16384 bytes;
- bounded ticket schema `asc.subagent-attachment.ticket.v1`, matching descriptor key/name/attempt,
  cwd/parent session/repo, original controller PID, sessionsDir containment, generation filename,
  nonce presence and **exact fixed argv**; nonce never leaves the private ticket or enters CLI;
- viewer basename `subagent-attachment-viewer.ts` or `.js`, canonical owned non-group/world-writable
  regular single-link file (512 KiB bound), under owner `extensions/self/` or `dist/extensions/self/`,
  and nearest owner manifest within four ancestors (64 KiB bound) names
  `@tryinget/pi-autonomous-session-control`.

ASC claim/read still own full ticket/process-start/nonce/generation/live-viewer/attempt checks.
Same-user code/files are not a security sandbox. Path/metadata checks are repeated immediately
before transport admission. Tickets/child transcript are never copied into replies or logs.

A process-wide weak fence elects one completion owner for the **original payload object**,
independent of per-extension API/events wrappers and module copies/reloads. Duplicate deliveries
of that same object are ignored: no second claim, launch or competing blocked reply. An
ineligible/wrong-context listener neither elects itself nor replies; ASC owns native-mode and
missing-helper diagnostics. Path/capacity refusals defer one microtask so another synchronous
eligible listener can admit first; otherwise exactly one bounded refusal is replied.
A new operator request is a new payload object and still uses ASC's durable atomic claim to
prevent launch duplication across attempts/reloads. The weak fence is not an owner registry.

Every elected item calls `claim` synchronously, before the first transport await. `reuse` reads once and
launches zero processes; `blocked` only reports. `launch` enters a bounded serial queue and builds
only:

```text
pi --no-session --no-extensions --no-tools --no-mcp --no-skills
   --no-prompt-templates --no-context-files --offline
   -e <ASC viewer extension> --asc-subagent-view-ticket <private ticket path>
```

No prompt, controller model/thinking args, child JSONL `--session`, fork, dispatch, event command,
event environment or arbitrary argv. The trusted host Pi executable is used, not event data.
`launchPiQuestSession` retains its existing cwd/Ghostty argv transport and receiver checks under
`controller-tab-only`; no independent shell script, shared resolver change, wrapper substitution
or new-window retry. Only this attachment host opts into `shellExitPolicy: "fail-closed"`: cwd
failure exits, and Pi replaces the scaffold via `exec`, so viewer death cannot leave a debugging
shell alive. Ordinary sidequest and observer launches retain their debugging-shell defaults.

## Bounds, settlement and lifecycle

At most 16 admitted launch items and 16 pending request replies per host runtime. Overflow
reports blocked without claim/effects. Launches serialize through LH plus the existing global
stagger (fixed 1 s here, never an unbounded environment delay). Each transport has a 20 s absolute
admission deadline/abort and each native-ready read has a 4 s polling bound (100 ms intervals).
Queue residence is capped at 400 s; finite queue capacity prevents unbounded accumulation.
ASC command reply wait must include serial admission and all readiness waits, not just 4 s.

Transport `ok` settles `{ok:true,effectDisposition:'settled'}` but cannot assert viewer readiness.
Explicit no-effects refusal settles `confirmed_no_effects`; throw/timeout/unknown or unsuccessful
`settled` settles `effect_indeterminate`. The latter may still acquire an exact native-ready ACK;
no transport is retried. No-effects refusal never upgrades to ready. Errors are bounded generic
per-child diagnostics; owner details are sanitized/truncated to 512 characters.

Shutdown unsubscribes, fences the generation, aborts in-flight native exec, synchronously settles
unsettled claims (unadmitted: no effects; admitted: indeterminate), and sends one disposed reply.
Queued work, late results, native-ready polls and old-generation restart continuations have no
new callbacks or dispatch after disposal. Each external exec also checks the fence/deadline.
Existing successfully settled transports are never downgraded by shutdown.

## Proof boundaries

Focused source regressions: `node --test tests/subagent-tabs-host*.test.mjs`; package typecheck/lint
are non-packaging checks. Host unit tests use private owned fixtures and stub ASC callbacks; the transport
integration exercises the actual existing launcher with a stub bus receiver. Producer regressions
add ASC's public extension entrypoint/actual `/subagents` producer and durable registry callbacks,
plus the actual Pi event bus shared by distinct API/events wrappers and two LH listeners. Those
exercise final refusal and bounded unconfirmed completion without a synthetic native-ready ACK.
These prove source admission/argv/settlement/reload/disposal/completion logic, **not** complete
cross-process ASC ticket atomicity, native TUI behavior,
GUI placement, installed discovery, or absence of model calls in the native viewer implementation.

Parent-required reality proof (not performed by the LH child):

1. Authorized install/fresh native TUI with two actual active ASC children; `/subagents` requests
   two native child views, no controller overlay, same actual niri/Ghostty window ID/count,
   distinct viewer surface IDs. Preserve any failure; never infer placement from nonzero surface.
2. Read actual viewer `/proc` argv: the fixed bootstrap above, no executing child session resume;
   no tools/model calls. Record original child PID/attempt unchanged on attach and repeat.
3. Guidance typed in native viewer reaches the original child with truthful delivery receipt;
   cancellation remains ASC's confirmed exact-identity action.
4. Close one viewer: original child remains running. Explicit reopen creates exactly one tab
   only after ASC proves viewer death; pending/indeterminate launch is not retried.
5. Terminal history remains in an attached viewer; main count strip collapses when all terminal.
6. Independently inspect actual receiver/window/tab behavior, including stale-surface/nameless
   launcher limitations; native-ready ACK proves handlers/bootstrap, not pixels or placement.

## Executed source checks (LH child)

Initial slice, before the duplicate-completion correction:

From this worktree's `packages/pi-little-helpers`:

```bash
node --test tests/subagent-tabs-host*.test.mjs tests/subagent-observer-command.test.mjs \
  tests/asc-observer-session.test.mjs tests/asc-execution-observer-launch.test.mjs \
  tests/ghostty-originating-window-tab.test.mjs tests/sidequest-launch-composition.test.mjs
node --test tests/sidequest.test.mjs
npm run typecheck
npm run lint
```

Observed: 218/218 plus 54/54 tests pass (40 new host regressions); typecheck passes; lint exits zero
with five existing warnings in untouched `sidequestGhostty.ts`, `sidequestLaunch.ts` and
`tests/sidequest.test.mjs`. Changed TypeScript/tests pass focused Biome checks without warnings.
`git diff --check -- packages/pi-little-helpers` passes. No native viewer/TUI/Ghostty GUI or installed
behavior was tested. No reality assertion was run; the parent must provide the real proof above.

Duplicate-completion correction checks:

```bash
node --test tests/subagent-tabs-host*.test.mjs tests/subagent-observer-command.test.mjs tests/sidequest.test.mjs
npm run typecheck
npm run lint
```

Observed after correction: 114/114 tests pass, including 45 host checks and four actual ASC producer
checks (included in the 45). Two eligible listeners make exactly one owner claim and one final
reply; wrong-mode/wrong-session first listeners cannot suppress the eligible listener. A full
first host cannot win a blocked reply against a second available host. A separately evaluated
host module shares the original-payload fence, while fresh payload objects retain durable ASC
reuse/no-retry behavior. Typecheck passes; lint exits zero with the same five existing warnings.
No production ASC code was changed by LH, and no ASC runtime import/dependency was added to the
LH consumer. The integration's ASC imports are test-only public surfaces.

No packaging/build/Decision151 artifacts, commits, AK mutations, landing, install/activation,
real model or operator GUI actions are authorized by this implementation slice.
