# Release evidence custody in Agent Kernel

`release_evidence_ak_adapter` validates one retained `pi.release-evidence.v1` closure and prepares or explicitly records a bounded Agent Kernel evidence entry.

## Why Agent Kernel needs no release-specific database extension

Agent Kernel already owns the durable runtime evidence ledger and accepts a typed `check_type`, result, optional task, and structured details through `ak evidence record`. The release adapter therefore keeps release-schema validation in the producing integration and uses the generic AK ledger only for custody and lineage. This avoids teaching the storage kernel that a release claim is semantically true.

## Actions

- `plan` is the default. It validates the evidence closure, returns the exact `ak evidence record` arguments, and performs no mutation.
- `record` repeats the validation and explicitly invokes Agent Kernel against the supplied repository root and configured AK database.

The adapter verifies canonical JSON, sidecars, package/source identity, subject and local-artifact size/digests, the artifact-manifest binding, and the SPDX subject checksum. A recorded `pass` means only that those custody checks passed.

It does **not** establish package safety, vulnerability absence, semantic correctness, compliance, adoption, KES acceptance, or engineering-content promotion.

## Pi tool example

```json
{
  "evidence_path": "/path/to/npm-pi-telemetry-0.3.0/tryinget-pi-telemetry-0.3.0.tgz.evidence.json",
  "artifact_ref": "github-release://tryingET/pi-extensions/pi-telemetry-v0.3.0/release-evidence",
  "repo_root": "/home/user/ai-society/softwareco/owned/pi-extensions",
  "action": "plan"
}
```

Review the returned `akEvidenceEntry`, `akArgs`, and authority ceiling before changing the action to `record`. An optional `task_id` binds custody to an existing AK task; omitting it records repository-scoped evidence.

## Relationship to telemetry and KES

The telemetry/KES adapter continues to produce an inert `pi-telemetry-review-snapshot-v1` AK handoff. It does not call AK. The existing `evidence_record` surface can record that reviewed handoff explicitly. Release evidence uses the dedicated adapter because its retained closure includes multiple linked files and requires package, source, artifact, and SPDX cross-checks before custody.

No custody operation promotes a KES candidate or shared engineering content. Those remain separate owner decisions.
