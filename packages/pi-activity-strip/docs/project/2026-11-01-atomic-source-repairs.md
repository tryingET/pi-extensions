---
summary: "AK7894: exact neutral-source authorization revocation, including pid-less presence windows, and hotkey discovery checked against niri's own config parser, with executable Given/When/Then RED/GREEN evidence and explicit native/live limits."
read_when:
  - "Changing neutral presence-app keyboard/jump authorization or hotkey discovery."
  - "Reconciling AK7894 source qualification with the separate AK7417 native HOLD."
system4d:
  container: "Activity-strip Node controller and read-only Niri shortcut hints."
  compass: "Preserve presence-app interaction without stale source authorization or invented shortcuts."
  engine: "Production-path Given/When/Then failures, minimal repairs, a niri-validated fixture oracle, package checks and independent inspection."
  fog: "A package test pass does not prove real GTK capture, startup, rollback or live adoption."
---

# AK7894 — atomic source repairs

> **SECURITY CORRECTION (Nov1, AK7675/938 and evidence17758/17767/17797,
> resource-owner confirmation18578):** Node22.23.3 is security-retired. The raw
> RED/GREEN/package results below were obtained before this pass reconciled that
> superseding authority. They remain historical observations, **not current
> security-qualified gate proof**. No further use/restoration is permitted. The
> unchanged repository pin is stale; the unadopted22.23.4 candidate must not be
> silently substituted. Full-root, landing and live qualification are unavailable
> until the toolchain/security owner resolves AK7675 and fresh admitted checks run.
> Candidate7b914dc6 is source-inspected, not delivered or currently qualified.

## Subject and authority

The operator requested an atomic-completion pass with Gherkin-style red–green TDD
on the remaining defects after changes in other sessions. Reconstruction uses
`81304a4595c7b32058337448f07835fe9d4ecaf2`, including the newer presence/engagement
contract in [the Oct31 record](2026-10-31-strip-presence-hover-hints.md).
AK7894 owns this bounded isolated JS/test/doc repair. It does not supersede
AK7417/878, AK7640/901 or AK7669's source-only prototype restrictions.

A successor inspection of candidate `7b914dc6` (same day, AK evidence 18620) found
three further defects, now repaired on top of it: pid-less presence windows lost
the strip, and the hotkey parser both advertised chords for configs niri refuses
to load and dropped the hint for valid ones. The successor subject is likewise not
delivered or currently qualified.

## Resolved mechanisms

### Retained neutral source

A presence app can authorize entry without owning a card. During the panel's NULL
focus, full projection retained only its window ID; it did not revoke authorization
when fallback observations moved that source to another workspace, changed its
application/process or lost it entirely. A delayed jump could consequently accept
facts that no longer described the original source.

`panel-neutral-source.mjs` now copies exact source PID/app/workspace facts at
admission. Projection, keyboard requests and jump acceptance recheck the source.
Neutral context identity includes the pinned PID and app, so a replacement cannot
inherit the earlier epoch. Fresh jump windows must also contain the original
source workspace. Title changes do not revoke a valid source, and an accepted
jump still survives its own keyboard release.

Niri reports `pid: null` when it does not know a client's process. The candidate
required an integer PID, so such a presence window lost the strip and the hotkey
(focus `unknown` is never eligible). The PID is now pinned exactly as observed, an
integer or `null`; window IDs are never reused, a PID that later differs still
revokes the source, and a malformed value still fails closed.

The source is not a fabricated card or publisher. Existing agent ownership,
ambiguous-presence admission, token/epoch guards and exact target rules remain.

### Shortcut discovery

The old line regex scanned bindings inside nested block comments, disabled
subtrees, raw strings and unrelated nodes. `strip-hotkey-kdl.mjs` instead reads
active direct `binds` children and an actual matching `spawn` action. Strings
are not executable structure; comments and `/-` exclusions remain inactive.

Independent inspections of the candidate found and drove real RED/GREEN fixes for
adjacent comments, missing argument/node separators and reserved bare-token
characters. Its subset was still more lenient than niri: it accepted grammar that
niri 26.04 rejects, so it advertised chords for configs niri refuses to load, and
its JSON string decoding rejected valid KDL strings anywhere in the file. Discovery
now accepts only KDL v1 grammar that niri itself accepts:

