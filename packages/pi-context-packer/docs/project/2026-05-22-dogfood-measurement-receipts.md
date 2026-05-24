---
summary: "Live dogfood receipts for context_plan/context_pack usefulness and no-packet decisions."
read_when:
  - "Reviewing whether pi-context-packer reduces raw read/search/status churn."
  - "Tuning packet ranking, measurement receipts, or no-packet recommendations."
type: "evidence"
system4d:
  container: "Package-local dogfood evidence for context-packer measurement."
  compass: "Prove usefulness with observed follow-up behavior, not more provider adapters."
  engine: "Plan/pack -> record receipt -> compare actual low-level probes -> tune next bet."
  fog: "Estimated calls avoided can be mistaken for evidence unless followed by observed outcome."
---

# Dogfood measurement receipts — 2026-05-22

## Purpose

The current product gap is live usefulness proof: show when `context_plan` / `context_pack` reduce raw `read` / search / status churn, and when no packet is needed because the relevant context is already loaded.

This note records package-local dogfood receipts from a real Pi session while updating this package's measurement posture. It is evidence for product tuning only; it is not AK evidence, FCOS closeout, Prompt Vault governance, or session memory.

## Counting rule

For these receipts, a "low-level probe" means an ad-hoc `read`, `bash` status/search/listing command, or equivalent raw file/status inspection that the agent would otherwise do outside a packet. Validation commands are tracked separately from context probes.

The packet receipt's `estimatedToolCallsAvoided` is a prediction from selected packet items. The dogfood follow-up is the observed comparison after doing the work.

## Receipt A — plan first, then packet for posture/measurement work

### Context

Objective used with `context_plan`:

```text
Dogfood pi-context-packer with real measurement receipts: prove when context_plan/context_pack reduces raw read/search/status churn and when no packet is needed. Need identify existing measurement APIs, tests, docs placement, and a minimal implementation/docs slice in packages/pi-context-packer.
```

Seeds:

- `packages/pi-context-packer/src/session-measurement.js`
- `packages/pi-context-packer/src/context-pack-result.js`
- `packages/pi-context-packer/tests/tool-result.test.js`
- `packages/pi-context-packer/docs/project/product-posture.md`

`context_plan` selected `agents`, `git`, `sci`, `docs`, and `session`, with no risks and explicit non-authorizations. This was useful as a cheap provider-selection membrane before reading files, but it did not itself provide a measurement receipt.

### Packet receipt

A local `contextPacketToolResult` run against the live package source with absolute monorepo `repoRoot` produced this compact receipt:

```json
{
  "totals": {
    "estimatedTokens": 4424,
    "bytes": 17714,
    "candidatesSelected": 3,
    "candidatesOmitted": 1
  },
  "sections": [
    {
      "provider": "agents",
      "itemCount": 2,
      "items": ["agents:AGENTS.md", "agents:packages/pi-context-packer/AGENTS.md"]
    },
    {
      "provider": "docs",
      "itemCount": 1,
      "items": ["docs:packages/pi-context-packer/docs/project/product-posture.md"]
    }
  ],
  "measurementReceipt": {
    "estimatedToolCallsAvoided": 3,
    "packetFillRatio": 0.3687,
    "wiredProviders": ["agents", "docs"],
    "selectedItemCount": 3,
    "alreadyLoadedItems": 0,
    "freshItemCount": 3,
    "duplicateTokensAvoided": 0,
    "omittedCandidateCount": 1,
    "packetUtilityRecommendation": {
      "status": "use_packet_review_omissions"
    },
    "dogfoodFollowupReceipt": {
      "status": "observation_pending",
      "expectedLowLevelCallsAvoided": 3,
      "actualLowLevelReadSearchStatusCalls": null
    }
  },
  "omissions": [
    {
      "provider": "sci",
      "reason": "blocked",
      "detail": "existing .ontology SCI artifacts present; refusing to mutate source-owned SCI state"
    }
  ]
}
```

### Follow-up observation

Observed after the packet:

