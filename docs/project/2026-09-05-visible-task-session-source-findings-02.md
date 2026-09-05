---
summary: "Source-bound revision02 evidence: claim commit-before-read failure, mutable authority inputs, Pi CLI load-error correction and mandatory task-mode integration seams."
read_when:
  - "Verifying Decision151 revision02 source claims and remaining owner dependencies."
type: "evidence_note"
task_id: 5451
---

# Visible task sessions — revision02 source findings

## Provenance and limits

Two read-only scouts investigated source contracts, not RFC legality or owner acceptance:

- AUTH/EXCL: `scoutpeer-mtow6t40-fff94942`, session `01a07376-b21a-772a-9cfd-bea04f66ffe1`, FINAL communication `904a5362-a859-4bbf-9fbe-3c5796dc8dec`, plus requested concurrency clarification.
- BOOT: `scoutpeer-mtow6t3t-c8b77726`, session `01a07376-ae0c-7a33-a4cf-45baf2354dfc`, FINAL communication `cc88a51a-4bca-4865-bbaf-e1b0bfc02a12`, plus requested internal-loop/lineage clarification.

The controller independently read little-helpers launch source/package manifest and the legacy script, and inspected pinned AK commit-then-read, scope mutation and unclaim excerpts. Scout source findings below are attributed, not claimed as independent duplicate controller inspection. Both scouts used no AK/DB commands, code changes, installations, feature launches, provider experiments or process probes. Their normal review-session launches do not exercise the proposed feature.

The [revised RFC](2026-09-05-visible-task-session-authority-startup-rfc-02.md) selects proposals from this evidence. Source hashes identify inspected bytes, not runtime proof. Original [decision inputs](2026-09-05-visible-task-session-decision-inputs.md) remain immutable; this note corrects and extends them rather than rewriting history.

## 1. AK claim is not atomic admission of the whole launch baseline

All AK references here are Git blobs at approved pin `cdeef5bfedcb1b19ee18921008f876ecd05eb8ca`, not mutable checkout/runtime commands.

- `crates/ak-core/src/tasks.rs:6898–7057`: `claim_task_tx` checks native pending/lease/deferral/dependency/decision conditions and increments task version. Inputs are task ID, actor, lease and time—not expected repo/scope/version/request identity. Atomic claimability is real; baseline CAS is absent from this ordinary operation.
- `tasks.rs:8117–8137`: `claim_task_at` commits its transaction and then calls `get_task`. **A returned error can follow a committed claim.** The launcher must not classify nonzero exit as no claim or retry automatically.
- `tasks.rs:7579–7640`: setting/clearing scope can occur while claimed and bumps task version when changed. Pre-read version `v` and expected post-claim `v+1` can conservatively detect intervening task-row changes, not prevent them.
- Dependency/decision changes elsewhere do not necessarily change this task's version. Final task readback is not a transaction over all authority inputs. Per-command gate serialization does not make a multi-call sequence atomic.
- `tasks.rs:829–839`: scope snapshot `exported_at` comes from task creation time; it is not read-time freshness. Compare actual versions/content and ordered observations, not a TTL or that timestamp.
- Missing explicit scope has native repo-default semantics. Requiring explicit scope in the launcher is an intentional stricter B policy, not a newly discovered native claim rule.
- `tasks.rs:8712–8810`: unclaim checks state and clears claim fields but has no expected claimant/version CAS. `release_expired_leases` changes rows without fencing workers. Neither is safe automatic compensation after ambiguous release.
- `task_composition_begin.rs:169–219`: typed begin has transaction-local version checks but is separately default-off and composes other contract/guardrail effects. B does not justify enabling it or claiming authenticated identity.

**Selected proposed answer:** unchanged native claim, explicit pre/post comparison and owner-coordinated absence of concurrent authority-input mutation during deterministic startup. Coordination must include companion/dependency/decision and automatic recovery writers, not just launchers. If owner acceptance/evidence of that operating precondition is unavailable, executable startup refuses. This is snapshot assurance, not atomic baseline admission or continuous revocation. A stronger owner CAS path would require separate authorization and still would not fence post-commit work.

For owner-driven ordinary task recovery, exact claimant/version recheck plus excluded competing edits is required before native unclaim; drift stops recovery. A local record or matching current snapshot is not an operation replay receipt. In-flight/external effects remain separately owned.

## 2. Pi load-error correction and actual bypasses

Pi source root `P` is the installed coding-agent package at `/home/tryinget/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent`, observed version0.84.4.

**Correction:** `dist/main.js:629–638,718–728` converts diagnosed extension-load errors to runtime errors and exits before entering the mode. Explicit missing extension paths become errors. It is incorrect to say that every explicit extension-load failure falls through to model execution. A factory can still have effects before registration rollback, and SDK callers own checking returned diagnostics.

