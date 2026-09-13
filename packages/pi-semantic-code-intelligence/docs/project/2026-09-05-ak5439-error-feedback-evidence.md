---
summary: "AK5439 source and isolated transport/component proof for actionable SCI error feedback; shared runtime activation and closeout remain separate."
read_when:
  - "Reviewing AK5439 or the SCI normal-mode error corridor."
type: "evidence"
system4d:
  container: "Pi SCI companion error classification and tool-result rendering only."
  compass: "Preserve actionable failure feedback without raw diagnostic disclosure."
  engine: "Regression-first -> safe local projection -> production-mode mapper/transport -> real tool-row component."
  fog: "A passing fixture or private MCP build is not activation of the operator's current session."
---

# AK5439 error-feedback repair

## Scope and posture

Exact task5439 owns the companion projection/rendering repair. Producer task5438 owns normal-mode public error data. Task5440 owns target-root orchestration design; no root routing or bridge implementation was changed here.

The task/scope/contracts were read through the approved exclusive AK gate from the owning repo. Claim succeeded with agent `sci-error-peer-forkpeer-mtosjj6s-eff025d8`, lease `2026-09-05T23:45:01.005637968+00:00`. No failed AK command, duplicate claim, task completion, shared SCI runtime build/install/reload, global settings change or active-editor interaction was performed.

## Implementation

- All seven existing NEXUS workspace reasons are locally projected, alongside prior outside-workspace/snapshot reasons. Missing-file guidance checks file existence; identity/boundary mismatch guidance does not claim a different identity was necessarily returned.
- Failed execute paths still throw; they do not return counterfeit `isError` flags.
- The registered renderer forwards the actual host `context.isError` flag. Failure takes precedence over stale success metadata or retained packets.
- Only exact locally authored safe error messages are rendered as plaintext. Unknown, extended, prefixed or unsafe content uses a fixed redacted message. The successful-packet validator is unchanged.
- A top-level renderer catch prevents Pi's raw-text fallback if content access itself throws. No rendering path writes the editor, sends messages, retries a workflow, applies a snapshot, or starts another worker.
- Prefix-only local bridge errors are not trusted: injected `SCI NEXUS ...` or `SCI bridge workspace is immutable ...` text must match an exact known local message before it can escape the execution catch.

## Evidence

Private log root: `/home/tryinget/.local/state/pi-quests/tmp/ak5439-sci-error.f3NEx4`.

1. New renderer regression suite before implementation: **1 pass / 11 fail** (`regression-before.*`). Failures reproduced hidden known/generic errors, missing-reason projection, host-error precedence and exception escape.
2. Renderer suite after implementation: all initial twelve cases passed. A further prefix-injection regression also reproduced a throwing `Error.message` getter escaping the execution catch (`getter-regression-before.*`); message inspection now fails closed without copying the getter's thrown text.
3. Normal-mode real producer factory/adapter integration covers all seven workspace reasons with `NODE_ENV=production` and empty `DEBUG`; only error modules are imported, no analyzer or DB.
4. Isolated private MCP transport exercises missing-file and nested-Git-repository rejection. The resulting thrown errors render through Pi's actual `ToolExecutionComponent` in both collapsed and expanded views. Source fixture bytes remain unchanged; workers close before owned scratch cleanup.
5. First integration attempt exposed a fixture-only ESM resolution error (`require.resolve` against an import-only package). Corrected to `import.meta.resolve`; failed receipt retained. No production/module-export policy was changed.
6. Full `npm run check` with both opt-in integrations enabled passed: **55 tests, 55 pass, 0 fail, 0 skip**, plus local-package links, structure, existing file-budget exceptions, Biome, typecheck and offline private artifact whitelist validation. No npm publish/install ran.
7. Existing five-workflow MCP dogfood against the same private producer returned `ok=true`: successful explore/locate, non-error missing definition, safe boundary failure, patch/structural previews, state/snapshot lineage and unchanged source inventory.

Final proof uses task5438's private v2 executable `/home/tryinget/.local/state/pi-quests/tmp/sci5438-producer.UzSFHN/semantic-code-mcp-v2` (independently verified SHA256 `4f781f54adb98b72fa43d58d5295aca99f9f27eba20b59e20cb547a662a8fded`), loading private `mcp-v2/mcp.js` (SHA256 `17a82700783881ae7358cc04299af9cd86d47654f5a6fb0741bd1489f4ed5670`). It was selected only for isolated commands, never installed or selected globally. Earlier v1 integration receipts remain historical; they are not substituted for final-v2 proof.

## Commands and effects

```bash
# From package root; explicit source/private build are required, otherwise integration tests skip.
SCI_PRODUCER_ROOT=/absolute/reviewed/producer \
SCI_TEST_MCP_COMMAND=/absolute/private-build/semantic-code-mcp \
node --import tsx --test tests/sci-error-producer-contract.test.ts tests/sci-error-transport.test.ts

# Audited package gate; scratch root and network posture made explicit.
PI_EXTENSIONS_TMPDIR=<owned-scratch>/gate-tmp npm_config_offline=true \
SCI_PRODUCER_ROOT=/absolute/reviewed/producer \
SCI_TEST_MCP_COMMAND=/absolute/private-build/semantic-code-mcp npm run check

SCI_MCP_COMMAND=/absolute/private-build/semantic-code-mcp npm_config_offline=true npm run dogfood
```

Package test children are synthetic or explicitly opted-in private MCP/source fixtures. Artifact validation uses `npm pack --dry-run`, not publication. The renderer-component test initializes a process-local built-in theme without a watcher; it does not drive the live operator TUI. No society database is used by these tests.

## Remaining gates

Independent exact-diff review and parent integration approval precede any shared-runtime activation or task closeout. The source/transport/component proof above does not claim current-session activation, broader multi-repository orchestration, a version release, or universal backend-error diagnosis. Existing Node `module.register` deprecation warnings and owner-scoped pre-existing file-budget exceptions were observed, not repaired in this slice.
