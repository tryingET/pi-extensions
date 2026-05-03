---
summary: "RFC for reducing Pi's default custom tool surface through lazy toolbox discovery, activation profiles, and package-owned lazy tool bundles."
read_when:
  - "You are changing how pi-extensions custom tools are discovered, activated, or loaded by default."
  - "You need the target architecture for starting Pi with a small active tool set while keeping heavy package capabilities discoverable."
  - "Before moving package tools into a central registry, MCP bridge, or generic always-on extension."
type: "proposal"
system4d:
  container: "Repo-root RFC for lazy custom-tool discovery and activation in pi-extensions."
  compass: "Start Pi with only the smallest useful active tool surface, while preserving explicit capability discovery and package-owner boundaries."
  engine: "Define stable toolbox core -> define package-owned lazy bundle contract -> activate profiles on demand -> validate startup/tool-surface reduction -> preserve rollback to eager mode."
  fog: "The main risks are hiding tools without reducing startup load, centralizing package behavior in the toolbox, and making governed/mutating tools too easy to activate by accident."
---

# RFC — lazy Pi toolbox discovery and activation

## Decision in one sentence

Create a new **`pi-toolbox-discovery`** package from the pi-extensions package template as an always-on but small broker: it discovers capability bundles from a catalog, lazily imports package-owned tool bundles only when needed, activates bounded tool profiles for the current session, keeps `self` and `interview` always active as foundational operator tools, and keeps heavyweight package extensions disabled by default once their lazy exports exist.

## Status

Draft RFC for review.

This RFC revises the initial architecture sketch after review findings identified required fixes around:

- lazy bundle interface
- catalog schema and ownership
- activation lifetime and persistence
- risk profiles and mutating-tool gates
- package-owner boundaries
- transitional compatibility
- validation and rollback

## Scope

In scope:

- the default active custom-tool surface in normal Pi sessions
- discovery of latent pi-extensions capabilities
- activation and deactivation of package-owned custom tools
- lazy import of heavyweight package tool bundles
- static/generated catalog metadata for capability routing
- skill-based semantic discovery that points to toolbox activation
- migration from eager extension loading to lazy bundle loading
- validation, rollback, and operator-visible diagnostics

Out of scope:

- changing built-in Pi tools such as `read`, `bash`, `edit`, and `write`
- changing Prompt Vault, AK, ROCS, or society authority semantics
- moving package behavior into a central toolbox implementation
- making MCP the primary Pi tool-discovery mechanism
- changing model/provider APIs directly
- implementing the first package refactor in this RFC
- recording an ADR or AK decision by file creation alone

## Problem framing

The current Pi agent startup surface exposes many custom tools by default. This creates two separate problems that are easy to confuse:

1. **Active tool-schema pressure**
   - every active tool contributes schema and prompt guidance to provider requests
   - most sessions do not need most tools
   - the model's tool-choice space becomes noisier than the task requires

2. **Extension startup/load pressure**
   - heavy extension modules can load at startup even if their tools are never used
   - hiding tools after startup does not remove this cost
   - package initialization side effects become harder to reason about

The desired target is not merely "fewer tools shown in the prompt." The desired target is:

> Pi starts with a tiny always-active tool surface, discovers capabilities cheaply, imports heavyweight package tool bundles only on demand, activates tools only for bounded purposes, and preserves package-owner authority.

## Evidence backing the framing

Pi already provides the primitives needed for this architecture:

- extensions can register tools with `pi.registerTool()` after startup
- extensions can change active tools with `pi.setActiveTools()`
- extensions can inspect active/all tools with `pi.getActiveTools()` and `pi.getAllTools()`
- skills already provide progressive-disclosure instructions: names and descriptions are in the prompt, full instructions are read on demand
- package filtering in settings can disable package extensions or narrow package resources
- package manifests already identify extension entrypoints

Current pi-extensions evidence:

