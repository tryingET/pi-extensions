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
- Failure-mode signaling: explicit reasons surfaced (`fzf-not-installed`, `prompt-command-source-unavailable`, `no-prompt-templates`, deterministic `PTX input/parse error` messages).
- CI smoke: mixed-extension non-UI smoke tests cover both load orders and both probes (`$$ /...`, `/vault...`) with loop/timeout detection.
- Spike support: `/ptx-fzf-spike` probes runtime viability (`interactive` vs `--filter`)
- Validation hooks: installed
- Tests: selector + adapter normalization tests active (`tests/fuzzy-selector.test.mjs`, `tests/ptx-candidate-adapter.test.mjs`)
