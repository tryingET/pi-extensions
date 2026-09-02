---
summary: "Native Pi exposure for Semantic Code Intelligence composite workflows."
read_when:
  - "Installing or changing SCI composite tools in Pi."
  - "Debugging the Pi-to-SCI MCP stdio bridge."
type: "guide"
system4d:
  container: "Private Pi integration for SCI's trusted local single-user MCP stdio runtime."
  compass: "Make composite SCI workflows the visible first choice without replacing precise native edits."
  engine: "Register schemas -> lazy MCP connect -> composite call -> bounded evidence -> guarded shutdown."
  fog: "Primitive-call drift, hidden apply authority, or treating local candidacy as hosted support."
---

# @tryinget/pi-semantic-code-intelligence

This private Pi package makes SCI's existing composite workflows first-class model-callable Pi tools. It removes the need for an agent to construct shell-wrapped CLI JSON calls or manually chain SCI primitives.

## Compatibility identity and producer contract

`@tryinget/pi-semantic-code-intelligence@0.1.1-rc.2` is the independently versioned private Pi companion candidate for producer SCI `2.1.0-rc.3` (and the earlier published `2.1.0-rc.1` / `2.1.0-rc.2` CLI + MCP stdio contract). Mirroring the producer package version would misstate the companion's own `0.1.x` lineage. The producer still advertises six composites including `safe_write`; this companion registers five Pi doors and leaves `safe_write` on MCP/CLI. This identifies a compatibility target, not a publication or immutable-artifact claim.

The minimum producer contract consumed or preserved by this companion is:

- four native Pi doors: `explore_symbol_impact`, `locate_confirm_definition`, `rename_safely`, and `preview_patch_checks`; the preview door routes to SCI's `patch_checks_in_snapshot` and `structural_patch_checks` (one patch surface, two input modes: a prepared unified diff or an ast-grep structural rewrite — exactly one, fail closed); producer MCP/CLI still includes `safe_write`, but Pi does not register an apply door;
- structural public-API, state, registry, and test risk signals with explicit evidence/unknown accounting; path or name conventions remain low-confidence naming fallback rather than structural detection, and no signal claims whole-program semantics;
- progressive `explore_symbol_impact` disclosure: `compact` is the bounded decision-first default, `standard` adds sparse normalized evidence under `details.schemaVersion: 2`, and `debug` adds separately bounded and redacted diagnostics;
- a model/operator split in Pi: the compact/standard/debug model projection participates in model context, while the validated, disclosure-sanitized producer packet is retained only in a bounded TUI custom entry;
- safe boundary recovery only for the exact allowlisted reason `outside_workspace`, projected to locally authored target-root/repo-relative guidance without producer prose, submitted paths, host paths, raw diagnostics, stderr, or stack traces;
- preview-only native Pi schemas: no `apply` input, no `ALLOW_SNAPSHOT_APPLY`, and no companion authority to apply a producer snapshot to the working tree.

The producer candidate supports installed CLI and MCP stdio for one trusted local operator and repository. Its experimental `semantic-code-intelligence experimental structural-evidence-receipt` command is outside that production-candidate interface commitment, and repository closeout receipt tooling is source-checkout-only. HTTP/MCP HTTP/LSP, hosted or network-exposed operation, multiple users or tenants, untrusted repositories, public publication, broad adoption/effectiveness claims, and performance/SLO claims remain unsupported. This companion does not promote those surfaces.

## Native tools

| Intent | Native tool | Posture |
|---|---|---|
| unfamiliar symbol or change impact | `explore_symbol_impact` | read-only |
| uncertain definition | `locate_confirm_definition` | read-only |
| any code-change diff (prepared unified diff OR ast-grep structural rewrite) | `preview_patch_checks` | preview-only Pi schema |
| symbol rename | `rename_safely` | snapshot/check execution |

The tools use one lazily started, session-scoped `semantic-code-mcp` stdio process per workspace. The process closes on Pi session shutdown. Calls return `pi.sci_composite_call.v1` details containing the workflow, transport, elapsed time, and lightweight utilization evidence.

`explore_symbol_impact` preserves SCI's progressive mode choice while separating model and operator views. `compact` sends a decision-first model projection, `standard` adds selected normalized evidence without empty audit bookkeeping, and `debug` adds a bounded, clearly labelled diagnostic summary without raw fragments. The complete producer packet is retained only as a bounded, structurally validated, disclosure-sanitized Pi custom entry, which does not participate in LLM context. Custom call/result renderers show a concise collapsed status and, when expanded, readable model and operator views; renderer failure never falls back to raw producer JSON.

Compact risk signals distinguish structurally `detected` evidence from `unknown`; conventional path/name matches remain explicitly low-confidence `namingFallback` evidence. The native validator checks per-signal reason/provenance consistency plus exact structural file/source/AST budget and omission receipts. SCI remains the schema and semantic owner and enforces fixed producer budgets (24 KiB standard details, 36 KiB debug details, 48 KiB complete packets). The bridge checks the producer byte cap before parsing, revalidates after recursive path/credential disclosure checks, and converts malformed, oversized, or unsafe producer content to bounded fail-closed JSON without retaining operator detail.

## Composite-first usage contract

```text
unknown symbol or impact -> explore_symbol_impact
uncertain definition     -> locate_confirm_definition only if explore did not confirm
rename                   -> rename_safely (never apply_rename)
code-change diff          -> preview_patch_checks (patch=unified diff, or language+pattern+rewrite)
```

Do not decompose a composite into primitive searches unless its result is insufficient. Use native Pi `read`/`edit` after the relevant files are known and for exact textual or Markdown changes.

## Prerequisite and trust boundary