- `pi-vault-client`, `pi-autoresearch`, `pi-society-orchestrator`, `pi-ontology-workflows`, `pi-designmd-foundry`, `pi-peer-messaging`, `pi-autonomous-session-control`, and `pi-little-helpers` all expose useful but task-specific tools
- many of those tools are governance-heavy or domain-specific, and should not be model-visible for ordinary file/code work
- some packages already contain clear family boundaries that can become activation bundles, for example vault, ontology, design, autoresearch, orchestrator, peer messaging, and self/subagent support

## Evidence limits

There is still insufficient evidence for:

- exact startup latency saved by each package's lazy conversion
- whether every current package can be refactored without changing tool behavior
- whether all existing session-resume flows preserve expectations when active tools are no longer restored eagerly
- whether one multiplexed toolbox tool is better than separate `toolbox_search` / `toolbox_activate` tools for model behavior

This RFC therefore separates the target architecture from rollout phases and requires validation before changing global defaults.

## Current boundary

The toolbox does not own any domain behavior.

Owner boundaries:

| Concern | Owner |
|---|---|
| capability discovery and activation state | `pi-toolbox-discovery` |
| Prompt Vault tool behavior | `pi-vault-client` |
| autoresearch runtime behavior | `pi-autoresearch` |
| ontology workflow behavior | `pi-ontology-workflows` |
| society orchestration behavior | `pi-society-orchestrator` |
| DesignMD behavior | `pi-designmd-foundry` |
| peer messaging behavior | `pi-peer-messaging` |
| subagent/self behavior | `pi-autonomous-session-control` and owning packages |
| canonical tasks/evidence/decisions | AK / society runtime, not toolbox |
| reusable prompt/procedure authority | Prompt Vault, not toolbox |
| semantic authority | ROCS / ontology owner repos, not toolbox |

Interpretation rule:

> `pi-toolbox-discovery` is an activation broker. It may discover, import, register, activate, deactivate, and report tools. It must not reimplement another package's runtime operation or become a new canonical authority surface.

## Target architecture

### Stable core

Create a new package:

```text
packages/pi-toolbox-discovery
```

The package owns:

- a small always-on extension
- one model-callable toolbox tool, or a small pair of toolbox tools after testing
- one optional `/toolbox` interactive command
- a capability catalog loader
- activation state and TTL handling
- lazy bundle import orchestration
- diagnostics and validation helpers

It does not own:

- package-specific tool implementations
- domain commands from other packages
- authority/policy semantics beyond activation risk gates
- package-specific schemas except catalog metadata

### Minimal default active tool set

Normal startup should target this active set:

```text
read
bash
edit
write
self
interview
toolbox
```

The default always-active custom tools should be limited to `self`, `interview`, and `toolbox`.

Optional local profiles may keep additional tools active, but those profiles must be explicit. Examples:

- `minimal`: built-ins + `self` + `interview` + `toolbox`
- `coding`: built-ins + `self` + `interview` + `toolbox`
- `ai-society-control-plane`: built-ins + `self` + `interview` + `toolbox`, with suggested but not auto-active society bundles
- `design`: built-ins + `self` + `interview` + `toolbox`, with suggested but not auto-active DesignMD bundle

### Answer: should `self` be always active?

Yes.

`self` is foundational operator/agent introspection, not a domain-heavy package capability. It should remain always active so agents can inspect their own progress, loops, touched files, and remembered traps without first needing to discover the introspection mechanism. It should still stay small and should not become a hidden activation path for unrelated heavy tools.

### Answer: should `interview` be always active?

Yes.

Structured operator interaction is a foundational UX affordance, not a domain-heavy package capability. It should remain always active because the safest response to ambiguous requirements is often to gather structured input rather than guessing or activating a large capability family. The toolbox may still expose an `operator-interaction` bundle later for additional interaction tools, but the core `interview` tool remains in the minimal active set.

### Answer: what owns the toolbox?

