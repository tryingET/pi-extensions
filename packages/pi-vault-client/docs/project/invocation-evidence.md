---
summary: "Submission receipts and unknown initial outcomes in Vault execution records."
read_when:
  - "Changing execution logging, submission receipt finalization or outcome interpretation."
type: "reference"
system4d:
  container: "Pi template submission and canonical Vault execution records."
  compass: "Keep invocation proof separate from assessed requested work."
  engine: "Record submission identity with NULL success, then allow explicit feedback."
  fog: "A finalized submission receipt does not prove generation, acceptance or improvement."
---

# Invocation evidence

The client logs a template when its prepared submission is finalized. That proves
submission identity, selected model and context; generation and task outcome are
still unknown. New rows therefore begin with SQL NULL in `success`, preserving
the existing nullable schema. Local receipt `finalized` describes submission
recording, not accepted work. Receipt identity, replay and authorization checks
retain their existing contracts.

Explicit later feedback can supply a reported success/failure judgement. Actual
artifact acceptance and measured benefit require their own source-owned checks
and appropriate evidence. Historical flags are preserved; missing output or zero
tokens alone cannot classify past runs.
