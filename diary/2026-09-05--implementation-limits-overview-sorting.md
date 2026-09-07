---
summary: "AK 5436: Overview defaults to displayed quota renewal ascending, then remaining percentage ascending."
read_when:
  - "Checking default limits Overview ordering or its installed TUI proof."
type: "implementation"
---

# Limits Overview sorting — 2026-09-05

Operator request: sort Overview by when it resets, shortest first, then Left lowest first.

## Implemented scope

- `packages/pi-little-helpers/lib/limits-runway.ts`: comparator shares the renderer's primary-window bottleneck selection. Sort the displayed renewal timestamp ascending, then remaining percentage ascending. Do not borrow an earlier date from another quota window or from banked credit expiry.
- `packages/pi-little-helpers/lib/limits-dashboard.ts`: default to this reset order; apply sorting after search and attention filtering. Keep active-account selection without active-first pinning. Existing explicit sort cycling remains available.
- Unknown dates sort after known dates; tied unknown dates use known remaining percentages before unknown percentages. Monetary key/wallet values are not compared against percentages. Passed dates retain their chronological position and existing refresh warning; sorting does not infer renewal.
- Added `tests/limits-sort.test.mjs`; adjusted an old hotkey test's active-first fallback expectation; updated README/help.
- No fetching, authentication, provider integration, account-switching implementation, ASC, or ontology changes in this slice. Existing unrelated dirty work preserved. No commit or publication.

## Verification

- Package `npm run check`: **403 tests passed**, lint/typecheck/package checks passed. Existing-version rejection occurred only in `npm publish --dry-run` and was accepted by the declared gate; no publication.
- Root `bash scripts/ci/smoke.sh`: passed.
- `git diff --check`: passed.
- Reinstalled the local package into Pi; also installed it in a private agent directory for isolated verification.
- Real Ghostty TUI, network-disabled with bwrap, non-Git scratch cwd and explicit loader: invoked the actual `createLimitsExtension` command with fixture-only account/snapshot dependencies. Real `/limits` rendered seven rows at width 75 in the expected order, both before and after actual `/reload`.
- Both rendered orders: EarlyZero, EarlyHigh, Middle, Banked, Later, Unknown, Wallet. The later active subscription remained selected. This proves the changed presentation with controlled data, not live provider retrieval.
- 14 fixture reads, zero sends, zero model/account switches; network guard recorded only blocked Pi metadata calls, zero forwarded requests. Process exited 0.
- Source hashes and global settings hash unchanged through the proof. This isolated reload is not activation in the controlling operator session.

Evidence root: `/home/tryinget/.local/state/pi-quests/tmp/pi-limits-sort-5436/` (`proof.json`, `overview-0.txt`, `overview-1.txt`, `network.json`, `terminal.log`, `exit-code`, source/settings hashes, install logs, loader and runner).

Gate logs: `/home/tryinget/.local/state/pi-quests/tmp/pi-limits-sort-5436-package.log` and `/home/tryinget/.local/state/pi-quests/tmp/pi-limits-sort-5436-root-smoke.log`.
