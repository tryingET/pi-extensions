---
summary: "Contract for the read-only AI Society startup context packet."
read_when:
  - "Changing the startup packet, AK probes, prompt injection, or degraded-mode behavior."
  - "Auditing whether the automatic Pi startup path can mutate AI Society runtime state."
system4d:
  container: "Read-only startup orientation contract for Pi sessions in AI Society repos."
  compass: "Orient the LLM without turning startup into a hidden rebaseline or authority layer."
  engine: "Detect repo -> read canonical surfaces -> parse machine output -> render compact markdown -> append persistent context message."
  fog:
    risks:
      - "Automatic startup accidentally mutates AK, git, projections, or decisions."
      - "Raw machine JSON floods the LLM context."
      - "Projection/read-first hints are mistaken for canonical authority."
---

# Startup context contract

## Intent

`@tryinget/pi-society-startup-context` provides a bounded orientation packet for fresh Pi sessions inside `~/ai-society`.

The packet helps the LLM start with the right repo/runtime posture:
- where am I?
- what repo is this?
- is git dirty?
- does AK know this repo?
- is direction healthy?
- what does the ready task queue look like?
- are there active decisions that should shape work?
- which local docs are pointers, not authority?

It is not a control-plane transition and not a repair path.

## Trigger and prompt path

The extension uses two Pi lifecycle hooks:

1. `session_start`
   - detects whether `ctx.cwd` is under `~/ai-society`
   - creates a fast/minimal path-inferred packet without AK/git probes
   - starts the full read-only snapshot refresh in the background
   - may show a terse UI status/notification
2. `before_agent_start`
   - uses only current-generation/current-config context; completion alone is not readiness
   - otherwise performs a bounded wait (`PI_SOCIETY_CONTEXT_FULL_WAIT_MS`, default `250`)
   - returns a hidden, persistent `society-startup-context` custom message for the next LLM turn, leaving the original system prompt exactly intact
   - compares the complete semantic snapshot content/evidence (including exact `capturedAt`, freshness, config and cwd) against the last active `society-startup-context` custom message from `ctx.sessionManager.buildContextEntries()`; excludes only local controller generation/monotonic scheduling origin
   - skips an identical active snapshot; re-emits if matching evidence exists only before compaction or on an abandoned branch; honors message omissions/replacements on hosts with context edits
   - uses no in-memory last-injection cache and never edits old messages; minimal adapters without a session manager append safely without deduplication
   - withdraws prior active advice with a single minimal superseding marker when injection is disabled or cwd leaves eligible scope; repeated withdrawn prompts are quiet, no AK/git probes are added, and re-enabling emits current advice
   - marks the latest snapshot as superseding earlier advisory snapshots (including other cwd/config identities); all snapshots are observations, never authorization or task claims
   - labels health/freshness at injection time, not as a continuing authority grant; current AK authority must still be read before acting
   - does not persist the packet into AK

The manual `/society-context refresh` command requests a read-only refresh and opens the current rendered packet in the Pi editor (or prints headlessly). Concurrent requests coalesce. Manual requests may bypass age/backoff, not generation/identity/shutdown checks. A superseded waiting command/prompt emits no obsolete packet.

## Authority model

The packet repeats the current AI Society authority split:

- AK = canonical runtime/lineage/task/evidence/decision authority; its configured fsqlite-backed database is durable substrate, not a consumer API
- ROCS = semantic authority
- Prompt Vault = reusable procedures/prompts, not runtime authority
- Pi = live execution harness and operator workbench
- Pi runtime registry/session JSONL = useful process/session context, not canonical authority
- DSPx/Oracle = empirical behavior analysis, not normative authority
- Docs/capability maps = narrative/projection unless promoted through AK/runtime authority

## Read-only surfaces

The automatic path may run only bounded read commands:

| Surface | Command shape | Purpose |
|---|---|---|
| Git root | `git rev-parse --show-toplevel` | locate repo root |
| Git dirty state | `git status --short` | summarize changed paths |
| AK repo posture | `ak repo resolve <cwd> --machine` | canonical registration/company/layer metadata without implicit bootstrap |
| AK startup snapshot | `ak startup snapshot --repo <canonical-repo> --ready-sample <n> --machine` | runtime schema, ready queue count/sample, task-status counts, deferrals, and expired-lease posture |
| Direction export | `ak direction export --repo <canonical-repo> --machine` | active/next direction nodes |
| Direction check | `ak direction check --repo <canonical-repo> --machine` | drift/stale warnings in the standardized AK machine envelope |
| Decisions | `ak decision list --machine --limit 10` | relevant active decision warnings |
| Decision passport | `ak decision passport <id> --machine` | only for a small number of active relevant decisions |