- a node ends at a newline, `;` or the end of input; `}` is not a terminator, and
  an empty `;` is an error;
- entries need whitespace, a block comment or a line continuation between them,
  and `/-` may be glued only to a children block;
- arguments and property values are strings, numbers, `true`, `false` or `null`,
  never bare identifiers; a property has no spaces around `=`;
- strings take exactly KDL v1's escapes (`\u{41}`, not the JSON-style
  `\u0041`), and literal tabs and newlines are content;
- raw strings are values and property keys but never node names; KDL v2 forms
  such as `#"…"#` and `#false` are rejected;
- `!` may only start a bare word (after an optional sign), and a byte-order mark
  directly after an identifier is refused, as niri joins it to that identifier.

A grammar error anywhere yields no hint, as niri loads nothing from that file.
That holds as far as the evidence below reaches (a fixture oracle, a sweep of
every character in fourteen positions and mutation fuzz, all against
`niri validate`); it is not a proof that the two grammars are equal. Every fixture
in `tests/strip-hotkey.test.mjs` records niri's own verdict on its exact text,
and a fixture that expects a chord must be one niri loads.

Where unsure, discovery refuses: a few forms niri accepts give no hint, namely
exponents without a leading digit (`1e`, `1e_3`), C1 control characters in a bare
word, a byte-order mark directly after a number or keyword (whitespace to niri),
and type annotations.

This is not a niri schema checker. A config that parses but that niri rejects for
its content (duplicate chords, unknown keys or actions, two actions in one bind,
two `binds` sections) can still produce the hint. Discovery does not evaluate
`include` files, `spawn-sh` shell strings or wrappers; those produce no hint, and
`PI_ACTIVITY_STRIP_HOTKEY` remains the explicit override. Discovery never runs
configuration commands or changes compositor state.

## Executable scenarios and observed proof

The package's ordinary `node:test` runner executes Given/When/Then scenarios in
`tests/presence-focus.test.mjs` and `tests/strip-hotkey.test.mjs`:

- Given a neutral grant, when the source disappears, relocates, changes PID or
  loses/changes presence-app identity, then NULL continuation cannot retain it.
- Given an already accepted hover/explicit jump paused at IPC, when those source
  facts change, then no window is focused. Title-only changes plus the action's
  own keyboard release still permit the exact target.
- Given commented, disabled, descriptive or string-contained command lookalikes,
  when discovering the hotkey, then only the actual active shortcut is advertised.
- Given adjacent comments, malformed entry boundaries or reserved bare characters,
  then discovery returns the correct chord or fails closed as appropriate.
- Given a presence window whose PID niri does not report, when it is the source
  across panel NULL focus, then the strip, keyboard and its exact jump stay until a
  differing PID revokes it.
- Given each fixture of the niri-annotated table, when discovering the hotkey, then
  a chord comes only from text niri loads: valid escapes, tabs, newlines, line
  continuations and every KDL line ending keep the hint, and each niri-rejected
  form yields none.

### Candidate `7b914dc6` (historical, retired runtime)

Exact final test files were replayed against archived **unchanged baseline
production files**, then against the repair, using Node **22.23.3**:

| Check | Observed result |
|---|---|
| Baseline production + final focused scenarios | 53 tests: 37 pass, **16 behavior failures**, exit1 |
| Repaired production + same scenarios | **53/53 pass**, exit0 |
| Declared package `npm run check`, npm12.0.2 | **864/864 tests**, lint/typecheck/file budgets and quick packaging pass |
| Independent inspection | Accepted bounded JS/test scope; 53 focused and 10 extra parser controls pass |

The earlier development RED used Node22.23.4; it is not substituted for the final
exact-pinned replay. Node22.23.3 was prepared privately from the official archive,
checked against its official SHA256 list, before its retirement was reconciled.
That checksum establishes bytes, **not safety or permission**. Existing pins and
global runtimes were not changed; the newly created private execution alias is
disabled and the original artifact/evidence retained without further execution.
Package dependencies were prepared with its exact lock in the isolated worktree,
not borrowed from the live checkout.

