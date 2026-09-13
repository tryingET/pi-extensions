---
summary: "AK5450: explicit multi-pass entry satisfies aliased child bootstrap before legacy-path inference."
read_when:
  - "Investigating extension_bootstrap_missing after relocating or forking multi-pass."
  - "Checking evidence and local activation posture for the explicit bootstrap fix."
type: "implementation"
---

# Explicit multi-pass bootstrap

The operator reported `extension_bootstrap_missing` even though the dispatch included the valid installed multi-pass entry. The resolver eagerly marked the numeric-alias requirement missing using the old upstream checkout path, then accepted the explicit fork path without reconciling that requirement.

The fix recognizes the actual regular `extensions/multi-sub.ts` or `.js` entry of a package named `pi-multi-pass` without evaluating code. Recognized explicit argument/environment sources take precedence and satisfy both automatic inference and symbolic multi-pass aliases. Missing paths, unknown aliases, unrelated packages, malformed manifests and non-entry files do not silently satisfy the provider requirement. Other legitimate extension files remain usable for their own purpose.

## Evidence

- Resolver regressions reproduced the original failure before the change.
- Final focused resolver/model/dispatch checks: **22 passed**. Dispatch tests use captured fixture spawners, not live agents.
- Full isolated ASC package `npm run check`: **533 passed**, typecheck/lint and packed JavaScript transport/release checks passed. Root smoke and diff check passed. Existing-version publish rejection occurred only in the gate's dry run; no publication.
- Independent source review PASS for the four runtime/test/doc files; reviewer independently reran all **10 resolver tests**. Corrected the review's low-severity documentation wording and added `.js`, symlink, and directory rejection tests.
- A separate network-disabled private Pi process used the patched resolver, loaded the actual installed multi-pass entry via `-e`, and listed `openai-codex-2` models, exit0. The host used synthetic OAuth-shaped credential/model fixtures, never real credentials. No inference, login, token refresh, or account switching was requested. This establishes registration/bootstrap, **not** successful live agent execution.
- Initial private-host attempts with no configured credential/API-key-shaped fixture listed no available models. A diagnostic wrapper confirmed registration; correcting the synthetic credential shape enabled the final direct-entry proof. No failed attempt was called success.

Evidence root: `/home/tryinget/.local/state/pi-quests/tmp/pi-asc-bootstrap-5450/` (`red.log`, `focused-final.log`, `package-check-final.log`, `root-smoke.log`, `source-final.sha256`, `live/proof.json`, `live/run.sh`, `live/select-and-boot.mjs`, child output and `live/exit-code`).

## Local application and boundaries

Applied only the identical reviewed four-file slice to the installed parent checkout after checking target drift; reran **22 focused tests** there. Reinstalled the same local ASC package path. Global settings, installed multi-pass entry/manifest, and every previously dirty ASC5432 file were hash-checked unchanged. No shared README/product-posture edits, unrelated source changes, or PR merge performed.

The controlling Pi session still needs `/reload` to adopt the changed module. Package installation and the private-host proof are not proof of operator-session activation. Task5448's pi-sub PR readiness work remained owned by its separate session.
