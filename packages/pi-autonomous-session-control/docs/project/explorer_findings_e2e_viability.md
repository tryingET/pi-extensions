---
summary: "Explorer findings snapshot for tactical goal #1 (end-to-end viability) under workflow_* schema fallback conditions."
read_when:
  - "Running explorer lane for fallback workflow execution."
system4d:
  container: "Explorer artifact"
  compass: "Capture current code/test reality with exact paths and smallest safe next step."
  engine: "Inspect implementation + regression coverage + runtime constraints -> emit deterministic transition recommendation."
  fog: "Looping on queue/fork commands without producing file-level evidence."
---

# Explorer findings — E2E viability (fallback mode)

## Objective
Prove end-to-end viability on a real change while `workflow_*` tool actions are unavailable in the currently loaded tool schema.

## Concrete reality observed

1. **Real repository change exists for fallback viability**
   - Added command compatibility bridge module:
     - `extensions/autonomy-control/register-control-command.ts`
   - It routes `/autonomy-control` payloads with
     - legacy branch ops (`op: fork|tree`) and
     - workflow actions (`action: workflow_start|workflow_advance|workflow_status|workflow_stop`).

2. **Parser + types support mixed payload modes**
   - `extensions/autonomy-control/helpers.ts`
     - `parseControlPayload(...)` now accepts both op-based and workflow action payloads.
   - `extensions/autonomy-control/types.ts`
     - Added `WorkflowControlAction`, `WorkflowControlPayload`, `AutonomyControlPayload`.

3. **Extension wiring uses modular command registration**
   - `extensions/autonomy-control.ts`
     - `/autonomy-control` command moved to `registerAutonomyControlCommand(...)`.

4. **Regression coverage exists for fallback bridge**
   - `tests/autonomy-control.command-compat.test.mjs`
     - verifies workflow-start payload via command path,
     - verifies unsupported action rejection.

5. **Quality gate currently green**
   - `npm run check` pass: **35/35 tests**.

## Runtime constraint still active

- Direct tool action calls (`autonomous_session_control` with `action: workflow_*`) remain schema-rejected in this loaded session context.
- Therefore operational fallback remains: `/autonomy-control {"action":"workflow_*", ...}`.

## Smallest safe delta assessment

- **No additional runtime behavior change is required in this explorer step.**
- The minimal safe delta for fallback viability is already implemented and covered by tests.

## Risks

1. Operator confusion when tool schema and repository runtime drift.
2. Status observability still depends on whether the loaded environment reflects latest extension build.

## Deterministic next transition recommendation

Move to **architect** lane to lock execution protocol and role sequencing for fallback mode:

1. Treat command-compat path as canonical fallback contract when `workflow_*` tool actions are unavailable.
2. Keep consent/E2E gates as explicit `pass|fail` decisions in prompts.
3. Continue phase progression using fallback commands until done/block.

## Files read (this explorer pass)

- `extensions/autonomy-control/register-control-command.ts`
- `extensions/autonomy-control/helpers.ts`
- `tests/autonomy-control.command-compat.test.mjs`
- `extensions/autonomy-control.ts`
- `extensions/autonomy-control/types.ts`

## Files touched (this explorer pass)

- `docs/project/explorer_findings_e2e_viability.md`