A new standalone package should own it: `packages/pi-toolbox-discovery`.

Reasons:

- `pi-context-overlay` is about context surfaces, not activation authority
- `pi-little-helpers` is intentionally utility-oriented and would become too broad
- a standalone package makes the architecture explicit, testable, and removable
- package-owner boundaries remain clearer when toolbox behavior is not mixed into an existing domain package

## Toolbox tool surface

### First-slice tool shape

Start with one multiplexed tool:

```ts
toolbox({
  action: "search" | "activate" | "deactivate" | "status" | "explain",
  query?: string,
  bundle?: string,
  profile?: string,
  tools?: string[],
  ttlTurns?: number,
  pin?: boolean,
  riskAcknowledged?: boolean
})
```

Reason:

- one toolbox broker plus the foundational `self` and `interview` tools keeps startup surface intentionally small
- action enum keeps the schema bounded
- `status` makes current activation posture visible
- `explain` lets the model/user inspect why a bundle exists without importing it

A later review may split this into:

```text
toolbox_search
toolbox_activate
toolbox_status
```

only if empirical use shows the multiplexed shape harms model reliability.

### Tool behavior

`search`:

- reads catalog metadata only
- does not import bundle modules
- returns matching bundles, profiles, risk class, and suggested activation command

`activate`:

- resolves a bundle/profile/tool subset
- checks risk gates
- lazy-imports the owning package's bundle module if needed
- calls that package's exported registration function
- calls `pi.setActiveTools([...current, ...newTools])`
- records activation state and TTL
- returns the exact tools activated and their expiration policy

`deactivate`:

- removes selected tools from the active set with `pi.setActiveTools()`
- does not require unregistering tool definitions
- records deactivation state

`status`:

- reports active tools
- registered but inactive tools
- available lazy bundles
- imported bundles
- active high-risk tools
- TTL/pin state
- recent activation/deactivation events

`explain`:

- returns catalog metadata and package ownership for a bundle/profile
- does not import heavy package modules

## Lazy bundle contract

Each package that wants toolbox activation must export a package-owned lazy bundle module.

Recommended module path convention:

```text
src/toolbox-bundle.ts
```

Built output path is package-specific but must be declared in the catalog.

### Type contract

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export interface ToolboxBundleContext {
  cwd: string;
  profile: string;
  requestedTools?: string[];
  activationId: string;
  signal?: AbortSignal;
}

export interface ToolboxRegisteredToolSummary {
  name: string;
  profile: string;
  risk: "safe" | "read" | "diagnostic" | "mutating" | "external-mutation" | "orchestrator-gated";
}