The extracted runner uses `spawn` without a shell. Within a refresh, AK calls are serial; git may proceed independently. Defaults are 45 s per AK command, 120 s per collection, and a separate 250 ms prompt wait. Git root/status retain 2 s/3 s bounds. Check abort before each stage; collection-budget expiry cancels the active reader and suppresses all later launches. Command diagnostics report external elapsed time (including admission), not internal AK timings.

Every machine read requires process success and exact envelope surface/schema/payload-kind agreement. Rejected responses never supply authority-bearing fields. Independently check consumed payload semantics: canonical repo registration/scope, snapshot counts/ready sample, direction node collections and typed check reports, decision arrays/count agreement and decision/passport identity. Snapshot IDs/counts are nonnegative safe integers; derived claimed-plus-running totals must also be safe. Ready priorities are integers 0–4. Validate original emitted optional values before projection (`claimed_by`: string/null, task statuses: pending/claimed/running/done/failed/blocked, and typed metadata); wrong types cannot silently become omitted or null facts. Missing/rejected direction-check evidence is unknown, not drift. Passport failures contribute to health and warning count, not only summary text.

Invoke installed/configured `ak`, inherit explicit caller `AK_DB`, and neither inject a backing filename nor prefer a local build. Caller `AK_DB` is part of configuration identity only: the published gate unsets it and selects its owner-controlled database.

## Compression rule

Raw machine JSON must not be pasted into the LLM prompt.

The extension parses machine/json output and emits semantic markdown bullets:
- counts, not full collections
- the ready-task sample emitted by `startup.snapshot` v1; active/blocked posture is count-only because v1 emits no such samples
- short decision samples, not raw payloads; an empty bounded decision sample is never presented as proof of global absence
- file pointers, not pasted docs
- package-local `docs/project/product-posture.md` and `docs/project/vision.md` pointers when cwd is inside a package that owns them
- bounded warnings, not full stderr dumps

If parsing fails, the packet reports a warning and omits that surface's canonical claims.

Automatic custom-message content is limited to **32 KiB in UTF-8 bytes**. Existing transport/sample bounds alone do not bound combined markdown bytes. If the full message exceeds this ceiling, withhold its entire body, never a silently truncated decision/grant or partial claim. Emit an explicit oversized-body notice, source health/freshness/refresh state, uncapped warning total and collection diagnostics when they fit. If even these diagnostics exceed the ceiling, explicitly withhold them too. All omitted semantic fields remain covered by the model-visible evidence SHA-256 digest, so changed omitted evidence still emits a new marker. Neither digest nor packet supplies authorization. Manual refresh/render behavior is unchanged and exposes the full packet.

## Mutation prohibitions

Automatic startup must not:

- create, claim, complete, defer, or rebaseline tasks
- advance decisions
- record evidence
- refresh projections/work-items
- repair direction drift
- bootstrap repo registration
- write docs or git state
- write session-derived facts into AK
- treat Prompt Vault, Pi runtime registry, session JSONL, docs, or capability maps as runtime authority

Future mutation commands such as `/society-rebaseline` must be explicit operator commands with separate reviewable contracts.

## Degraded mode

The packet degrades fail-open for orientation but fail-closed for authority claims:

- outside `~/ai-society`: quiet by default; no AK/git probes
- full refresh pending: fast packet is explicit that AK/git/direction/task/decision posture is not checked
- AK missing or timed out: warning plus unavailable AK section
- repo not registered: warning; no bootstrap
- machine surface unavailable: warning; no human-output parsing fallback
- direction check unavailable/rejected: unknown plus warning, not inferred drift; an accepted negative check reports observed drift only
- git unavailable: dirty posture unavailable

The packet keeps `packet_tier` / `full_refresh_status` for valid public projections and adds independent dimensions:

- `source_health`: `healthy`, `degraded`, `not_checked`; completed collections with unavailable required sources (including requested passports or git) are degraded. Unregistered repos are degraded orientation, not healthy canonical observation.
- `freshness`: `fresh`, `stale`; measured monotonically from collection start, default TTL 5 min. Prior stale facts may be displayed only as stale orientation, never current authority.
- `refresh_state`: `idle`, `refreshing`, `backoff`, `blocked_cleanup`; readiness/checkmark requires a healthy fresh full packet and no refresh in progress.
- `warningCount`: total before display truncation; source health cannot be repaired by truncating warnings.

`captured_at` remains a wall-clock snapshot label, not the scheduling clock. Source health measures availability of semantically checked observations, not decision authorization or direction conformance.

## Lifecycle and recovery

