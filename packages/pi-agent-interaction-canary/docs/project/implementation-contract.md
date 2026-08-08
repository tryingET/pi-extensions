---
summary: "Implementation contract for the injected-receipt-only Agent Interaction canary."
read_when:
  - "Changing canary acquisition, authority, redaction, expansion, or provenance behavior."
system4d:
  container: "Bounded experimental canary contract."
  compass: "Preserve owner authority and fail closed on receipt or binding drift."
  engine: "Validate owner receipt -> apply consumer policy -> return compact or bound expansion."
  fog: "A passing named canary does not establish general compatibility or caller authentication."
---

# Implementation contract

This canary is removable as one isolated package and has no shared registration. It consumes complete injected owner receipts only. It exposes only receipt validation and transient projection; it does not acquire owner data, persist state, or record evidence.

## Owner adapters

- **ts-quality P1 retention:** exact current schema-4 pilot receipt and immutable owner policy joins.
- **Agent Kernel P2 task projection:** exact current schema-3 / policy-v2 pilot receipt, authorized task expansion, source coordinate, immutable owner policy, and task-ID/source-ID equality.
- **ROCS owner packet:** closed canary packet carrying a digest-valid semantic pack result.

The consumer binding covers provider, owner, source identity, owner generation, owner source digest, owner policy digest, consumer policy, and payload. Expansion requires exact source identity, generation, source digest, and policy digest from compact output.

Pointer construction is redaction-aware. Redacted key ancestors withhold every descendant from compact and expansion. Policy-withheld values cannot be recovered through this package.

## Evidence boundary

Checked-in compatibility fixtures were generated once from the current P1/P2 owner sidecars. Tests prove adapter compatibility and adversarial rejection hermetically; they do not execute either owner implementation. Live Pi install/reload and live injected calls remain owner-deferred by the task constraint.

## Execution provenance

Results identify the extension entry, tool, and command and classify only the observed handler entry. This observation is not cryptographic caller authentication. Owner `declared_policy_target` fields are policy coordinates only; they never become authenticated-caller claims in Pi output.
