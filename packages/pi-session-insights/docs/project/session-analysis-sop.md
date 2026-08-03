---
summary: "Operator SOP for bounded Pi session extraction, attribution, and propagation review."
read_when:
  - "Running pi-session-insights on real sessions."
system4d:
  container: "One-session deterministic audit procedure."
  compass: "Keep observation, authority, runtime, and KES facts separate."
  engine: "locate -> extract -> revalidate owners -> attribute -> inspect propagation -> synthesize."
  fog: "A transcript can look authoritative while remaining only historical capture."
---

# Session analysis SOP

1. Locate candidate `.jsonl` paths with `find`; do not content-search them with text tools.
2. Run `pi-session-insights` once per candidate. Output is bounded, but jq `--slurp` memory still scales with that one file.
3. Read current AK task/decision/deferral facts separately.
4. Inspect Git and owner-repo docs separately.
5. Create a temporary `pi.session-insights.attribution.v1` document; every authority-bearing field must be a `{value, source}` record with a non-whitespace exact source.
6. Rerun the extractor with `--attribution`.
7. Check `diary/`, `docs/learnings/`, and accepted propagation surfaces.
8. Only then synthesize bounded findings with an LLM.

Stop when attribution remains ambiguous. Null plus an uncertainty is correct; cwd-based owner guessing is not.
