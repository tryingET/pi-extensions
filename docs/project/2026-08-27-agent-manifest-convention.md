---
summary: "Versioned standing-agent manifest, Fleet Phase-1 lint/immutable-observation contract, and Phase-0 execution quarantine."
read_when:
  - "Authoring or validating a standing-agent agent.json manifest."
  - "Changing pi-agent-registry discovery, lint, immutable revision, resolution, or dispatch posture."
type: "reference"
---

# Agent manifest convention v1 (AK 5098/5100/5131)

A standing agent is declared by an `agent.json` at its standalone agent-repo
root. The registry maps that declaration to read-only inspection metadata. AK,
source-owner policy, role cards, and persona inputs retain their separate
authority; a manifest or lint result grants none.

**Fleet Phase 2 (AK 5132) is active.** `dispatch_agent` executes exactly one
read-only standing-agent run per `(agent, exact claimed AK task)` pair through
the ASC-owned runtime, with write-once receipts, one typed AK evidence row, and
every unauthorized shape still failing closed with `confirmed_no_effects`.
Readiness, lint health, and manifest existence still grant no authority;
visible standing agents, lifecycle-v2 permit binding, and orchestrator fleet
integration remain later fleet phases. See
`packages/pi-agent-registry/README.md` for the full contract.

## Authoring schema (`agent.json`)

```json
{
  "schema": "ai-society.agent/1",
  "name": "agent-adoption-steward",
  "version": "0.1.0",
  "display_name": "Adoption Steward",
  "role": "Adoption Steward",
  "creation_task": "AK-5100",
  "system_prompt_file": "docs/person/system-prompt.md",
  "skills": {
    "profile": "ec-py",
    "extra": ["softwareco-owned-repo-router"]
  },
  "tools": ["read", "bash"],
  "extensions": [],
  "defaults": {
    "model": null,
    "thinking": "medium"
  },
  "scope": {
    "repos": ["/home/tryinget/ai-society/softwareco/owned/*"],
    "forbidden": [".git", "node_modules", "society.v2.db"],
    "note": "read-only advisory territory"
  },
  "activities": ["prompts/activities/*.md"]
}
```

Rules:

- `name` — canonical one-repo-per-agent machine name; it matches the repository
  basename.
- `role` — one canonical human-readable role-card name. It is descriptive
  binding, not organizational delegation or an executable profile.
- `creation_task` — exact `AK-<positive integer>` provenance reference. Registry
  lint validates syntax only; it does not absorb AK authority or claim the task
  exists, is accepted, or authorizes runtime activation.
- `system_prompt_file` — contained compiled persona artifact. The ratified v2
  template uses `docs/person/system-prompt.md`, reconstructed from the six
  canonical persona inputs plus exact raw manifest bytes.
- `skills.profile` — runtime-compatible as `null` for legacy/template birth,
  but current fleet lint requires one non-empty canonical engineering-core
  profile key or transition alias to satisfy the published EC fleet interface.
- `skills.extra` — additional named skills. Fleet lint treats an extra as
  immutable-bound only when its committed bytes exist in the agent or
  engineering-core snapshot.
- `tools` — exact least-privilege declaration. `[]` means no model-callable
  tools; Phase 1 does not silently turn it into `read`.
- `extensions` — optional child extension declarations; relative paths stay
  inside the agent repo.
- `defaults.model` — `null` delegates future selection; Phase 1 never launches.
- `scope` — advisory operating territory, never a sandbox or authority grant.
- `activities` — contained recurring-work templates; lifecycle authority is not
  inferred from their presence.

## Compatibility and schema evolution

`ai-society.agent/1` runtime parsing keeps `role` and `creation_task` optional
until owner-authorized L2 backfill lands. Fleet lint requires both for current
v2 conformance and reports legacy omissions as errors without mutating agent
repos.

Schema-1 fields may be added: runtime consumers ignore unknown additions at the
top level and inside known objects, while fleet lint emits migration
diagnostics. Known field values remain strict. Removing or renaming a field
requires a new schema integer plus an explicit N/N-1 compatibility window.
Unknown schema versions fail closed.

Engineering-core profile keys are published API identifiers. Canonical keys
remain stable; renames use a direct deprecated alias for a release window.
Fleet lint warns on aliases, rejects unknown profiles/members, and requires the
versioned profile envelope. Legacy raw maps remain runtime-transition reads
only and cannot produce a current fleet-lint result.

