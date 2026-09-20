---
summary: "AK5827/5828/5838 installed broker defect, bounded repair, and replacement-release gates."
read_when:
  - "Qualifying or releasing the peer-messaging launcher repair."
  - "Deciding whether to resume the frozen helpers/registry publication waves."
---

# Installed peer broker repair

## Authority and state

- AK5827 investigation: evidence 10282; clean-installed published `0.4.0`
  cannot cold-start its broker on Linux/Node 22.22.2 with Pi peers 0.84.4.
- AK5828 dependency triage: evidence 10283; remediation accompanies AK5838.
- AK5838 owns the bounded implementation and replacement-release preparation.
- Operator approved implementation/validation/preparation, **not release-PR merge
  or publication**. Existing tags and published artifacts remain immutable.

This document is an explanation, not release authority or proof of publication.

## Defect and repair

The broker executed `<package>/node_modules/tsx/dist/cli.mjs`, while `tsx` was
only a dev dependency. The clean consumer had no such file. A separate direct
launcher invocation returned `MODULE_NOT_FOUND`; the public runtime independently
failed with broker exit code 1. Detailed stderr was from the direct invocation,
not the production child, whose stderr is discarded.

The repair declares `tsx` as a production dependency and resolves its public
`tsx/cli` export from this package using Node module resolution. Declaration alone
would be insufficient: npm can hoist that dependency to a consumer's root.
Transport, peer identity, same-machine boundaries, and ask/reply semantics are
unchanged.

Source tests now cover nested/hoisted resolution, nearest dependency selection,
missing dependency rejection, and direct/Windows launch-command construction.
Quick and full release checks install the actual candidate tarball, production
only, in both layouts. Each invokes the installed public API with a new private
runtime directory and verifies real cold startup, two peers, send, correlated
ask/reply, disconnect, and disappearance of the captured broker OS process.
On Linux, process identity includes `/proc` start time, not only PID-file removal.
Forced cleanup fails the smoke rather than counting as natural teardown proof.

Observed candidate proof: 54 package tests passed, both installed layouts passed
on Linux/Node 22.22.2, and the updated source lock audit returned zero findings.
The isolated candidate still carries the pre-release source version `0.4.0`;
its tarball must **not** be published as that existing version. Native Windows
runtime behavior has not been verified by these Linux tests.

## Advisory triage

The frozen/current-before-repair peer development lock contained:

| Dependency | Before | Updated lock | Bounded reachability finding |
| --- | --- | --- | --- |
| protobufjs | 7.5.9 | 7.6.6 | No broker protobuf parsing, schema construction, or Any conversion path identified |
| ws | 8.20.1 | 8.21.3 | Broker transport uses `node:net` IPC; Google Live SDK WebSocket use is a separate host path |
| esbuild | 0.27.7 | 0.28.2 | Broker's tsx uses transforms, not the advisory's Windows `serve`/`servedir` operation |
| tsx | 4.21.0 dev | 4.23.13 production | Runtime-required launcher; new version permits patched esbuild 0.28.x |

Advisories: `GHSA-wcpc-wj8m-hjx6`, `GHSA-f38q-mgvj-vph7`,
`GHSA-j3f2-48v5-ccww`, `GHSA-96hv-2xvq-fx4p`, `GHSA-g7r4-m6w7-qqqr`.
No exploit was demonstrated. Negative reachability is source-bounded, not a
universal security claim. Consumer graphs are distinct from development locks:
the clean reproduction resolved protobufjs 7.6.6 and ws 8.21.3 already, but still
lacked the launcher. Frozen locks were not rewritten and `npm audit fix` was not
used.

## Replacement release gate

Do not blindly resume the old helpers `0.10.1` / registry `0.3.3` or `0.3.4`
publication waves as a repaired combination: helpers declares the exact optional
peer `0.4.0`, whose clean cold-start defect is now confirmed.

The root release-please node-workspace plugin has `updatePeerDependencies: true`.
Use its ordinary new-version PR rather than manually editing frozen versions.
Before requesting merge/publication approval, verify the generated PR:

1. gives the repaired peer a new version (expected patch `0.4.1`);
2. updates helpers' exact optional-peer contract and gives helpers a new version;
3. updates registry's linked helpers release dependency and any other genuinely
   affected generated consumers;
4. has green PR checks and verifies the final-version installed artifacts;
5. produces the normal immutable dependency-first wave, with old incomplete
   waves explicitly accounted for rather than retagged or silently resumed.

Generated versions and PR readiness are **pending verification**, not established
by this candidate note. Live activation and final main/PR checks are recorded in
AK; no passing local candidate can authorize release publication.
