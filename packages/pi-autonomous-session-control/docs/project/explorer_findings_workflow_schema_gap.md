---
summary: "Explorer findings: workflow_* schema gap between repository code and loaded runtime tool surface."
read_when:
  - "Investigating why workflow_start/workflow_status calls fail at runtime despite passing tests."
system4d:
  container: "Explorer artifact"
  compass: "Capture concrete evidence and smallest safe delta."
  engine: "Inspect code + tests + runtime behavior -> isolate invariant gap -> propose deterministic next step."
  fog: "Assuming code is broken when issue may be loaded-schema/runtime drift."
---

# Explorer findings — workflow schema gap

## Scope
Objective: **Prove end-to-end viability on a real change**.
Focus: why `workflow_*` actions fail in the currently loaded session while repository tests pass.

## Evidence (code + runtime)

1. `extensions/autonomy-control/register-tool.ts`
   - Tool schema includes:
     - `workflow_start`
     - `workflow_advance`
     - `workflow_status`
     - `workflow_stop`
   - Runtime routing includes `handleWorkflowStateMachineAction(...)`.

2. `extensions/autonomy-control/workflow-state-machine.ts`
   - Implements explicit workflow run state transitions, consent gate (`pass|fail`), and E2E gate (`pass|fail`).

3. `tests/autonomy-control.workflow-state-machine.test.mjs`
   - Covers start/advance/status/stop paths and branching constraints.

4. Runtime behavior in current session
   - Direct tool calls with `{"action":"workflow_start"...}` and `{"action":"workflow_status"}` fail schema validation.
   - Non-workflow actions (e.g. `status`, `queue_fork`, `queue_parallel_roles`) succeed.

5. `extensions/autonomy-control.ts` + `extensions/autonomy-control/helpers.ts`
   - Slash command `/autonomy-control` currently parses only `{"op":"fork"|"tree", ...}` payloads.
   - It does **not** accept `{"action":"workflow_*", ...}` payloads.

## Key invariants

- Repository code + tests indicate workflow state-machine support is implemented.
- Loaded runtime tool schema in this session does not currently expose `workflow_*` actions.
- Existing fallback orchestration via queue actions works (`queue_fork`, `queue_parallel_roles`, role lanes).
- Current command-level fallback is limited to fork/tree payloads.

## Risks

- Operator confusion: docs/tests claim workflow API support while active runtime may reject workflow actions.
- Deterministic flow execution risk: inability to issue `workflow_status` blocks inspectable state-machine progression in affected sessions.

## Smallest safe delta recommendation

Add a **command-level compatibility bridge** in `/autonomy-control`:

- Accept payloads containing `action` (at least `workflow_start|workflow_advance|workflow_status|workflow_stop`).
- Route those actions through the same handlers used by the tool path.
- Keep legacy `{op: fork|tree}` payload behavior unchanged.
- Add focused regression coverage for command payload compatibility.

This preserves action-contract compatibility while providing a deterministic fallback when tool schema refresh lags.

## Next deterministic step

Transition to **architect** role for a minimal design patch:

1. Define command payload union (`op` legacy + `action` workflow).
2. Specify routing and context shim strategy for command handler.
3. Enumerate tests + doc deltas (`README.md`, `docs/dev/status.md`, `CHANGELOG.md`).
