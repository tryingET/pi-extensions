---
summary: "Capability-aware /resets commands, banked-reset semantics, and provider evidence boundaries."
read_when:
  - "Using /resets or interpreting Banked/Expires in /limits."
  - "Adding a native subscription reset adapter or management destination."
system4d:
  container: "Capability-aware subscription reset commands and dashboard guidance."
  compass: "Verified inventory and explicit action, never guessed reset counts."
  engine: "Select subscription -> inspect capability -> confirm a supported action."
  fog: "Quota renewals, monetary credit, and banked reset credits have different semantics."
---

# Subscription resets

`pi-little-helpers` owns `/limits`, `/resets`, and the compatibility command `/codex-reset`.
Provider-specific usage adapters and credentials remain owned by sub-core; the existing
Codex reset adapter stays local. This change does not add speculative provider API calls.

## Commands and account safety

- `subscription_resets({ provider?: string })`: read-only machine query, default active
  subscription. No action parameter or local HTTP server. Results omit credentials and
  provider redemption IDs; explicit tool results enter model context. Project restrictions
  apply before querying, and unsupported aliases never borrow a base-account inventory.

- `/resets` or `/resets status`: read-only inspection of the **active** subscription.
- `/resets use`: native redemption where implemented, with explicit confirmation.
  Else it explains the missing capability and sends no reset request.
- `/resets manage`: for z.ai/Grok, offers to open the verified provider management page.
  This is **not** a banked-reset redemption API. Browser login can differ from Pi:
  verify the account before changing anything. Headless mode prints guidance only.
- `/codex-reset [status|use]`: compatibility entrypoint; its empty invocation retains
  the previous interactive `use` behavior. Prefer `/resets`, whose default is `status`.

Native Codex calls use the **same handler, lock, pending state and request IDs** through
both command names. Base and numbered multi-pass subscriptions are account-bound;
project `allowedSubs` restrictions apply before reads and again before spending.
After switching with `/subs` or the explicit `s` action in `/limits`, close the dashboard
and invoke `/resets` on that active subscription. Inspecting a dashboard row alone does
not switch accounts. The dashboard never spends a credit.

Codex spending requires a saved session with an assistant turn and a recovery record
readable from the session file before POST. Legacy pending requests without account
identity, or a changed identity, block new spending. An ambiguous result stays unresolved;
retries reuse its recorded request ID. An unresolved request on the same underlying
account through another alias also blocks a new spend: restore its original alias.
Recovery is **session-scoped**, not a global lock;
do not start a separate session's reset while one is unresolved. Server idempotency
retention is not independently guaranteed. No real redemption was used to test this change.

## Dashboard semantics

| Banked / Expires | Meaning |
| --- | --- |
| `↺N` / date | Native adapter reported count and expiry information |
| `↺0` / `none` | Native inventory reported zero available resets |
| `↺?` / `unknown ?` | Native inventory unavailable; not zero |
| `?` / `unknown` | Compatible core or inventory read unavailable; not zero |
| `login` / `unknown` | Inventory authentication required; not zero |
| `multi` / date | Separate 5-hour/weekly inventories; inspect details, never sum distinct-card counts |
| `n/s` / `n/s` | Integration does not support reset inspection for this identity |

Unsupported **here** does not prove that a provider has no resets. Subscription details
and `/resets status` explain the capability and management path. Quota renewal is not
banked credit expiry; prepaid money, promotional purchase credits, and usage percentages
are never converted into reset counts. An error-only quota response displays `!`, not
`old`; `old` requires retained usage, credit, or balance data after a failed check.

## Provider research (2026-09-07)

The initial documentation-only research missed actual reset cards. Operator-directed
z.ai subscription web search, followed by inspection of producer-owned source, corrected it:

- **Grok:** public web-client protobuf descriptors and gRPC-Web transport establish
  `POST https://grok.com/grok_api_v2.GrokBuildBilling/GetRemainingResets`. The request
  is five zero bytes, with `application/grpc-web+proto`. Its inventory message contains
  tokens with validity-start/end timestamps. A live read using **existing Pi xAI OAuth**
  returned status 0 and one reset. Browser cookies were not required. HTTP 200 with an
  unframed JSON body instead returns gRPC error 13; HTTP status alone is not success.
- **z.ai:** [Official ZCode usage docs](https://zcode.z.ai/en/docs/usage-stats#reset-card)
  describe actual quota Reset Cards. ZCode 3.11.2 packaged source verifies
  `GET https://zcode.z.ai/api/v1/coding-plan/reset/status`, with ZCode JWT Authorization,
  `X-Bigmodel-Authorization` containing the z.ai BUSINESS access token, and
  `Bigmodel-Target-Type: PERSONAL`. The separate available-five-hour/weekly arrays carry
  epoch-millisecond expiry timestamps. Their lengths are per-window counts, **not** a
  proven total number of distinct cards. This success path is source-grounded and tested
  with fixtures; live authenticated ZCode inventory has not been verified here.

The adapter owner is sub-core, documented in its `docs/reset-inventory.md`, which pins
source URLs and the inspected ZCode source digest. These private endpoints can change.
No card grants, redemption requests or history-read mutations were performed or exposed.

### z.ai sign-in provisioning

The current adapter accepts explicitly provisioned `SUB_CORE_ZCODE_JWT` and
`SUB_CORE_ZAI_BUSINESS_TOKEN` in the Pi process environment. It does not obtain them
or initiate login. A regular `ZAI_API_KEY` is insufficient; a raw website OAuth token
may also differ from the business token the desktop client uses. Missing app tokens
return `AUTH_REQUIRED`, not zero inventory. Do not paste tokens in chat, command arguments
or repository files. No browser/app credential stores are scanned. Team scope is unsupported.

### Consumer contract

`sub-core:reset-inventory-request:v1` takes `{provider, signal?, reply}`. Responses contain
`version: 1`, exact `provider`, `checkedAt`, and either `inventory.windows` or `error.code`.
Each window has `scope`, `availableCount`, and `resets: [{expiresAt, validFrom?}]`.
The helper validates identities, cardinality and dates, strips extra fields, and bounds
its wait. Inventory failures do not turn usable quota into zero remaining resets.
There is no redemption method in this query contract; `/resets use` remains Codex-only.

## Adding a provider

`lib/reset-capabilities.ts` is the shared capability catalog, consumed by the command
router and dashboard. `native` is an implemented capability, never inferred from quota
windows or an arbitrary payload. The current native dispatcher is the Codex handler;
adding another native provider requires wiring its own verified adapter, not just changing
metadata. Admission requires provider-owned contracts and tests for:

1. exact account identity and project restriction rechecks;
2. inventory count, per-credit eligibility and expiry semantics;
3. redemption outcomes and ambiguous failures;
4. idempotency/replay behavior and durable pending recovery before spending;
5. cancellation, headless refusal, account drift, aliases and confirmation.

Keep unsupported aliases unsupported rather than borrowing base-account inventory.
Management URLs must be static, source-verified, credential-free HTTPS destinations;
never use model base URLs or provider-response URLs. Confirm before opening a browser.
