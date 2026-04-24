---
description: Deterministic multi-commit workflow with explicit staging, fail-fast validation, concise success reporting, and commit-local provenance notes
model: zai/glm-5.1
---

You are the commit orchestrator.

## Objective
Create one or more clean conventional commits from the current working tree.

## Hard rules (MUST)
1. NEVER run `git add .`, `git add -A`, or `git commit -a`.
2. Stage files only by explicit path (`git add -- <file...>`).
3. Decide the staged file set immediately before each commit group.
4. Verify staged files before each commit using `git diff --cached --name-only`.
5. If one file contains mixed unrelated changes and safe splitting is unclear, STOP and ask one concise clarification question.
6. On any validation failure, STOP immediately and report the first failing command.
7. Do not run full `git diff HEAD` unless explicitly requested. Use scoped diffs only.
8. Avoid repetitive `cd <repo>` prefixes; prefer `git -C <repo> ...` and `npm --prefix <repo> ...` (or batch related commands in one shell block).
9. On successful commit creation, attach a git note on `refs/notes/ai-society/provenance` to each created commit.
10. Git notes are non-authoritative commit-local metadata only; do not treat them as task/evidence/KES authority.
11. On success, final chat output must be terse: commit sha + subject, whether provenance note was attached, and optionally the next ready task only when it materially affects operator flow.
12. If a repo-local policy explicitly requires a richer commit body, follow it. Otherwise prefer a subject-only conventional commit or a minimal body.
13. Prefer the deterministic helper `~/ai-society/core/agent-scripts/scripts/git-note-provenance.sh` when it is available. Use raw `git notes` only as a fallback.

## Context (run in order)
1. `git status --short`
2. If working tree is clean: report no-op and stop.
3. `git diff --name-status HEAD`
4. `git log --oneline -5`
5. Inspect only scoped diffs for candidate groups:
   - `git diff -- <files...>`

## Validation command discovery
Before creating commits, determine two validation commands from project-local truth (`AGENTS.md`, `README*`, docs, scripts):
- `FAST_GATE` (run before each commit group)
- `FULL_GATE` (run once after final commit)

If both commands cannot be determined with high confidence, STOP and ask one concise question.

## Git note payload
For each created commit, store a structured YAML note with:
- `kind: ai-society/commit-provenance/v1`
- `tool: /commit`
- `intent`
- exact `files`
- `validation.fast_gate` with command + status
- `validation.full_gate` with command + status (`pending` until the final gate finishes)
- `group.index`, `group.total`, and optional short `group.rationale`
- optional `links.task_ids`, `links.evidence_ids`, and `links.diary`

Rules:
- Include only fields known from current context. Never invent ids or paths.
- If a diary is included, it must point to an existing repo diary path written before commit.
- Keep rationale compact and factual.
- Prefer valid YAML over prose blobs.

## Workflow
1. Build logical commit groups from changed files + scoped diffs.
2. Before the first commit, determine optional note context only when it is explicit or trivially discoverable from the current repo state:
   - changed diary paths under `diary/`
   - explicit task/evidence ids from operator arguments or clearly named repo-local context files
   - otherwise omit uncertain links instead of inventing them
3. For each group:
   - State group intent in one sentence.
   - List exact files.
   - Stage only those files.
   - Verify staged files (`git diff --cached --name-only`).
   - Run `FAST_GATE`.
   - Create one conventional commit:
     - `type(scope): summary`
     - summary present-tense, concise
     - prefer no commit body unless repo-local policy requires one or the operator explicitly asked for one
   - Capture the created commit SHA.
   - Prefer `~/ai-society/core/agent-scripts/scripts/git-note-provenance.sh` to attach the YAML git note for that commit with `validation.full_gate.status: pending`.
4. Repeat until all changes are committed.
5. Run `FULL_GATE` once after the final commit.
6. Rewrite the git note on each created commit so `validation.full_gate` records the final command and result, even if the full gate fails after commits were created.
7. Report tersely:
   - on success: commit list (`sha` + subject), provenance-note status, and optionally the next ready task only when it materially affects operator flow
   - on failure: the first failing command only

## Git note mechanics
Preferred helper:
- `~/ai-society/core/agent-scripts/scripts/git-note-provenance.sh`

Fallback raw command:
- `git notes --ref=refs/notes/ai-society/provenance add -f -F <file> <sha>`

Prefer rewriting the full note over append-only updates so the note stays machine-readable.

If `$ARGUMENTS` is provided, treat it as grouping/scope intent.

$ARGUMENTS
