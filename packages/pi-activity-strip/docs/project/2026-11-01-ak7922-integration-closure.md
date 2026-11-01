---
summary: "Correct the truncated AK7922 source-stack integration recipe; preserve final oracle, harness hardening and artifact-receipt binding without granting execution or adoption."
read_when:
  - "Reconciling the AK7922 branch for integration after the safe Node pin route."
  - "Using the retained AK7922 INTEGRATION-RUNBOOK.md."
task_id: 8027
---

# AK7922 integration: preserve the complete qualified source stack

## Correction and boundary

The retained `ak7922-hover/evidence/INTEGRATION-RUNBOOK.md`, SHA-256
`662f67e93e0ab5d5f9ef991f77014090643b0d4067e0c5b127905e1707415038`,
stops its cherry-pick recipe at `47dacedfc`. Evidence18831 instead binds the final
native branch tip **`2e74abad282346595e67a6a4dc4508751b56d917`**.
The recipe omits its last three commits: the expiry regression oracle, harness
hardening/documentation, and final source/artifact receipt rebind. Following the
truncated recipe does not reproduce that recorded source subject.

The frozen runbook is historical evidence and remains unmodified. This supplement
corrects its source-stack completeness information; **neither document grants
current gate, landing, restart, rollback, publication or lifecycle authority**.

## Immutable historical native sequence

The following ten commits are the ordered history from base
`81304a4595c7b32058337448f07835fe9d4ecaf2` to the final tip above:

| Commit | Purpose |
| --- | --- |
| `31362ca289dabb50f12be91a7919b057d914da21` | Stationary re-entry repair and GTK oracles |
| `38da15f60bc1fc430fb610a260408d0d9debaef7` | Explicit GUI heavy-job attribution |
| `a96fe08983c6c6f7041e24bf88d193b97655749a` | Initial artifact; superseded later in this history |
| `a472e4de2495b602308046c7b1fcee483e96e6e6` | Hide-anchor expiry repair |
| `21eebeb9589c516c68814c9b6454fe7bd69f4aa8` | Artifact with expiry repair |
| `226e203259b8ad0a5cfa3543cec3b6f0523011a3` | Hover-after-hide harness precondition |
| `47dacedfc8f35395e5e010408f8acef862799918` | Heartbeat timeout handling |
| `92e959d7b6362d163f35c79f17a8f783a517333b` | **Expiry GTK regression oracle** |
| `7fd934f0a2ed77a82a39928d711df6e59025463e` | **Harness hardening and design documentation** |
| `2e74abad282346595e67a6a4dc4508751b56d917` | **Final native source/artifact receipt rebind** |

Historical stack expression for completeness checking, **not a command to run in
the canonical checkout or a substitute for current integration admission**:

```text
git cherry-pick f4447f5a9 8f3e3a5d1 31362ca289dabb50f12be91a7919b057d914da21 38da15f60bc1fc430fb610a260408d0d9debaef7 a96fe08983c6c6f7041e24bf88d193b97655749a a472e4de2495b602308046c7b1fcee483e96e6e6 21eebeb9589c516c68814c9b6454fe7bd69f4aa8 226e203259b8ad0a5cfa3543cec3b6f0523011a3 47dacedfc8f35395e5e010408f8acef862799918 92e959d7b6362d163f35c79f17a8f783a517333b 7fd934f0a2ed77a82a39928d711df6e59025463e 2e74abad282346595e67a6a4dc4508751b56d917
```

The first two commits are the separately owned AK7898/AK7960 diagnostics/docs
stack, not native commits. Reconcile their actual ancestry and current owner
subject before selecting an integration operation. If some changes are already
present, or the current base differs, do not blindly replay this expression.
Record the exact resulting combined subject and independently verify the intended
native changes, strict tests, shipped artifact and final receipt are all retained.
Never hand-merge a binary receipt. A required rebuild needs its own current scope,
safe toolchain and resource admission; this supplement authorizes none.

## Current-route preconditions, not historical permission replay

Evidence18940 selects the **normal repository full/pre-push route** for AK7675:
`scripts/ci/full.sh` using owner-verified Node22.23.4, standard heavy-job admission,
run alone. The old bespoke packet and its R1–R6 findings remain historical and
are not automatically prerequisites for that replacement route. Obtain the
current claimant's settled result and exact source/runtime bindings; this document
does not assert that the replacement gate has passed or the pin has landed.
Never execute or restore security-retired Node22.23.3 or change global defaults.

Before integration, reconcile current AK task/decision state, canonical base,
source custody, exact gate/resource sequencing and every intended component.
The AK7894 source candidate and AK8014 evidence-cleanup candidate are distinct
subjects; they are not implicitly included in a pin-alone gate or native proof.
Do not drop their obligations or count unrelated partial gates as qualification.
Canonical movement remains exclusively through `scripts/land-canonical.sh` under
current authority, not manual checkout, merge, reset or source copying.

## Proof and acceptance limits

Evidence18831 reports historical source-subject verification, not fresh safe-
toolchain or combined-root qualification. In particular:

- Preserve the strict known-RED rapid-return oracles and the positive expiry
  oracle. Evidence18750 records the operator's accepted exact-pixel/fast-return
  limitation; neither a green count nor this recipe silently resolves it.
- Keep nested host-parent GUI proof distinct from AK7454's private monitor-
  independent lane proof. Rebind any new run to the executed test image, exact
  source, resource admission and verified owned cleanup.
- Root/package/native/packed gates, actual fresh-process startup, compatible
  paired rollback and conditionally permitted live adoption remain separate
  obligations on the actual combined candidate.
- Do not follow the old runbook's binary-only emergency restore or historical
  whole-pair rollback recipe as current approval. A historical panel plus receipt
  is not a qualified controller/runtime pair; no retired Node may be restored.
- Diagnostics/source fingerprints and receipt matches establish bounded integrity
  observations, not every loaded byte, capture behavior or restartability.

## Executable source-stack regression

AK8027 retains a stdlib-only metadata checker and fixtures beside its evidence.
It reads recipe text and the immutable expected ten-commit history; it does not
execute the displayed commands, application code, gates, tests or GUI helpers.

```gherkin
Given the ten-commit native history bound by evidence18831
When the frozen recipe ending at47dacedfc is checked
Then it fails with the three omitted commits named

Given this corrected historical source-stack expression
When the same exact-order completeness check is applied
Then all ten native commits are retained in order
And deleting, duplicating or reordering a required commit fails
And passing this check does not authorize or qualify integration
```

Delivery of this source supplement and qualification of the eventual combined
candidate remain the integrator's work; a passing metadata check is not portfolio
completion. Preserve the original frozen runbook and all failed proof artifacts.