The normal quick package release check intentionally skips live Pi smoke and
accepts the registry's existing-version response to `publish --dry-run`; it did
not publish anything. Full root verification and canonical landing are separate
steps and must bind their own exact subject and receipts.

### Successor repairs (development observations, not qualification)

These ran on the system Node **26.13.0** (Arch `nodejs`, inside the package's
`engines` range), which is neither the pinned gate runtime nor a substitute for
it. They are development observations only. No dependency was installed: the
package suite needs none, and the locked Biome 2.4.4 binary of an existing
install was run read-only for the format and lint check.

| Check | Observed result |
|---|---|
| Final scenarios against unchanged `7b914dc6` production | 119 tests: 87 pass, **32 behavior failures**, all assertion failures |
| Repaired production + same scenarios | **119/119 pass** |
| Whole package suite, `7b914dc6` vs repair | 864/864 vs **930/930** |
| Fixture oracle against `niri validate -c` (niri 26.04) | **85/85** annotations agree |
| Seeded mutation fuzz, the same 4500 configs | grammar-level false hints 155 vs **0**; true hints 359 vs 413 |
| Noisy structural fuzz, 15000 configs | grammar-level false hints **0** |
| Every character up to U+3100 plus specials, 14 positions, 175798 configs | grammar-level false hints 4 before the last fix, **0** after |
| Operator's real niri config | `Super+Shift+A` before and after |
| Locked Biome check; file-budget ratchet (`--fail`) | clean; ok |

Two findings came from this verification rather than the first inspection: the
fuzz found that niri refuses raw-string node names, and a fresh-context
adversarial inspection found the `!` and byte-order-mark rules, two tests that
passed for the wrong reason and an untested malformed-PID claim. Each was
reproduced RED first and then repaired; its re-inspection confirmed the repairs
and two added fixtures now kill the mutants it found surviving. It found no defect
in the neutral-source change. In the fuzz and sweep, every hint given for a config niri
rejects comes from a schema error, which is out of scope. Each of the 229 hints
the structural fuzz lost is one of the refusals listed above or a config with no
active `binds` section; the mutation-fuzz losses were sampled, not all classified,
and the sample were configs whose bind no longer runs `focus-strip`.

`niri validate` only parses a file; it does not contact the running compositor.
The package gate, commit hooks, full root verification and landing still need the
safe pinned toolchain and an admitted, prepared checkout (AK7675).

## Explicit residuals and ownership

- **C0 toolchain security:** AK7675/938 must reconcile the security-retired stale
  pin and its approved-but-unadopted22.23.4 candidate. Resource review18567's C1–C3
  stage repairs cannot authorize the retired runtime;18578 supersedes that omission.
  Old root-stage commands are withdrawn, never replayed. The responsible source/
  toolchain maintainer and workstation security/provenance owner must approve a
  new exact subject and fresh safe checks. AK7894 remains incomplete meanwhile.

- **Native behavior:** AK7417/878 and AK7640/901 retain the historical rapid-entry,
  stationary-remap and backend-loss REDs. This pass neither executes the disabled
  AK7669 prototype nor claims those failures repaired. Resource owner15944
  reaffirmed the separate exact-stage admission requirement in evidence18550.
- **Native/full GUI/startup/rollback/live adoption:** require their respective
  fresh executed subject, strict oracles, resource/owner agreements and receipts.
  No install, ribbon restart, operator-desktop action or live switch occurs here.
- **Source delivery:** AK7894 remains responsible until an inspected candidate,
  full root verification and supported canonical landing have actual receipts.
  A source commit or this document alone is not delivery.
- **Other owner work:** preserve unrelated untracked diaries, retained recovery
  worktrees, lock custody and frozen publication artifacts. AK7076's npm admission
  deferral is independent; it is not silently closed by this source repair.

Local command logs, original/final source bindings and inspection dispatch
`dispatch-1793491277027` are retained under the task's private evidence directory;
the successor's RED/GREEN logs, niri oracle, probes and fuzz results sit in its own
evidence directory (AK evidence 18620 onward). AK evidence records carry the exact
custody references and final subject.
