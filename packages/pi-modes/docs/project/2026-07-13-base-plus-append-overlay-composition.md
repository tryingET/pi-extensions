---
summary: "Design packet for composing one base prompt mode with an ordered set of append-mode overlays."
read_when:
  - "Implementing multi-mode selection or changing pi-modes session state and composition."
  - "Reviewing append overlays, replace_final exclusivity, or startup compatibility."
system4d:
  container: "Package-owned direction-to-execution design for pi-modes composition."
  compass: "Add useful prompt layering without changing execution or mutation authority."
  engine: "Discover -> select one base and ordered overlays -> validate -> compose -> persist."
  fog: "Ambiguous ordering, stale session state, and exact-final composition can silently change prompt or authority meaning."
---

# Base plus append-overlay composition

Date: 2026-07-13
Status: implemented, validated, and release-integrated
Owner: `packages/pi-modes`

## Verified current state

The current package has one active key, persisted as `pi-mode-state.v1 { key }`. `/mode` selects one mode. `append`, `replace_base`, and `replace_final` are mutually alternative strategies on that selected definition. `append` composes over the host-assembled prompt, `replace_base` reconstructs the host custom-base branch, and `replace_final` returns exact configured text. Project discovery is trust-gated and deepest-ancestor-wins by key. A startup-only nonblank `PI_MODE` overrides replayed session selection.

No existing package packet or AK task found in the 2026-07-13 preflight described this base-plus-overlay feature. The repository direction check passed, but the active `SF5`/`IW4` nodes concern measured campaign automation and are not a truthful parent. After explicit owner authorization to proceed, unlinked scoped AK task `3904` was created and claimed for this package-only implementation rather than falsely linking it to campaign automation.

## Decision

A composed selection contains:

- zero or one **base** mode;
- zero or more ordered **overlay** modes;
- only `append` definitions may be overlays;
- a `replace_final` base is exclusive and therefore cannot coexist with overlays;
- no base and no overlays means native host behavior unchanged.

`replace_base` and `replace_final` definitions are base candidates. An `append` definition is an overlay candidate. For backward compatibility, an old single selected `append` key migrates to native base plus that one overlay; an old selected `replace_base` or `replace_final` key migrates to that base with no overlays.

## `/mode` multi-selector UX

`/mode` opens a multi-selector with separate **Base** and **Overlays** sections:

- Base is radio-style: `Native host`, or one discovered `replace_base`/`replace_final` mode.
- Overlays are checkboxes containing discovered `append` modes.
- Checked overlays show ordinal numbers and support move-up/move-down (or equivalent reorder controls).
- Choosing a new `replace_final` base always requires explicit confirmation because it removes the host envelope; the confirmation also names and clears overlays when present. Overlays are disabled while it remains selected.
- Choosing an overlay while `replace_final` is selected requires confirmation to switch base to `Native host`; there is no implicit weakening of exact-final semantics.
- Apply rediscovers and validates the draft immediately before persisting one atomic selection entry; if definitions changed enough to alter the previewed semantics, Apply rejects the stale draft and asks the operator to reopen the selector.
- Draft edits and confirmation prompts affect draft state only. Apply appends one v2 entry before deriving footer/in-memory state from replay; cancel makes no session-entry, footer, or composition change.
- The custom selector is TUI-only. Headless/RPC callers use explicit direct syntax. Semantic failures throw and emit Pi's `extension_error`; current Pi host transport still returns prompt-command `success:true` and print exit 0 after a handled extension-command error, so automation must inspect `extension_error`/stderr rather than treating transport acceptance as semantic success.

Direct syntax should remain scriptable and unambiguous:

```text
/mode off
/mode <base-key>
/mode +<overlay-key>
/mode -<overlay-key>
/mode set <base-key|native> [--overlay <key>]...
```

`/mode <key>` preserves legacy meaning: a base key selects that base and clears overlays; an append key selects native base plus only that overlay. `off`, `default`, and `none` clear both base and overlays.

## Deterministic ordering and composition

Overlay order is selection order, persisted explicitly as an array. Discovery order, filesystem order, labels, and locale sorting never alter an existing composition. Re-selecting an already selected overlay is idempotent; remove then add places it last. Duplicate keys are rejected during normalization.

Composition is:

1. resolve and validate the whole selection against currently discovered definitions;
2. if base is native, start with the host-assembled prompt;
3. if base is `replace_base`, build its custom static base with the native dynamic envelope exactly as today;
4. if base is `replace_final`, require zero overlays and return its exact prompt;
5. append each overlay in persisted order using a stable, separately labelled section containing its mode label and prompt.

Overlay composition must not repeatedly call the current `append` composer over an already decorated prompt if that would create nested or order-ambiguous headings. A dedicated composition function should render one base followed by a flat ordered overlay sequence.

## Native fallback and invalid selections

Fail closed to the safest truthful partial result:

