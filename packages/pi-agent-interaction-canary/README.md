---
summary: "Read-only Pi canary over injected owner-native Agent Interaction receipts."
read_when:
  - "Testing or integrating the Agent Interaction canary."
  - "Reviewing its authority, acquisition, redaction, or expansion boundaries."
system4d:
  container: "Experimental private Pi extension package."
  compass: "Test bounded owner-native interaction without transferring authority to Pi."
  engine: "Inject receipt -> validate exact coordinates -> compact or bound expansion -> return transient result."
  fog: "Handler provenance is not caller authentication, and a bounded canary pass is not a general compatibility contract."
---

# Pi Agent Interaction Canary

Experimental read-only Pi package registering:

- tool: `agent_interaction_canary`
- command: `/agent-interaction-canary <request-json>`

Pi is a **transient consumer only**. ts-quality retains retention-plan authority, Agent Kernel retains task/evidence authority, and ROCS retains semantic authority. The package creates no files, caches, evidence, session entries, or memory.

## Injected receipts only

The canary performs no acquisition. An authorized caller must inject one complete owner receipt as `receipt_json` together with its exact `provider` and `source_identity`:

| Provider | Owner input | Source identity |
|---|---|---|
| `ts_quality_p1_retention` | Current ts-quality retention projection pilot schema 4 receipt | `ts-quality:retention:<fixture-root-digest>` |
| `agent_kernel_p2_task_projection` | Current Agent Kernel task-inspection projection pilot schema 3 / owner policy v2 receipt | `agent-kernel:task:4666` |
| `rocs_owner_packet` | Closed `rocs.owner-packet.v1` carrying a `semantic-pack-result.v0` | `rocs:pack:<root-id>` |

P1 validation joins the exact owner policy, owner surface/schema, caller identity, validity context, plan generation, authorized-view digest, compact protocol/digest, and recoverable omission pointers. P2 validation joins its exact owner policy and task-show schema, embedded authorized expansion, compact coordinate, entity generation, source digest, policy withholding, selected task ID, and requested task source ID. ROCS validation joins its packet owner/schema/policy digest, generation coordinates, closed pack shape, and domain-separated `pack_digest`.

## Compact and expansion

A compact call requires:

```json
{
  "provider": "agent_kernel_p2_task_projection",
  "source_identity": "agent-kernel:task:4666",
  "receipt_json": "<complete injected JSON receipt>"
}
```

The response binds provider, owner, source identity, owner generation, owner source digest, owner policy digest, consumer policy, and complete payload. Expansion is stateless and requires reinjecting the same receipt plus **all four** compact values:

```json
{
  "view": "expand",
  "expected_source_identity": "<compact binding.source_identity>",
  "expected_generation": "<compact binding.generation>",
  "expected_source_digest": "<compact binding.source_digest>",
  "expected_policy_digest": "<compact binding.policy_digest>"
}
```

Missing, stale, switched, or mismatched bindings fail closed.

## Consumer policy and redaction

`pi-agent-interaction-canary.consumer-policy.v2` hashes every enforcement control, including:

- exact provider/owner/schema/policy coordinates;
- injected-only acquisition and absence of process execution;
- input/output, source-leaf, depth, and compact-leaf caps;
- RFC 6901 pointer encoding;
- sensitive/control/redacted-key subtree withholding;
- inherited non-recoverability of withheld descendants;
- control-character, home-prefix, and secret-token value redactions;
- exhaustive omission classes; and
- all four same-receipt expansion bindings.

Key redaction occurs before pointer construction. A sensitive or control-bearing key becomes `<redacted-key>` and its entire subtree is policy-withheld in both compact and expansion. Withheld content is counted against source caps but never traversed into output or made recoverable. Ordinary value redactions are monotonic across both views.

Compact output emits exactly up to 32 authorized leaves. Every remaining authorized leaf is listed as `compact-leaf-cap`; policy-withheld subtrees are separately listed as `policy-withheld`. Expansion removes only compact-cap omissions and never policy withholding.

## Compatibility receipts and validation

The hermetic suite includes receipts generated from the current owner implementations:

- `tests/fixtures/current-ts-quality-p1-retention-receipt.json`
- `tests/fixtures/current-agent-kernel-p2-task-receipt.json`

Generate/update these only through their owner sidecars during an explicitly authorized compatibility revision. The installed extension itself cannot generate them.

```bash
cd packages/pi-agent-interaction-canary
npm run check
```

Tests cover exact P1/P2 compatibility, ROCS packet joins, source switching, nested secrets, sensitive/control keys, forged receipts, missing and stale bindings, byte/leaf/depth limits, exact compact cap, and static absence of process/filesystem/session-memory surfaces.

Live Pi activation remains separate from implementation validation: under an explicitly authorized task, install the exact local package path, reload or start a fresh Pi process, verify both registrations, then inject current owner receipts for compact and same-receipt expansion. The extension itself performs no installation or acquisition.

## Execution provenance boundary

Every result carries a bounded `execution_provenance` block identifying the loaded extension entry, registered tool, and registered slash command. `observed_pi_invocation` means only that the corresponding Pi tool or command handler was entered (or that a direct function call was used in tests). It is **not** cryptographic caller authentication and grants no authority.

Current owner receipts use `declared_policy_target`. The canary validates that target while preserving the explicit rule that registered handler observation is not cryptographic caller authentication.

The exact adapters additionally require all current mandatory owner checks: P1 schema 4 requires its revised complete check object, declared policy target and authentication deferral, post-redaction authorized-view generation only, exact policy/compact omission equality, recoverable nested pointers, compact text reconstruction, and healthy pilot/redaction/read-boundary posture. P2 schema 3 / policy v2 requires exact production resource `task:4666`, `policy_enforcement`, the explicit unauthenticated standalone caller disclaimer, its revised checks, exact authorized envelope/task grants, exact selected values and omission classes, and deterministic reconstruction of `AK_TASK_COMPACT_PILOT_V1`. Failed, degraded, unknown-field, or drifted receipts are rejected.

Current production compatibility fixture invocations:

```bash
cd /home/tryinget/ai-society/softwareco/owned/ts-quality
node scripts/pilots/retention-projection-pilot.mjs \
  --policy-target pi-agent-interaction-canary

cd /home/tryinget/ai-society/softwareco/owned/agent-kernel
python3 scripts/pilots/task-inspection-projection-pilot.py
```

The P2 production invocation is owner-fixed to `task:4666`; it accepts no caller-selected task argument. `tests/direct-current-owner-probe.mjs` consumes either command's stdout over stdin and performs compact plus bound expansion without adding acquisition to the extension.

## Template lineage

This monorepo package is generated from `../pi-extensions-template` with
`scaffold_mode=simple-package`; `.copier-answers.yml` records the exact local
template commit. The canary-specific implementation is an intentional local
delta over that generated structure.

Use plain installed `ak` from the monorepo root for AK task operations. The
package is private and has `releaseConfigMode=none`; generation and validation
do not authorize publication.

## Package validation

From the package directory:

```bash
npm test
npm run check
```

The package-local quality script delegates to the canonical pi-extensions
package gate. Live activation remains a separate proof step: install from this
exact package path, reload or start a fresh Pi process, and verify the command
and tool through registered handlers.
