---
name: task-session
description: Discover the exact-task visible-session capability, make a DB-free read-only plan, or inspect retained attempts. Refuses launch while native AK verification is blocked; never replace it with a legacy shell launcher.
system4d:
  container: "Fresh ordinary visible-task capability, not candidate/ASC authority."
  compass: "Exact provider/task fidelity and truthful blocked-state discovery."
  engine: "Capability, bounded read-only plan, independent inspection."
  fog: "Native AK verification remains blocked; installed custody is unverified."
---

# Visible task sessions

Use the installed `pi-task-session capability` or Pi `task_session` tool first. The production host/bootstrap/profile/viewer paths are implemented and tested synthetically, but **public launch remains gated** on native AK verification and approved installation/pins. A terminal, claim, plan or shape fixture is not an admitted worker.

- `pi-task-session --help`: independent discovery, no namespace/account/DB access.
- `pi-task-session plan`: one strict JSON request on stdin; no claim, spawn or attempt creation.
- `pi-task-session inspect [request-id]`: existing operational state only, no AK lock/DB.
- `pi-task-session watch request-id`: read-only state observations until interrupted.
- `pi-task-session classify`: whole-request DB-free lane classification. Only positively classified `outside` can preserve legacy behavior. Unknown is not outside.

Request schema: `pi.task-session.request.v1`; exact fields `requestId, akInstance, taskId, cwd, provider, model, reasoning, account, profile, objective, context, placement` plus `schema`. Use exact `openai-codex` identity, absolute existing canonical cwd/context paths, literal objective, explicit reasoning/account/profile, and `placement:"window"`. No arbitrary executables, credentials, runtime/FD/environment/state-root overrides, batches, resume, fork, alternate account or fallback.

No installation/enrollment is implied by reading this skill. Never mint custody from a clean checkout, absent PID, empty registry or old candidate permit. Withdrawal and missing CLOSED retain exclusion. Host future-dispatch closure, started-effect disposition, and owner-native AK claim resolution are three independent retirement gates. No automatic claim recovery or relaunch.

Lane consumers use `pi-task-session identity` and `pi-task-session classify-installed`, or the matching
`taskSessionInstalledIdentity` / `classifyInstalledTaskSessionRequest` emitted core exports. The latter
accepts whole-request taskIds/cwd without a guessed AK instance. Missing canonical binding remains unknown.
`pi-task-session stop request-id` publishes a bound stop request; it does not resolve a claim or effects.