The remaining mandatory-admission gap is concrete:

- `dist/core/extensions/runner.js:623–650,974–1012`: lifecycle/input exceptions are caught; absent input handlers continue. A valid loaded extension with no required admission registration does not establish denial. Awaited `session_start` is not a cancellable admission contract.
- `dist/core/agent-session.js:821–949`: extension command routing precedes `input`; expansion, pending messages, possible compaction and `before_agent_start` can change execution/context after an earlier input check.
- `agent-session.js:1099–1123`: custom messages with `triggerTurn` can enter `_runAgentPrompt` directly. Non-trigger/next-turn messages can affect later context. `steer`/`followUp` enqueue outside ordinary input interception.
- `agent-session.js:772–805` and agent-core `agent-loop.js`: internal tool rounds, steering/follow-ups, retry and agent-end queues continue without a fresh `AgentSession.prompt` entry. Continuation is not provenance: a new queued objective can travel through the same loop.
- Stock TUI submit/command handlers become active before awaited session rebind finishes; `/compact`, `/tree`, session changes and shell `!` routes are handled above ordinary prompt input. No initial task prompt is a useful restriction, not a stock-TUI universal veto.
- Compaction/branch summaries invoke models separately. `preflightResult(true)` can mean handled or queued, not model execution or task admission. Extension send bindings can be fire-and-forget with errors reported separately.
- Arbitrary full-permission extensions/raw SDK callers can construct another Agent, call a provider or spawn processes. A supported task-mode boundary is not hostile same-UID containment.

**Selected proposed answer:** mandatory host task-mode state plus a constrained no-initial-task-prompt profile; gate ingress before command/queue/context insertion and assert admitted local run lineage at downstream provider and actual tool dispatch. Do not add AK reads at every tool or promise continuous authority revocation. Disable first-use compaction/summarization, reload/session switching and secondary objective-bearing inputs; stop honestly on context overflow.

## 3. Existing integration seams are useful, not already enforcing

- `createAgentSession` accepts a custom ResourceLoader; a supplied literal/snapshot loader can avoid default resource discovery. Services construction currently creates DefaultResourceLoader itself; its options are not equivalent to a fully custom loader.
- Default loader resolves packages before no-extension/skill filters. Remote configured packages may install; post-load overrides cannot undo factory effects or file reads. `--no-extensions` is not no-install, and no-context-files does not exclude every SYSTEM/APPEND_SYSTEM input.
- Actual installed context discovery contains override/worktree behavior beyond simplistic path-name assumptions. Bind resolved order/content and required provenance, not a copied general loader description. No AGENTS changes were made in this task.
- CLI `@file` processing can strip BOM, wrap text, resize images and combine messages; it does not preserve arbitrary raw input bytes as the final request. Use the proposed literal task envelope rather than call argv spelling exact-byte delivery.
- `sdk.js` stream-function/context/onPayload composition is an existing downstream seam; current extension transform errors are best-effort, not mandatory refusal. Provider payload hooks and model sampling overrides can alter instruction-bearing fields. The selected profile must disallow arbitrary rewrites and bind supported provider serialization.
- Agent tool hooks and execution wrappers can assert local lineage; preflight alone is insufficient when parallel tools execute later. Argument preparation/listener code before a tool hook remains trusted code. No new universal agent-core API is established merely because these seams exist.
- Model/system/tool refresh between rounds must not silently replace the frozen profile. Tool results may evolve task context without admitting a new objective; no raw hash-equality promise applies to every later model request.

The BOOT scout read installed README, extensions, SDK, packages, skills, prompt templates, settings, compaction, sessions, models and custom-provider docs completely; followed task-relevant examples; inspected corresponding source. Selected bundled CLI string windows corroborated the load-error exit and input/launch routines. This is not full bundle/module equivalence or live behavior proof.

## 4. Exclusion, production ports and legacy compatibility

Existing candidate state derives a root partly from XDG state and uses resolved paths; it does not prove the new cross-profile canonical exclusion contract. Candidate locks already have owner-specific composition and narrow terminal-recovery rules. Do not import PID-absence recovery for a terminal-compaction lock as proof of arbitrary worker quiescence.

Revision02 selects two conflict indexes: same AK-instance/task across workspaces **or** same canonical checkout/common-Git conflict domain across task IDs. A short namespace mutex publishes reservations; owner calls and spawning occur outside it, while the durable reservation continues exclusion. Candidate-class requests refuse before candidate locking, and unmanaged/legacy writers require explicit coexistence disposition. Parent mutation shares the same conflict rule. This is a new proposed operational contract, not a claim that existing candidate records implement it.

Controller reinspection of `sidequestLaunch.ts` confirms `options.exec` presence affects ancestor discovery, detached handshake selection, staggering and placement observation. A real CLI exec injection must not take those test shortcuts. Current manifest has no proposed CLI bin, launch-core export or skill entry. Emitted-JS/public-boundary and installed proof remain future owner work.

