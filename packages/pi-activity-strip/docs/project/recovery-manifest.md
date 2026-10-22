---
summary: "Read-only cross-harness recovery manifest CLI, evidence semantics, privacy and coverage limits."
read_when:
  - "Inventorying agent processes and session evidence without reopening or closing sessions."
  - "Consuming the recovery-manifest.v1 JSON contract."
---

# Recovery manifest

From this package directory:

```bash
node ./bin/pi-activity-strip.mjs manifest
node ./bin/pi-activity-strip.mjs manifest --no-ak
node ./bin/pi-activity-strip.mjs manifest --pi-session-root /absolute/custom/session-root
```

The command emits JSON and does not start the ribbon. It works independently of the panel;
Pi self-reports are unavailable when the existing broker is absent. `--json` is accepted but
redundant. Unknown options fail rather than falling through to `open`.

For private recovery work, paths can be included explicitly:

```bash
umask 077
node ./bin/pi-activity-strip.mjs manifest --include-paths > /private/owned/manifest.json
```

Choose an existing private directory you own. Do not commit native inventories. Even redacted
output contains session IDs, PIDs, task IDs, process fingerprints and window/workspace topology.
Path hashing is pseudonymization, not anonymization. By default **all absolute pathname values**
are SHA-256 references, including procfs provenance and `/proc/PID/root/...` paths.

## Read boundary

The collector reads procfs metadata for the current Unix user, Claude registry metadata, an
already-running Pi broker, filename inventories, and fixed `niri msg -j windows|workspaces` and
`ak task list --status claimed --format json --all --verbose` queries. It never opens the society
DB directly. It does not install hooks, focus windows, acquire session leases, replay prompts,
close sessions, start an LLM, launch an agent or change AK claims. Owner CLIs retain their own
runtime admission behavior; read-only here describes requested operations, not an assertion
that every external program performs zero internal bookkeeping.

No transcript body, title, prompt/reply preview, environment or raw command line is emitted.
The first two procfs argv slots are inspected only for executable/script recognition and stored
as a digest for rechecks. Pi and Codex JSONL reads are **first-record metadata projections via
jq**, which halts before subsequent records. Claude JSONL content is not read at all.
Dependencies: Linux procfs, Node, `getconf`, `jq`; niri, AK and the broker may be unavailable.

## Schema: `pi-activity-strip.recovery-manifest.v1`

The pure input contracts are [recovery-types.ts](../../src/common/recovery-types.ts); the output
builder is [recovery-manifest.mjs](../../src/common/recovery-manifest.mjs).

| Field | Contract |
| --- | --- |
| `schema`, `readOnly`, `complete` | Exact schema above; `true`; **always `false`** |
| `observation` | Start/end ISO timestamps, observed boot ID and PID domain, `atomic:false` |
| `privacy` | Path mode and explicit never-emitted content categories |
| `capabilities[]` | Harness, metadata/session method, transcript method, current-display support, published claimant prefix or null, limitation |
| `sources[]` | Source reference, state, observed/rejected counts, limitations; failed reads never imply zero sessions |
| `sessions[]` | **Observation rows, not a census of sessions.** Process-only rows have `session.id:null` |
| `coverage` | Observation, identified-session, distinct harness-qualified identity, process-only, source-link, transcript and claim counts |
| `windowContainmentGroups[]` | Candidate window containment, distinct observed process count and known session-identity count; never tab/session cardinality |
| `claims[]` | Exact AK claimant projection, lease, match state, matching observation IDs and query provenance |
| `limitations[]` | Non-atomic capture, incomplete historical coverage, owner boundaries |

Each observation row carries `observationId`, `harness`, `session` (ID/source/provenance/cwd/reported
start), `process` (state, candidate process or null, provenance, uncertainties), `placement`
(state/windows/provenance/uncertainties), `transcripts[]`, and `ak` (published claimant or null,
identity links, authority reminder). Process metadata includes PID, PPID, birth ticks, boot ID,
PID domain, approximate wall-clock birth, executable/inode identity, selector digest and cwd.
Window entries distinguish internal `workspaceId` from user-visible `workspaceIndex`.

Counts deliberately distinguish eleven AGNT Electron processes from **zero established AGNT
session identities**. No helper process is silently collapsed into a conversation. One session
resumed twice remains two observation rows but one distinct harness-qualified identity.

### Process and session associations

- Check the registry's **machine/PID namespace domain before host PID lookup**. A foreign PID 2
  can coincide with host PID 2 and identical start ticks; it remains `foreign-namespace`, not
  "stale kthreadd". This CLI does not map namespace-local PIDs into the host namespace.
