---
summary: "Must-fix code-context review after the initial ripwire main promotion."
read_when:
  - "Reviewing acquisition boundaries or running the local ripwire workflow."
system4d:
  container: "Explicit, read-only Linux context-pack acquisition."
  compass: "Fix reproduced failures without enabling automatic adoption."
  engine: "Failing regressions -> fixes -> packed and registered-tool verification."
  fog: "Programmatic workflow checks are not a model-task pilot."
---

# Ripwire must-fix review

Baseline: `2abdd14627da60985b03e396bbbf5f87708d7925`.
This changes the context-packer package only. No dependency upgrade, npm publication,
operator installation, automatic selection, or replacement code backend is included.

## Reproduced and corrected

- The corpus skipped `.mjs`, `.cjs`, `.mts`, and `.cts` although the pinned binary
  supports them. Include these variants and advance corpus policy identity to v2.
- Zero headroom could invoke the binary with a host tokenizer, and remaining
  admission capacity after earlier providers was ignored. Check both token and byte
  availability before acquisition. Explicit reserves are never reduced to force work.
- Negative/fractional/unknown budget inputs could silently turn into defaults.
  Reject invalid budgets before provider execution; schemas expose the same integer
  constraints as runtime normalization.
- A source-local `TMPDIR` could create snapshots inside the source while reporting
  no source writes. Resolve roots and refuse source-local temporary storage before
  creation. Temporary-directory preparation errors enter the sanitized refusal path.
- Accepted code seeds did not reach the ranker. Forward validated symbol/path hints
  in one bounded `--for` argument. Disclose hints that do not fit. Hints do not narrow
  the approved corpus or become command-line flags.
- Both registered tools now share explicit discovery/expansion/refresh/error guidance;
  the slash prompt and schema use the same exact selection field names. Runtime
  identification changes to `ripwire-context-v2` so stale installation is observable.

The six new regression groups fail on the baseline and pass with these fixes. The
cumulative RW-10 gate now also uses the real pinned binary for module-file discovery,
model-visible selection extraction, body expansion, stale-selection recovery, exact
zero-tokenizer-headroom refusal, and refusal of a source-local temporary directory.
It repeats the discovery/expansion/recovery path through the installed Pi handler.
Fixture source changes between reads are intentional; acquisition is separately
checked for source preservation.

## Verification

Run the canonical package pre-push gate, then `npm run dogfood:gate -- --gate RW-10
--candidate-sha <exact SHA> --output-dir <outside repository>` and the full networked
`npm run release:check`. Exact candidate/main identities and receipts belong in the
review PR. No source-local evidence, private credentials, or operator settings are used.

This is assistant review and isolated reexecution, not independent third-party review
or a live-model task pilot. The adoption gate remains unapproved. Per-file stable
reads are not an atomic whole-repository transaction; token estimates without a host
tokenizer remain estimates. Scope exclusions and limits still require attention.
