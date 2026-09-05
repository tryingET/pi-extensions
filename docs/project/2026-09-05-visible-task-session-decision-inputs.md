---
summary: "Task 5435 source-grounded G1/G2 disposition: missing authenticated task handoff and fail-closed Pi bootstrap; coherent same-package launch-core allocation with production-port caveat."
read_when:
  - "Continuing visible-task-session packet85 toward an architecture decision."
  - "Evaluating task claimant transfer or turning little-helpers transport into a noninteractive CLI."
type: "design_packet"
task_id: 5435
status: "g2_design_allocation_resolved_g1_owner_decision_blocked"
---

# Visible task sessions — decision inputs

## Position and claim limit

This is a source-grounded continuation of [design packet85](2026-09-05-visible-task-session-design.md) and its [review](2026-09-05-visible-task-session-review.md), under **task5435** after design-only task5434 completed. It supplements the same packet through a source link; it creates no second authority store or implementation wave. Original reviewed discovery/design bytes remain unchanged so their exact-hash review is reproducible locally.

**G2 has a coherent source-grounded design allocation. G1 is a confirmed missing owner contract, not a solved runtime capability.** No RFC-ready, ADR, task-transfer, installed-export or operational acceptance is asserted. No runtime code, AK schema, package install or feature launch was performed.

Independent source investigator: `session-01a072c3-c49a-701d-9b25-1b5fd81693d6`. The parent independently inspected the little-helpers sources and manifest. AK runtime command availability was read through the approved exclusive gate; the investigator used pinned Git source and installed Pi files, not direct AK/DB commands. One intercom wait expired while investigation continued; it was not cancellation and no duplicate investigation was launched.

## G1: existing task APIs do not implement authenticated delegation

AK source conclusions below bind approved commit `cdeef5bfedcb1b19ee18921008f876ecd05eb8ca`, using `git show`, not the newer mutable checkout. Current checkout HEAD observed by the investigator was `9c991dc03459bb7bf749b7ddb26233eb3f7f4e9b`; 17 selected task/composition files differ from the pin. Current docs/HEAD must not be substituted for installed command behavior.

1. The pinned typed-task-composition RFC section 5.1 explicitly defines actor identity as an **auditable local assertion**, `actor_identity_assurance=asserted_local`, and states that v1 has no delegation, override or service actor. Authenticated/delegated authority is a breaking expansion requiring separate review. ADR-0031 preserves that assurance level and default-off rollout. Those artifacts are constraints, not a refreshed decision passport.
2. The pinned CLI accepts a caller-supplied `claim --agent` string. `claim_task_tx` verifies claimability, lease bounds, pending state, deferrals/dependencies/decisions and atomically writes the supplied claimant. Atomic claimability is real; requester authentication and parent-to-child transfer are not provided. Already-claimed tasks refuse another claim rather than transfer ownership.
3. `task handoff` is preflight only. It explicitly reports no task claim/completion and no intercom authority. `expected_peer` is compared with a receiver-supplied peer value, not an authenticated child attestation. An accepted envelope suggests a future claim command; it is not the transfer receipt.
4. `task begin` is default-off. It requires pending/no existing claim, validates source-bound owner configuration and exact repo/actor allowlists, then records asserted-local identity. These checks do not authenticate the requesting process as the asserted actor. `task operation show` is generation-fenced replay evidence, not a delegation grant or terminal-effect receipt.

**Counterexample:** a caller with access to the same local API can submit another permitted actor string. A parent-held task cannot become child-owned through begin. An unclaim/claim sequence is not an accepted atomic handoff, revocation or old-worker fencing protocol. This is a source-demonstrated assurance limit, not a live exploit test.

**Disposition:** do not silently strengthen `asserted_local`, enable default-off composition, equate possession of a task ID with delegation, or use the launcher to create a shadow authorization token. The AK task/claim owner must decide the intended assurance/delegation model and its exact requester/child/task/repo/scope/version binding, claimant disposition, atomic transfer/revalidation, replay/revocation and old-worker-effect handling. A deliberately weaker trusted-local/non-delegating operating mode is an explicit requirement/decision alternative, not an undocumented shortcut that satisfies the stronger G1 claim.

## G1: Pi ordering has useful seams but not the promised barrier

Installed Pi version observed: **0.84.4**. The investigator read the extension guide and input-transform example, then checked installed runtime source:

- Normal TUI initialization awaits session rebind; binding awaits `session_start` and resource discovery. The initial message is submitted after initialization. Print mode likewise rebinds before the initial message.
- For ordinary non-command text, `prompt` awaits the `input` event before expansion, constructing the user message and running the model. An `input` handler returning `handled` skips model execution; `continue` can admit the same sole message. A bootstrap LLM message plus second queued task prompt is therefore not inherently necessary.
- Extension commands execute before `input` and bypass it. `input` exceptions are caught/logged and later processing continues. `session_start` exceptions are also swallowed, and that event has no cancellation result. `before_agent_start` is an injection seam, not a denial contract, and catches errors.
- Input interception has already exposed the message bytes to extensions. Before model use is not before any extension sees private content. Extension factories/startup handlers can perform effects; other extensions may initiate turns. These extensions have full system access, not an OS sandbox.

**Counterexample:** a required admission handler throws or fails to load, and ordinary processing continues; or command-shaped prompt text bypasses the input barrier. The absence of a startup error notification cannot prove denied task execution.

**Disposition:** the Pi runtime/integration owner must specify a mandatory, fail-closed bootstrap/message-release path covering extension presence, initialization/error/denial, command input, other startup effects/turn initiation and post-gate transforms. Owner readback unavailable must withhold task-model execution. Bind requester and child identity/incarnation through the accepted G1 authority route. A future catch-and-handle input adapter is plausible, not an already verified exclusive barrier. No provider/launch experiments were performed to close this gap.

## G2: same-package allocation is sufficient at design stage

Inspected little-helpers package: version **0.9.0**, Node `>=22.19.0`, TypeScript 5.9.2 as a development dependency. Its source manifest has no CLI bin, public launch-core export or `pi.skills` entry. The package has publish preparation, explicit file coverage and peer dependencies; inspecting the source manifest does not certify what the final tarball includes.

`launchPiQuestSession` imports `ExtensionAPI` as a type and consumes `pi.exec` / `pi.getThinkingLevel`; it also needs model, parent cwd/context, provenance, process/placement and environment policy. `launchDetachedGhosttyWindow` uses Node APIs and a private command-admission handshake. The existing source, not a duplicate shell implementation, is the reuse boundary.

Selected **design allocation**, subject to decision:

1. Keep ownership in little-helpers. Factor explicit model/thinking/exec, parent-cwd/context and placement/provenance ports; the Pi adapter supplies actual host values. Do not fabricate a full ExtensionAPI object or require a parent TUI for CLI invocation.
2. CLI and Pi adapters share the same typed transport source. Publish package-owned Node ESM JavaScript from build-time TypeScript emit for the CLI/core; do not depend on runtime TypeScript stripping inside installed `node_modules`. Pin emitted dependency closure, relative import-extension rewriting, public bin/exports and packaged files in the implementation contract. No new package or daemon is justified by current source evidence.
3. Preserve the internal command-only ASC observer path, its controller-tab-only refusal and read-only nature. Do not expose its arbitrary command seam as a user-facing `shellCommand` API. Preserve existing company-provenance owner calls and explicit parent context; do not recode company selection inside the CLI.
4. **Separate production ports from test-injection intent.** Today's `options.exec` presence suppresses automatic Ghostty-ancestor discovery, bypasses detached handshake transport unless a detached-window launcher is also supplied, and changes stagger/placement-observation behavior. A real CLI exec function must not take those test shortcuts. Production CLI and Pi adapters must retain the same handshake, ancestor/presence and placement policies; test overrides must be explicit and unable to masquerade as production evidence.
5. Persist the normalized transport outcome into the operational attempt record before relying on disposable handshake scratch. The existing detached launcher cleans its temporary directory in `finally`; that directory is not a durable unresolved-attempt ledger.

**New negative parity obligation G2-P1:** provide a real CLI exec port with no test-mode declaration; assert retained detached command admission, ancestor/presence discovery, production stagger and observer placement refusal. A test suite that disables these through its exec stub cannot be the only oracle. Also verify installed packed dependency closure, emitted import paths, no registration side effects, provider/cwd/prompt parity and failure classifications without a parent Pi session.

The independent reviewer judged this allocation coherent **with G2-P1 retained**. This resolves the package-placement/design question, not emitted-build correctness or live parity. Those tests belong to explicitly authorized post-ADR implementation/affected-use proof. “No parent Pi session” does not mean no installed child Pi executable, model configuration or package dependencies.

## Source identities

All AK paths in this table resolve under the agent-kernel repository at the approved Git commit above. They identify pinned blobs, not current worktree files. Pi paths resolve under the installed coding-agent package named above. Inline source paths are grouped in fenced blocks to avoid advertising mutable document links as pinned source retrieval.