Each controller has a generation-safe single flight, shared by startup, prompts and manual commands. Cwd/config change cancels and invalidates the prior generation; replacements wait for its actual reader cleanup. Publication, bounded-wait completion and immediate rendering/injection all recheck identity/generation/shutdown. Shutdown awaits bounded cleanup receipts and suppresses late results; a failed receipt is not settlement. Unresolved owned-resource handles are retained separately from completed promises. They block manual/automatic/config-replacement collections until demand-time observation proves settlement; config invalidation, controller restart and new extension factories never discard them. The adapter supplies reload-stable readers from a process/realm-local `globalThis`/`Symbol.for` registry keyed by source-module URL and the host's stable `SessionManager` object (retained across the pinned Pi host's reload/new/resume/fork). Distinct host managers remain isolated even with identical cwd/session-id strings. Minimal injected adapters without a host manager fall back to their own API object; that fallback is not a host reload proof. Weak owner maps hold only ownership registries, not packets/flights or AK facts; unresolved receipts additionally pin their owner until settlement observation. Config changes do not grow namespace entries. Default serial collection aborts at the first cleanup failure and launches no further readers while blocked, bounding outstanding receipts per controller; unresolved owners cannot be safely capped/evicted on age, shutdown or GC. This is not cross-process recovery, nor a fence for a changed module-owner path/manager identity. `blocked_cleanup` exposes only degraded/stale unknown-source orientation. Unavailable ownership proof remains blocked, not permission to signal an unowned group or forget a reader.

Effective configuration is snapshotted once per generation. Fingerprint normalized cwd/home, resolved executable (including PATH effects), inherited caller `AK_DB`, enable/limits, prompt/command/refresh/TTL/retry budgets and outside-packet flags. It is not an AK database authority token.

Retries are demand-driven on subsequent prompts/commands, with exponential 15 s base, 0–25% injectable jitter applied **before** the 120 s cap. Only healthy collection resets failure backoff. Manual refresh bypasses age/backoff but coalesces in-flight work. No idle polling, cross-controller mutex or shared authority cache is created. The only idle timer is a generation-bound one-shot footer expiry update at the healthy TTL deadline (no probes/retries), canceled on replacement, new collection and shutdown. It rechecks the monotonic deadline and current identity before clearing readiness. Clock/random suppliers are injectable for tests.

## Owned-reader cleanup and limits

POSIX readers get a detached process group. Record cancellation, command timeout, refresh timeout, nonzero exit, launch failure, malformed machine/payload failure and unproven cleanup distinctly. Send TERM to the owned group, wait 250 ms and escalate to SIGKILL independently of leader exit/pipe closure. Settlement requires both the direct child and no live owned group members; verification is bounded to 2 s after escalation. Successful transport additionally waits for both stdout/stderr EOF within a bounded 2 s drain budget (also subject to cancellation/command budget); incomplete output is `output_incomplete`, never success. Failure to establish settlement reports `cleanup_failure`, never successful cleanup; later AK stages are suppressed.

Linux `/proc` observations check leader start time, session and UID so another invocation/pre-existing group is not knowingly signalled. A non-atomic empty census cannot retire a group or suppress TERM/KILL. Corroborate it with atomic kernel group-existence checks. Only observed atomic absence is cached; zombie-only settlement requires a successfully delivered, ownership-guarded SIGKILL and then two stable nonempty PID/start-time-matched censuses. Matching zombie-only observations while the kernel group exists are not sufficient before escalation; TERM/KILL cannot be bypassed. ESRCH during signalling is not counted as successful SIGKILL delivery; atomic absence may still establish actual settlement independently. Ownership/PID reuse or unavailable observations stay fail-closed. Non-Linux POSIX uses group existence without equivalent `/proc` proof; Windows has direct-child-only fallback. Deliberately escaped process groups/sessions are not contained. Controlled AK readers must not daemonize; the adversarial escape regression demonstrates the limitation and explicitly cleans its own escaped fixture.

## Local candidate verification

The five imported transport/config/message/payload/lifecycle modules are named in the packed `files` manifest, not the entire `src` directory. Regressions cover source schemas, warning truncation, failure/recovery/TTL/backoff, registered adapter races/coalescing/shutdown, real controlled groups and an extracted tarball on a separately installed production Pi host with no repo/dev-dependency fallback. Compatibility preserves valid public imports/projections, not rejected-data consumption. Local checks do not establish live AK capacity, producer optimization, deployed generation or Ghostty behavior; those require parent-owned inspection/dogfood/publication.

## Disable/configure

Set `PI_SOCIETY_STARTUP_CONTEXT=0` to disable automatic startup probes and snapshots. One minimal withdrawal marker supersedes prior active startup advice; no marker is emitted without prior active advice.

Other bounded knobs are documented in [README](../../README.md#configuration).
