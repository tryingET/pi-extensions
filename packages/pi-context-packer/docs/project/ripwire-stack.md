---
summary: "Implementation and verification boundaries for the ripwire-only context-provider stack."
system4d:
  container: "Read-only context-provider integration."
  compass: "Bounded useful context without source mutation."
  engine: "Implement -> verify exact artifact -> review."
  fog: "A passing local check does not establish production adoption."
read_when:
  - "Reviewing or independently dogfooding a ripwire stack increment."
---

# Ripwire-only stack

The stack starts at PR #200. No merge, release publication, or operator installation is authorized by this document.

## RW-02: complete output budget

`context_pack` fits all model-visible text, including fences, headings, provenance and omissions.
Selected-content metrics remain separate from final-output metrics in `details.outputBudget`.
The byte limit is exact. Without a host-supplied `countTokens` function the token accounting uses
an explicitly estimated two UTF-8 bytes per token, not a claim of exact tokenizer compliance.
Known remaining host capacity and the reasoning reserve constrain the selected budget. Missing
host headroom is disclosed as unknown. A ceiling too small for a refusal produces empty error
content and a structured host-side reason. An invalid tokenizer fails closed.

Calibration scaffolding is no longer in normal model-visible text. The exported renderer accepts
`{ diagnostics: true }` for an explicitly requested, still-budgeted diagnostic rendering. Redacted
calibration templates remain available in host-side details and the programmatic packet API.

Run `npm run dogfood:gate -- --gate RW-02 --candidate-sha <HEAD> --output-dir <EXTERNAL_DIR>`
from an exact clean checkout. The command creates an isolated packed-artifact scenario plus a
fresh Pi registered-tool smoke. Missing prerequisites are BLOCKED, not passing skips.

Use one detached worktree and isolated Pi roots per candidate. Evidence identifies the exact
commit and package digest. Implementer re-execution is not independent external review.

## RW-03: trusted adapter

`@tryinget/pi-context-packer/ripwire` exports the read-only provider. It is available to `context_pack` when explicitly selected (RW-04 onward). Provision the CLI explicitly; this package does not install tools or agent skills.
Set `PI_CONTEXT_PACKER_RIPWIRE_BIN` to an absolute executable path. Linux x64 has a recorded default
build digest; another operator-approved build requires `PI_CONTEXT_PACKER_RIPWIRE_SHA256` and must
report the supported version. A supplied digest is an operator trust decision, not upstream build
attestation. The reviewed source is `93c8edaafdb5499e89939cc2cebd0429e278e86f`.

Source traversal currently requires Linux `/proc` descriptor-relative reads. Other profiles fail
closed until they have an equally anchored implementation and verification. The approved corpus
contains regular programming-language files (maximum 512 KiB each, 10,000 files, 64 MiB total).
Hidden entries, vendor/generated directories, symlinks and explicitly excluded paths are not read.
Tests are not categorically excluded. Git-ignore rules are not an implicit authority boundary.
The corpus is copied outside the source tree, the verified executable bytes run with no cache,
and raw process errors are withheld. Snapshot identity is not a multi-file filesystem transaction.

`RW-03` dogfood uses the real provisioned binary and tests exclusions, symlinks, a wrong-digest
negative control, cancellation, and source preservation. Raw subprocess or compiler output is
not promoted into a packet. Use Pi read/search tools on refusal; there is no other code backend.

## RW-04 — opt-in packet discovery

`context_pack` and `context_plan` accept `providers.ripwire: "required"` for
repository-wide discovery over the approved corpus. No code-path or symbol seed
is required. `off` and the current `auto` mode make no ripwire call. Execution
still requires the operator-configured pinned binary; models cannot choose its
path, digest, exclusion policy, environment, or arguments. The normal packet
carries source-content hashes and snapshot identity with ranked signatures.
Required-provider failures produce an incomplete error packet with explicit
omissions, not an apparently successful empty discovery. Native Pi read/search
remains the fallback. No additional backend is used.

The RW-04 dogfood gate exercises both the packed API and the installed registered
Pi `context_pack` closure against isolated code targets. Runtime helpers are
separate from registration so the extension remains under its file budget.

## RW-05 — focused source

Hash-bound source expansion uses the pinned binary and the same approved corpus.
The packed dogfood scenario verifies definitions below line 120, duplicate names,
wrong-line refusal and stale content. The installed Pi closure also expands a real symbol.

## RW-06 — private cache

Cache-disabled, cold and warm paths are compared on real output. The gate then changes
uncommitted source, adds/renames/deletes files, changes exclusions and corrupts entries.
Installed Pi verification proves the registered handler reports a real cache hit.

## RW-07 — active-context working set

The runner verifies repeat, refresh, changed source and session isolation. The installed
Pi closure uses a real in-memory SessionManager for active-entry projection. No durable
working-set memory or cross-session claims are created.
