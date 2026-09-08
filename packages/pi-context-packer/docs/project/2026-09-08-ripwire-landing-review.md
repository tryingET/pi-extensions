---
summary: "Source review findings and verification boundaries for the ripwire-only main transition."
read_when:
  - "Reviewing the cumulative ripwire stack or repeating its landing dogfood."
system4d:
  container: "Nine context-packer increments plus a final review-hardening increment."
  compass: "Fix reproducible blockers before main; retain explicit-only activation."
  engine: "Source review -> regression tests -> packed dogfood -> CI -> main verification."
  fog: "Implementer reexecution is not independent authorship or a model-task benchmark."
---

# Ripwire landing review — 2026-09-08

## Decision boundary

The operator requested review, dogfooding and main landing. This authorizes this source
transition, not an npm publication or changes to the operator's installed Pi settings.
The immutable automatic-approval record remains disabled. Explicit ripwire use is the
supported release posture. The retrieval-only study is not enough to approve automatic use.

## Findings fixed before promotion

1. **Workspace-root alias escape.** A model-provided cwd/repoRoot lexically beneath the
   trusted workspace could be a symlink outside it. A real-binary reproducer returned
   external code before this fix. The planner now canonicalizes existing roots before
   trust checks. The adapter rejects a noncanonical root and verifies the opened root's
   descriptor path. Regression tests require refusal before provider invocation while
   retaining legitimate in-workspace aliases.
2. **Explicit zero budgets became defaults.** Budget normalization now preserves zero
   packet and provider ceilings and a zero reserve. Zero code-provider budgets cannot
   launch acquisition. Rendered empty error content is used when no refusal can fit.
3. **Concurrent source growth could exceed the read bound.** Stable reads allocate only
   the observed, capped size plus one detection byte and retain before/after identity
   checks. Nonblocking opens avoid a substituted special file blocking a source read.
4. **Upstream-redacted signatures were not marked in normalized evidence.** Visible
   upstream redaction markers are treated conservatively as redacted projections.
   They must not be described as byte-exact source. Existing scrub flags are preserved.
5. **Post-migration guidance was stale.** Unselected code context now explains explicit
   ripwire selection rather than claiming the capability has not been implemented.

## Review coverage

Reviewed the active changes across removal/configuration contracts, workspace trust,
provider selection, execution and parsing, corpus scope, final rendered budgeting,
hash-bound expansion, cache permissions and identity, active-context deduplication,
rollout policy, evaluation contracts, registered tool wiring and packaged-runtime checks.
Historical evidence moves retain their original bytes and are outside the live package.
Unrelated independently owned packages are not removed.

A reusable `/ripwire-context` prompt makes the explicit tool request discoverable.
The cumulative RW-10 dogfood executes RW-01 through RW-09 packed scenarios, verifies
that prompt with the pinned Pi runtime parser, and exercises the actual installed
registered handlers plus root-alias and zero-budget regressions in a fresh Pi process.
The parent candidate passed 193 package tests; the reviewed source adds five regression
tests. Exact candidate identities, results and artifact digests belong in generated
receipts and the promotion PR, not inferred from this document.

```sh
# Exact clean checkout, normal non-root user, provisioned dependencies and binary.
bash scripts/package-quality-gate.sh pre-push packages/pi-context-packer
cd packages/pi-context-packer
npm run dogfood:gate -- --gate RW-10 --candidate-sha "$(git rev-parse HEAD)" --output-dir /absolute/external/evidence
npm run release:check
```

## Limits retained

Linux descriptor-anchored acquisition only. Source reads are individually stable, not
an atomic multi-file filesystem transaction. Scope exclusions are not semantic proof
of completeness. The byte ceiling is exact; tokenizer-free token accounting is an
estimate. Private optional caches contain source-derived data and have bounded post-write
pruning, with transient concurrency overhead. Prompt parsing and offline tool execution
are not paired model-agent outcomes. This review is a new source review and isolated
reexecution by the assistant, not an independent external author's approval.

The review environment lacks the external owner-workspace `ak` and docs-list CLIs;
no owner-task reconciliation or external workspace check is claimed. Repository
quality gates and isolated package tests are run without fabricating those owner results.
