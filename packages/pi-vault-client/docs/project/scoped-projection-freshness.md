---
summary: "Client verification of exact scoped template receipts without claiming whole-export freshness."
read_when:
  - "Changing projection diagnostics or scoped Prompt Vault publication."
type: "reference"
system4d:
  container: "Pi client consuming source-owned Prompt Vault projections."
  compass: "Report selected template freshness without overstating inventory freshness."
  engine: "Current DB identity, completed receipt, governed facets and owned file bytes."
  fog: "Pending writes and foreign or linked evidence must fail closed."
---

# Scoped projection freshness

Prompt Vault owns authoring and projection receipts. The client reads current
visible DB rows and verifies a selected template's completed
`prompt-vault/pi-scoped-template-receipt/v1` receipt before consulting the older
global inventory. It checks source Vault identity, template ID/name, destination,
current version, original content hash, normalized file bytes and all governed
facets. Callers of `checkProjectionFreshness` supply the active source Vault
directory; the diagnostics tool uses the same configuration as its DB reader.
Content-bearing template listings include the source ID needed by this check.

Scoped evidence reports `freshness_scope: template` and
`global_freshness: not_checked`. A fresh selected template says nothing about
other files or the global inventory. Incomplete, malformed, foreign, linked or
policy-ineligible scoped evidence fails closed; an old global receipt cannot
hide it. Source updates make an otherwise valid receipt stale. The reader
rejects symlink ancestors, symlink/hardlink evidence and non-regular files.
Templates without scoped receipts retain the existing global v2 checks and
workflow/loop quarantine behavior. This change does not create execution
bindings or relax dispatch gates.
