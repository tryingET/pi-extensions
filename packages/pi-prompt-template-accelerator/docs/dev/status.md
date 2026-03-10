---
summary: "Current project status snapshot."
read_when:
  - "Checking project health or preparing handoff updates."
system4d:
  container: "State report for current branch/project."
  compass: "Keep stakeholders aligned on progress and blockers."
  engine: "Update status after meaningful implementation slices."
  fog: "Status can stale quickly without disciplined updates."
---

# Status

- Scaffold: complete
- Primary UX: `$$ /<partial>` routes through fuzzy selector (`fzf --filter` ranking when available, deterministic fallback otherwise)
- Command UX: `/ptx-select [query]` explicit selector entrypoint
- Mapping logic: placeholder-aware argument shaping with line-hint parsing + deterministic context inference preserved
- Conflict mitigation: deprecated custom-editor autocomplete path removed (no `setEditorComponent` usage)
- Runtime hardening: non-UI mode now returns transformed command (`action: transform`) instead of swallowing `$$` input; malformed/non-slash `$$` invocations also return deterministic transform errors.
- Trigger-context hardening: PTX context inference now tolerates contexts without `sessionManager` / `getBranch()`, so live-picker style flows do not crash when only lightweight trigger metadata is available.
- Selection identity hardening: live picker candidates now carry exact prompt metadata (`name` + `path` + description), so duplicate prompt names from multiple installed packages keep the selected template stable instead of re-resolving by name only.
- Picker contract hardening: `$$ /...` and `/ptx-select` now include only prompt commands with a usable template path, so picker selections stay aligned with PTX's fully-prefilled-command contract.
- Prefill fallback: when a direct `$$ /name` invocation cannot provide a readable template path or richer live transform, PTX now inserts the raw slash command instead of leaving the editor empty.
- Failure-mode signaling: explicit reasons surfaced (`fzf-not-installed`, `prompt-command-source-unavailable`, `no-prompt-templates`, `no-prefillable-prompt-templates`, deterministic `PTX input/parse error` messages).
- Diagnostics: `/ptx-debug-commands [query]` inspects visible prompt commands, paths, prefillability, and inferred arg contracts.
- CI smoke: mixed-extension non-UI smoke tests cover both load orders and both probes (`$$ /...`, `/vault...`) with loop/timeout detection.
- Spike support: `/ptx-fzf-spike` probes runtime viability (`interactive` vs `--filter`)
- Validation hooks: installed
- Tests: selector + adapter normalization tests active (`tests/fuzzy-selector.test.mjs`, `tests/ptx-candidate-adapter.test.mjs`)