```json
{
  "status": "observed",
  "expectedLowLevelCallsAvoided": 3,
  "actualLowLevelReadSearchStatusCalls": 2,
  "duplicateReadsObserved": false,
  "omissionFollowupsUsed": ["git/status inspection for SCI .ontology side-effect posture"],
  "recommendationMatchedOutcome": true,
  "notes": "The packet avoided re-reading AGENTS and product-posture context while writing the receipt. Remaining raw probes were side-effect/safety checks around SCI-created .ontology artifacts and doc-style orientation, not duplicate reads of selected packet content."
}
```

Outcome: packet useful, but the SCI omission mattered. The next tuning target is not a new provider adapter; it is clearer live receipt capture and avoiding confusing read-only dogfood with SCI artifact side effects.

## Receipt B — no packet needed after context is already loaded

### Context

After AGENTS and product posture content were already in the active session, the same packet assembly was run with a `systemPrompt` containing those exact selected files. This models the common Pi case where resource-loader or previous turns already loaded the useful context.

### Packet receipt

```json
{
  "totals": {
    "estimatedTokens": 123,
    "bytes": 486,
    "candidatesSelected": 3,
    "candidatesOmitted": 0
  },
  "sections": [
    {
      "provider": "agents",
      "itemCount": 2,
      "items": [
        {
          "id": "agents:AGENTS.md",
          "contentMode": "metadata",
          "duplicateOf": "system_prompt",
          "duplicateTokensAvoided": 1144
        },
        {
          "id": "agents:packages/pi-context-packer/AGENTS.md",
          "contentMode": "metadata",
          "duplicateOf": "system_prompt",
          "duplicateTokensAvoided": 917
        }
      ]
    },
    {
      "provider": "docs",
      "itemCount": 1,
      "items": [
        {
          "id": "docs:packages/pi-context-packer/docs/project/product-posture.md",
          "contentMode": "metadata",
          "duplicateOf": "system_prompt",
          "duplicateTokensAvoided": 2363
        }
      ]
    }
  ],
  "measurementReceipt": {
    "estimatedToolCallsAvoided": 0,
    "packetFillRatio": 0.0154,
    "wiredProviders": ["agents", "docs"],
    "selectedItemCount": 3,
    "alreadyLoadedItems": 3,
    "freshItemCount": 0,
    "duplicateTokensAvoided": 4424,
    "omittedCandidateCount": 0,
    "packetUtilityRecommendation": {
      "status": "no_packet_needed",
      "reason": "all selected packet content is already represented in the active prompt/session"
    }
  }
}
```

### Follow-up observation

```json
{
  "status": "observed",
  "expectedLowLevelCallsAvoided": 0,
  "actualLowLevelReadSearchStatusCalls": 0,
  "duplicateReadsObserved": false,
  "omissionFollowupsUsed": [],
  "recommendationMatchedOutcome": true,
  "notes": "The correct action was to skip loading duplicate packet content and proceed from already-loaded context. The useful output was the no-packet recommendation plus duplicate-token accounting, not a larger packet."
}
```

Outcome: no-packet recommendation matched the live work. This is the clearest current product proof for session-awareness: the packet should sometimes prevent context growth rather than add content.

## Receipt C — post-reload copy-ready observation template check

### Context

After reloading Pi with the dogfood template changes available, the current session already had the relevant AGENTS, measurement implementation, packet formatting, and dogfood evidence files loaded. The objective was deliberately narrow:

```text
Post-reload dogfood: verify copy-ready dogfood observation template output
```

Providers `git`, `sci`, `ak`, `fcos`, and `prompt_vault` were disabled for this check so the packet decision measured only already-loaded repo-bounded AGENTS/CLAUDE instruction/docs context and the receipt-export surface.

### Packet receipt

```json
{
  "totals": {
    "estimatedTokens": 129,
    "bytes": 510,
    "candidatesSelected": 3,
    "candidatesOmitted": 0
  },
  "measurementReceipt": {
    "estimatedToolCallsAvoided": 0,
    "alreadyLoadedItems": 3,
    "freshItemCount": 0,
    "duplicateTokensAvoided": 4145,
    "omittedCandidateCount": 0,
    "packetUtilityRecommendation": {
      "status": "no_packet_needed",
      "reason": "all selected packet content is already represented in the active prompt/session"
    }
  },
  "dogfoodObservationTemplate": {
    "kind": "context_pack_dogfood_observation_v1",
    "observation": {
      "actualLowLevelReadSearchStatusCalls": null,
      "duplicateReadsObserved": null,
      "omissionFollowupsUsed": [],
      "recommendationMatchedOutcome": null,
      "notes": ""
    }
  },
  "templateTextHasSelectedPaths": false,
  "templateTextHasRawContentMarkers": false
}
```