export interface ToolboxBundleModule {
  readonly id: string;
  readonly version: 1;
  registerToolboxBundle(
    pi: ExtensionAPI,
    context: ToolboxBundleContext
  ): Promise<ToolboxRegisteredToolSummary[]> | ToolboxRegisteredToolSummary[];
}
```

### Bundle rules

A lazy bundle module may:

- register tools owned by its package
- share package-owned schema definitions with its eager extension
- validate local runtime prerequisites
- expose multiple profiles such as `read`, `diagnostic`, `mutating`, or `all`

A lazy bundle module must not:

- mutate package state merely by being imported
- register unrelated package tools
- bypass existing package guardrails
- register commands/widgets/event handlers unless the catalog declares `sideEffects: "commands-or-ui"` and the activation profile allows it
- perform domain operations during activation
- claim canonical authority for anything it merely activates

### Eager compatibility mode

Each converted heavy package may keep an eager extension path for compatibility, but eager behavior should be explicitly gated:

```text
PI_TOOLBOX_EAGER=1
```

or by package-local setting.

Default after migration should be lazy for heavyweight tool families.

## Catalog schema

The toolbox catalog should be generated where possible and curated where necessary.

Recommended checked-in source file:

```text
packages/pi-toolbox-discovery/catalog/toolbox.catalog.json
```

Recommended generated report:

```text
packages/pi-toolbox-discovery/dist/toolbox.catalog.generated.json
```

### Catalog entry shape

```json
{
  "id": "vault",
  "title": "Prompt Vault tools",
  "description": "Prompt Vault query/retrieve/governed mutation/rating workflows.",
  "ownerPackage": "packages/pi-vault-client",
  "ownerSemantics": "pi-vault-client owns Prompt Vault tool behavior; toolbox owns discovery and activation only.",
  "keywords": ["prompt vault", "vault", "template", "prompt", "governed prompt"],
  "module": "packages/pi-vault-client/dist/toolbox-bundle.js",
  "piHostRange": ">=0.61.0",
  "sideEffects": "tools-only",
  "profiles": [
    {
      "id": "read",
      "description": "Read-only vault query/retrieve/dispatch-check flows.",
      "tools": ["vault_query", "vault_retrieve", "vault_vocabulary", "vault_dispatch_check"],
      "risk": "read",
      "defaultTtlTurns": 4,
      "requiresExplicitUserIntent": false
    },
    {
      "id": "mutating",
      "description": "Governed Prompt Vault insert/update/rate flows.",
      "tools": ["vault_insert", "vault_update", "vault_rate"],
      "risk": "mutating",
      "defaultTtlTurns": 2,
      "requiresExplicitUserIntent": true
    }
  ]
}
```

### Catalog fields

Required:

- `id`
- `title`
- `description`
- `ownerPackage`
- `ownerSemantics`
- `keywords`
- `module`
- `profiles[]`

Recommended:

- `piHostRange`
- `sideEffects`
- `docs`
- `skills`
- `validationCommand`
- `rollbackNotes`
- `defaultTtlTurns`

### Catalog truth rule

The catalog may duplicate tool names, descriptions, and package ownership facts, but only as routing metadata.

It must not duplicate:

- tool schemas as a second source of truth
- execution logic
- authority semantics that belong to domain packages
- Prompt Vault, AK, ROCS, or orchestrator decisions

If generated metadata and curated metadata disagree, validation must fail until the owner updates one of them.

## Activation profiles and risk gates

Risk classes:

| Risk | Meaning | Default activation |
|---|---|---|
| `safe` | local display, status, or non-mutating helper | allowed by model/toolbox |
| `read` | read-only domain access | allowed by model/toolbox |
| `diagnostic` | read-only checks that may be slower or environment-sensitive | allowed with clear result text |
| `mutating` | local governed state/file/db mutation possible | requires explicit user intent or policy pin |
| `external-mutation` | push, publish, release, network write, or public mutation possible | requires explicit user approval at use time; activation alone is not approval |
| `orchestrator-gated` | tool is itself a gate/dispatch surface | allowed only under package-defined gate semantics |

### Answer: can mutating tools activate without explicit confirmation?

No, not by default.

The toolbox may suggest a mutating profile, but actual activation must require one of:

- direct operator request naming the capability or mutation class
- session-pinned policy allowing that profile
- package-owned confirmation flow

Activation of a mutating tool is still not permission to execute a mutation. Tool-specific guardrails remain in force.

### External mutation rule

External mutation approval must remain use-time explicit.

Activating a tool such as a release workflow does not approve:

- git push
- GitHub Release creation
- npm publication
- cloud mutation
- public state change

The owning tool must still require its own explicit approval parameter or confirmation.

## Activation lifetime and persistence

Default activation is **ephemeral**.

Modes:

| Mode | Behavior | Use case |
|---|---|---|
| `ephemeral` | active for `ttlTurns`, then deactivated | ordinary model-discovered need |
| `session` | active until `/reload`, session shutdown, or explicit deactivate | focused work session |
| `pinned` | restored from session metadata for the current branch/session | operator-chosen persistent profile |

Default TTL:

- `safe`: 6 turns
- `read`: 4 turns
- `diagnostic`: 3 turns
- `mutating`: 2 turns
- `external-mutation`: 1 turn
- `orchestrator-gated`: 2 turns unless package catalog says otherwise

### Answer: persist across `/reload`?

Only pinned activations should persist across `/reload`.

Ephemeral and session activations should be cleared on reload because reload often means extension/resource posture changed.

### Answer: persist across resume?

Only pinned activations should restore on resume.

The restore should be branch-local if Pi session metadata can identify branch entries. Otherwise it should restore only when the session's latest toolbox activation state explicitly says it is pinned.

### Answer: persist across session tree navigation?

Pinned activation should follow the current branch's latest toolbox state.

Ephemeral activation should not be replayed when navigating history. This avoids surprising reactivation of tools that were active for a past local task.

## Skills as semantic discovery

Skills should become the human/model semantic trigger layer.

For each major bundle, provide or update a short skill:

```text
prompt-vault-toolbox
ontology-toolbox
autoresearch-toolbox
designmd-toolbox
society-orchestrator-toolbox
peer-messaging-toolbox
session-introspection-toolbox
operator-interaction-toolbox
```

Each skill should:

- describe when the capability is relevant
- tell the model to call `toolbox({ action: "search", query: ... })` first when uncertain
- specify read-only activation examples
- specify mutating activation requirements
- avoid copying full tool schemas

Skills do not replace tools. They reduce always-on instruction load and point to explicit activation.

## Options considered

| Option | Description | Strengths | Risks / reasons not preferred |
|---|---|---|---|
| **A. New lazy toolbox discovery package** **(preferred)** | Add a small always-on toolbox that searches a catalog, imports package-owned bundles, and activates bounded profiles | Small active tool surface, preserves package boundaries, true startup-load reduction after migration, testable | Requires package refactors and catalog discipline |
| B. Hide tools after startup only | Keep all existing extensions loaded, then call `pi.setActiveTools()` to keep few active tools | Fast transitional win, low package refactor risk | Does not reduce extension startup cost; easy to mistake for final architecture |
| C. Use skills only | Rely on skills to instruct the model how to use existing tools | Good progressive disclosure for instructions | Does not reduce active tool schema surface or extension loading |
| D. Use MCP as the primary tool broker | Put tools behind MCP servers or a broker MCP server | Potential external ecosystem compatibility | Pi does not need MCP for native packages; MCP still needs profiles/brokering to avoid huge tool lists |
| E. Put toolbox into `pi-little-helpers` | Add toolbox as another utility | Lower package count | Makes little-helpers too broad and obscures architecture significance |
| F. Put toolbox into `pi-context-overlay` | Treat activation as context management | Adjacent to context reduction | Tool activation is a runtime capability boundary, not only context display |
| G. Keep current eager all-tools state | No migration | Zero implementation cost | Preserves avoidable prompt/tool-schema noise and heavy startup behavior |

Preferred direction:

- adopt Option A as the target
- allow Option B as Phase 1 only
- use skills from Option C as a discovery layer, not the whole solution
- keep MCP as optional future backend, not the primary Pi-native architecture

## Chosen architecture

The chosen architecture has four layers.

### Layer 1 — always-on toolbox core

At startup, Pi loads:

- built-in file/code tools
- `pi-toolbox-discovery`
- lightweight UI/status extensions that do not add model-callable tool clutter

The model sees only `self`, `interview`, and `toolbox` as always-active custom tools; `toolbox` is the only custom discovery/activation broker.

### Layer 2 — cheap catalog discovery

The toolbox searches catalog metadata without importing heavy package modules.

The catalog answers:

- what capability exists?
- who owns it?
- what profiles are available?
- what tools would be activated?
- what risk class applies?
- what docs/skills are relevant?

### Layer 3 — package-owned lazy bundle registration

When activation is requested, the toolbox imports the owning package's bundle module and calls its exported registration function.

The owning package registers its own tools.

The toolbox then enables those registered tools by active name.

### Layer 4 — bounded activation state

The toolbox tracks activation TTL, pin/session mode, risk class, and deactivation.

It can deactivate by removing tools from the active set without trying to unload modules.

## Transitional compatibility plan

### Phase 0 — diagnostics only

Add a diagnostic script or development command that reports:

- active tools
- registered tools
- tool source packages
- prompt-snippet count
- extension package count
- top packages by tool count

No behavior changes.

### Phase 1 — active tool minimization

Implement `pi-toolbox-discovery` with toolbox status and activation of already-registered tools.

At session start, set active tools to:

```text
read,bash,edit,write,self,interview,toolbox
```

This reduces model-visible tool schemas but does not yet reduce heavy package load.

Phase 1 must be labeled transitional.

### Phase 2 — catalog-backed activation

Add the catalog and search/activate/deactivate/status flows.

Existing eager packages may still load, but activation becomes explicit and observable.

### Phase 3 — lazy package exports

Convert heavy packages one by one to export toolbox bundle modules.

Initial target order:

1. `pi-vault-client`
2. `pi-ontology-workflows`
3. `pi-designmd-foundry`
4. `pi-autoresearch`
5. `pi-society-orchestrator`
6. `pi-peer-messaging`
7. `pi-autonomous-session-control`
8. selected `pi-little-helpers` tools

Each package conversion must prove schema/behavior parity for the activated tools.

### Phase 4 — settings default switch

Once critical bundles exist, update default/local settings to disable heavyweight eager extensions by default and load them through toolbox bundles instead.

Example target shape:

```json
{
  "packages": [
    "../../ai-society/softwareco/owned/pi-extensions/packages/pi-toolbox-discovery",
    {
      "source": "../../ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client",
      "extensions": [],
      "prompts": []
    }
  ]
}
```

### Phase 5 — policy hardening

Add:

- activation presets
- per-repo suggested bundles
- high-risk activation review
- catalog drift checks
- compatibility checks against Pi host version
- release-contract docs for package authors

## Compatibility and failure behavior

### Answer: how does toolbox know host compatibility?

Each catalog entry may declare `piHostRange`.

The toolbox should compare that range against the live Pi host version when available. If unavailable, it should warn and continue only for low-risk profiles.

The bundle module may also export or check compatibility during activation. If host compatibility fails, activation fails closed and no active tools are added.

### Answer: do all bundles need profiles?

Yes.

Every bundle must support at least one profile named `default`.

Governance-heavy bundles should support narrower profiles such as:

- `read`
- `diagnostic`
- `mutating`
- `all`

The `all` profile should not be the default for heavyweight or governed bundles.

### Answer: what happens if lazy import fails?

Activation fails closed.

The toolbox result should include:

- bundle id
- requested profile/tools
- module path
- error summary
- whether any tools were activated before failure
- rollback/deactivation action taken
- next suggested command or fallback

If partial registration occurred, toolbox should deactivate any newly active tools from that failed activation id.

### Answer: how to restore current eager behavior?

Rollback options:

1. set `PI_TOOLBOX_EAGER=1` for converted packages that support eager mode
2. disable `pi-toolbox-discovery` session-start minimization
3. restore previous package settings entries that load eager extensions
4. `/reload` Pi
5. verify `toolbox_status` or `/tools` shows restored active tools

The first implementation must document the exact rollback commands after the package paths are final.

## Validation expectations

### Static checks

- catalog JSON schema validates
- every catalog `ownerPackage` path exists
- every catalog `module` path exists after build
- every profile has non-empty `tools`
- every risk class is valid
- no two bundles claim the same tool name unless an explicit conflict policy exists
- generated tool inventory matches curated catalog tool lists

### Runtime checks

- default active custom tool count is at or below 3 in minimal profile: `self`, `interview`, and `toolbox`
- `toolbox({ action: "search" })` does not import heavy package modules
- read-only bundle activation registers and activates expected tools
- deactivation removes tools from active list
- TTL expiration removes tools after expected turns
- mutating profile activation requires explicit user intent or policy pin
- failed lazy import leaves no newly active tools behind
- pinned activation restores on reload/resume only when expected

### Package parity checks

For each converted package:

- lazy-registered tool names match eager tool names for the selected profile
- tool parameter schemas match or have a documented compatibility migration
- prompt snippets/guidelines match intended active-tool behavior
- package-local tests cover activation through the toolbox bundle
- eager compatibility mode remains available until migration closure

### Root validation

Before accepting this RFC as ADR basis, reviewers should expect at least:

```bash
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs . --strict
just check
```

After implementation begins, add package-specific tests under `packages/pi-toolbox-discovery` and converted packages.

## Success criteria

This RFC succeeds if later implementation reaches a state where:

- ordinary Pi sessions start with built-in tools plus only `self`, `interview`, and one custom toolbox broker
- capability discovery works without importing heavyweight package modules
- at least vault, ontology, and DesignMD bundles can activate lazily
- mutating/governed tools are not activated by accident
- package-owner boundaries are visible in catalog and code
- current eager behavior has a documented rollback path
- validation proves both active-tool reduction and startup-load reduction

## Non-goals and rejected interpretations

Do not interpret this RFC as saying:

- toolbox owns Prompt Vault, ontology, orchestration, or autoresearch behavior
- hidden activation is allowed because fewer tools are visible
- mutating tool activation is mutation approval
- MCP should become the primary interface for Pi-native package tools
- hiding tools after startup is sufficient final architecture
- all packages must convert in one wave
- skills alone solve the tool-surface problem

## First implementation slice

The first implementation slice should be deliberately modest:

1. create `packages/pi-toolbox-discovery`
2. register one `toolbox` tool and optional `/toolbox` command
3. implement `status`, `search`, and activation of already-registered tools
4. add session-start minimization behind a feature flag or explicit setting
5. add a small hand-written catalog for two bundles, for example `vault` and `designmd`
6. add tests for active-tool minimization and deactivation
7. document rollback to the current eager state

This slice proves the operator/model UX before heavy package refactors.

## Open questions for review

These are real review questions, not implementation TODOs:

1. Should Phase 1 minimization be on by default in this repo, or behind an opt-in flag until two lazy bundles exist?
2. Should the toolbox surface remain one multiplexed tool, or should `search` and `activate` split before first release?
3. What is the exact host-version source for `piHostRange` checks in local development?
4. Should pinned activation be stored as session custom entries, settings, or both?
5. Which two packages should prove lazy bundle parity first: vault/designmd, or vault/ontology?
6. How strict should generated-vs-curated catalog drift checks be during Phase 2?
7. Should packages with commands/widgets have separate non-tool lazy activation, or should toolbox only handle model-callable tools in the first ADR?

## ADR basis draft

If this RFC is accepted after review, the ADR should carry forward these decisions:

- create `packages/pi-toolbox-discovery` as the activation broker
- keep default active custom tools to `self`, `interview`, and one toolbox broker in minimal profile
- define package-owned lazy bundle exports as the stable extension seam
- keep catalog metadata as routing/discovery truth, not execution truth
- require risk profiles and explicit gates for mutating/external-mutation tool activation
- treat active-tool minimization as Phase 1 and true lazy import as Phase 3 success
- preserve eager rollback until converted packages prove parity

## Next legal move

Run a fresh multi-perspective RFC review against this revised RFC.

Recommended review prompt:

```text
Review docs/project/2026-05-03-rfc-lazy-pi-toolbox-discovery.md as an architecture-significant RFC for pi-extensions. Focus on runtime/tool activation boundary, package-owner separation, migration/rollback, and validation realism. System4D mode: lite.
```
