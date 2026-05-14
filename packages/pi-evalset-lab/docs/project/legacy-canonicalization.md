---
summary: "Canonicalization and deprecation record for the pi-evalset-lab legacy standalone repo migration."
read_when:
  - "Reviewing why packages/pi-evalset-lab exists."
  - "Checking the disposition of the former standalone repo."
system4d:
  container: "Migration and deprecation record for a package-level canonical home."
  compass: "Treat the monorepo package as authoritative; the former standalone workspace is gone."
  engine: "Scaffold -> port runtime/docs/assets -> validate -> delete legacy workspace."
  fog: "Historical generated reports and standalone governance files were discarded with the deleted legacy workspace."
---

# pi-evalset-lab legacy canonicalization and deprecation

`packages/pi-evalset-lab` is the canonical monorepo package home for the former standalone repo at `~/programming/pi-extensions/pi-evalset-lab`.

Canonicalized here:

- `/evalset` runtime extension: `extensions/evalset.ts`
- installable prompt directory: `prompts/`
- sample datasets and report UI assets: `examples/`
- JSON-to-HTML report export helper: `scripts/export-evalset-report-html.mjs`
- package overview/release history: `README.md`, `CHANGELOG.md`
- stable package docs: selected `docs/project/` files

Intentionally not canonicalized into the live package:

- generated `.evalset/reports/` outputs
- `dist/netlify-drop/` generated export output
- standalone `.github/`, release, support, and security root scaffolding
- legacy `docs/dev/` tree

## Legacy deprecation result

The standard legacy-package deprecation workflow was applied, then the entire `~/programming/pi-extensions/` parent workspace was deleted at operator request.

- Legacy working copy: removed from `~/programming/pi-extensions/pi-evalset-lab`
- Legacy parent workspace: removed from `~/programming/pi-extensions/`
- Session-history relocation: `skip-no-history`; no directory existed at `~/.pi/agent/sessions/--home-tryinget-programming-pi-extensions-pi-evalset-lab--`
- Canonical package validation after migration: `npm run check`, `npm run release:check:quick`, root release component checks, release contract validation, and docs strict

New implementation, docs, release, and install work belongs in this package directory.