### Follow-up observation

```json
{
  "status": "observed",
  "expectedLowLevelCallsAvoided": 0,
  "actualLowLevelReadSearchStatusCalls": 0,
  "duplicateReadsObserved": false,
  "omissionFollowupsUsed": [],
  "recommendationMatchedOutcome": true,
  "notes": "The post-reload packet did the right thing: it recommended no packet, exposed 4,145 duplicate tokens avoided, and produced a copy-ready observation template without selected paths or raw content markers."
}
```

Outcome: reload verification matched the intended product behavior. The copy-ready template is useful even when no packet is needed because it gives the agent a safe place to record the observed no-packet outcome.

## Receipt D — provider-route summary without raw seeds

### Context

After adding redacted provider-route summaries to dogfood observation templates, a local package-source packet was assembled to check whether the template exposes enough route shape to diagnose docs-vs-SCI query mismatches without leaking seed values.

The packet used mixed seed kinds: one code path seed, one Markdown path seed, and one symbol seed. Providers `docs` and `sci` were required; `git` and `session` were disabled for focus. SCI was not marked read-only safe in the local environment, so the SCI provider correctly remained fail-closed while the route summary still recorded the intended query seed shape.

### Packet receipt

```json
{
  "totals": {
    "estimatedTokens": 2061,
    "bytes": 8245,
    "candidatesSelected": 2,
    "candidatesOmitted": 2,
    "budgetAccounting": "selected_provider_content_only"
  },
  "providerRoutes": [
    {
      "provider": "agents",
      "posture": "selected",
      "routeRole": "selected",
      "queryCount": 1,
      "selectedQueryCount": 1,
      "followupQueryCount": 0,
      "seedCount": 0,
      "seedCounts": {}
    },
    {
      "provider": "sci",
      "posture": "selected",
      "routeRole": "selected",
      "queryCount": 1,
      "selectedQueryCount": 1,
      "followupQueryCount": 0,
      "seedCount": 2,
      "seedCounts": {
        "code": 1,
        "symbol": 1
      }
    },
    {
      "provider": "docs",
      "posture": "selected",
      "routeRole": "selected",
      "queryCount": 1,
      "selectedQueryCount": 1,
      "followupQueryCount": 0,
      "seedCount": 1,
      "seedCounts": {
        "markdown": 1
      }
    },
    {
      "provider": "prompt_vault",
      "posture": "optional",
      "routeRole": "followup",
      "queryCount": 0,
      "selectedQueryCount": 0,
      "followupQueryCount": 1,
      "seedCount": 0,
      "seedCounts": {}
    }
  ],
  "providerRoutesNote": "excerpt: full template also includes skipped/follow-up providers with selected queryCount separated from followupQueryCount",
  "prediction": {
    "expectedLowLevelCallsAvoided": 2,
    "packetUtilityRecommendationStatus": "use_packet_review_omissions",
    "alreadyLoadedItems": 0,
    "freshItemCount": 2,
    "duplicateTokensAvoided": 0,
    "unwiredProviderOmissions": []
  },
  "omissionSummary": [
    {
      "provider": "docs",
      "reason": "budget",
      "detailEstimatedTokens": 23,
      "detailBytes": 91
    },
    {
      "provider": "sci",
      "reason": "blocked",
      "detailEstimatedTokens": 48,
      "detailBytes": 189
    }
  ],
  "templateRedactionChecks": {
    "hasRawPath": false,
    "hasRawSymbol": false
  }
}
```

### Follow-up observation

