---
summary: "AK6847 owner disposition: Decision 89/98 development observers stay accepted but inactive on stock Pi 1.1; disabled-path hint is deduplicated against the active replay context."
read_when:
  - "Changing the development semantic-preflight grant, its observers, or the disabled-path hint."
  - "Assessing whether ontology preflight can change the cached SYSTEM prefix on a given Pi host."
system4d:
  container: "AK6847 disposition of the Decision 89/98 development observers on the stock Pi 1.1 host."
  compass: "Keep accepted observers intact while proving the stock host cannot change SYSTEM through them."
  engine: "Real Pi 1.1 SDK regression -> fail-closed grant -> stable SYSTEM -> active-context hint dedup."
  fog: "A dormant fork-only path can be mistaken for a live cache defect, or a passing stock test for fork-host proof."
type: "verification"
---
# Stock Pi 1.1 observer disposition (AK6847)

## Authority

- Task: AK6847. Deferral 632 was released by `ak task resume` on 2026-10-10 after the owner chose this disposition in a native interview.
- Architecture history is unchanged and owned by `core/rocs-cli`: Decision 89 (`~/ai-society/core/rocs-cli/docs/adr/2026-07-31-semantic-pi-extension-handler-observation-v0.md`) and Decision 98 (`~/ai-society/core/rocs-cli/docs/adr/2026-08-01-correlated-pi-agent-prompt-observation-v0.md`). This note is a package-local projection that cites that history. It is neither a decision nor an ADR.
- No successor decision was created. Any future message-based observer successor belongs to the ROCS architecture owner (`core/rocs-cli`) and should start only when a concrete receiver needs it.

## Verified finding: no current runtime defect on stock Pi 1.1

The development grant requires an immutable `ctx.hostCapabilities` carrying `prompt.system.chain.v1` and four other tokens. The installed Pi 1.1.0 host does not supply that object. Its `runner.createContext()` has no such getter, and `agent_prompt_ready`/`promptRunToken` do not exist. Those seams live only on pi-mono fork lines.

A run through the real Pi 1.1.0 SDK observed the following. It loaded this package via `DefaultResourceLoader`, bound the runner in TUI mode, and used a no-network faux provider. The run is pinned by `tests/stock-pi11-dormant-observation.test.ts`.

- `"hostCapabilities" in ctx` is false.
- `status` reads back unavailable, `observation` reads back `state=unsupported-host` (unsupported takes precedence over disabled), and `enable-development` is refused. The UI was asked for confirmation zero times, so no runtime preparation or cache write started.
- No `child_process` call was made, so no ROCS discovery or build ran.
- Across ordinary prompts and ontology-keyword prompts, the SYSTEM message was byte-identical on every provider request, carried the fixed `ontology_workflow` section, and had no preflight marker. History stayed append-only.

So the Decision 89/98 path causes no cache or signed-thinking prefix failure on the stock host. It can change SYSTEM only on a host that advertises these capabilities. On such a host, while a grant is enabled, it still appends a fresh block to SYSTEM on every prompt and therefore still changes the cached prefix. The owner accepted that as the known limitation of the accepted architecture. There the accepted observers, including the positive preparation, exact-match, and mismatch tests, stay unchanged.

## Disabled-path hint dedup

The disabled-path advisory note used to be appended on every keyword prompt, which made history grow by about 290 bytes per prompt. It also claimed "for this prompt", which would go stale if the note were replayed. It is now:

- worded without time: discovery results apply only where the SYSTEM prompt sent with a prompt carries a semantic-preflight block (a missing block can also mean discovery ran but went stale, so the note does not claim discovery never ran);
- emitted only if the host's active replay context (`sessionManager.buildContextEntries()`) does not already carry that exact note, with append-only `context_edit` omission or replacement taken into account. This is persisted-session evidence, not proof of the provider payload: an unpersisted per-request `context` handler could still drop it;
- re-emitted once after compaction drops it, on a branch that never had it, or after an edit omits it; a resumed session dedups from the entries it persisted;
- emitted again (fail open) if the host cannot report its context;
- never editing or removing earlier entries, and never kept in a separate in-memory replay cache.

Coverage: `tests/disabled-hint-dedup.test.ts` (a 60-turn repeated run, resume from persisted entries, a `SessionManager.branch` fork point, compaction, context edits, the older wording, fail open) and `tests/default-prompt-delivery.test.ts` (the registered handler on Pi 1.1).

## Rollback

Revert the package commit. The Decision 89/98 observers and the grant path are not touched by this change.