- unavailable/invalid base -> native host base;
- unavailable/invalid overlay -> omit that overlay;
- resolvable `replace_final` plus overlays -> preserve the exact final prompt, omit every overlay, and emit a diagnostic; never silently expose the host dynamic envelope or treat `replace_final` as composable;
- no valid resolved components -> native host behavior unchanged.

Diagnostics must name omitted keys and reason. Resolution must not rewrite mode files or silently persist repaired state. A later explicit operator Apply may persist normalized state.

## State schema and migration

New writes use fingerprinted `pi-mode-state.v3` entries:

```json
{
  "customType": "pi-mode-state.v3",
  "data": {
    "baseKey": "focused-builder",
    "overlayKeys": ["review", "explain"],
    "fingerprints": {
      "focused-builder": { "digest": "<sha256>", "scope": "global", "path": "<path>" },
      "review": { "digest": "<sha256>", "scope": "builtin", "path": null },
      "explain": { "digest": "<sha256>", "scope": "builtin", "path": null }
    },
    "driftPolicy": "block",
    "activatedAt": "<ISO-8601>",
    "source": "selector"
  }
}
```

`baseKey: null` means native host base. Readers scan the active branch oldest-to-newest and understand v1, v2, and v3:

- every well-formed recognized entry replaces the preceding candidate regardless of version;
- malformed recognized entries and unknown custom-entry types are ignored, leaving the preceding valid candidate active;
- every selection shape shares one duplicate-free maximum of 64 overlays, and every newly created v3 entry must be immediately replayable;
- v1 keys translate against current discovery; valid v1/v2 state migrates once to fingerprinted v3 on session start;
- invalid legacy state freezes to native-empty with a warning rather than silently repairing slot roles;
- no historical entry is rewritten and no database migration occurs;
- every new explicit selection writes v3 only.

Replay and resolution diagnostics are runtime warnings, not hidden repairs or persisted normalization.

## Startup semantics

Preserve `PI_MODE` as a startup-only explicit override. Backward-compatible single values retain legacy interpretation:

- base key -> that base, no overlays;
- append key -> native base plus that overlay;
- `off|default|none` -> native base, no overlays;
- invalid/unavailable -> native base, no overlays, warning.

`PI_MODES` provides strict JSON `{baseKey, overlayKeys}` multi-selection and takes precedence over `PI_MODE`; no delimiter grammar is accepted. Both selectors are consumed only on process startup, not reload/session replacement, and interactive changes supersede them for later turns. Startup `replace_final` additionally requires `PI_MODE_CONFIRM_EXACT=1`.

Every configured nonblank startup selector—including `off`, invalid syntax, unavailable keys, and unacknowledged exact-final—appends one authoritative v3 entry before later turns replay session state. Invalid selections persist native-empty fallback so an older session selection cannot unexpectedly reactivate.

## Trust and ancestor overrides

Discovery remains unchanged: global modes load first, then trusted ancestor `.pi/modes` directories root-to-cwd, with deepest definition winning by key. Untrusted projects contribute no ancestor/project definitions. The composed selection stores keys, not paths, so every turn resolves keys against the current trusted discovery result.

Consequences:

- if an ancestor override changes a selected key from `append` to a base strategy (or vice versa), the component becomes invalid for its stored slot and is omitted/falls back with a diagnostic;
- inherited files remain selectable and previewable but cannot be edited or deleted from a descendant cwd;
- `/mode-new --project` still writes only at cwd;
- no composition action mutates an ancestor or bypasses symlink/path guards.

## Preview, status, edit, and delete

- `/mode-preview` without arguments previews the current draft composition in the multi-selector; direct preview should support the same explicit `set` shape without activation.
- Preview displays resolved base, ordered overlays, omitted components, source scope/path, and final composed prompt.
- `/mode-status` shows native/custom base, strategy, ordered overlays with ordinals, diagnostics, and fallback state. Compact footer text should remain bounded (for example `mode:focused-builder +2` or `mode:native +2`).
- `/mode-edit <key>` keeps editing one definition. After save, re-resolve the active composition and warn if strategy changes invalidate its slot; do not silently move it between base and overlays.
- `/mode-delete <key>` confirms the exact file and truthful post-delete effect. Deleting an inactive mode never rewrites active state. If the key occupies an active slot, delete first and append the confirmed v3 selection only when the remaining composition is valid; otherwise retain the existing blocked state and report the partial file-deletion effect explicitly. Do not persist native-empty normalization as a hidden side effect.

## Tests and acceptance evidence

Kernel tests:

- native, `replace_base`, and exact `replace_final` base composition;
- zero, one, and many overlays in persisted order;
- flat section rendering, duplicate rejection, remove/re-add ordering;
- `replace_final` exclusivity and malformed-state fail-closed behavior;
- v1-to-v2 translation for append/base/final/off and chronological mixed-entry replay;
- unavailable base/overlay and strategy drift after ancestor override;
- trusted/untrusted ancestor discovery and deepest-key override;
- startup-only `PI_MODE` compatibility for all strategy types and invalid values, including authoritative v2 persistence over prior v1/v2 state across later turns;