```json
{
  "status": "observed",
  "expectedLowLevelCallsAvoided": 2,
  "actualLowLevelReadSearchStatusCalls": 0,
  "duplicateReadsObserved": false,
  "omissionFollowupsUsed": ["SCI read-only safety remained unconfirmed, so SCI content was not trusted as covered"],
  "recommendationMatchedOutcome": true,
  "notes": "The route summary showed the expected split: Markdown seed to docs, code and symbol seeds to SCI, and generic providers with zero seeds. The copy-ready template did not include raw path or symbol values. Validation commands were run separately from low-level context probes. This receipt is local package dogfood only, not live reload evidence."
}
```

Outcome: provider-route summaries are useful receipt metadata. They make query-seed mismatches reviewable without putting raw seeds into pasteable dogfood evidence, while SCI omissions still force owner-surface follow-up instead of implying coverage. The receipt projection now separates selected `queryCount` from optional `followupQueryCount`, and packet totals explicitly count selected provider content rather than rendered Markdown scaffolding.

## Receipt E — executable structured docs-list JSON smoke

### Context

After wiring structured docs-list JSON intake, package-cwd dogfood exposed an important production issue: asking docs-list to scan the whole monorepo root can exceed the docs provider buffer and rank unrelated monorepo docs before package-local evidence. The fix is to run docs-list from the package `cwd` while preserving monorepo-root-relative `repoPath` values for packet reads.

### Packet-local smoke

`npm run dogfood:docs-list-json` now runs a repeatable package-local smoke that:

- calls the real `docs-list.mjs` with `--json`, `rankedItems`, and `repoPath` output;
- assembles `context_pack` docs packets from package-root and package-subdirectory `cwd` values with monorepo `repoRoot`;
- verifies selected docs paths came from ranked repo-relative JSON output in both cwd postures;
- verifies package-root and package-subdirectory discovery select the same ranked package docs;
- fails if selected packet omissions remain hidden behind a matched receipt;
- verifies compact details omit raw selected docs paths and content;
- fills a redacted observation template and evaluates it locally without persisting evidence.

Observed smoke output:

```json
{
  "status": "matched",
  "selectedDocs": 8,
  "packageSubdirSelectedDocs": 8,
  "expectedLowLevelCallsAvoided": 8,
  "actualLowLevelReadSearchStatusCalls": 0,
  "actualLowLevelCallsAvoided": 8,
  "duplicateReadsObserved": false,
  "recommendationMatchedOutcome": true
}
```

Outcome: structured JSON intake and package-subdirectory docs-list root climbing are now covered by both unit tests and a real package-local dogfood command. This is still package-local product proof only; it is not AK evidence, FCOS closeout, Prompt Vault governance, or live operator-session activation.

## Receipt F — isolated installed-artifact execution smoke

### Context

Release readiness previously proved that the tarball installed and registered `/context-pack` plus all model-callable tools in an isolated Pi runtime. The next hardening step was to prove the installed artifact code also executes core packet paths without relying on the source checkout, and then to close adversarial gaps around docs-list discovery and overclaiming registered-handler execution.

### Smoke behavior

`npm run release:check` now installs the packed tarball into isolated `PI_CODING_AGENT_DIR` and `NPM_CONFIG_PREFIX`, loads the installed extension through Pi, then executes installed artifact code against a temporary read-only fixture:

- Pi runtime registration metadata exists for `/context-pack`, `context_plan`, `context_pack`, `context_dogfood_evaluate`, and `context_dogfood_summarize`;
- `context_plan` returns an ok plan;
- seeded `context_pack` reads Markdown and renders packet content;
- docs-list-discovered `context_pack` reads ranked JSON output from a temporary docs-list script without a caller Markdown seed;
- compact details omit raw selected item content;
- dogfood evaluation returns `matched` for the runtime smoke receipt;
- aggregate dogfood evaluation preserves validation-count recorded/missing posture for a mixed current/legacy receipt set.

The smoke intentionally describes executable behavior as installed-core execution rather than registered-tool-handler execution because Pi `getAllTools()` exposes tool metadata, not handler functions.

Observed release-check output:

```text
context-packer runtime registration and installed core execution OK
```

Outcome: release smoke now covers registration metadata, installed-artifact seeded packing, installed-artifact docs-list discovery, installed-artifact dogfood calibration, and aggregate validation-count observability. This remains package release evidence only; it does not publish the package or activate the current operator session.

