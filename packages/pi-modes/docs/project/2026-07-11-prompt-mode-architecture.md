---
summary: "Architecture for composable, drift-aware prompt modes without execution authority."
read_when:
  - "Changing prompt composition, mode/preset storage, state replay, activation, or cross-package boundaries."
  - "Evaluating whether a mode may trigger autonomous behavior."
system4d:
  container: "Session-local prompt composition extension."
  compass: "Make base, overlay, exact-final, portability, and definition drift explicit."
  engine: "Discover -> strict validate -> select/preset -> fingerprint -> compose -> observe -> reapprove."
  fog: "Inherited prompt definitions and extension ordering can change model context without changing a selected key."
---

# Prompt-mode architecture

## Decision

`pi-modes` owns prompt-profile and preset discovery, strict bounded validation, atomic selection, prompt composition, session-local replay, drift detection, and operator visibility.

| Strategy | Role | Result |
|---|---|---|
| `append` | ordered overlay | Retain the selected base and append one flat labelled section. |
| `replace_base` | base | Replace the static base while preserving Pi append/context/skills/cwd. |
| `replace_final` | exclusive base | Return configured bytes exactly at this handler; retain no host envelope or overlay. |

A selection contains zero or one base plus zero or more ordered overlays. Native host is the default base. Later-loaded `before_agent_start` handlers can still modify any result, so provider-payload exactness is a full extension-chain property.

Pi's native project/global `SYSTEM.md` remains default base authority. No active component, `/mode off`, blocked drift, or failed replay-time contracts return native host assembly.

## Runtime flow

```text
native SYSTEM.md / host base
+ builtins
+ ~/.pi/agent/modes/*.json
+ trusted ancestor .pi/modes/*.json root -> cwd
-> strict per-file validation and deepest-key precedence
-> PI_MODES JSON, else PI_MODE, else active-branch v1/v2/v3 replay
-> validate exact candidate and composition contracts
-> capture semantic/provenance SHA-256 fingerprints
-> append one pi-mode-state.v3 entry
-> before_agent_start re-resolves trusted definitions and checks drift
-> compose once or return native host with diagnostics
-> status/preview expose effective components, hashes, estimates, and fallback
```

Global and trusted ancestor `mode-presets` use the same layering, trust, bounds, and symlink rules. Presets contain only base/overlay keys and order. Import/use never embeds prompt text or grants authority.

## Definition contract

Schema v2 requires explicit `promptStrategy`, canonical key, bounded display/prompt text, and known fields only. Legacy v1 remains readable; its omitted strategy retains the historical `replace_base` default.

Append overlays may declare:

- `requires`: named components must be explicitly selected;
- `conflictsWith`: named selected components invalidate the candidate;
- `before` / `after`: ordering assertions when both overlays are selected.

Contracts validate exact operator candidates. They never auto-add, auto-remove, auto-reorder, execute, or mutate. Direct incremental commands can therefore fail where one atomic `set` or preset succeeds.

## State and drift

New writes use `pi-mode-state.v3`:

```json
{
  "baseKey": "focused-builder",
  "overlayKeys": ["review"],
  "fingerprints": {
    "focused-builder": { "digest": "<sha256>", "scope": "global", "path": "<path>" },
    "review": { "digest": "<sha256>", "scope": "builtin", "path": null }
  },
  "driftPolicy": "block",
  "activatedAt": "<ISO-8601>",
  "source": "selector"
}
```

Fingerprints cover normalized semantic content, strategy, contracts, resolved scope, and source path. JSON whitespace and mtime do not matter. `block` is default and returns native host until explicit reactivation or `/mode-reapprove`. `warn` and `allow` are explicit operator choices and never bypass slot or contract rules; a drifted `replace_final` base remains blocked under every policy until confirmed reactivation.

Replay scans the active branch chronologically. The newest well-formed recognized v1, v2, or v3 entry wins. Malformed recognized entries are ignored. Valid legacy state migrates once to v3; invalid legacy state freezes to native host. Historical entries are not rewritten.

## Operator and automation surfaces

- `/mode` is a searchable atomic selector with details and live composition summary.
- Direct `+`, `-`, and `set` forms are semantic and completion-aware.
- Interactive `replace_final` activation/reapproval confirms; headless commands require `--confirm-exact`, and startup exact-final requires `PI_MODE_CONFIRM_EXACT=1`.
- Confirmation is bound to the semantic/provenance snapshot that is persisted; a definition change during the confirmation gap rejects the action.
- `/mode-status --json` and `/mode-preview --json` provide deterministic machine output.
- New/edit authoring saves without implicit activation; edits to active definitions become visible drift.
- Deleting an inactive definition never rewrites active state; active deletion persists only the confirmed valid remainder.
- Named compositions support save/use/export/import with global/project trust boundaries.
- `PI_MODES` is strict JSON and precedes legacy single-key `PI_MODE`.

## Host compatibility

`replace_base` reconstructs Pi's documented custom-base branch from `BuildSystemPromptOptions` until Pi exposes a supported builder or return patch. The package constrains peers to `>=0.83.0 <0.85.0`, compares complete output against the pinned host builder, and runs credential-free installed-artifact smoke. Publication creates, hashes, checks, uploads, and publishes one retained tarball. Expanding the host range requires the parity and artifact proofs.

Prefer an upstream seam such as:

```ts
ctx.buildSystemPrompt({ ...event.systemPromptOptions, customPrompt })
```

or:

```ts
return { systemPromptOptions: { customPrompt } };
```

## Trust and authority boundary

Mode activation does not send messages, continue, dispatch agents/peers, start campaigns, invoke tools, mutate AK/Prompt Vault/KES/ROCS/evidence, or grant mutation/publication/promotion authority. A mode, preset, prompt, contract, fingerprint, or environment variable is never an authorization token.

## Rollback

`/mode off`, package disable/removal, or native host are rollback. A pre-v3 downgrade may reveal an older v2 entry; explicitly use that version's `/mode off` or disable the package.

## Attribution

The product concept and command vocabulary were informed by Maxime Rivest's MIT-licensed [`pi-modes`](https://github.com/MaximeRivest/pi-modes). This implementation is independently structured around explicit composition, trust, safe persistence, drift, presets, observability, and tests.
