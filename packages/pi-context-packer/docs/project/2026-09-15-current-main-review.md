---
summary: "Current-main compatibility review, lossless selectors, read boundaries, and verification."
read_when:
  - "Reviewing the context-packer refresh onto current main and Pi 0.84.4."
system4d:
  container: "Read-only context retrieval in the complete current monorepo."
  compass: "Preserve new packages and fix reproduced integration defects."
  engine: "Baseline -> failing controls -> fixes -> installed and repository checks."
  fog: "Programmatic dogfood is not a live-model task pilot."
---

# Current-main review

Baseline: `e54cc3a396250590f6b74ca6f900bd4f012f9c5d`.
The previous ripwire landing `555fb3ab6ba51adfa3b837836e6c743dff57a0fa`
is already its ancestor. No old feature commits need replaying. The review branch
starts at this current main, preserving every package and the Pi 0.84.4 development
pins. In particular, the new private `pi-typescript-tool` is retained, not installed
or enabled by this change.

## Reproduced issues and fixes

- A cache child named `..cache` was mistaken for a parent traversal and accepted
  inside source. Containment now checks whole parent components, in both directions.
- Sanitized display labels changed `operator<` to `operator‹` and shortened long
  paths. Valid selectors now have a separate, lossless `code.selection.json` block.
  Unsupported literal selectors explicitly direct the caller to native reads.
- The mutation test helper had no `stat` import and always returned false. Positive
  and negative controls now prove it detects files; unexpected I/O failures propagate.
- Markdown/AGENTS reads still used unbounded `readFile` and missed same-size changes.
  They now share bounded positional reads, descriptor identity and nanosecond-time
  checks with code acquisition. Non-code hosts without POSIX no-follow retain their
  existing platform fallback; code acquisition still requires anchored Linux reads.

The six new regression tests fail against the unchanged baseline and pass with
these corrections. These are bounded local file-read guarantees, not an atomic
whole-repository snapshot or protection against hostile mount/host mutation.

## Re-execution

From an exact clean source checkout, with the approved ripwire binary configured:

```sh
bash scripts/package-quality-gate.sh pre-push packages/pi-context-packer
node --test packages/pi-session-compaction/tests/p1-continuity-recall.test.mjs
cd packages/pi-context-packer
npm run dogfood:gate -- --gate RW-10 --candidate-sha <HEAD_SHA> --output-dir <OUTSIDE_REPO>
node scripts/dogfood-monorepo.mjs --repo <MONOREPO_ROOT>
npm run release:check
```

RW-10 now includes real-binary nested-package/operator expansion, and repeats it
through the actual registered Pi handler. Its existing cache scenario also proves
that `..cache` cannot change source. The repository check inventories every tracked
package manifest, verifies declared source entries, and records generated runtime
entries separately rather than indexing build output. It discovers and expands
implementations in `pi-typescript-tool`, `pi-context-packer`, and
`pi-session-compaction` using only selectors in the visible packet. These are
symbol-directed probes, not a blind retrieval benchmark or verification of every
package's behavior.

Receipts identify the exact tested candidate, artifact and host. GitHub clean-install
verification is separate from local reexecution with provisioned dependencies. The
runtime marker is `ripwire-context-v3`. Automatic selection remains off. No package
publication, new tool authority, or operator installation is part of this PR.
