---
summary: "Candidate cross-owner runtime contracts, public fixtures, and claim/failure/effect crosswalk for Gate A."
read_when:
  - "Implementing or reviewing registry, Vault-client, ASC, tool/extension descriptor, or Pi integration."
type: "contract-candidate"
status: "owner_acceptance_pending"
---

# Gate A runtime integration contract

## Integration stewardship

`pi-extensions` is the smallest existing integration surface containing pi-agent-registry, pi-vault-client, pi-autonomous-session-control, and tool/extension descriptor work. It publishes shared fixtures and a semantic crosswalk without becoming owner of governance law, Prompt Vault content, Agent Kernel authorization, Pi core runtime, or effects. No neutral repository, new service, or giant global error enum is introduced.

## Public claim boundary

- **Registry** resolves, builds/materializes, hashes, and verifies release evidence. It never approves, appoints, authorizes, or activates.
- **Vault client** retrieves exact governed content and produces a narrowing-only materialized view. It never grants appointment, authorization, credentials, or effects.
- **Descriptors** are owner-produced claims about executable identity, hooks, tools, inputs, and compatibility. A descriptor grants no authority and does not self-verify.
- **Pi runtime** receives a complete resolved envelope and reports actual provider inputs, prompts, skills, context, memory, transcript, compaction, tools, extension hooks, credentials, modes, and session semantics.
- **ASC** owns process/session custody, pre-effect gating, runtime linkage, and effect receipts/dispositions. Pi pre-provider evidence is not ASC pre-effect evidence.

## Exact resources and complete trees

Strict resolution accepts only L0-owned provider-qualified, algorithm-tagged exact references. The owner schemas in `contracts/gate-a/schemas/` reference that generic contract rather than copying it. Bare-name precedence is forbidden in strict mode. Complete skill trees and invocation policy—including disabled model invocation—survive resolution and materialization. Physical paths remain local locators.

## No-ambient and hard ceiling

The expected envelope is closed-world. Omitted prompts, context, skills, memory, transcripts, compaction, extensions, hooks, tools, credentials, and modes mean absent, not inherited defaults. The run permit is a ceiling; every effective runtime surface must be a subset. Unknown or unobservable surfaces are `unproven`, never assumed empty. Read-only prompt text or a tool list is not confidentiality or OS confinement.

Extension hooks are distinct from tools. `fixtures/gate-a/extension-hook-inventory.json` is a current-source-bound candidate inventory, not a runtime observation. Runtime evidence must enumerate every reachable hook after loading and provider transforms.

## Session, delegation, effects, and rollback

Fresh and resumed sessions are distinct. The first pilot requires fresh/no transcript/no memory/no compaction. A pre-task-provider attestation binds final rendered provider inputs before the model call; ASC separately gates effects and links any effect receipt to the runtime attestation and current permit. Child authority is the trusted intersection of release, resources, tools, hooks, credentials, effects, target scope, quotas, and time; a model may request less, never more.

Current Phase-2 registry dispatch, schema-1 manifests, Vault-client calls, and ASC behavior remain available. Strict mode is additive and non-default. Rollback disables its feature flag and retains existing evidence as historical; rollback cannot promote old evidence to accepted standing-agent evidence.

All identities and receipts under `fixtures/` are synthetic compatibility vectors. They are not appointments, approvals, permits, runtime observations, or settled effects. Gate A acceptance covers contracts and mutually compatible fixtures; Stage B must implement and observe the strict runtime/effect envelope.
