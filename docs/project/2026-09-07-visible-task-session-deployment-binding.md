---
summary: "Decision151 deployment binding: preserve the ordinary approved AK pin and add a separately approved task-session worker behind the same canonical owner gate/DB lock."
read_when:
  - "Implementing public producer compatibility or staging/publishing the task-session worker."
type: "implementation_plan"
task_id: 5480
---

# Decision151 — narrow deployment binding

This supplements [the implementation plan](2026-09-07-visible-task-session-implementation-plan.md) and [validation/rollout/rollback gates](2026-09-07-visible-task-session-validation-rollout-rollback.md) within [the accepted ADR](../adr/2026-09-06-visible-task-session-authority-startup.md). It is not a new task database, delegation mechanism or permission to activate.

## Decision and evidence

Independent native review resolved R1–R6 for the supported task-session implementation. Native schema40/43 and real AK/Pi internal interoperability now have explicit proof: source `4e621c977e21b886d142263138ed0e134c737b2c`, Pi evidence `817b08d799a7163bb3abc4d83e15ea675793ec5f`, and [42-case integration report](2026-09-07-visible-task-session-native-schema40-43.md), committed `fc9d115a01c68d74720090b7c4c79f68c7a37b45`; AK evidence8487 records the bounded result.

The same review identified ordinary CLI changes between the current approved pin and the new source: completion now rejects expired leases/unresolved decisions, and readiness uses stricter collectors. Those changes are not silently approved for global deployment by the D151 proof.

The operator therefore explicitly selected **“Keep ordinary AK pin; deploy a separately pinned D151 worker”** in an answered interview value returned before timeout. Canonical selection evidence8488. Preserve ordinary approved pin `cdeef5bfedcb1b19ee18921008f876ecd05eb8ca`; do not overwrite `approved_binary` as part of D151 publication.

## Owner allocation and invariant

- AK owns one additional approved **task-session worker pin**, its fixed owner entrypoints and versioned read-only capability descriptor. It uses the same authoritative database and permanent canonical admission lock as ordinary AK. No second DB/queue, alternate lock domain or broad binary broker.
- Ordinary commands continue selecting the existing approved binary. Only the explicit task-session `plan`, `supervise` and `recover` routes select the additional worker. A bounded `describe` route reports source-owner capability/configuration/pin facts without opening the database or granting task admission.
- The ordinary pin, worker pin, gateway/protocol and policy generation remain separately identified and bound. Full policy digest can bind both pin selections; the profile's worker digest must identify the binary actually executing task-session operations, not silently stand for the old ordinary CLI.
- Publication is an explicit owner operation after the existing tests, identity, rollback and custody gates. Code or an inert staged binary is not an activated worker.

Exact field spelling and descriptor schema are jointly fixed by AK and its narrow orchestrator consumer before integration. Preserve existing public request/refusal contracts; no public caller-supplied binary, FD, policy root, arbitrary command, environment or model implementation override is introduced.

## Public compatibility: replace a construction fence, not safety gates

The current unconditional producer-verification exception is an honest development fence, but cannot be the final implementation. Replace it with actual bounded compatibility checks only after the reviewed producer and consumer are connected:

1. Verify the fixed owner entrypoint/closure before invocation; consume the versioned AK-owned descriptor, not a consumer-invented interpretation of raw DB state.
2. Require supported protocol, exact executing worker/gateway/platform identities, owner configuration and the profile's pin/policy bindings. Unknown/missing/incompatible/not-enabled state refuses. Never fall back to ordinary `ak`, a source checkout, another pin/account or a test shortcut.
3. Read-only plan remains non-mutating, using the additional worker's guarded no-maintenance path under canonical serialization. It performs no reservation, directory creation, claim, spawn or provider action.
4. Launch still requires profile/resource/account/metadata preflight before effects, positive namespace/domain custody and actual T0/T1/T2/CLOSED. Compatibility is not task authority or enrollment proof.
5. Child-side compatibility, profile, phase/incarnation and deadline assertions remain mandatory. Source-review status strings and fixture passes are not runtime permits.

The source-owner descriptor and actual entrypoint wiring must be executable-testable. Avoid a circular profile/policy digest dependency when freezing publication records; preserve independent policy/profile/namespace generations and their stated owners.

## Required new regressions

- Ordinary command argv still reaches the old approved pin; explicit task-session operations reach only the separately approved worker.
- Missing/disabled/malformed worker configuration, hash/path/ABI/policy mismatch, unknown descriptor and failed owner lookup refuse without fallback or early effects.
- Plan does not mutate the full DB family or operational namespace; describe never opens a DB.
- Correct staged identities permit the public production code path in an isolated synthetic environment, without a fake native worker or injection-dependent admission logic.
- Withdrawal or worker failure does not disturb ordinary pin selection, release claims, drop occupancy/history or imply effect closure. Bulk-recovery suspension still follows actual enrollment; its permission is not inferred from worker presence.
- Default release artifacts exclude test-support controls. Inert staging uses clean committed source and the owner-approved Decision154 resource route; no live publication follows automatically.

## Remaining rollout work

Owner metadata/native-fit approval for the actual requested Astra/Codex identity; clean immutable worker and Pi artifacts; public-entrypoint/G2 proof; positive writer/trigger/candidate/effect custody in one eligible existing checkout; coordinated worker/host/profile publication; and authorized real Pi/Ghostty/provider plus second-harness canaries remain required.

Global ordinary AK upgrade is outside this binding. If later requested, its compatibility and release decision stays with the AK owner rather than being hidden inside D151 activation.
