---
description: End-of-session closeout audit — verified-done / open / landmines / hidden, with pre-compaction reconstruction from the session JSONL via a cheap subagent
argument-hint: "[focus]"
---

# Session Closeout Audit

Produce the closeout report for THIS session. Memory is insufficient: compaction
may have dropped earlier work. Reconstruct from ground truth and from the
session JSONL (physical history includes pre-compaction content).

## Step 1 — Ground truth first (read-only, never memory)

Run and record exact outputs, trimmed:

- `git status --short` (split: tracked-dirty vs untracked-count) and
  `git log origin/<default>..HEAD --oneline | wc -l`
- `git branch --list | grep -v <default>` (stray branches)
- `ak task list --repo "$PWD"` — my tasks: state + leases + active deferrals
- For every external surface this session touched: the checkable status
  (e.g. `gh run list` for workflows touched, `gh pr list`, ruleset/API state).
  If you cannot check a surface you mutated, list it under HIDDEN as
  "unchecked mutation", never under DONE.

## Step 2 — Pre-compaction reconstruction via one cheap subagent

Dispatch ONE `dispatch_subagent` (profile: `minimal`, read-only) with an
objective of exactly this shape, filling in `$REPO` and `$HOURS`:

> Read-only session-forensics digest. Load and obey
> `/home/tryinget/.pi/agent/skills/pi-session-jsonl/SKILL.md` (jq-only parsing,
> metadata-first, no tool payloads, never print image data).
> 1. Resolve the newest session JSONL under `~/.pi/agent/sessions/` whose
>    header cwd is `$REPO`, modified within the last $HOURS hours. Run
>    `scripts/session-audit.sh inventory <file>` first; if not `complete`,
>    say so and prohibit exhaustive claims.
> 2. Emit ONLY this markdown digest — no transcripts, no payloads:
>    - **session**: path, entry count, integrity verdict
>    - **tools**: per tool name: call count + distinct target paths
>    - **mutations**: every edit/write/bash/gh/git/ak call classified
>      (repo-edit / external-api / authority-record) with a one-line purpose
>    - **claimed-but-checkable**: assistant assertions of
>      done/verified/passed/green, each marked
>      supported / unsupported-in-this-view
>    - **pre-compaction**: compaction boundary count; classes of content in
>      physical history but absent from the effective context projection
> 3. Use calibrated negatives and attribute each finding to its view
>    (physical / active / context).

Merge the digest into the report. If the subagent cannot resolve the session
file, say so explicitly and fall back to in-context memory, labeled as such.

## Step 3 — The report (exact structure)

```
## DONE (verified, not assumed)
| item | proof (commit sha / run id / AK evidence id / URL) |
Every DONE row needs a checkable reference. No reference → OPEN.

## OPEN — live tests / pending on external schedule
What must happen later, and where the rollback/verification lives.

## LANDMINES — pre-existing or surfaced debt
Each with: cause, blast radius, and binding (AK task id / evidence id).
Bind only findings arising from THIS session's work; observe-but-don't-bind
pre-existing operator state (their untracked files, their open PRs) and mark
them "yours, untouched".

## HIDDEN — decisions and caveats worth restating
Bypasses used (--no-verify, --force), wider-than-ideal grants, tools that
failed mid-session, things taken on operator's word without verification.
```

## Rules

- Follow the `atomic-completion` Prompt Vault contract (text_ok): findings are
  resolved, deferred with a full contract, or hard-blocked — never abandoned.
  Deferred items must be bound into AK in the same pass.
- Observed vs inferred: label which. Calibrated negatives only
  ("not observed in this view", never "never existed").
- If a session with no work is closed out, say "nothing to close out" —
  do not manufacture findings or bind AK records for operator pre-state.
