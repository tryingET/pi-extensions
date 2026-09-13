---
summary: "Use and limits of the operator-reviewed, exact-session closeout receipt gate."
read_when:
  - "Closing a session with AK-bound findings or debugging a refused closeout receipt."
type: reference
system4d:
  container: "Exact-session, operator-reviewed declared obligations."
  compass: "No self-certified safe verdict or disappearing findings."
  engine: "Append, freeze, resolve, read back, independently review, seal."
  fog: "AK records and local receipts do not prove arbitrary semantic claims or process custody."
---

# Session closeout gate

After local package install and `/reload`, run **`/session-closeout`**.
It opens this host session's gate and sends the global Prompt Vault `close-session`
export only when its bytes match the v2 export receipt, prefixed with the exact
host-bound `closeoutId` / `sessionId` / `sessionFile` / `repo` / `boundary`.
Do not `setActiveTools` in that command: `session_closeout` is always-active when
registered so the model can call add/freeze/bind/check/seal without breaking the
prompt-cache tool prefix. `/close-session` remains Vault-owned procedure text;
the runtime does not shadow that template name.

The executor inventories and resolves work. It cannot pass a `verdict`, delete a
finding, weaken acceptance criteria, or approve its own report. You independently
review two checkpoints: inventory freeze and final seal. Each uses a scrollable
editor: submit the text **unchanged** to proceed, then type the displayed
`approve <digest>` token. Escape, editing review text, or another answer declines.
No default Yes. **Print/JSON/RPC cannot approve**. This is deliberately an
operator-reviewed v1, not an autonomous semantic reviewer.

## Runtime interface

`session_closeout` actions (call serially; seal must be alone):

| Action | Parameters / effect |
| --- | --- |
| `open` | Host supplies exact session ID/file, repository and current branch boundary. Idempotent; never searches newest JSONL. |
| `status` | Inventory, bindings and historical receipt. Not a fresh safe verdict. |
| `add` | `title`, `acceptance`, optional exact registered `repo`, `kind: work\|retained`. Assigns stable `O1`, `O2`, etc. No deletion/update operation. |
| `freeze` | Operator reviews inventory. Further additions invalidate freeze and receipt; existing items remain immutable. |
| `bind` | Frozen `id`, `disposition: resolved\|deferred\|retained`, `taskId`, `evidenceId` for resolved, and `rationale`. Binding revisions remain in journal. |
| `check` | Fresh AK/Git readbacks, refusal reasons and digest. Always says BLOCKED until separate operator seal. |
| `seal` | Rechecks facts, requests independent operator review, rechecks again, and only then records the receipt. |

`/session-closeout status`, `/session-closeout check`, and `/session-closeout seal`
are operator shortcuts. They do not terminate Pi. No automatic commit, push,
credential change, AK lifecycle write, cancellation, or process cleanup occurs.

## Evidence contract

`check` exposes owner-calculated `gitSnapshots` and `acceptanceBindings` even
when observations are unbound or invalid. Use those exact binding values only
after performing the required proof; do not invent hashes to satisfy the gate.

Work requires an exact AK task in the obligation's registered owning repository.
If none exists, create one with scoped `ak task create`, then claim, record evidence,
and complete it. Missing task IDs are not a reason to leave work unbound. Do not
create tasks for retained items or an empty inventory.
A resolved item requires task `done` and an exact task-bound passing evidence row.

- Code evidence: `details.commit` (also `commit_sha` or `head_sha`) must equal current
  repository HEAD. Dirty inputs additionally require `details.closeout_git_digest`
  equal to the Git digest shown by `check`. A historical pass at another HEAD is
  deliberately insufficient; obtain fresh owner proof, do not copy a hash onto
  an unperformed check.
- Non-code evidence: `details.closeout` contains `obligation_id`,
  `acceptance_sha256` (SHA-256 of JSON encoding of the exact acceptance string),
  and `git_digest`. These are binding fields, **not proof generators**.
- The whole evidence collection is hashed, and its result index is displayed.
  Added/changed/contradictory evidence invalidates approval. The operator must
  adjudicate competing rows; the gate does not silently discard failed evidence.

This gate validates owner records and freshness, not the truth of arbitrary prose.
For hosted CI, publication, credentials, or runtime claims, independently inspect
actual external outcomes before accepting the seal; generic passing AK rows are
not a substitute. There is no built-in GitHub poller in v1.

## Deferrals

Deferred is **INCOMPLETE work**, never done. The exact task must be pending, without
claim/lease, and have an active first-class AK deferral. Prose-only deferrals refuse
certification. Its `trigger_json.closeout` must contain:

