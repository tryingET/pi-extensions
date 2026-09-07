---
summary: "AK5491/AK5503: producer-grounded read-only Grok/ZCode reset inventory, machine query, and installed runtime proof."
read_when:
  - "Continuing reset inventory/auth work or shipping the local subscription query implementation."
system4d:
  container: "pi-little-helpers consumer, sub-core provider adapters, and toolbox discovery."
  compass: "Read actual reset inventories; preserve authentication and per-window semantics."
  engine: "Subscription search -> producer source -> fixed read endpoints -> strict validation -> live proof."
  fog: "HTTP 200 can contain a gRPC failure; quota windows and reset cards are distinct."
---

# Provider reset inventory — local verified slice

Operator chose **a local query interface over the providers' existing inventory endpoints**,
not a request for new official APIs. This supersedes the earlier bounded-negative research
in `2026-09-07--implementation-subscription-resets.md`; the older commit `dc96113f` does
not contain this follow-up. Shipping remains separate from these local runtime results.

## Discovery and corrections

Actual z.ai subscription MCP `web_search_prime` found official ZCode Reset Card docs,
z.ai's anniversary Reset Card announcement, and Grok inventory references. Follow-up
inspection of producer-owned sources established both existing inventory interfaces:

- Grok web assets contain protobuf descriptors for `GetRemainingResets` and a same-origin
  gRPC-Web binary transport. A normal JSON POST yielded HTTP 200 with gRPC status 13;
  the correctly framed unauthenticated request yielded 16. **The correctly framed Pi
  xAI OAuth request returned status 0 and real inventory.** Browser cookies were not
  required on this live account, contradicting the inspected third-party integration note.
- Official ZCode 3.11.2 packaged source defines `GET /api/v1/coding-plan/reset/status`,
  separate 5-hour/weekly arrays, epoch-ms expiry and two-token PERSONAL authorization.
  The app was inspected, not executed or installed. This workstation has no provisioned
  ZCode JWT/business-token pair; successful authenticated ZCode inventory remains unproven.

Source URLs, schemas and ZCode digest are pinned in provider-owner
`packages/sub-core/docs/reset-inventory.md` in `softwareco/contrib/pi-sub-maintained`.
No endpoint guessing was used in the implementation; no redemption/card-grant/history
mutation route was invoked. Public source assets and focused search results are scratch
research, not shipped dependencies.

## Implementation and ownership

- `pi-sub-maintained` sub-core/sub-shared: additive
  `sub-core:reset-inventory-request:v1`, fixed Grok binary RPC adapter, fixed ZCode GET
  adapter, strict frame/protobuf parsing, 15-second cancellation/deadline, body bounds,
  typed errors and per-window counts. Existing GET-only usage query contract is unchanged.
  Grok reuses base xAI OAuth resolution. ZCode accepts explicitly provisioned
  `SUB_CORE_ZCODE_JWT` and `SUB_CORE_ZAI_BUSINESS_TOKEN` only; no browser/app-store scans,
  login, token exchange/refresh or API-key substitution. Provider repo is not AK-registered;
  its declared CONTRIBUTING/Changesets process applies, and a scoped changeset was added.
- `pi-little-helpers`: `subscription_resets` read-only machine query; `/resets status`
  and `/limits` consume the new optional owner contract. Strict identity/scope/cardinality/
  calendar checks strip opaque redemption IDs. Counts across ZCode windows are not summed.
  Unsupported aliases cannot borrow base inventory. Missing old core is explicit, not zero.
- `pi-toolbox-discovery` AK5503: `subscription-resets` read bundle makes the registered
  query discoverable/activatable without broadening startup defaults or classifying it as
  an unknown mutating tool. No owner imports or credential behavior moved into toolbox.

Review found and fixed: malformed trailer `0:16` accepted as zero; valid reset-only data
hidden from Horizon during independent quota failure; loose calendar/interval/error-member
normalization. Added regressions and cold listener/shutdown plus bus→tool execution tests.
Independent recheck cleared those findings; it did not claim ZCode live auth proof.

## Verified proof

- Helpers `npm run check`: **451/451 tests**, lint, typecheck, structure and packaging passed.
- Toolbox `npm run check`: **47/47**, full package gate passed. New tests are in their own
  bounded file; no file-budget exception was introduced.
- Provider repo `npm run verify`: full workspace typecheck/test/lint passed
  (94 core, 182 bar, 5 shared, 24 status tests = **305**).
- Root `scripts/ci/smoke.sh` and scoped `git diff --check`: passed.
- Reinstalled local sub-core, pi-little-helpers and toolbox packages.
- Fresh installed `/resets status`: Grok returned **1 weekly reset**, expiry
  **2026-09-12T18:49:00.000Z**; z.ai returned `AUTH_REQUIRED`, not zero.
- First fresh model proof correctly reported that the new tool was latent. After adding
  its owner-scoped toolbox catalog entry, a fresh real Pi model called `toolbox` activation
  successfully and then `subscription_resets` exactly once for xAI. The actual tool result
  contained the same count/expiry; no other tool or redemption action ran.
- Fresh installed Ghostty TUI at 75 columns: `/limits` displayed Grok `↺1` and z.ai `login`
  before and after `/reload`; `/resets status` returned the real count. Source paths
  correlated to canonical installed helpers; TUI exit 0. No model turn in this TUI probe.

Scratch artifacts under `/home/tryinget/.local/state/pi-quests/tmp/pi-resets-5491/`:
`inventory-{helpers,core,toolbox}-final.log`, `inventory-tool-live-activated.jsonl`, and
`inventory-live/{proof.json,terminal.log,exit-code}`. JSONL interpreted only with jq.
All counts are point-in-time observations, not permanent account facts.

## Remaining boundaries

No actual reset credits consumed. Native `/resets use` remains Codex-only; inventory
metadata does not authorize implementing/retrying redemption. z.ai successful inventory
needs explicit app-auth provisioning and live read verification; do not ask the operator
to paste secrets into chat/repo/command arguments. PERSONAL only; team scope remains absent.

This follow-up is **locally implemented and installed, not committed/pushed/released**.
Preserved unrelated dirty state and the previous clean worktree/commit. Original AK5491
shipping preflight remains unresolved; complete its clean full-gate dependency preparation
and review the provider contribution separately before making a remote-shipping claim.
An already-running Pi controller must reload to load the new registrations/catalog;
fresh-session behavior has been self-tested rather than delegated to the operator.
