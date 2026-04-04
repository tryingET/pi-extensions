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
- `bundled-bridge-import` — installed release smoke must still see the temporary bundled ASC bridge in the isolated package copy

Usage today:
- ASC contract tests load these cases from `packages/pi-autonomous-session-control/tests/`
- orchestrator adapter tests load these cases from `packages/pi-society-orchestrator/tests/`
- installed-package smoke loads these cases from `packages/pi-society-orchestrator/scripts/`

Add new cases when a seam bug, packaging drift, or consumer-truth edge case is learned the hard way.