## Receipt G — validation commands separated from context probes

### Context

While reviewing the next highest-impact slice from the current product posture, the main gap remained live usefulness proof rather than provider breadth. The dogfood counting rule already said validation commands should be tracked separately from ad-hoc read/search/status probes, but the structured observation and aggregate model only had probe counts.

### Slice

The receipt scaffold now includes `validationCommandsRun` as an optional non-negative integer in both the immediate follow-up receipt and the copy-ready observation template. `context_dogfood_evaluate` carries it through single-receipt calibration, and `context_dogfood_summarize` totals it separately from low-level context probes.

Adversarial coverage rejects fractional, negative, or non-integer validation counts instead of silently coercing them. The field is deliberately numeric-only: detailed validation output remains in the owning test/check surface, and the count is packet-local calibration metadata, not task-completion proof.

Outcome: evaluated dogfood receipts can now distinguish “the packet avoided context probes” from “the agent still ran validation,” which should reduce false over/under-claiming before ranking changes or new provider adapters are justified. Follow-up hardening preserved missing-vs-zero semantics in aggregate summaries so legacy receipts without `validationCommandsRun` do not silently imply zero validation commands.

## Receipt H — activity-type dogfood calibration labels

### Context

The product posture's main gap still points to repeated evaluated receipts across implementation, review, and validation tasks before ranking changes or new provider adapters. Existing receipts separated validation-command counts from context probes, but the evaluator and aggregate summary did not preserve what kind of activity the receipt represented.

### Slice

The dogfood observation scaffold now includes optional `activityType` metadata (`implementation`, `review`, `validation`, `planning`, or `other`). `context_dogfood_evaluate` normalizes missing legacy labels to `unspecified`, redacts caller-controlled activity labels before returning text/details, and keeps the field as packet-local calibration metadata rather than task-completion proof. `context_dogfood_summarize` reports `activityTypeCounts` and per-receipt activity labels so repeated receipts can show whether matched signals cover a useful task mix.

Adversarial coverage redacts malicious activity labels containing local paths, secret-like strings, and Markdown-structure injection; legacy receipts without labels remain valid; stored prior evaluations round-trip the label through aggregate summaries. The package-local docs-list dogfood smoke now fills `activityType: "validation"` and verifies the label appears in the non-persistent evaluation.

Validation:

```text
npm run check
npm run dogfood:docs-list-json
```

Outcome: activity coverage is now observable in redacted dogfood summaries. This supports the next frontier—collecting repeated implementation/review/validation receipts—without adding provider adapters, reading receipt files, mutating AK/FCOS, promoting evidence, or treating labels/counts as completion proof.

## Receipt I — core activity coverage gates stable aggregates

### Context

After activity-type labels landed, aggregate summaries could count implementation/review/validation receipts, but a set of three matched receipts from a single activity type could still be classified as `stable_positive_signal`. That would overstate dogfood coverage before ranking or provider tuning.

### Slice

`context_dogfood_summarize` now derives packet-local `activityCoverage` for core activity types: `implementation`, `review`, and `validation`. Aggregate status only reaches `stable_positive_signal` when repeated matched receipts also cover all three core activity types. Repeated matched receipts with missing core activities now produce `activity_coverage_gap` and a next action naming the missing receipt types.

The coverage projection is advisory only: it does not read receipt files, promote evidence, update AK/FCOS, or prove task completion.

Adversarial/negative coverage verifies validation-only matched receipts do not become stable, mixed implementation/review/validation receipts can become stable, legacy `unspecified` labels remain valid while leaving coverage incomplete, and the formatted aggregate exposes present/missing coverage plus a non-authorization.

Validation:

```text
node --test tests/dogfood-observation.test.js
npm run check
```

Outcome: dogfood aggregate status is now harder to overclaim. Repeated positive receipts must cover the core implementation/review/validation loop before they are treated as stable packet-local calibration for ranking or provider tuning.

## Receipt J — immutable aggregate coverage membrane

### Context