Adapter tests or host-compatible harness coverage:

- selector apply/cancel, radio/checkbox behavior, reorder, confirmation gates, stale-draft rejection, and TUI-only behavior;
- direct command compatibility;
- preview/status/footer truth;
- edit/delete effects without implicit ancestor mutation, including same-key lower-precedence definitions becoming visible after delete;
- session resume/reload and branch-local replay.

Validation before activation:

1. package `npm run check`;
2. root scoped package quality gate;
3. host compatibility canary where system-prompt options are exercised;
4. local install, `/reload`, and real flows for native + overlays, replace-base + overlays, and replace-final exclusivity.

## Rollout and rollback

Roll out behind internal state-schema compatibility, not a new autonomy flag:

1. land kernel/state migration tests;
2. land adapter UX and status/preview truth;
3. run package/root/canary checks;
4. locally install and dogfood before release.

Rollback is disabling/removing the package or `/mode off`, both of which preserve native `SYSTEM.md`, `APPEND_SYSTEM.md`, and host assembly. Current releases write fingerprinted v3 only. A pre-v3 downgrade ignores v3 and may expose an older v2 selection, so operators must explicitly use that version's `/mode off` or disable it. Do not dual-write lossy legacy state for multi-overlay compositions.

## Authority boundary

Composition changes prompt policy only. It does not send messages, continue after settlement, invoke tools, launch peers/subagents/campaigns, mutate files or external systems, or grant task, evidence, finalizer, cleanup, merge, release, publication, promotion, or autonomy authority. Mode names and prompt text are not authorization tokens. This package must not mutate AK, Prompt Vault, KES, ROCS, or evidence.

## Scoped execution task

AK task `3904`, **Implement pi-modes base plus ordered append overlays**, was created at P2 with the following required scope:

- `packages/pi-modes/src/modes.ts`
- `packages/pi-modes/extensions/mode.ts`
- `packages/pi-modes/tests/modes.test.ts`
- `packages/pi-modes/README.md`
- this design packet

The task allows only `packages/pi-modes/**`. It remains deliberately unlinked rather than claiming the unrelated campaign-automation direction. Completion requires package check, root scoped gate, migration tests, local installation, and live prompt-composition evidence.

## Implementation and dogfood evidence

- Pure kernel and adapter suites pass 45 tests covering composition, v1/v2 chronology and freeze, malformed state, startup translation, direct syntax, selector Apply/Cancel, semantic/provenance fingerprints, and exact-final confirmation/whitespace.
- `npm run check` passes structure, file budgets, formatting/lint, typecheck, tests, package whitelist, and release quick checks. The publish dry-run truthfully reports the existing `0.1.0` registry version guard and continues its non-publishing validation.
- The local package was installed with `pi install <package-path>`.
- A fresh Pi RPC session proved command registration plus persisted `{baseKey:null, overlayKeys:["review","explain"]}` and truthful `mode-status` output.
- A fresh host `before_agent_start` probe proved: native plus ordered overlays; `society-integrator` replace-base plus the real inherited `adaptive-portfolio` overlay while retaining project context; and exact byte equality for a temporary `replace_final` mode.

## Selector implementation

The installed Pi host has no public ordered multi-select component, so the package uses a bounded `ctx.ui.custom()` component based only on supported TUI primitives. It keeps draft state private, provides radio-style base selection, checkbox overlays, Alt+Up/Down reordering, inline confirmation, and atomic Apply/Cancel without importing host-internal selector classes.

## 2026-07-13 hardening and extension follow-up

AK task `3919`, **Harden and extend pi-modes composition system**, owns the package-bounded follow-up authorized by the operator. The implemented candidate advances the original design without expanding authority:

- strict schema v2, bounded validation, packaged JSON schemas/linter, and explicit overlay requirements/conflicts/order assertions;
- fingerprinted `pi-mode-state.v3` with activation metadata, default block-on-drift behavior, explicit reapproval, and optional warn/allow policies;
- named composition presets with global/trusted-ancestor discovery and save/use/export/import/list surfaces;
- structured `PI_MODES` startup composition ahead of legacy `PI_MODE`;
- searchable selector details and live composition summary, semantic completions, machine-readable status/preview, and prompt hashes/size/token estimates;
- direct exact-final confirmation in TUI and mandatory `--confirm-exact` acknowledgement headlessly;
- authoring saves without implicit activation; edits to active definitions become blocked drift;
- package version truth reconciled from published/tagged `0.2.0` to candidate `0.3.0`, local-behind-registry release failure, constrained tested Pi peer range, and packed-artifact extension smoke.

The follow-up acceptance suite and fresh runtime evidence supersede the earlier 45-test/v2-only count above. Release, commit, publication, and direction closeout remain separate owner actions.
