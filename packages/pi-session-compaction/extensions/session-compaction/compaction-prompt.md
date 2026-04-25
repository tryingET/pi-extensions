# What to include

This summary must be self-contained. Assume little or no recent conversation will remain verbatim after compaction, especially when `keepRecentTokens` is low or `0`.

Use these section headings exactly. Omit a section only if it is truly empty. Prefer concise bullets under each heading.

## Self-contained continuation snapshot
- Current repo/cwd
- Current objective
- Latest explicit user request
- Current implementation state
- Current dirty/worktree state
- Current blocker or risk

## Compaction boundary
- What older context this summary replaces
- What, if anything, is expected to remain verbatim
- Whether this was a split-turn compaction

## Next action
1. Recommended next action
2. Why this action fits the current state
3. First validation step
4. Follow-up or rollback step

## Constraints and preferences
- User-stated constraints
- Operator preferences
- Scope boundaries
- Things not to touch

## Work performed
- Completed changes
- In-progress changes
- Files changed and why
- Files read only if important

## Decisions and rejected paths
- Decisions made
- Failed/rejected approaches
- Do not repeat

## Evidence and verification
- Commands/tests/checks run
- Observed results
- Unverified claims
- Inferences vs facts

## Open issues and uncertainties
- Known unknowns
- Questions for the operator
- Risks for the next turn

## Mandatory reading
- exact/file/path.ts
- docs/exact-doc.md

## Essential user prompts / commands + arguments used
- Preserve all essential user prompts, not only the original request.
- Preserve user prompts that changed goals, constraints, corrections, preferences, decisions, or scope.
- Preserve slash commands and their arguments.
- Preserve `/compact ...` custom instructions.
- Preserve prompts in chronological order when possible.
- Do not preserve low-value acknowledgements or purely conversational filler.

# Style
- This is a continuation checkpoint, not a narrative recap.
- Make the summary self-contained enough to continue with `keepRecentTokens=0`.
- Preserve exact file paths, commands, errors, symbols, task ids, and user instructions when useful.
- Do not claim completion without observed evidence.
- Do not reproduce secrets, tokens, credentials, private keys, or auth material.
- Do not duplicate the full files-touched manifest; summarize meaning, then rely on the appended managed block.
- Output only markdown for the summary.
