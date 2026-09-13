---
summary: "Numbered Codex account eligibility for parent/child Fast hooks, loaded-runtime proof, and separate transport limitations."
read_when:
  - "Debugging Fast on Astra or a numbered Codex account."
  - "Reviewing Fast eligibility versus actual backend routing."
system4d:
  container: "Better OpenAI parent and child Fast hooks."
  compass: "Recognize Codex account aliases without changing account authority."
  engine: "Shared predicate, negative oracles, and isolated loaded-runtime validation."
  fog: "Request priority is not proof of backend routing, billing, or speed."
---

# Fast eligibility for numbered Codex accounts

## Implemented boundary

The old literal-provider match made `openai-codex/*` exclude `openai-codex-2/gpt-6-astra`.
The shared `src/fast-support.ts` predicate now recognizes canonical positive numbered aliases
only when the selected model API is `openai-codex-responses`. Both the full extension and minimal
child hook use that predicate. Exact model restrictions and exact account-specific entries retain
their meaning. Missing/wrong APIs, leading-zero/zero/non-numeric suffixes and unrelated providers
do not inherit the base entry. Explicit configured matches retain their existing behavior.

This is eligibility, not account selection: no provider/model object, authentication, credentials,
configuration defaults or persistent Fast preference is changed. No config migration is required.
Bare `/fast` still toggles desired state. Pro and image behavior are outside this change.

## Independent verification

Four new regression tests cover the matcher matrix and full parent/child hook paths, including
model transitions and off-state. Independent verification also passed the existing child test.
Five fresh installed Pi 0.84.4 SDK processes loaded the actual extension paths through
DefaultResourceLoader and ExtensionRunner. Across 37 synthetic requests they exercised real
`AgentSession.prompt('/fast')`, inherited on/off, model/account restrictions, malformed payloads
and abort-followed-by-request behavior. The core-supplied `onPayload` callback produced the
expected priority body. All runs preserved selected model/account identity, used synthetic auth,
reported zero extension errors and made zero network requests. These are loaded-runtime proofs
with a mock provider, not billed requests or backend Fast acceptance.

## Why additional routing headers are not included

The referenced [custom Codex transport](https://github.com/IgorWarzocha/howaboua-pi-stuff/blob/5193fa5844a14d5ad7d1b077dfadf17eafb7e1bc/packages/pi-codex-conversion/src/providers/openai-codex/headers.ts)
combines requested priority with `originator=codex_cli_rs` and
`x-codex-routing-hint=model=<model>;tier=priority`.

Twenty independent mock-transport cases tested installed Pi 0.84.4's package provider and the
actual CLI-bundled provider. Both assemble final Codex headers after the extension header hook,
unconditionally overwriting `originator` with `pi`. A routing hint survives, but that is only
part of the custom transport's contract. WebSocket reuse also retains the original handshake
headers when a subsequent request's priority changes. SSE compression/retries and WebSocket
fallback were included in the mock evidence; no external request was made.

Accordingly this change does not add misleading partial headers, replace transports, patch global
fetch, override another account provider, or reinterpret a backend `default` tier as priority.
A complete final-header contract and routing-sensitive WebSocket reuse belong to the Pi provider
runtime and require separate owner work. Actual backend tier, quota, billing and speed remain
unverified. Installing/reloading this package cannot itself fix those provider-runtime limits.