A post-implementation adversarial review found two in-process object-boundary risks in the activity coverage slice: aggregate details exposed the module-level core activity array by reference, and coverage checks read activity counts through ordinary inherited-property lookup. In a long-lived Pi host, either could make later summaries overclaim `stable_positive_signal` after returned-object mutation or prototype pollution.

### Slice

The aggregate coverage membrane now freezes the core activity constant, returns a fresh `required` array in each `activityCoverage` projection, builds aggregate count maps as null-prototype objects, and checks core activity counts with own-property lookup. This preserves JSON-shaped output while making in-process consumers less able to poison later packet-local calibration.

Adversarial coverage verifies that mutating `aggregate.activityCoverage.required` does not alter subsequent summaries, and that polluted `Object.prototype.implementation/review` does not let validation-only receipts satisfy core activity coverage. Prototype-shaped labels such as `__proto__` remain countable.

Validation:

```text
node --test tests/dogfood-observation.test.js
```

Outcome: the dogfood aggregate projection is now harder to corrupt across calls in a persistent host. This keeps activity coverage advisory and non-persistent while reducing false stable-positive signals caused by JavaScript object capability leaks.

## Receipt K — raw seed normalization fail-closed hardening

### Context

A next-slice review found that caller-controlled path and symbol seeds were trimmed before safety checks. That meant raw values such as `"\ndocs/project/vision.md"` could be silently normalized into safe-looking provider queries, weakening the pre-provider safety and receipt-accounting membrane.

### Slice

Raw path and symbol seed values now fail closed when they contain C0/C1/DEL control characters or leading/trailing whitespace. The omitted-seed projection still classifies Markdown-looking contaminated paths as `docs` omissions for source-owner meaning, but it does not route the raw value to providers or expose it in packet details or dogfood templates.

Adversarial coverage verifies contaminated seeds are excluded from provider queries, contaminated Markdown targets are not read by `context_pack`, docs-list fallback/no-results behavior still works, and public packet/receipt surfaces omit raw contaminated paths and content.

Validation:

```text
node --test tests/context-plan.test.js tests/context-pack.test.js
```

Outcome: dogfood route telemetry and omission counts are more trustworthy because raw caller seed contamination cannot be laundered by normalization before provider selection.

## Receipt L — compact context_plan details projection

### Context

After raw seed intake hardening, the next highest-impact projection gap was `context_plan` tool details. The rendered plan text was compact, but the extension returned the raw plan object in structured details, including raw objective text, absolute workspace paths, proposed query strings, raw seeds, and raw seed notes.

### Slice

`context_plan` now exposes compact details with objective/workspace/query/seed references, provider postures, query counts, seed-kind counts, omitted-seed reasons, risks, owner-surface recommendations, a redaction receipt, and non-authorizations. The live extension returns this compact projection instead of the raw plan object.

Adversarial coverage verifies compact plan details omit sentinel objectives, absolute temp roots, raw path/symbol/prompt/free-text seed values, and raw seed notes while preserving provider posture and count telemetry.

Validation:

```text
node --test tests/tool-result.test.js
```

Outcome: the always-available planning tool now follows the same Markdown-primary / compact-details discipline as `context_pack`, reducing hidden JSON bloat and accidental leakage before packet assembly.

## Receipt M — context_plan wrapper and installed projection smoke

### Context

After compact `context_plan` details landed, validation still needed to prove the source extension wrapper and installed release artifact kept the compact projection boundary. Direct projection tests were useful, but they did not execute the registered source wrapper, and release smoke only checked installed registration metadata plus core module execution.

### Slice

The extension test harness now executes the registered `context_plan` tool wrapper with sentinel objective/seed/note/workspace values and verifies structured details omit the raw values while preserving provider posture and seed-kind telemetry. Release smoke now imports the installed compact plan projection and asserts installed artifact redaction for sentinel objective, workspace, seed, and note values.

The release smoke wording remains bounded: it validates installed registration metadata and installed core/projection execution, not registered handler execution through Pi internals.

Validation:

```text
node --test tests/context-pack-extension.test.js
npm run release:check
```

Outcome: compact `context_plan` details are now protected at the source wrapper and installed artifact boundaries without overstating runtime authority or handler execution coverage.

