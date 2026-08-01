---
summary: "Threat model, admission rules, and explicit non-sandbox boundary for pi-code-mode."
read_when:
  - "Activating code mode or changing confirmation, worker, capability, or subprocess behavior."
  - "Reviewing non-interactive use or adding a mutating/network/orchestration adapter."
system4d:
  container: "Local arbitrary-code execution risk boundary."
  compass: "Make authority and admissions visible; fail closed where UI approval is unavailable."
  engine: "Activation -> per-call confirmation -> bounded worker -> explicit capability effects -> close/reset."
  fog: "A child process or VM context can be mistaken for a secure sandbox."
---

# Security model

## Threat statement

`eval` executes model-supplied code with the invoking user's operating-system permissions. A child process limits lifecycle damage to the Pi process, but it does not provide a hostile-code security boundary.

Installing and activating this package grants a model a general local-code execution surface comparable in authority to Bash.

## Defaults

- code mode does not disable or override model-facing Bash;
- every eval requires interactive confirmation;
- non-interactive execution is denied;
- wall-clock timeout defaults to 30 seconds and is capped at 120 seconds;
- abort or timeout terminates the selected worker;
- a disposable protocol broker bounds worker frames before they reach the long-lived Pi host;
- worker control traffic uses a dedicated descriptor, every frame is runtime-shape validated, and result commit requires a host-issued finalization exchange;
- worker stdout/stderr capture, serialized result transport, and final model-visible output are bounded;
- JSON-compatible logical state has a hard 1,000,000-byte commit limit; invalid or oversized state does not replace the last committed state;
- default bridge effects are `read` and `process`;
- filesystem bridge operations reject paths outside `ctx.cwd`, including resolved symlink escapes;
- `read_text` enforces a hard 1,000,000-byte ceiling even when code requests a larger `maxBytes`;
- process bridge execution uses an executable and argument array with `shell: false` and terminates the spawned POSIX process group on abort/timeout.

## Important limitation

Capability effect admission governs only calls made through `tool.*`. It does not govern arbitrary language operations:

- Python may import `os`, `subprocess`, networking modules, or other installed libraries.
- JavaScript receives a narrowed VM context, but Node's VM is not treated as a security sandbox.

Therefore effect metadata supports review, adapter admission, and observability; it is not a claim that untrusted code cannot bypass the registry.

The broker and finalization exchange prevent ordinary stdout from being interpreted as control traffic, bound malformed/flooded frames away from the Pi host, and reject direct worker exit after a provisional result. They are lifecycle and resource-integrity defenses, not tamper-proof isolation from code deliberately inspecting inherited descriptors or same-user process internals.

## Adapter requirements

An additional capability must:

1. declare its strongest truthful effect;
2. validate input at its owner boundary;
3. honor the supplied abort signal;
4. preserve owner receipts and error semantics;
5. avoid embedding secrets in results or worker messages;
6. remain disabled unless its effect is in `allowedCapabilityEffects`;
7. use the owner package's public execution API rather than private Pi handler maps.

Mutating, network, or orchestration adapters require explicit package configuration. Registration alone does not admit their effects.

The runtime aborts each eval-owned signal on cancellation or timeout, but it cannot forcibly stop an arbitrary host-side promise. A custom adapter that ignores the signal may continue after the worker is gone and violates this package contract. Default `run_process` honors abort by terminating the child process with escalation.

## Non-interactive use

`allowNonInteractive: true` is an embedding decision, not a safe default. An embedding extension enabling it must provide its own admission boundary, such as a controlled CI manifest or an operator-approved toolbox profile.

## Not provided

This package does not provide:

- Linux namespace/seccomp isolation;
- container, VM, or microVM isolation;
- network filtering;
- secret redaction from arbitrary code;
- package/module import allowlisting;
- generic Pi permission-hook coverage for nested operations.

Use an actual sandbox execution environment if hostile-code isolation is required.
