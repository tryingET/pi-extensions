---
summary: "Package ownership and safety boundaries."
read_when:
  - "Changing package architecture or validation."
system4d:
  container: "Monorepo extension package."
  compass: "Native capture, workstation-owned inference, browser-owned setup."
  engine: "Explicit read-only actions with bounded transport and subprocesses."
  fog: "Hermetic proof must not be promoted to live owner behavior."
---

# Boundaries

Pi owns tools/commands; native Clipper owns extraction/template semantics;
workstation/lane-op owns the canonical provider contract and lifecycle;
Clipper's browser UI owns additive Interpreter configuration.

This extension owns none of those services or their secrets. It has no server,
provider registration, browser mutation, inference manager, or implicit save.
Only temporary native input files are written. See [README](../../README.md) for
usage and [native engine boundary](native-engine.md) for provenance and smoke.

Validation: package `npm run check` checks structure/release mapping, current host
pins, typecheck, adversarial tests and packaging via canonical root package gates.
Root engineering policy is adopted without a local override. AK remains at the
monorepo root; no package-local task wrappers or lifecycle operations are added.
