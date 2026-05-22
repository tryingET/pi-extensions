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
    "estimatedToolCallsAvoided": 3,
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
  "expectedLowLevelCallsAvoided": 3,
  "actualLowLevelReadSearchStatusCalls": 0,
  "duplicateReadsObserved": false,
  "omissionFollowupsUsed": [],
  "recommendationMatchedOutcome": true,
  "notes": "The correct action was to skip loading duplicate packet content and proceed from already-loaded context. The useful output was the no-packet recommendation plus duplicate-token accounting, not a larger packet."
}
```

Outcome: no-packet recommendation matched the live work. This is the clearest current product proof for session-awareness: the packet should sometimes prevent context growth rather than add content.

## Lessons for ranking and product bets

- `context_plan` is useful as the cheap first membrane when the agent is not sure which providers matter, but plan-only output needs a later observed receipt if we claim churn reduction.
- `context_pack` is useful when it returns fresh AGENTS/docs/git context with a concrete follow-up receipt; the current receipt was enough to avoid duplicate AGENTS/product-posture reads.
- `no_packet_needed` is a first-class success state. In this run it avoided 4,424 duplicate estimated tokens and turned the packet into metadata.
- SCI omissions should remain explicit. A read-only packet must not hide `.ontology` side effects or pretend SCI coverage exists when artifacts block safe assembly.
- Landed next improvement: `context_pack` now emits a copy-ready `context_pack_dogfood_observation_v1` template in packet Markdown and compact details so agents can paste observed follow-up counts without persisting evidence, mutating owner surfaces, or duplicating raw packet content. Adding more provider adapters remains lower leverage until more receipts accumulate.