- Bracket reads with process observations. PID/start ticks, boot, observer PID domain, executable
  inode, parent, harness and executable/script selector digest must agree. Otherwise report
  `process-changed`. An explicit stored birth token mismatch is `birth-mismatch`.
- Claude registry `pidDomain` + `procStart` + executable classification + compatible `startedAt`
  yields `birth-correlated`, **not proof of current display**. The registry lacks a boot ID.
  `/proc/stat` boot time has second precision; a fixed 2-second clock comparison allowance is
  disclosed in code. A larger offset stays `uncertain-start-time`; it is never tuned to counts.
  A legacy record missing domain/birth is `unconfirmed`.
- Pi broker self-report is `reported`, not process-birth proof. Its publisher has no birth token;
  stale self-reports are labelled `stale-publisher`. Unregistered/headless Pi processes remain
  process-only. Custom session roots need the explicit option; non-UUID custom IDs are not
  guessed into filenames or AK claimant identities.
- Codex open-rollout descriptors plus first `session_meta.payload.id` establish only
  `open-descriptor-associated`. **Neither writable mode nor current display is asserted.**
  Root-thread `session_id` is not substituted for thread `id`. No latest-file, cwd/time,
  filename-final-UUID or SQLite recency fallback is used.
- Reused PIDs and source changes cannot suppress an independent process-only observation.
- `boot-mismatch`, `source-changed`, `not-observed`, `harness-mismatch` and `process-only` retain
  their literal meaning. Unsupported process kinds never acquire a guessed session ID.

### Placement, transcript and task links

A niri window PID usually belongs to the terminal, not the agent. Rechecked process ancestry
provides only **containment**. One host window is `containment-only`; several are `ambiguous`.
Two sessions can share that window. Titles, list order and continuity's order-based fallback
are never placement proof. Window changes are labelled `changed`; workspace reordering drops
an unconfirmed visible index. A hidden/remote session may have no observed window.

Transcript states distinguish `filename-candidate` (Claude), `header-id-matched`,
`header-unconfirmed`, `ambiguous-path`, `not-found-in-scanned-roots`, `unavailable`, `file-replaced`
and `unavailable-after-capture`. `changed:true` preserves file growth/replacement observations.
No state claims transcript completeness, preservation or recoverability. The index scans only
one directory level under the selected roots, caps examined entries at 100000 and reports
partial/truncated sources. Claude registry reads cap files at 4096 and metadata at 256 KiB.

AK joins preserve `session-UUID`, `claude-session-UUID` and `codex-session-UUID` independently.
Unknown prefixes are `unsupported-claimant`, never normalized to Pi. `exact-claimant` means
**identity equality to an observed AK row**, not that a candidate process owns custody or shows
that task. Expired/invalid leases, ambiguous session observations and absent identities are
explicit. No repo/cwd fallback binds claims. Recheck current AK before acting.

The legacy panel parser and discovery behavior are **unchanged**. In particular, enabling new
active panel chips on top of its Codex cwd/time heuristic would be unsafe. The manifest's
stronger observation contract is separate from panel telemetry and broker-only `snapshot`.

### Unsupported owner surfaces

AngelX saved-session filenames can carry a historical PID; installed-owner inspection found no
qualified current-session presence producer. AGNT stores conversations separately from its
frontend `activeConversationId`; no process-birth publisher was verified. OMP source has terminal
breadcrumbs and daemon client IDs, not a qualified live conversation association. These adapters
therefore expose unsupported capabilities, not guessed UUIDs or command-line prompt replay.
See AK7378's private evidence report for the date-bound installation inspection; these static
capability records are not proof that an executable is currently installed or absent.

AK6737 retains authoritative cross-harness custody. AK6481 retains native reopen. This schema
introduces no AK state, ontology authority, archival seal or reopen authorization.

## Verification and rollback

```bash
node --test tests/recovery-*.test.mjs
npm run check
```

Fixtures are synthetic and include namespace/PID collision, PID reuse and birth mismatch,
classification changes, ambiguous/shared windows, live observation changes, expired claims,
cross-harness UUID collisions, unsupported prefixes, missing transcripts and redaction sentinels.
Native proof must additionally exercise the exact CLI, full AK query and read-only boundaries;
a passing pure test or broker snapshot is not that proof.

The CLI creates no persistent runtime state. Rollback is ceasing to invoke the candidate; if
landed, revert its source commit in a linked worktree and use the canonical landing procedure.
Do not reset the live checkout, delete sessions or transfer task claims as rollback.
