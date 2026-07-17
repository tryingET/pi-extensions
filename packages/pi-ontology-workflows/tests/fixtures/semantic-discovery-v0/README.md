---
summary: "Provenance for ROCS semantic-discovery v0 fixtures used by the package verifier tests."
read_when:
  - "Refreshing or reviewing pi-ontology-workflows semantic protocol fixtures."
type: "test-fixture-provenance"
system4d:
  container: "Test-only package fixture provenance."
  compass: "Keep ROCS verifier fixtures exact, portable, and non-authorizing."
  engine: "Verify release identity and hashes before atomic fixture refresh."
  fog: "Fixture drift or machine-local lookup can create false protocol confidence."
---

# ROCS semantic-discovery v0 fixtures

These files are exact test-only copies from `core/rocs-cli` release `v0.2.1`, commit `c0cfb1297ba78f4ca1fe53f488bcb15ad79b7843`:

```text
docs/project/semantic-discovery-v0/golden-fixtures.json
docs/project/semantic-discovery-v0/differential-fixtures.json
```

Retained SHA-256 values:

```text
f79db9a05d1cb2335aaac00c167f27fdd56025fc308f237a6c73403e0be287c7  golden-fixtures.json
b6aee4c0486a5ae370ff6382a369c7d1263900b2e9d81a74e83937f0b8f81baf  differential-fixtures.json
```

Vendoring keeps package and CI tests deterministic without treating a machine-local sibling checkout as runtime authority. Refresh only from a verified ROCS release and update both hashes atomically.
