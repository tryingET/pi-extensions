---
summary: "Many-of-the-greats analysis, critical inspection and bounded self action-intent safety scope for AK7460."
read_when:
  - "Inspecting why self action routing uses a bounded command grammar."
  - "Distinguishing the AK7460 repair from remaining self observation and memory work."
---

# Self action-intent safety inspection — 2026-10-23

This is an implementation rationale and verification guide, not canonical task,
decision, permission or completion authority. AK7460 owns the bounded first slice.

## Question

How can self become useful enough to use at decision boundaries without turning
an unreliable mirror into an autonomous controller?

## Mode 1 — many of the greats

| School | Central claim and premises | Strongest case; what others miss |
| --- | --- | --- |
| Evidence discipline / formal methods | Attempts, observed success and proven effects must remain distinct. | A useful-looking false success can corrupt every downstream decision. |
| Cybernetics | Feedback matters when it changes the next action. | A passive mirror can accurately describe a loop while failing to interrupt it. |
| Situated cognition | Progress is relative to the task and receiver. | Read-only investigation can succeed without any file mutation. |
| Human factors | Reflection needs recognizable invocation points and low interaction cost. | A large capability catalogue does not create a reliable habit. |
| Experimental science | Utility requires external outcome evidence. | Call counts and self-reported helpfulness cannot demonstrate fewer mistakes. |
| Minimalist systems design | Observation and execution need explicit boundaries. | Another implicit task manager increases ambiguity and duplicates owner surfaces. |

## Mode 2 — confrontation

Cybernetics demands stronger intervention; evidence discipline refuses to grant it
to a mirror that can misclassify failed edits and unrelated checks. Both demands
cannot govern the same intervention simultaneously. In the current system,
observation integrity dominates: stronger intervention would amplify bad signals.

Situated cognition rejects file activity as universal progress; cheap counter-based
monitoring depends on exactly that reduction. Counting reads instead does not
resolve the disagreement: activity still does not establish task success.

Human factors favors easy invocation, while evidence discipline requires explicit
action intent. The acceptable compromise is not fuzzy authorization: observation
may be easy, but state-changing commands must have a bounded, inspectable grammar.

## Mode 3 — contextual dominance

Evidence discipline and minimalism govern implementation; human factors governs
invocation guidance; outcome evidence governs any later adoption of stronger
automation. Do not add a proactive controller or optimize call frequency.

## Critical inspection changed the first slice

The independent inspection reproduced not just checkpoint-question collisions,
but a negated continuation requesting a follow-up. It recommended action-intent
safety as the smallest first repair, before broader observation changes.

The first patch passed 326 self tests, yet independent inspection found additional
bypasses: prefill-like prose, question/refusal suffixes, a normalized separator
that disagreed with raw payload extraction, and broken read-only query aliases.
Those findings required stronger grammar boundaries and regression cases.

A subsequent adversarial fixture supplied both an existing continuation and file
activity. It exposed rejected prefill questions falling into handoff-summary
candidate persistence. The repair therefore blocks that fallback too.

## Implemented scope

- Unknown action requests do not default to checkpoint creation.
- Action recognition is anchored to supported command forms.
- Explicit command heads own their payloads; incidental payload keywords do not
  select a different action.
- Unsupported action-like requests cannot fall through to stateful handoff logic.
- Supported ASCII separators agree with raw payload extraction; unsupported
  compatibility separators are rejected.
- Explicit read-only action-state queries retain question-mark aliases.
- Existing draft protection, prefill send suppression, continuation policy and
  candidate ownership checks remain in force.
- Tool guidance recommends checks at decision boundaries, not on a schedule.

This is a bounded command grammar, not arbitrary English authorization parsing.
Use colon syntax for arbitrary payloads. A quoted or colon payload is data;
questions and negations inside it are not nested directives.

## Verification surfaces

- `tests/self/action-intent-safety.test.mjs`: rejected requests, positive aliases,
  directive payload ownership, action-state data, complete notification payload,
  persisted-memory byte stability, preserved drafts, no sends, and candidate
  preservation followed by a valid explicit continuation.
- `tests/self/*.test.mjs`: existing self behavior and delivery contracts.
- `npm run check`: package-declared verification contract.
- Fresh Pi process exercising the actual extension: live non-TUI evidence;
  mocked TUI draft tests do not establish compositor/TUI behavior.
- The action-family collision matrix additionally exercises rejected route/diagnostic
  aliases against handoff, feedback and crystallization payload keywords, preserving
  persisted-memory bytes and both empty and occupied drafts.

Passing routing tests do not prove spontaneous adoption or improved decisions.

### Initial handoff verification and landing posture (historical)

The following records the first handoff, not continuing verification or landing authority.

- The package's full `npm run check` passed, including its declared build,
  lint/typecheck, test, packaging and packed-runtime checks.
- Root `scripts/ci/smoke.sh` passed.
- An independent tester approved the three final repaired boundaries after 92
  selected pure tests and 65 additional in-memory probes.
- A fresh isolated Pi process loaded this candidate extension and executed nine
  actual self calls: question/refusal/unsupported-separator requests selected no
  action, a saved continuation remained, and an explicit checkpoint command
  created exactly one checkpoint.
- Full repository `just ci` was attempted and stopped at install admission:
  other packages in the isolated worktree have no installed dependency metadata.
  This is not a passing repository-wide gate. No fleet installation repair or
  validation bypass was performed.
- The patch remains a linked-worktree candidate. Canonical landing, live package
  installation and verification of the canonical installation are not established.
  AK7466 removes only the now-obsolete action.ts file-budget exception.

The fresh-process evidence is non-TUI. Integration fixtures check both empty and
occupied editor drafts; this does not establish real compositor/TUI behavior.


### Continuation inspection and repair

The successor rebased the same patch onto `1ad259d8e`, producing `f2338b059`.
Ordinary isolated provisioning admitted all 39 install roots and the full repository
`just ci` passed through the heavy-job runner. No caller skip flags were supplied;
repo-declared optional/live-test skips remain. This superseded the initial install
blocker, but did not establish canonical activation.

A fresh independent inspection then reproduced an in-scope bypass: a rejected
`launch autoresearch campaign` directive with `controller handoff summary` in its
payload replaced a saved continuation after file activity. Landing was held despite
the passing suite. New regressions reproduced persisted-memory changes before repair.

The rejection envelope now covers the route and diagnostic action families as well,
and runs before feedback/diagnostic keyword fallback. Refusal typography normalization
is rejection-only; it does not widen accepted command syntax. Explicit storage and
protection command heads retain ownership of their payloads. Handoff rejection is
anchored too, so explicit feedback and diagnostic queries can still discuss handoff
prompts. The repaired self suite passed 387 tests, including the cross-family collision
matrix and positive meta-payload regressions. The earlier full-CI
pass is not proof for this amended source; fresh repository verification and live
activation remain separate prerequisites.

## Remaining work

- AK7463 — observation integrity: finalized effects, activity versus progress, scoped failure
  recovery, observation horizon and downstream advice.
- AK7464 — memory lifecycle: implicit persistence by supported handoff-summary queries,
  multiwriter durability and branch/reload reconstruction.
- AK7465 — truthful direction/trap capability wording and owner-routed utility evaluation.

No source-owner promotion, release, publication, task completion or independent
operator closeout is authorized by this document.
