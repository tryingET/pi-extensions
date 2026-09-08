---
summary: "AK #5538: operator-reviewed closeout gate, verified TUI/reload, and explicit proof limits."
read_when:
  - "Auditing delivery or limitations of the session closeout v1 gate."
type: diary
---

# Session closeout v1 — AK #5538

Delivered `/session-closeout` and `session_closeout` in `pi-little-helpers`.
The command activates the tool and validates the existing global Prompt Vault
export receipt before sending the procedure. Removed the duplicate repo-local
`close-session` prompt; Prompt Vault remains procedure owner (#5501, another peer).
No credential/provisioning work (#5502) belongs to this slice.

The model proposes immutable obligations and AK bindings, not a safe verdict.
Inventory freeze and final seal require separate unchanged-text review and an
exact typed token in the real operator TUI. Readbacks bind exact host identity,
active journal branch, Git content, task/evidence collections and deferral deadlines.
New findings invalidate approval. WORK and SESSION verdicts remain separate.
See [the contract](../packages/pi-little-helpers/docs/project/session-closeout.md).

## Verified evidence

Local artifacts: `~/.local/state/pi-quests/evidence/session-closeout-5538/`.

- `package-check-final.log`: package `npm run check`, including 470 passing tests.
  The declared release check skips Pi smoke, tolerates the existing-version npm
  dry-run guard, and is not evidence of publication or a whole-monorepo gate.
- 19 targeted closeout regressions pass. Independent review
  `dispatch-1788827166883` returned GO after its test-isolation finding was fixed.
- `live-tui-005755/`: isolated real Pi TUI freeze/seal plus `/reload` and fresh
  `/session-closeout check`. Session `01a07e85-8abc-79e7-99e0-331bb4504ddb`,
  receipt `1152058e-5f13-4a64-b354-24d56509b11b`.
- `installed-tui-013202/`: same real TUI sequence through default installed fleet,
  not a forced source extension. `registration.json` identifies command/tool
  source as the user-installed package and `close-session` as the global prompt.
  The test's jq assertion checks exact host-bound journal/receipt and readback.
  `historicalReceiptMatches: true` accompanies `SESSION: BLOCKED`, correctly not
  a renewed safe verdict.
- `ak-readback-probe.json`: real registered-repo, task and evidence reads for
  claimed #5538; resolution correctly refused because the task was not done.
- Package reinstalled from its local directory; current operator session still
  needs `/reload` before invoking the new command.

The TUI driver simulates an operator for an explicitly empty disposable inventory.
It does not certify any real work, establish exhaustive discovery, prove external
outcomes or exercise positive live AK resolved/deferral disposition. Those AK
branches are fixture-tested; do not inflate this canary into semantic acceptance.

At 01:30Z another peer reported an accidental interrupted Prompt Vault export
removed the global receipt. The installed canary uses the status activation path,
not the normal open-to-Vault handoff. Its pass does not establish current global
receipt availability. #5501/export owners must recover and verify that projection;
normal `/session-closeout` deliberately refuses procedure delivery without it.
Do not represent the runtime proof as recovery of that independent incident.

**01:37Z follow-up:** the export owner restored the byte-exact receipt
`112630c6e4b1c1b78d44de14e832409f5c17edac75221df5f99a1009834fbb8b`.
The fresh default-installed normal `/session-closeout` entrypoint then passed:
`entrypoint-013728/result.json`, session `01a07ea9-bf73-7173-8f3d-4063a7343e8a`.
It created the exact host-bound journal and delivered the receipt-matching global
prompt via the real extension input path. A test observer stopped the procedure
at delivery, before model execution: this proves entrypoint wiring, not a full
real-work audit. Receipt and prompt hashes were stable across the run. AK evidence
**8567** supersedes the missing-receipt caveat in runtime evidence **8565** and the
historical #5538 completion result. No global export freshness claim is made.

## Failures resolved and limits retained

- Initial live driver issued reload before the final assistant response settled.
- Next driver waited for a session-start notification erased by Pi's reload screen
  reconstruction, although reload succeeded. Wait for settled state and built-in
  reload completion instead.
- Initial installed-fleet run had the tool registered but inactive. Exercise the
  command activation path. The driver now fails immediately if the agent settles
  without the expected review UI rather than waiting out the agent deadman.
- Reviewer found ambient `GIT_INDEX_FILE` could redirect test mutations. All
  closeout test Git mutations now use a sanitized helper; outside-index sentinel
  and rejecting-hook regressions pass.
- Prior review fixes cover contradictory-evidence digest drift, late-await branch
  races, same-status content races, post-read deadline expiry and review budgets.

No commits, pushes, AK task completion, process cancellation or credential changes
are performed by the gate. Declared-scope human review is not automated custody
discovery, an exit lock, or a sandbox against arbitrary same-user code. Unrelated
worktree changes and other peers' package manifest additions were left untouched.
