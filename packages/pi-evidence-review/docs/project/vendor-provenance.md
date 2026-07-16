---
summary: "Provenance and review hashes for the vendored SCI evidence review v1 contract artifacts."
read_when:
  - "Reviewing schema or fixture lineage for pi-evidence-review."
system4d:
  container: "Vendored SCI v1 schema and fixture lineage."
  compass: "Keep reviewed bytes exact and auditable."
  engine: "Canonical source -> byte copy -> SHA-256 -> consumer tests."
  fog: "A vendored copy is neither producer authority nor permission to drift the schema."
---

# Vendored SCI evidence review v1 provenance

Vendored on 2026-07-12 from the canonical checkout at `/home/tryinget/ai-society/softwareco/owned/semantic-code-intelligence` for authorized AK task 3843. These copies are validation inputs, not permission to modify SCI or reinterpret raw producer data.

| Vendored path | Canonical source | SHA-256 |
|---|---|---|
| `schemas/evidence-review-v1.schema.json` | `schemas/evidence-review-v1.schema.json` | `f964b852b0bb82593402c8390308da0d12366313c9029ce83b348d65af9ef958` |
| `tests/fixtures/valid.json` | `tests/fixtures/evidence-review-handoff-valid.json` | `01189f79426e3fce466e188cda95cf7bac3fafd4f66af060e04c529876fcf0e9` |
| `tests/fixtures/adversarial.json` | `tests/fixtures/evidence-review-handoff-adversarial.json` | `f06c9b59216e0772e51b44036557792fb771cfb5e3fe8799101bbccfa444a078` |
| `tests/fixtures/current-producer-sample.json` | `tests/fixtures/evidence-review-claim-model-sample.json` | `acf53f703645f7c3edc3a245199db1f6d182e7f96fe2fb309be1090a96544e9d` |

The schema is intentionally generated/contract-sized above the normal package file budget. It is kept byte-exact and excluded from manual formatting; changing it requires coordinated SCI/consumer review and refreshed hashes.
