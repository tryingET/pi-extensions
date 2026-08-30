---
summary: "Contract for the read-only AI Society startup context packet."
read_when:
  - "Changing the startup packet, AK probes, prompt injection, or degraded-mode behavior."
  - "Auditing whether the automatic Pi startup path can mutate AI Society runtime state."
system4d:
  container: "Read-only startup orientation contract for Pi sessions in AI Society repos."
  compass: "Orient the LLM without turning startup into a hidden rebaseline or authority layer."
  engine: "Detect repo -> read canonical surfaces -> parse machine output -> render compact markdown -> inject into prompt."
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
   - uses the full packet when it is ready
   - otherwise performs a bounded wait (`PI_SOCIETY_CONTEXT_FULL_WAIT_MS`, default `250`)
   - appends the rendered markdown packet to the system prompt for the next LLM turn
   - does not persist the packet into AK

The manual `/society-context refresh` command reruns the full read-only probes and opens the rendered packet in the Pi editor.

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

The implementation uses `execFile`, not a shell, and bounds command execution with `PI_SOCIETY_CONTEXT_COMMAND_TIMEOUT_MS`. It validates exact `repo.resolve` v1 and `startup.snapshot` v1 envelope surface/schema/payload-kind fields. It invokes installed/configured `ak`, inherits an explicitly supplied `AK_DB`, and neither injects a backing filename nor prefers a local build.

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
- direction check fails: warning; no repair
- git unavailable: dirty posture unavailable

The packet includes `captured_at` so readers know it is a snapshot, not live truth.

## Disable/configure

Set `PI_SOCIETY_STARTUP_CONTEXT=0` to disable automatic startup probing and injection.

Other bounded knobs are documented in [README](../../README.md#configuration).
