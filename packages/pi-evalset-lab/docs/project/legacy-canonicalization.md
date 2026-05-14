---
summary: "Canonicalization note for the pi-evalset-lab legacy standalone repo migration."
read_when:
  - "Reviewing why packages/pi-evalset-lab exists."
  - "Planning legacy repo deprecation after monorepo migration."
system4d:
  container: "Migration note for a package-level canonical home."
  compass: "Make the monorepo package authoritative before deprecating legacy state."
  engine: "Scaffold -> port runtime/docs/assets -> validate -> hand off legacy deprecation."
  fog: "Legacy sessions, generated reports, and standalone governance files still need explicit disposition."
---

# pi-evalset-lab legacy canonicalization

`packages/pi-evalset-lab` is the canonical monorepo package home for the legacy standalone repo at `~/programming/pi-extensions/pi-evalset-lab`.

Canonicalized here:

- `/evalset` runtime extension: `extensions/evalset.ts`
- installable prompt directory: `prompts/`
- sample datasets and report UI assets: `examples/`
- JSON-to-HTML report export helper: `scripts/export-evalset-report-html.mjs`
- package overview/release history: `README.md`, `CHANGELOG.md`
- stable package docs: selected `docs/project/` files

Intentionally not canonicalized in this package:

- generated `.evalset/reports/` outputs
- `dist/netlify-drop/` generated export output
- standalone `.github/`, release, support, and security root scaffolding
- legacy `docs/dev/` tree
- standalone repo archival/deletion state

Next controller action after review: run the root legacy-package deprecation workflow against the legacy repo, render the handoff, decide whether to relocate sessions, then archive/delete only after explicit approval.
