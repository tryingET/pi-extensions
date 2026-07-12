---
summary: "Read-only Pi TUI consumer for normalized SCI evidence review v1 files."
read_when:
  - "Installing or reviewing the pi-evidence-review package."
system4d:
  container: "Standalone-friendly read-only Pi evidence review consumer."
  compass: "Render only exact, bounded, normalized SCI v1 evidence."
  engine: "Explicit file -> containment and byte checks -> schema and semantic checks -> inert TUI."
  fog: "Treating evidence prose, commands, paths, or readiness as executable authority."
---

# pi-evidence-review

A standalone-friendly Pi extension that validates and inertly displays one already-normalized SCI `semantic-code-intelligence.evidence_review.v1` JSON file.

## Use

```text
/evidence-review path/inside/the/current/workspace/review.json
```

The argument must name exactly one workspace-relative regular `.json` file. The command does not discover files, invoke SCI, normalize raw inputs, follow links, execute commands, contact a network, persist a session entry, record a decision, or mutate anything.

Interactive TUI mode is required. Print, JSON, and RPC modes fail before reading the named file.

## Contract and limits

The package vendors the exact reviewed draft-07 schema in [`schemas/evidence-review-v1.schema.json`](schemas/evidence-review-v1.schema.json) and validates it directly with Ajv. Companion checks enforce:

- 1,048,576-byte input with one-byte overflow detection
- strict UTF-8 and one complete JSON object
- depth 32, array 256, aggregate item 4,096, and aggregate string 262,144-code-point caps
- unique IDs for every ID-bearing collection (including handoff gates) and every cross-array reference in the handoff contract
- rejection of every observed symlink path component, final-component `O_NOFOLLOW`, opened-descriptor containment, stable inode/size/mtime/ctime checks, and post-read component rechecks

Invalid input is rejected atomically with a generic diagnostic. Payload strings are plain terminal text: ANSI/control/bidi characters and markdown/HTML metacharacters are neutralized; URI, path, command, option, recommendation, and next-action values remain inert.

### Filesystem boundary

The reader fails closed unless the host provides `O_NOFOLLOW` and a resolvable `/proc/self/fd` or `/dev/fd` descriptor path. It rejects symlinks observed before open, immediately after open, or after reading, and rejects same-size mutation when inode, size, nanosecond mtime, or nanosecond ctime changes. Node does not expose `openat2(RESOLVE_BENEATH|RESOLVE_NO_SYMLINKS)`: a privileged adversary that can perform and restore a transient component swap entirely between observations, or a filesystem that does not report mutation through stable metadata, remains a platform limitation. Use only a workspace whose directory tree is not concurrently controlled by an adversary; this package does not overclaim race-proof no-symlink traversal on such hosts.

Canonical producer contract: `semantic-code-intelligence/docs/project/evidence-review-handoff-contract.md`. Vendored artifact provenance and hashes are recorded in [`docs/project/vendor-provenance.md`](docs/project/vendor-provenance.md).

## Development

```bash
npm install
npm run quality:pre-commit
npm run check
npm run docs:list
```

Live activation is intentionally controller-owned: install this package path with `pi install`, reload Pi, then verify the command in a real TUI. This candidate package does not perform those actions itself.

Root-managed component release metadata is intentionally disabled in this bounded candidate because the required root release configuration files were outside AK-3843's authorized paths. A later owner-reviewed release wave may opt the package in and synchronize those root files.
