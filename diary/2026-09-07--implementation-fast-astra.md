---
summary: "Fixed Fast eligibility for numbered Codex accounts and validated loaded parent/child hooks without billing or credential changes."
read_when:
  - "Reviewing Astra Fast account-alias support or its transport limitations."
system4d:
  container: "pi-better-openai package and its supported Pi extension hooks."
  compass: "Restore priority request injection without changing account authority."
  engine: "Shared matcher, independent runtime fixtures, package checks, local install."
  fog: "Client-side priority injection does not prove backend priority or speed."
---

# Fast account-alias correction

Added one shared Fast predicate used by parent and inherited child hooks. Base Codex allowlist
entries now cover canonical numbered accounts on the Codex Responses API, while exact model and
account restrictions remain intact. Provider/auth identity, Pro behavior and persisted preferences
are unchanged. Four permanent regression tests cover the alias matrix and actual hook paths.

Independent review accepted the change. Five fresh installed Pi 0.84.4 SDK processes exercised
37 synthetic requests through real extension loading, `/fast` command dispatch and core payload
callbacks, including inherited on/off, model changes and interruption. No network requests or real
credentials were used. The controller repeated that runtime proof after the local package install.

`npm run check` passed all 23 tests, structure/type/style checks and the declared packaging gate.
The first run caught missing system4d metadata in the new document; it was fixed. Packaging's
publish dry-run encountered the existing-version guard handled by the owner script; no publication
occurred. The new shared source is included in the package. Scoped whitespace checks passed.

`pi install` completed for the existing local package path. Fresh runtime loading was verified;
the already-running interactive session still needs `/reload` to load the changed source. Fast
was not silently enabled and the account was not switched.

A separate 20-case mock transport investigation found that installed Pi overwrites `originator`
and reuses WebSocket handshake headers across priority changes. No misleading partial routing
headers, provider overrides or fetch monkeypatch were added. Complete native-style routing and
backend acceptance/speed require separate provider-runtime work and evidence. Details are in
[the package evidence note](../packages/pi-better-openai/docs/project/2026-09-07-fast-astra-account-aliases.md).