The lane script still changes default mode by task count, creates a log directory during dry-run and directly spawns Ghostty. Revision02 explicitly excludes its migration from the first allocation and supplies retained/refused option decisions for later owner adoption. That exclusion does not itself make coexistence safe or disable the script.

## Selected exact source identities

AK paths resolve under the pinned Git commit above; P paths under the installed package; L paths under `packages/pi-little-helpers` in the inspected worktree. Documentary/source currentness must be rechecked before owner acceptance and affected use.

```text
AK crates/ak-cli/src/main.rs c27ff83625da1e32f55f9d3f1db75564ee265f60b24b0c8d493ef4671bbcb4a9
AK crates/ak-core/src/tasks.rs e9ec2d99327ebfc66979281bf1d19e70ec8d50d6a6ed14a6064d0aa556d4f3f2
AK crates/ak-core/src/task_composition_begin.rs 1a683e2c1851a9bae32d1f6e75e640555b3ebb11532b6a1b728ec560b29ec3e7
AK docs/project/task-scope-authority-contract.md 692a4132a37ef096fffa2ebeeab7bb4f71dba7b4a559e8b71cbdc2fcf514bad8
P package.json db9fead11bd2ddf7a327d2c2d11b535f30d059241c251d376837d5ab638a5576
P dist/main.js f8cf0b949a4042d6aa02f24d93818519d51a9034a5734749041d344cfcf2f509
P dist/core/sdk.js 6969bd56ba8e1628cd033bb15cb15fe38299f00b5ad84f4f8ef37a33a98681c9
P dist/core/agent-session.js e213e4094a3f176b2491e0470ac8ecd88aeab0030d35aabd9ba289ba7b74b923
P dist/core/resource-loader.js 8e8a1bc1c5bc9e955f6a2314dd1db02071be56d48b1fea7b8b2cacb4fc9a0628
P dist/core/package-manager.js 26aa8adf255f7b1ebf9b00732d2e9a1648e38b76a10eedcd443131e3708b6e88
P dist/core/extensions/runner.js 0de12ed1275e02595f92476eec3f61ae1f2e54fd2225ced721ddc90af58a5e61
P dist/modes/interactive/interactive-mode.js e257622a8ab52658ec55d37c7d2e45d1a0883df7242d60a292761993088994a8
P dist/cli/initial-message.js d15e1b6ff88ebf85944cce50f4eab219a36f3539e42a0ded19b8f5ff5308b29d
P dist/cli/file-processor.js 4946f4e3e193713135a4924982d31c9403190befd421b7be9893d0e5c65055ae
P dist/bundle/cli.js 5406c369954516fb56879d685e082ff9095cd6e06e41af406f394942377fd4bf
P dist/bundle/chunks/chunk-OMWWHBTG.js 08cbc4d2d6d3cafe995cf3c3a1a6fded7b07f07009101b6fee7cdce5daf8062d
P node_modules/@earendil-works/pi-agent-core/dist/agent.js d84351e451b9fef40fe2532c446aca90d26a4be9038b2d77d3d45dd6eab21d41
P node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js 7b75576c0770e8d82c5d74229f5464611d2f1c01b69a6b592eb0862215429f2c
L extensions/sidequestLaunch.ts 42ddd7abd8dbcee9598c7abacfb87a62eea91b5c68861438226797e0e0de24a3
L package.json 85ee07452f72ba9ef3a2bf1206d739095dbb6471944626f456b75d0341c937c3
L src/candidatePeerAdmissionState.ts e82b0d52a19a9d5b73762428d5d25850676cc564a3d3b2116ce7839b9a6994a9
L src/candidateGitWorktreeIdentity.ts 8a3fb70094cd0d728e34e3735c962471410ad4e6dac442bd3d2410176e56ff72
Lane scripts/launch-pi-ak-task-ghostty.sh 9a2eccea7c7f5d78c5065bc71cb8073d02890219bcb442247edbe63f08e9e552
```

## Verification implications and remaining owners

New negative cases: commit-then-read error; scope change/revert with unexpected task version; dependency/decision drift without task-version change; unclaim compensation racing another claimant; missing registration vs explicit load error; custom/non-trigger message injection; late context/provider rewrite; internal follow-up/compaction routes; parallel tool preflight versus actual execution. They supplement V3/V4/V5/G2-P1 rather than invent another acceptance inventory.

These facts narrow the proposal; they do not grant ratification. Before ADR, AK/Pi owners must accept the bounded snapshot/coordination assumption and recovery operation, Pi/integration owners the required host/profile/lineage boundary, and transport/lane owners namespace/conflict/coexistence and packaging. If they require stronger assurance, revise explicitly rather than silently activate default-off operations or widen host governance.
