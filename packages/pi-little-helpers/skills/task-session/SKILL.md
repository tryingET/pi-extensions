---
name: task-session
description: Discover the exact-task visible-session capability, make a native read-only plan, or inspect retained attempts. Refuses launch without compatible owner-published separate-worker configuration; never replace it with a legacy shell launcher.
system4d:
  container: "Fresh ordinary visible-task capability, not candidate/ASC authority."
  compass: "Exact provider/task fidelity and truthful blocked-state discovery."
  engine: "Capability, bounded read-only plan, independent inspection."
  fog: "Live deployment and Ghostty placement remain unverified."
---

# Visible task sessions

Use the installed `pi-task-session capability` or Pi `task_session` tool first. Public launch requires an enabled owner descriptor, independently published expected pins, valid namespace/enrollment and matching profile. The actual native worker still decides admission; no installed/live readiness is claimed. A terminal, claim, plan or shape fixture is not an admitted worker.

- `pi-task-session --help`: independent discovery, no namespace/account/DB access.
- `pi-task-session plan`: one strict JSON request on stdin; invokes the owner-native read-only planner under canonical serialization. No claim, viewer/host launch or attempt creation.
- `pi-task-session inspect [request-id]`: existing operational state only, no AK lock/DB.
- `pi-task-session watch request-id`: read-only state observations until interrupted.
- `pi-task-session classify`: whole-request DB-free lane classification. Only positively classified `outside` can preserve legacy behavior. Unknown is not outside.

Request schema: `pi.task-session.request.v1`; exact fields `requestId, akInstance, taskId, cwd, provider, model, reasoning, account, profile, objective, context, placement` plus `schema`. Use the exact requested provider/model/account labels bound by the selected owner-provisioned profile, absolute existing canonical cwd/context paths, literal objective, explicit reasoning/account/profile, and `placement:"window"`. No arbitrary executables, credentials, runtime/FD/environment/state-root overrides, batches, resume, fork, alternate account or fallback.

No installation/enrollment is implied by reading this skill. Never mint custody from a clean checkout, absent PID, empty registry or old candidate permit. Withdrawal and missing CLOSED retain exclusion. Host future-dispatch closure, started-effect disposition, and owner-native AK claim resolution are three independent retirement gates. No automatic claim recovery or relaunch.

Lane consumers use `pi-task-session identity` and `pi-task-session classify-installed`, or the matching
`taskSessionInstalledIdentity` / `classifyInstalledTaskSessionRequest` emitted core exports. The latter
accepts whole-request taskIds/cwd without a guessed AK instance. Missing canonical binding remains unknown.
`pi-task-session stop request-id` publishes a bound stop request; it does not resolve a claim or effects.

A `pi.task-session.profile.v2` may reference a private content-addressed nonexecutable model-source record.
That record binds requested labels to an explicit resolved model/provider while retaining the same OAuth
account and pinned native Codex SSE/API/endpoint. Builtin v1 profiles remain supported. No alias discovery,
model object, endpoint/header/module override or model-source publication is accepted through the tool.
Unsupported alias fit (including WS/refresh requirements) refuses; do not invent Astra mappings or downgrade.

`pi-task-session profiles` (or `task_session` operation `profiles`) lists existing private profile hashes,
exact requested/resolved identities and metadata preflight results without invoking AK or logging credentials.
This is inspection, not publication or admission. Missing profiles need separate owner publication; no
setup, namespace creation or worker activation is performed by discovery or plan.

## Separate-worker publication

The owner must separately approve the private namespace `producer.json` publication, matching profile,
complete fixed host/runtime closure and AK configuration. See the repository's
`docs/project/2026-09-07-visible-task-session-public-implementation.md` for the exact data contract.
`capability` checks the DB-free owner descriptor; it is not task claimability or placement authority.
`plan` reads the native baseline; `launchable:true` is local eligibility, not admission.
Ordinary AK `approved_binary` remains independently pinned; worker failure never selects a fallback.
Inspection/history/classification and stop do not invoke AK, including after worker withdrawal.
Never provision, enroll, publish pins or install as an implicit consequence of a discovery request.