## Receipt N — plan projection metadata hardening

### Context

A deep adversarial review found three metadata-boundary issues left after compact `context_plan` details: overflow Markdown seeds were classified as SCI omissions after their raw value was discarded, invalid core API seed kinds could leak through omitted-seed labels when Pi schema validation was bypassed, and compact details returned the plan non-authorization array by reference.

### Slice

Core seed intake now allowlists seed kinds inside `buildContextPlan`, overflow omitted-seed classification uses the raw coerced seed value, packet omission rendering normalizes seed-kind labels, and plan/detail non-authorizations are copy-on-return from a frozen constant. Tests cover Markdown overflow provider classification, invalid kind redaction in plan and packet projections, and returned-array mutation resistance.

Validation:

```text
node --test tests/context-plan.test.js tests/tool-result.test.js
```

Outcome: context-plan projections now treat caller-controlled metadata labels and returned object references as part of the adversarial boundary, not harmless implementation details.

## Receipt O — atomic-completion projection reference hardening

### Context

An atomic-completion pass found four remaining projection and intake debts: compact plan details still returned live budget/risk/owner-recommendation references, compact packet details returned live packet projection references, non-path omitted seeds rendered as `unsafe_path`, and note truncation appended an ellipsis after the declared 500-character cap.

### Slice

Plan and packet compact details now clone returned projection surfaces, omitted seed reasons distinguish path/symbol/general seed failures, and note truncation keeps the final displayed note within the schema cap. Regression coverage mutates returned plan and packet details to prove source packet/plan objects are not changed, verifies `prompt` oversize omissions render as `unsafe_seed`, and verifies truncated notes stay at 500 characters including the ellipsis.

Validation:

```text
node --test tests/context-plan.test.js tests/tool-result.test.js
```

Outcome: compact details are safer for long-lived in-process consumers, and provider/seed omission labels no longer imply path semantics for non-path seed failures.

## Receipt P — runtime-context provenance for dogfood calibration

### Context

The next product gap remained usefulness proof, but existing receipts could not distinguish source-local dogfood, installed-artifact smoke, and a live Pi session after reload. That made aggregate signals easy to overread as live activation proof.

### Slice

Dogfood observation templates now include `runtimeContext` with `source_local`, `installed_artifact`, `live_pi_reloaded`, or `unknown`. `context_dogfood_evaluate` normalizes and redacts the observer-supplied label, and `context_dogfood_summarize` reports runtime-context counts plus live-reloaded coverage without treating those labels as task completion, AK/FCOS evidence, install proof, or reload proof.

Validation:

```text
node --test tests/dogfood-observation.test.js tests/context-pack.test.js tests/context-pack-extension.test.js
npm_config_cache=/tmp/pi-npm-cache npm run check
npm run dogfood:docs-list-json
node /home/tryinget/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs . --strict
```

Outcome: repeated receipts can now separate package-local, installed-artifact, and live-reloaded calibration before ranking/provider tuning. At this point, core implementation/review/validation activity coverage remained the stable-positive gate, and runtime coverage was reported separately. The first plain `npm run check` attempt hit local `~/.npm` ENOSPC during `npm pack`; rerunning with a temporary npm cache passed.

## Receipt Q — dogfood receipt contract spine hardening

### Context

A deep adversarial review found that runtime-context provenance had landed in the copy-ready observation template but not every receipt surface. Stored evaluation inputs could also carry a forged `status`, and installed-artifact smoke did not prove `installed_artifact` runtime labels.

### Slice

The dogfood receipt contract now propagates `runtimeContext` into the immediate follow-up receipt, recomputes stored evaluation status from stored fields before aggregate counting, records supplied-vs-recomputed status metadata, gates `stable_positive_signal` on both core activity coverage and at least one observer-supplied `live_pi_reloaded` receipt, and updates installed release smoke to set/assert `installed_artifact` runtime context while preserving one legacy unknown receipt for missingness coverage.

Validation:

```text
node --test tests/dogfood-observation.test.js tests/tool-result.test.js tests/context-pack.test.js
npm_config_cache=/tmp/pi-npm-cache npm run check
npm_config_cache=/tmp/pi-npm-cache npm run release:check
npm_config_cache=/tmp/pi-npm-cache npm audit --omit=dev --audit-level=moderate
```

