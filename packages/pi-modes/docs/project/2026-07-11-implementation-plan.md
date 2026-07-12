---
summary: "Implementation and rollout plan for safe prompt-mode switching."
read_when:
  - "Implementing or reviewing the initial pi-modes package."
  - "Planning live activation or later autonomy integration."
system4d:
  container: "Delivery plan for the initial prompt-mode package."
  compass: "Land safe prompt composition first and defer autonomous execution to its owners."
  engine: "Scaffold -> kernel -> adapter -> docs -> tests -> live activation."
  fog: "A broad autonomy ambition can widen a bounded prompt-mode implementation."
---

# Implementation plan

## Immediate implementation

1. **Scaffold the package from `pi-extensions-template`.**
   - Keep `.copier-answers.yml` tracked.
   - Align the package with the pinned Earendil Pi host contract.
2. **Land a testable prompt-mode kernel.**
   - Versioned JSON schema.
   - `append`, `replace_base`, and `replace_final` composition.
   - Global/project/builtin precedence with project-trust gating.
   - Per-file diagnostics, safe paths, atomic writes, and session state replay.
3. **Land the Pi extension adapter.**
   - `/mode`, `/mode-status`, `/mode-preview`, `/mode-new`, `/mode-edit`, `/mode-delete`.
   - Footer status and `before_agent_start` composition.
   - Explicit `PI_MODE=<key|off>` launch selection without introducing a parallel project-default file.
   - Preserve native `<project>/.pi/SYSTEM.md` and `~/.pi/agent/SYSTEM.md` behavior whenever no named mode is active.
   - No continuation, dispatch, campaign, or authority behavior.
4. **Add examples and operator documentation.**
   - One example for each strategy.
   - Explain the difference between base and final replacement.
   - Make the package discoverable from root package maps and the runtime capability map.
5. **Verify.**
   - Unit tests for composition, precedence, malformed files, trust, traversal, persistence, replay, and launch-variable parsing.
   - Package `npm run check` and root package gate.
   - Install the local package, reload Pi, and exercise a real `/mode` flow before claiming live activation.

## Follow-up: upstream composition seam

Propose or contribute a public Pi host builder for reconstructing a custom base from `BuildSystemPromptOptions`. Add a compatibility-canary scenario, then remove the parity implementation only after live proof.

## Deferred autonomy phases

Autonomy is intentionally not implemented by `/mode`.

1. Emit a non-authoritative, hashed mode-activation snapshot.
2. Qualify mode profiles through `pi-evalset-lab`.
3. Add an orchestrator-owned, plan-only autonomy route decision.
4. Route explicit supervised execution to ASC or visible-loop owners.
5. Route measured recursive improvement to `pi-autoresearch`.
6. Keep continuation, durable writes, finalization, cleanup, and promotion under separate explicit gates.

The read-only scout architecture packet for this work recommends that mode activation never carry an execute bit, objective, budget, or authority token.

## Rollback

- `/mode off` restores the host-assembled prompt for subsequent turns.
- Removing or disabling the package leaves Pi's native `--system-prompt`, `SYSTEM.md`, and `APPEND_SYSTEM.md` behavior unchanged.
- Custom mode files are plain JSON and do not modify project or global Pi system-prompt files.
