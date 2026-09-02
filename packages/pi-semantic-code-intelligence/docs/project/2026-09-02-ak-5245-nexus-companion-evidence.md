---
summary: "AK #5245 live evidence for Pi SCI companion NEXUS workspace and snapshot references."
read_when:
  - "Closing or auditing Pi Composite NEXUS v1 companion adoption."
type: "evidence"
system4d:
  container: "Private Pi SCI companion NEXUS handshake and session-restore proof."
  compass: "Keep workspace identity opaque, TUI-only, and fail-closed."
  engine: "Handshake -> pin -> persist -> restore validate -> dogfood/live proof."
  fog: "Frozen SCI 2.1.0-rc.3 predates the handshake and is not a compatible producer."
---

# AK #5245 — Pi SCI companion NEXUS adoption evidence

Date: 2026-09-02
Decision: AK `145`
Task: AK `5245`
Producer: SCI source `a4fe0973` or later (`bin/semantic-code-mcp`)
Companion: `@tryinget/pi-semantic-code-intelligence` unreleased source

## Companion contract landed

- Hidden `get_snapshot { nexus:true, preferExisting:true }` handshake
- Immutable Pi-session `ctx.cwd` pin
- Workspace ref injected into all five producer workflows
- Model-facing `state` / `snapshotRef` preserved and validated
- Opaque `workspace_ref.v1` persisted in TUI-only `pi-sci-nexus-workspace-v1`
- Session restore revalidates identity; mismatch fails closed without host paths

## Validation

```bash
npm test
SCI_MCP_COMMAND=/home/tryinget/ai-society/softwareco/owned/semantic-code-intelligence/bin/semantic-code-mcp npm run dogfood
bash ../../scripts/package-quality-gate.sh ci packages/pi-semantic-code-intelligence
```

Observed:

- package quality gate `ci`: pass
- unit tests including `tests/sci-nexus-workspace.test.ts`: pass (6/6)
- dogfood `ok=true` with `nexusWorkspaceStable`, `nexusStateBound`, `nexusSnapshotBound`
- dogfood retained custom types: `pi-sci-nexus-workspace-v1`, `pi-sci-explore-operator-v1`
- dogfood workspace id example: `wsp_92b27a299a4a40f38c1606b04c82ac0c`

Frozen SCI `2.1.0-rc.3` remains incompatible; dogfood requires the decision-145 source MCP.

## Live installed-Pi proof

1. `pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-semantic-code-intelligence`
2. Fresh print session with `SCI_MCP_COMMAND` pointed at the SCI source MCP and `--model xai/grok-4.6 --no-session`
3. `toolbox` activate `sci` / `read`, then `explore_symbol_impact` on `nextPinnedNexusWorkspace` / `src/nexus-workspace.ts`

Observed model-visible result: `definitionConfirmed: true`, `workspaceId` prefix `wsp_`, `state.digest` starts with `sha256:`.

Preview routes were proven in dogfood (`patch_checks_in_snapshot` and `structural_patch_checks`), not in the print session.