```text
AK pinned sources — path : SHA-256
crates/ak-cli/src/main.rs : c27ff83625da1e32f55f9d3f1db75564ee265f60b24b0c8d493ef4671bbcb4a9
crates/ak-core/src/tasks.rs : e9ec2d99327ebfc66979281bf1d19e70ec8d50d6a6ed14a6064d0aa556d4f3f2
crates/ak-core/src/task_composition_begin.rs : 1a683e2c1851a9bae32d1f6e75e640555b3ebb11532b6a1b728ec560b29ec3e7
crates/ak-core/src/task_composition_admission.rs : 4eb49ed6eccada81ef1a000988a5bacfe74b1c7d5a8eb9ed3d27729462ab58b6
crates/ak-core/src/task_composition_request.rs : b2432c7ff6b645edc06a4fa3390203c8fba51ef38a9e3950ea7965060e6aae5f
crates/ak-core/src/task_composition_protocol_types.rs : 9d00227814b377e4dc01eb5f22965f54b96945e6833d9e9fc4366aa982cd4b9b
docs/project/2026-07-25-rfc-typed-replay-safe-task-begin-closeout-composition.md : 8dd7131494bdf3d2a9f7d7aff726bbe1294211317eabaff75de02a249cbdf93e
docs/adr/0031-typed-replay-safe-task-begin-closeout-composition.md : 43d2cbb94f6111e701b2068a83f6db8076b22fa19401be582fc334835ed4b645
docs/project/2026-05-17-sf12-iw24-typed-handoff-envelope-design.md : acde1349793db5c487127730393980ce72ded824ec5f12f116f872b06e08b910

Installed Pi 0.84.4 sources — path : SHA-256
package.json : db9fead11bd2ddf7a327d2c2d11b535f30d059241c251d376837d5ab638a5576
docs/extensions.md : e1e776e9b91355b6d4e5627f4a474de231fd213e0df2ab79957195f560cdd43e
dist/core/agent-session.js : e213e4094a3f176b2491e0470ac8ecd88aeab0030d35aabd9ba289ba7b74b923
dist/core/extensions/runner.js : 0de12ed1275e02595f92476eec3f61ae1f2e54fd2225ced721ddc90af58a5e61
dist/modes/interactive/interactive-mode.js : e257622a8ab52658ec55d37c7d2e45d1a0883df7242d60a292761993088994a8
dist/modes/print-mode.js : f2eb170b9620c1d37e68b788ff71257a4402a23e7f3999575feee8e5d9e13b3f
examples/extensions/input-transform.ts : cf0f65d610631ca75d18aae1c8f1408139702f674cb2835f8c009b943776474b

Little-helpers inspected worktree sources — path : SHA-256
package.json : 85ee07452f72ba9ef3a2bf1206d739095dbb6471944626f456b75d0341c937c3
extensions/sidequestLaunch.ts : 42ddd7abd8dbcee9598c7abacfb87a62eea91b5c68861438226797e0e0de24a3
extensions/sidequestDetachedWindow.ts : a2cda460058d730af898d01028669206a960b94570f841778e997306303ef00d
extensions/sidequestLaunchResult.ts : c8eebf6c7620cae85f053a6127528cfc23c495e25081f7fe97d758b8e0dd9cf1
```

## Existing-state-machine next boundary

The workflow advanced from discovery -> design -> exact-hash review -> revision -> re-review -> bounded pre-decision source analysis. It has **not** advanced to accepted architecture or implementation. G2's original packaging uncertainty is narrowed to a coherent same-package allocation with later artifact proof. G1 is now a precisely evidenced owner gap.

Next is an explicit architecture/owner-contract decision about G1's assurance model and Pi bootstrap, incorporating the G2 allocation and preserving the original safety goals. Opening that decision does not accept the model or authorize changes to AK/Pi. The task stays at the decision-input/owner-choice boundary until the exact scope is authorized; do not activate SF7/IW8 or reuse its unrelated task4165 as permission.

Required decision inputs: preserve the strong delegated-authority option and explicitly evaluate any trusted-local/non-delegating alternative against stakeholder need, security claims, revocation and old-worker recovery. Do not narrow the outcome solely to avoid an owner boundary or relabel a weaker guarantee as equivalent. An accepted decision and post-ADR owner tasks are required before changes to identity assurance, bootstrap semantics or shared launch contracts.