## Runtime inspection contract

```text
registry.resolve(name) -> {
  name, role?, creation_task?,
  systemPrompt,
  skillDirs,
  tools, thinking, model, extensions,
  activities, advisory scope,
  cleanup
}
```

This is mutable worktree inspection metadata, not an immutable receipt and not
execution authority. `agent_registry show` may materialize temporary skills for
inspection and cleans them afterward. `agent_registry lint` is the fleet-wide,
no-materialization contract below.

## Fleet lint and immutable revision

`agent_registry action=lint` and `pi-agent-registry-lint` enumerate every
immediate canonical `agent-*` repository, including repositories with missing
or malformed manifests. One bad repo cannot hide the rest of the fleet.
Bounded manifest, provenance, profile-member, skill, and endpoint-finalization
failures become repository-local diagnostics; a candidate that disappears after
discovery is represented as invalid while later candidates continue.

The report schema is `ai-society.agent-fleet-lint/1`. It is an
`immutable_observation` with `authorityEffect=none` and a stable SHA-256 report
identity. It binds, where provable:

- full agent Git commit/tree identity;
- separate clean/dirty/concurrent worktree observation;
- exact committed manifest blob and SHA-256;
- exact engineering-core profile schema, commit/blob, and SHA-256;
- trusted reconstruction of compiled prompt inputs/output without executing
  fleet scripts;
- template ownership bytes and a `verified_local_source` observation only when
  a full source Git revision resolves to a local `tpl-agent-repo` containing
  required template files; this is not template-owner authority or rendered
  product currentness;
- exact role/name collisions;
- advisory committed diary/learning age.

Git capture disables repository fsmonitor/hooks, replacement refs, optional
index locks, external diffs, global/system configuration, paging, and prompting.
Committed symlink/submodule modes do not count as regular manifest/prompt/skill
bytes. The trusted compiler uses Python code-point/newline semantics and fails
closed to `unverifiable` for numeric additive values or unpaired surrogates whose
byte parity is not proven; manifest BOMs remain invalid while persona BOMs remain
content.
Runtime manifest/profile reads also use strict UTF-8 exact bytes and reject
BOM-invalid JSON and unpaired surrogates. Ownership and Copier-source parsing
match the ratified Python owner's `splitlines`/`strip`, duplicate, scalar, and
trailing-`/**` overlap semantics; Fleet additionally requires the manifest and
persona paths to remain agent-owned.

`fresh/current/verified` is never inferred from a path, mtime, semantic version,
short SHA, or author assertion. `stateSha256` identifies equal captured
state/policy; `reportSha256` also binds `observedAt`. Missing, dirty, stale,
malformed, endpoint-drifted, or ambiguous inputs become stable diagnostics or
`unverifiable`; they never become dispatchable. LLM-facing paths are
logical/redacted.
Native error text and configured physical paths are never serialized. Unknown
additive field names are represented only by digests, and physical-path-shaped
role values are omitted with an error rather than entering report identity.

Exact collision lint proves only normalized string equality. Semantic role
pain/differentiation review, creation acceptance, lifecycle state, staleness
disposition, consent, retirement, and activation remain owner/AK decisions.

The current real-fleet baseline is intentionally unhealthy and revision-bound:
three canonical legacy repos lack manifests; the adoption-steward manifest
lacks `role`/`creation_task`, its prompt is not current under the trusted v2
compiler, its extra skill is not commit-bound in the agent/EC snapshots, and
its template provenance is missing. Phase 1 proves truthful visibility, not
out-of-scope backfill.

## Sources of truth

- L0 birth/propagation shape: `core/tpl-template-repo` `tpl-agent-repo` v2.
- Fleet operating/lifecycle/role conventions: `softwareco-agents`.
- Skill-profile interface: engineering-core `skills/profiles.json` plus
  `docs/skill-profiles.md`.
- Runtime task/evidence/decision authority: Agent Kernel.
- Read-only manifest/fleet observation: `packages/pi-agent-registry`.
- Bounded Phase-2 execution: ASC-owned runtime only through the pi-agent-registry exact-task read-only dispatch contract (AK 5132).