Outcome: aggregate dogfood summaries are less vulnerable to forged stored statuses, runtime provenance is consistent across receipt scaffolds, and release smoke now exercises installed-artifact runtime labels instead of silently normalizing them to `unknown`.

## Receipt R — compact omission and suggestion detail projection

### Context

A next-slice review found that the Markdown packet and dogfood observation template had safer omission projections than the structured `context_pack` tool details. Compact details still cloned public omission `detail` strings and mirrored them into `nextToolSuggestions[].reason`, which could expose repo-relative omitted item paths or budget item ids in the JSON receipt surface.

### Slice

`compactContextPacketDetails` now projects omissions and next-tool suggestions by reference and accounting fields instead of raw detail/reason strings. Markdown packet output remains human-usable, but compact details expose `detailRef` / `reasonRef`, `...Omitted`, estimated token counts, byte counts, provider/reason/tool metadata, and non-authorizations.

Adversarial coverage forces a budget omission for a caller-seeded Markdown path and verifies the packet Markdown can mention the public omission while `details`, compact omissions, and compact next-tool suggestions omit the raw repo-relative path and item id. Existing returned-projection mutation coverage still protects source packet state.

Validation:

```text
node --test tests/tool-result.test.js
```

Outcome: the structured details surface is now closer to the dogfood receipt membrane and less likely to become a raw JSON side channel for omission paths or mirrored owner-surface suggestions.

## Lessons for ranking and product bets

- `context_plan` is useful as the cheap first membrane when the agent is not sure which providers matter, but plan-only output needs a later observed receipt if we claim churn reduction.
- `context_pack` is useful when it returns fresh repo-bounded AGENTS/CLAUDE instruction, docs, and git context with a concrete follow-up receipt; the current receipt was enough to avoid duplicate instruction/product-posture reads.
- `no_packet_needed` is a first-class success state. In this run it avoided 4,424 duplicate estimated tokens and turned the packet into metadata.
- SCI omissions should remain explicit. A read-only packet must not hide `.ontology` side effects or pretend SCI coverage exists when artifacts block safe assembly.
- Landed next improvement: `context_pack` now emits a redacted copy-ready `context_pack_dogfood_observation_v1` template in packet Markdown and compact details so agents can paste observed follow-up counts without persisting evidence, mutating owner surfaces, duplicating raw packet content, or leaking selected item paths / raw omission details.
- Provider-route summaries are a useful addition to the receipt scaffold: they expose provider/posture/query/seed-kind counts for mismatch review while omitting raw seed values, and they must distinguish selected query counts from optional follow-up query counts. Adding more provider adapters remains lower leverage until more evaluated receipts accumulate.
- Release and dogfood proof text must not overclaim: distinguish registered tool metadata, installed core execution, source-local dogfood, and live operator-session activation. Fill `runtimeContext` truthfully; it is observer-supplied calibration metadata, not proof that context-packer verified reload or task completion. Stored evaluations are input, not authority; aggregate status must be derived from normalized fields.
- Packet budget metrics are selected-content metrics unless a receipt explicitly says otherwise; rendered Markdown scaffolding needs separate accounting in tool details.
- Empty docs-list results are provider information, not success; receipt truth needs an explicit `docs/no_results` omission so required docs misses do not disappear.
- Docs-list JSON is a provider contract boundary: invalid JSON, `ok:false`, schema drift, unsupported item shapes, and payload repoRoot mismatch must surface as provider/schema omissions; mixed valid/unsupported items can still select safe docs while preserving the schema omission; nested `package.json` discovery ambiguity must survive provider failures, package roots under fixture/sample container directories must not silently narrow package docs scans, legitimate nested package roots and packages merely named sample/fixture should stay nearest-package scoped, `repoPath` should stay in caller repo-root basis unless the payload declares a safe inner `repoRoot`, package-local JSON `path` fallbacks must be rebased to POSIX repo-relative paths before repo-root packet reads, and process-level docs-list script overrides must be treated as trusted executable code rather than ordinary read-only data.