```json
{
  "schema": "pi.closeout-handoff.v1",
  "owner": "accountable owner",
  "blocker": "demonstrated reason execution cannot proceed",
  "trigger": "observable unblock event",
  "next_action": "exact next legal action",
  "rationale": "why deferral is necessary",
  "blast_radius": "consequence of neglect",
  "acceptance": "exact unchanged obligation acceptance string",
  "deadline": "2099-01-02T00:00:00Z",
  "evidence_ids": [123]
}
```

Use actual future dates and existing evidence IDs from that same task. AK
`review_at` must be future and no later than the handoff deadline. Expiration
is checked after reads and again before receipt issuance. The operator explicitly
accepts the handoff and outstanding responsibility; naming someone in JSON is
**not** their acceptance, and task creation is not scheduling.

## Persistence and refusal model

The append-only gate journal is stored as `pi.session-closeout.v1` custom entries
in the exact Pi session file. This is a local control/receipt surface, **not AK
obligation authority**. AK retains tasks/evidence/deferrals. Closing Pi preserves
the journal; deleting the session does not. Keep required continuation evidence in
AK and durable owning artifacts, not only in this journal.

Reload resumes the same inventory. A fork cannot borrow its parent's approval or
inventory: inherited obligations remain the parent's responsibility. A child must
explicitly declare any work it assumes; the gate never silently transfers custody.
Tree navigation that abandons any own journal entry refuses use until the original
branch is restored. Adding a finding is allowed, removing or weakening one is not.
Keep acceptance concrete and correct before operator freeze. V1 has no retirement
or split transition; corrections requiring removal need explicit owner intervention,
not a new empty closeout on the same session.

Limits are checked before inventory persistence: 30 items, 12KB total inventory,
8KB bindings, 40KB model output, 96KB untruncated review. Large evidence may refuse
review; choose concise canonical evidence instead of truncating critical facts.
Git snapshots include HEAD, status, cached/worktree binary diffs and untracked
file hashes; two content captures must agree. They are reread after AK readbacks
and after review. Untracked limits: 1000 files, 2MiB each, 20MiB total. Dirty
submodules/gitlinks fail closed pending their own owner reconciliation. Never
clean operator WIP just to satisfy this gate.

Pending messages, unsettled calls since the initial boundary, concurrently running
tools, branch/session changes, corrupt journals, unavailable/malformed AK responses,
and stale proof block sealing. New tool work or inputs invalidate prior evaluation.
Status calls do not revive a receipt. Cross-source observation is not an atomic
transaction: the receipt certifies checked observations at issuance, not a perpetual
lock against changes by other sessions afterward.

## Honest result

```text
WORK: COMPLETE | INCOMPLETE
SESSION: SAFE_TO_CLOSE | BLOCKED
reviewer: operator-confirmation
coverage: operator-reviewed declared obligations; not exhaustive process discovery
```

Operator review must cover omitted history, semantic acceptance, actual external
outcomes, and resource custody. V1 does not automatically discover every ASC job,
prove process quiescence, prevent Ctrl+C, or defend against arbitrary same-user
code rewriting files/session history. The executing model cannot self-certify
through the normal tool API. Do not represent that as a hostile-code sandbox.

## Verification

```bash
node --test tests/session-closeout*.test.mjs
npm run check
pi install /absolute/path/to/pi-extensions/packages/pi-little-helpers
# Then /reload in the operator session.
# Opt-in: real TUI test in a NEW external artifact directory (requires Pi auth, uv, jq).
node tests/session-closeout-live.mjs "${TMPDIR:?set TMPDIR to your scratch root}/closeout-canary-$(date +%s)" --installed
```

Tests cover exact identity, fork/reload/branch refusal, disappearing obligations,
forged verdicts, headless/RPC approval refusal, typed operator decisions, added
contradictory evidence, same-status content races, expired deferrals, stale hashes,
aggregate budgets, and concurrent tool/message barriers. Live proof must separately
exercise real Pi registration and TUI review; mocked confirmation is not that proof.

The live canary simulates typed operator input for an explicitly empty scratch
inventory. It exercises installed command/tool registration, activation, freeze,
seal, and reload readback; jq corroborates the host-bound journal. It does **not**
accept real work or prove live AK resolved/deferral behavior. Those branches have
fixture coverage; a separate real AK read-only probe verifies registered-repo,
task and evidence envelope compatibility and refusal of a still-claimed task.
Use `/session-closeout` to start normally. `session_closeout` stays in the
toolbox always-active set when `pi-little-helpers` is registered; the command
must not hotload it.
