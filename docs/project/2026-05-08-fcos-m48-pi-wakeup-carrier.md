---
summary: "Pi/host-runtime carrier for FCOS-M48 steward-continuity wake-up participation: pi-context-overlay presents current context, pi-provenance can provide minimal source-owned session provenance, and neither becomes continuity-state authority."
read_when:
  - "You need the exact Pi carrier for FCOS-M48 steward-continuity wake-up participation."
  - "You are deciding whether governance-kernel can cite Pi/host-runtime evidence for the selected steward-continuity receipts + wake-up-routing packet."
  - "You need the boundary between Pi wake-up presentation, AK continuity state, Prompt Vault procedures, KES crystallization, and session JSONL evidence."
type: "reference"
---

# FCOS-M48 Pi wake-up participation carrier

## Purpose

This note materializes the Pi/host-runtime side of the selected `FCOS-M48-01` packet:

```text
steward-continuity receipts + wake-up routing
```

It names the exact Pi-owned carrier surfaces that participate in wake-up presentation and evidence without making Pi canonical continuity-state authority.

## Carrier identity

| Field | Value |
|---|---|
| Cross-repo concern | `FCOS-M48-01` |
| Selected packet | steward-continuity receipts + wake-up routing |
| Source owner | `softwareco/owned/pi-extensions` |
| Carrier task | AK task `#2629` |
| Presentation carrier | `packages/pi-context-overlay` |
| Provenance helper | `packages/pi-provenance` |
| Governance gate task | governance-kernel task `#2626` |
| AK continuity carrier | agent-kernel task `#2628` |

## What Pi carries

Pi / host runtime carries the steward-facing wake-up participation surface.

For this first slice, the exact carrier is:

1. **`pi-context-overlay` presentation**
   - `/c` opens a current-session context inspector overlay.
   - `/context-report` generates a concise context-window report.
   - The package rebuilds from `ctx.sessionManager` on session lifecycle events, so it participates in wake-up by presenting current context to the operator/steward.

2. **`pi-provenance` evidence helper**
   - extracts minimal source-owned assistant-message/session provenance from Pi session state;
   - can support downstream evidence writers without making AK, governance-kernel, or orchestrator the source owner for Pi runtime facts.

This pair is the first exact Pi carrier for `FCOS-M48`: `pi-context-overlay` presents wake-up context, and `pi-provenance` can identify Pi-owned runtime evidence when a downstream owner records it.

## First-slice participation record

```json
{
  "schemaVersion": "pi.steward-wakeup-carrier.v0",
  "concern": "FCOS-M48-01",
  "selectedPacket": "steward-continuity receipts + wake-up routing",
  "owner": "softwareco/owned/pi-extensions",
  "carrierTask": 2629,
  "presentationCarrier": "packages/pi-context-overlay",
  "provenanceHelper": "packages/pi-provenance",
  "state": "exact_pi_carrier_named_not_continuity_authority",
  "authority": {
    "wakeUpPresentationAuthority": true,
    "sessionProvenanceSourceOwner": true,
    "canonicalContinuityStateAuthority": false,
    "procedureAuthority": false,
    "crystallizationAuthority": false,
    "fullStewardRuntimeImplemented": false
  },
  "requiresBeforeFcosM48Closeout": [
    "agent-kernel continuity receipt / active-state carrier evidence",
    "governance-kernel reconciliation citing both owner carriers"
  ]
}
```

This is a carrier participation record, not a new Pi persistence schema.

## Non-authorizations

This carrier does **not** authorize:

- treating Pi session JSONL as sovereign continuity memory;
- treating `/c` or `/context-report` output as canonical continuity state;
- claiming full steward runtime / jurisdiction implementation;
- moving Prompt Vault into continuity-state authority;
- moving KES into dynamic continuity ownership;
- closing `FCOS-M48-01` without AK carrier evidence and governance-kernel reconciliation.

## Governance-kernel closeout use

Governance-kernel may cite this file and task `#2629` as the Pi/host-runtime owner-carrier evidence for the selected packet only when paired with:

1. agent-kernel continuity-receipts / active-state carrier evidence;
2. governance-kernel reconciliation that keeps the selected packet boundary explicit;
3. no claim that Pi owns canonical continuity state.

## Later widening, if needed

A later Pi implementation wave may add a purpose-built steward wake-up command or widget. That widening should remain package-owned and should not silently move canonical continuity state out of AK.
