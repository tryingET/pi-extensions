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

## Native tools

| Intent | Native tool | Posture |
|---|---|---|
| unfamiliar symbol or change impact | `explore_symbol_impact` | read-only |
| uncertain definition | `locate_confirm_definition` | read-only |
| prepared unified diff | `patch_checks_in_snapshot` | snapshot/check execution |
| syntax-shaped transformation | `structural_patch_checks` | preview-only Pi schema |
| symbol rename | `rename_safely` | snapshot/check execution |
| general patch preview/check | `safe_write` | preview-only Pi schema |

The tools use one lazily started, session-scoped `semantic-code-mcp` stdio process per workspace. The process closes on Pi session shutdown. Calls return `pi.sci_composite_call.v1` details containing the workflow, transport, elapsed time, and lightweight utilization evidence.

`explore_symbol_impact` exposes SCI's progressive response modes directly: `compact` is the default decision-only packet, `standard` adds normalized bounded evidence, and `debug` adds bounded/redacted diagnostics and raw fragments. SCI enforces the output contracts and fixed detail budgets (24 KiB standard, 48 KiB debug); this Pi schema only makes the same mode choice discoverable and forwards it unchanged.

## Composite-first usage contract

```text
unknown symbol or impact -> explore_symbol_impact
uncertain definition     -> locate_confirm_definition
rename                   -> rename_safely
structural transformation -> structural_patch_checks
prepared patch           -> patch_checks_in_snapshot or safe_write
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
npm run dogfood
bash ../../scripts/package-quality-gate.sh ci packages/pi-semantic-code-intelligence
```

`npm run dogfood` creates an isolated temporary target, invokes three registered native tools through the live MCP stdio bridge, verifies schema compatibility for all six composites, and proves the preview-only `safe_write` path leaves source content unchanged. Its JSON reports:

- `sciCompositeCalls`
- `nativeFallbacks`
- `rawShellAvoided`
- native registration and installed-MCP contract assertions

## Release posture

`releaseConfigMode=none` and `private:true` are intentional. This package is a local Pi integration for SCI's private local production candidate; it is not authorized for npm publication. The package-local release check is pack/whitelist validation only and must not run `npm publish`, including dry-run publication.
