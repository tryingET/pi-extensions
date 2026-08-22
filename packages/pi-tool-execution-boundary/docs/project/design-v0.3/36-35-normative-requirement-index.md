## 35. Normative requirement index

The machine-readable source of truth is `requirements/requirements-v0.3.json`, which indexes 143 unique requirements split by domain under `requirements/v0.3/`.

Generated review surfaces:

- `requirements/requirements-traceability-v0.3.csv`
- the per-domain JSON fragments;
- release/test evidence generated from requirement IDs.

Every security-significant implementation change must reference at least one requirement ID. CI must fail when a referenced ID is unknown, a required fragment is missing, the declared total differs from the loaded total, or duplicate IDs exist.

The domains are:

```text
ARCH ATTEST BOOT CACHE CELL COMPAT COV DATA DB DEBUG DUR IMG IR LEASE LIFE OBS
OUT PERF PI POL PRESS PRIV PROM PROTO QA RES RET SOCK SRC SRCART STOR SUP TEST
TRUST UPG UX VFS WS
```

The human summary is intentionally generated from the structured requirement corpus rather than maintained as a second normative list.