Install SCI's trusted local single-user production candidate so `semantic-code-mcp` is on `PATH`. The extension starts it with:

- `SEMANTIC_CODE_WORKSPACE` and `WORKSPACE_ROOT` set to the Pi session cwd;
- protocol-clean stdio flags;
- runtime logs contained under `<workspace>/.ontology/pi-mcp/`.

The native Pi schemas intentionally omit SCI's `apply` parameters, and the bridge never enables `ALLOW_SNAPSHOT_APPLY`. These tools can create contained `.ontology` runtime state and execute caller-selected local check commands, but this package cannot apply their snapshots to the working tree. Check-command execution therefore remains risk-gated in the toolbox catalog.

At MCP connect time, the bridge compares every registered Pi schema subset with SCI's advertised schemas and fails closed on missing tools, required-field drift, property/type drift, incompatible defaults, or wider numeric bounds.

This package does not authorize hosted, network-exposed, multi-user, or public SCI operation.

### Pi Composite NEXUS v1 workspace binding

The bridge now performs a hidden `get_snapshot { nexus:true }` handshake before the first composite call. SCI mints one opaque `workspace_ref.v1`; the bridge pins the originating `ctx.cwd`, injects that reference into all five workflows, and refuses later root drift instead of closing/rebinding to another repository. The companion persists only that opaque workspace ref in a TUI-only custom entry (`pi-sci-nexus-workspace-v1`) and revalidates it on session restore. Handshake-contract failure or a changed identity fails closed with local recovery; start a target-root session instead of rebinding. Explore/locate model evidence preserves bounded workspace-state and path references. Preview/rename results preserve exact revisioned snapshot references while the native Pi surface remains preview-only.

Workspace and snapshot references are identity/lineage, not authorization tokens. They cannot select a filesystem root, do not replace SCI lexical/realpath/descriptor containment, and do not grant cross-repo access. NEXUS reasons such as `workspace_path_unresolved`, `workspace_state_changed`, and `stale_snapshot_ref` receive locally authored path-redacted recovery; unknown or malformed producer errors remain generic.

### Safe workspace-boundary recovery

All five native composites recognize SCI's allowlisted `outside_workspace` reason contract from AK #4862 / SCI commit `b4f3c96ed4fc77439390426393244362f14334b2` without matching or copying producer prose. The bridge emits locally authored model-visible recovery: use a repo-relative path in a Pi session started at the target repository root. A shell `cd` does not rebind the session's `ctx.cwd`; start a target-root Pi session instead. Obvious absolute, file-URI, Windows drive/UNC, NUL, and `..` traversal inputs fail locally for the declared repo-relative `file` and `paths` fields, while repo-relative symlinks still reach SCI so realpath containment remains final authority. Unknown, malformed, extended, secret-bearing, transport, startup, stderr, and backend errors retain generic redaction, and no rejected path or workspace path is reflected.

## Pairing with a published SCI candidate

Clone or open this repo only to install the companion. SCI itself should come from a reviewed
local tarball so `semantic-code-mcp` is on `PATH`:

1. For the NEXUS source profile, use an SCI source build containing decision-145 producer commit `a4fe097` or later and point `SCI_MCP_COMMAND` at that build's `bin/semantic-code-mcp`. The frozen published `2.1.0-rc.1` through `2.1.0-rc.3` artifacts predate the NEXUS handshake and are not compatible with this unreleased companion source. Released companion tags retain their documented historical pairings.
2. Install that archive with SCI's bundled lifecycle (`SCI_ROOT` / `versions/<version>` / `current`).
3. Prepend the activated `node_modules/.bin` directory to `PATH`.
4. Install this package from source (`pi install "$PWD"`) and `/reload`.

Start the Pi session at the trusted target repository root. A shell `cd` does not rebind `ctx.cwd`.
This pairing is still unpublished: the companion stays private and is not an npm distribution.

## Install and activate

```bash
cd packages/pi-semantic-code-intelligence
npm install
npm run check
npm run dogfood
pi install "$PWD"
```

Then `/reload` or start a fresh Pi session.

When `pi-toolbox-discovery` is installed, the owner extension registers all schemas at startup and toolbox keeps them latent:

```text
toolbox({ action: "activate", bundle: "sci", profile: "read" })
```

For snapshot/check tools, explicit operator intent and acknowledgement are required:

```text
toolbox({
  action: "activate",
  bundle: "sci",
  profile: "mutating",
  riskAcknowledged: true,
  riskJustification: "operator requested SCI preview/check workflow"
})
```

The acknowledgement fields are a caller declaration used by toolbox policy; they are not independent proof of operator consent. Follow the active operator instruction and owner authority.

## Verification

```bash
npm test
SCI_MCP_COMMAND=/absolute/path/to/semantic-code-intelligence/bin/semantic-code-mcp npm run dogfood
bash ../../scripts/package-quality-gate.sh ci packages/pi-semantic-code-intelligence
```

`npm run dogfood` creates an isolated temporary target, invokes four registered native tools through the live MCP stdio bridge, verifies schema compatibility for the five Pi composites, and proves preview workflows leave source content unchanged. Its JSON reports:

- `sciCompositeCalls`, `nativeFallbacks`, and `rawShellAvoided`;
- separate explore model/operator byte receipts and custom-entry retention;
- narrow-width call, collapsed, expanded, and durable-entry renderer assertions;
- native registration, installed-MCP contract, and preview-only assertions.

## Release posture

`releaseConfigMode=none` and `private:true` are intentional. This package is a local Pi integration for SCI's private local production candidate; it is not authorized for npm publication. The package-local release check is pack/whitelist validation only and must not run `npm publish`, including dry-run publication.
