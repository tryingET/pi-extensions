---
summary: "Context-packer code-provider migration and validation."
read_when:
  - "Working on the ripwire-only integration."
system4d:
  container: "Read-only context-packer package in pi-extensions."
  compass: "Remove the old code provider without implied replacement consent."
  engine: "Plan, bound, verify, and report explicit omissions."
  fog: "Package verification is not proof of model task performance."
---

# @tryinget/pi-context-packer

Read-only context planning and packet assembly for Pi. Instructions, Markdown/docs-list,
Git posture, and session metadata remain available. Prompt Vault, AK, and FCOS remain
owner-routed. Ripwire is available for explicit, read-only code discovery:

```json
{"objective":"Find the provider capability checks","providers":{"ripwire":"required"}}
```

Filename seeds are optional. `auto` does not yet activate ripwire. The operator must
provision the supported executable and set `PI_CONTEXT_PACKER_RIPWIRE_BIN` to its
absolute path. See [the stack contract](docs/project/ripwire-stack.md) for the
pinned build, digest, approved-corpus policy, and Linux support boundary.
The package never installs a tool or changes agent settings. Ordinary Pi read/search
remains available when discovery is unavailable or insufficient.

## Migration

SCI is removed from this package's runtime, routing, prompts, and active experiments.
Remove `providers.sci` and its provider budget from saved requests; obsolete configuration
is rejected, never silently mapped to permission to execute another tool. No installed
software or user `.ontology` data is removed. Historical code and evidence are archived
at `docs/archive/pi-context-packer/pre-ripwire` in the monorepo, outside this package artifact.
Other independently owned monorepo packages are not removed by this migration.

## Verification

Run the canonical gate from the monorepo root:

```sh
bash scripts/package-quality-gate.sh ci packages/pi-context-packer
```

Run `npm run release:check` from this package for isolated installed-Pi verification.
The quick release check skips Pi smoke and is not proof of activation.
`npm run dogfood:gate -- --gate RW-01 --candidate-sha <SHA> --output-dir <EXTERNAL_DIR>`
checks an exact clean candidate and emits an independently rerunnable receipt.
An offline registered-tool smoke is not a model-task benchmark or independent authorship.

The package does not apply edits, run validation commands, install tools, or move task authority.

### Focused source expansion

After discovery, call `context_pack` with `providers.ripwire: "required"` and
`code: { mode: "expand", selection: { path, name, line, contentSha256 } }`.
Copy the repo-relative path, literal symbol, line and source SHA-256 from the discovery
packet. The adapter rechecks source content and requires exactly one matching body;
a stale hash, mismatched line or ambiguous definition refuses instead of guessing.
Body and ancillary-context omissions are explicit. Redacted output is not editable source.

### Optional private cache

`PI_CONTEXT_PACKER_RIPWIRE_CACHE_ROOT` is an operator setting, not a model argument.
Use an absolute, user-owned mode-0700 directory outside source repositories with no
symlink ancestors. Leave it unset to disable caching. Entries are mode 0600 and may
contain source-derived text. Each request revalidates binary and corpus bytes before
reuse; uncommitted changes and scope policy affect identity. Corrupt entries cause a
fresh run. Post-write pruning targets 32 entries/32 MiB; concurrent in-flight writes
can temporarily exceed the aggregate target. Source acquisition is individually stable,
not an atomic filesystem snapshot.

### Active working set

The extension inspects Pi's active, compaction-aware session entries for successful
`context_pack` results. Only visible, non-metadata source items contribute content keys.
Keys bind repository, location, file bytes and served representation. Matching unchanged
items become brief references; `code: { mode: "discover", refresh: true }` forces serving.
A new session or compacted-away original does not inherit a loaded claim. This does not
inspect arbitrary native read output or guarantee visibility after unrelated extensions
transform the final prompt. Without active-entry support, deduplication is unavailable.
