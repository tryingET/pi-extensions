---
summary: "Execution-seam case fixtures for validating ASC/orchestrator boundary guardrails."
read_when:
  - "Inspecting pi-extensions governance projections, policies, or execution-seam fixtures."
---

# Execution seam casebook

Shared canonical seam scenarios for the ASC → orchestrator execution boundary.

Purpose:
- keep contract, consumer, and installed-package proof anchored to the same named cases
- turn discovered seam regressions into reusable fixtures instead of one-off prose
- grow a compounding compatibility memory without reopening the architecture split

Initial seed cases:
- `timeout-empty-output` — timeout result with empty `fullOutput` must still keep human fallback text
- `timeout-whitespace-output` — whitespace-only raw timeout output must not blank the human fallback body
- `assistant-protocol-semantic-error` — semantic assistant failure must preserve partial output and failure kind
- `assistant-protocol-parse-error` — malformed raw pi JSON output must preserve parse-error classification and body text across translation into the helper protocol seam
- `assistant-protocol-incomplete` — a clean transport exit without exactly one terminal assistant event must fail closed and preserve partial output plus incomplete-protocol classification
- `bundled-bridge-import` — installed release smoke must still see the temporary bundled ASC bridge in the isolated package copy
- `capacity-parent-not-draining` — helper protocol backpressure must remain bounded and helper-owned deadlines must terminate the helper even when the parent never drains stdout
- `capacity-dead-helper-live-raw-group` — helper death alone must not reclaim capacity while the exact detached raw Pi process group remains live; missing custody metadata stays fail-closed
- `capacity-pre-spawn-dead-owner` — an exact-token lease still in the proven pre-spawn phase may be reclaimed after owner death, while a spawn-committed/no-status lease remains blocked

Usage today:
- ASC contract tests load these cases from `packages/pi-autonomous-session-control/tests/`
- orchestrator adapter tests load these cases from `packages/pi-society-orchestrator/tests/`
- installed-package smoke loads these cases from `packages/pi-society-orchestrator/scripts/`

Add new cases when a seam bug, packaging drift, or consumer-truth edge case is learned the hard way.
