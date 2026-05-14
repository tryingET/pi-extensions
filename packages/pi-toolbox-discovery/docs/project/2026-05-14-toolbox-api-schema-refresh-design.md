---
summary: "Design membrane for toolbox activation visibility and API/tool schema refresh semantics."
read_when:
  - "Changing pi-toolbox-discovery activation semantics."
  - "Debugging toolbox activate versus API/RPC/model-callable tool visibility."
system4d:
  container: "pi-toolbox-discovery activation boundary."
  compass: "Make tool activation truthful, bounded, and visible on the next applicable provider turn without overstating host API powers."
  engine: "Evidence -> state model -> contract -> tests -> bounded implementation."
  fog: "Confusing registered, active, prompt-visible, provider-schema-visible, and client-schema-visible tools causes false claims of activation."
---

# Toolbox API/schema refresh design membrane — 2026-05-14

## Current state / evidence

- `packages/pi-toolbox-discovery/extensions/toolbox.ts` does not import owner packages. It only plans, risk-gates, and calls `pi.setActiveTools(...)` for tools already present in `pi.getAllTools()`.
- Pi host docs state that `pi.registerTool()` can run after startup and that `pi.setActiveTools()` manages active tools at runtime. Installed host code (`dist/core/agent-session.js`) rebuilds the internal active tool list and base system prompt in `setActiveToolsByName(...)`.
- The same host code sends `before_agent_start` the rebuilt system prompt/options for a future prompt, and agent-core receives `agent.state.tools` for provider requests. It cannot retroactively change a provider request that has already been sent.
- `toolbox` currently says broadly that Pi loads/registers tool schema once at startup. That is too broad for Pi core generally, but true for toolbox-owned behavior because toolbox intentionally refuses to dynamically import/register owner tools.
- Lease TTL previously expired on `turn_start` with `expiresAtTurn <= state.turn`. A `ttlTurns: 1` activation performed during a tool call could be removed at the very next model turn before the model had a chance to use the activated tool.
- Dynamic activation changes the provider tool-schema prefix. That can create a prompt-cache miss/write for the first request under a new active-tool combination, but cache reuse resumes for later requests with the same combination.

## Reconstructed objective

Make `toolbox activate` provide API/toolbox parity with interactive slash-command dispatch as far as this extension truthfully can:

1. If requested tools are registered, activation updates Pi's active tool set immediately and must survive the next applicable provider/model turn.
2. If activation changes the active set, queue a same-task continuation so Pi can issue the next provider/model request with the refreshed active-tool schema without requiring the operator to type `go`.
3. If requested tools are missing from `pi.getAllTools()`, fail closed with an owner-extension install/reload requirement.
4. Messaging must distinguish:
   - owner tool registration;
   - active-tool selection;
   - prompt/provider-schema visibility on the next provider request;
   - impossibility of retroactively changing the already-issued provider request or an external client schema snapshot.

## Owner / authority boundaries

- `pi-toolbox-discovery` owns catalog discovery, risk gates, active-set changes, leases, and user-visible diagnostics.
- Owner packages (`pi-vault-client`, `pi-society-orchestrator`, etc.) own actual tool registration and behavior.
- Pi core owns whether provider requests are rebuilt dynamically and whether RPC/client protocols expose a tool-schema refresh event. This package should not mutate installed Pi core.
- External API harnesses that snapshot tool schemas outside Pi may require a reload/new session; toolbox can only report that limitation precisely.

## Active-tool / schema state model

Tool visibility has separate states:

1. **registered**: present in `pi.getAllTools()`; executable definition exists in the current Pi runtime.
2. **active**: present in `pi.getActiveTools()` and `agent.state.tools` after `pi.setActiveTools(...)`.
3. **prompt-visible**: included in the rebuilt system prompt/options for the next applicable model/provider request.
4. **provider-schema-visible**: included in the tool schema for a provider request created after activation.
5. **external-client-callable**: exposed by an outer API/client protocol. This may be a static snapshot outside toolbox control.

`toolbox activate` can move a tool from registered to active, next-request prompt/provider visible, and queue a continuation request after the current tool result. It cannot create missing registrations and cannot mutate a provider/client schema that has already been sent.

## Trust / security model

- Keep the existing risk gate: mutating, external-mutation, and orchestrator-gated tools require `riskAcknowledged=true` and a non-empty `riskJustification`.
- Treat non-catalog explicit tools as high-risk external-mutation unless acknowledged.
- Missing registered tools remain a fail-closed installation/reload problem.
- Do not dynamically import arbitrary owner packages from toolbox; that would bypass owner extension startup policies and increase supply-chain risk.
- Do not impersonate the operator when continuation is needed. Queue an extension-origin custom message, not a user-authored command.

## UX / API / DX contract

Successful activation should say:

- active set updated now;
- activated tools are intended for the next provider/model request after the toolbox result;
- the current already-issued provider request cannot be retroactively changed;
- a same-task continuation was queued when the active set changed, or why it was not queued;
- cache impact is bounded to the first request for a new active-tool combination, with later reuse for stable combinations;
- if an outer API session still does not expose the tool as callable, enable/install owner extension and `/reload` or start a fresh session.

Failed activation should say:

- exact missing tools;
- exact owner/reload requirement;
- toolbox did not change active tools for the missing request.

TTL semantics should mean `ttlTurns: 1` keeps a just-activated tool available for one future model turn, then expires before the following turn.

## Failure / rollback model

- If activation fails because any requested tools are missing, do not partially activate the subset. Return `ok:false` with exact missing tools.
- If activation succeeds but the client cannot see the tool, the rollback is `toolbox({ action: "deactivate", ... })` or waiting for TTL expiry; client schema recovery is `/reload` or a fresh session.
- If a continuation is unwanted, pass `autoContinue: false`; if a continuation was already queued, it is non-authoritative extension context and should only continue the previous objective.
- If TTL behavior regresses, tools may either disappear before use or linger too long. Tests pin the one-future-turn behavior.

## Adversarial test plan

- Activation updates active tool set and returns a precise next-provider-request visibility contract.
- Activation that changes the active set queues exactly one same-task continuation with `deliverAs: "steer"` and `triggerTurn: true`.
- Activation that is a no-op or passes `autoContinue: false` does not queue continuation.
- `ttlTurns: 1` survives the next `turn_start` and expires only before the following turn.
- Activation during an existing turn survives the next provider turn before TTL expiry.
- Missing registered tools fail closed with install/reload language and no active-set mutation.
- Mixed registered+missing requests do not partially activate the registered subset.
- Broad/mutating/orchestrator activation remains blocked without risk acknowledgement and justification.
- Doctor/status wording distinguishes missing registration from active-set/lease problems.
- README codifies the dynamic-refresh boundary without falsely claiming toolbox can register owner tools.

## Implemented bounded slice

- Changed TTL expiry from `expiresAtTurn <= currentTurn` to `expiresAtTurn < currentTurn`, so a just-activated tool remains available for one future provider/model turn.
- Added activation result details under `schemaVisibility` to make next-request versus retroactive/client-snapshot behavior machine-visible.
- Added `autoContinue` activation control and extension-origin same-task continuation when activation changes the active set.
- Added activation result details under `continuation` and `cacheImpact` to make same-task refresh and cache tradeoffs machine-visible.
- Reworded plan, doctor, activation failure, activation success, and README text to distinguish owner registration from active-set selection, external client schema snapshots, continuation behavior, and cache impact.
- Added tests for next-request visibility messaging, no partial activation on mixed missing requests, activation-during-turn TTL behavior, continuation queueing, no-op continuation suppression, and `autoContinue: false`.
