---
summary: "Exact fresh-template and selective spike port identities."
read_when:
  - "Exact fresh-template and selective spike port identities."
system4d:
  container: "Private pi-typescript-tool package in pi-extensions."
  compass: "Typed trusted-code execution with explicit limits."
  engine: "Review -> implement -> package checks -> owner activation."
  fog: "In-process vm and typechecking are not security boundaries."
---

# Provenance

- Fresh source checkout: sibling `pi-extensions-template`, observed clean at HEAD
  **8bcc39a85a62b6b8dc4b96e5879f79b4e97d8192**.
- Generation (no existing destination; no update/recopy or spike scaffold reuse):

```bash
copier copy --trust --vcs-ref 8bcc39a85a62b6b8dc4b96e5879f79b4e97d8192 --defaults \
  -d scaffold_mode=simple-package -d repo_name=pi-typescript-tool \
  -d command_name=typescript-tool -d release_config_mode=none \
  ../pi-extensions-template packages/pi-typescript-tool
```

- Generated `.copier-answers.yml` is untouched.
- Selective behavior source: **a0411c361453c082822d9cdb05f177a9948c9f1a**, on
  spike/pic-typescript-tool; inspected using git show, no checkout. Its source,
  tests, README and LICENSE were read. In-memory gate design and fs-only tool
  intent were retained; unsafe timeout/root/serialization assumptions were not.
- Original mechanism: cv/pic **v0.2.37**, Carlos Villela, Apache-2.0. See NOTICE.
- SCI explore_symbol_impact could not confirm the requested symbol in this
  checkout, so git-show source inspection supplied the definition evidence.
- Before generating/editing AGENTS, the specified runtime resource-loader and
  system-prompt sources were inspected. Current source includes AGENTS.override.md
  before AGENTS.md and XML project-instructions rendering (different from the
  older global summary); discovery remains session-cwd-bound. No loader edits.
- Installed Pi extension docs were read fully, including relevant package docs
  and examples. No SDK session or custom TUI APIs are used.

## Intentional generated deltas

Private:true; current exact Pi 0.84.4 dev pins while preserving template host
baseline 0.84.3; TypeScript 6.0.3 moved to runtime dependencies with a strict
validator; exact typebox/Node typings/tsx/jiti development pins; runtime src and
Apache notices in pack allowlist; all generated docs/prompts made package-specific;
policy pin/loop references projected from the owning root; private packaging branch
runs provider-free artifact checks rather than publication or Pi installation.

Template/source repos, root control plane and unrelated working-tree paths are
outside this port's mutation scope. No commit, install, provider session or AK
mutation is part of the implementation handoff.
