---
summary: "AK5597 completed inert archive audit and proposed exact offline provisioning boundary; not execution admission."
read_when:
  - "Preparing the first offline npm12 provisioning attempt after evidence8857."
type: reference
---

# Offline provisioning: audit complete, execution not admitted

## Authority and campaign state

AK5597 remains root-only. Evidence8857 accepts actual acquisition of166 archives,
not extraction, npm execution, SDK qualification, full CI or main landing.
Evidence8783 delegates exact-job admission only AFTER independent source/effect
review and fresh workstation-owner gates. The acquisition admission8851 is consumed.
Current accepted predecessor source freeze is `ak5597-root-source-freeze.p0jnb43k`
under pi-quests TMPDIR, digest
`fe77af1fde18998d88dc0062cdf7ea910a46897955df6bc4f23b05e9d4501240`.
Evidence8829 accepts13 calibration and34 observer synthetic tests, not SDK proof.
No provisioning execution is authorized by this document.

## Audited inputs

Researcher `dispatch-1789052412237` completed inert archive/data reading only; full
recovery report retrieved2026-09-10. No extraction or package execution occurred.
Paths below use `S=/home/tryinget/.local/state/pi-quests/tmp`:

- Acquisition: `S/ak5597-toolchain-v2.XQ9ADjIf/export-parent/ak5597-artifacts-acquisition-ivp6vrGr/acquisition`.
- Manifest: `S/ak5597-acquisition-inputs.TAcEcBy8/acquisition-inputs.json`,
  SHA256 `1c411d9d51d7ba083ebdd19c35d8c55fc8c3d77ff492071e50bd8eed567f7ce8`.
- npm seed: acquisition `npm-12.0.2.tgz`,
  SHA256 `5dbb86c71d07a1957f2e90734092dd6a58bdcd9ebc2d8d41ca1c6e6a21d364e1`.
- Proposed root files: `S/ak5597-inert-inputs.KS6yoZ2L/proposed/`:
  - package.json `d68798bd253930de8391d728b1d73e86fa870b789138de17da5a7cca8f87d560`;
  - package-lock.json `2e37ccd22b23a8cc3d0f19aa8eaa389700eb8e184e892e4207e4ee2c40b81606`.
- Node: `S/ak5597-node22.CmLeiVRU/node-v22.22.2-linux-x64/bin/node`,
  124679552bytes, SHA256
  `81925c0995b5c1427b5d538e6a90ca2fdc4daffb786b09af749beaf7369d4e90`.
  Prior official HTTPS/SHASUMS provenance remains limited: detached signature not
  independently verified. Do not use this distribution's bundled npm.

All166 archived-input SRI, receipt hashes and sizes passed.30,885,021compressed
bytes;139,458,048decompressed tar bytes;15,046effective members (14991regular,
55directories), plus7PAX headers.15,043unique normalized destinations,
127,422,475logical bytes including duplicate pairs,127,401,612counting them once.
400package.json files parsed. No escaping paths, links, special entries, privileged
modes, ancestor conflicts or sparse indicators observed.164roots were package/;
two safe DefinitelyTyped roots were node/ and retry/. Bounds:128MiB expanded per
archive,512MiB aggregate,20000members/archive,100000aggregate,64MiB/member,
1MiB/package JSON. No hard resource/safety stop in completed audit.

## Exact duplicate decision proposed, not yet granted

Each pair is `package/./dist/index.js` followed by `package/dist/index.js`.
Normal ordered extraction of ONLY these pairs is proposed; do not omit/repack or
accept arbitrary normalized collisions.

| Archive | Effective member orders | Bytes each | SHA256 of each payload |
| --- | --- | --- | --- |
| agent-base7.1.4 | 3,4 | 7324 | c6503bd5e007db8b73fedf07b6eaaf4a94d5541953f0d06c8a17d1644c29a0c5 |
| http-proxy-agent7.0.2 | 2,3 | 6088 | fd33b43da34da60d4914780e13fae5d52a7faaa996d687eea5335128de148627 |
| https-proxy-agent7.0.6 | 2,3 | 7451 | 30165586fac3becbc9dbf2b7b5bdaa802a77ac34af9926208f6e94a3bd87ef31 |

Direct byte comparisons passed. All six are type0,0644,uid/gid0,
mtime499162500, empty uname/gname/linkname/PAX,device major/minor0.
Exact archive identities come from the pinned manifest's name/version/SRI rows.

## Static root graph and npm semantics

167/167root-lock locations map to165SDK archives; all four SDK owners are0.84.4.
338edges:333resolved and5absent explicitly optional peers; checked stable ranges
had no mismatches. Coding-agent's embedded npm-shrinkwrap.json is59437bytes,
SHA256 `a137fbb6530359fda4aa1212eb1d8ad54157bddced042ea24d8e566eea21ec54`.
136records/289edges examined:100exact URL/version/SRI matches,6Pi URL/version
matches lacking embedded SRI,29genuinely unacquired mandatory-reachable versions.

Pinned npm12.0.2 ignores dependency shrinkwrap; preserve that embedded file intact.
Do not acquire29extra versions solely for this npm12/root-lock attempt. This is
not a conclusion for other installers or exact embedded-graph reproduction.
Sources inside the unchanged npm seed (not extracted paths):

- package/docs/content/configuring-npm/package-lock-json.md:26–35,
  file SHA256 `931d585fc91607d8d7929f71e72230b09ceef45abd300b6761df024f3872ef85`;
- package/node_modules/@npmcli/arborist/lib/shrinkwrap.js:401–410;
- package/node_modules/@npmcli/arborist/lib/arborist/build-ideal-tree.js:995–1035.

npm seed bundles68direct dependencies,147dependency locations plus npm,
357edges without missing targets; absent kerberos peer is optional. Engines
`^22.22.2 || ^24.15.0 || >=26.0.0` accept supplied22.22.2. Checked object-form
engine ranges accept it; jsonparse has legacy `["node >= 0.2.0"]` form.
Only observed install lifecycle declarations: Google GenAI no-op preinstall and
protobufjs version-warning postinstall. ALL scripts remain disabled.22declared bin
targets exist; no root binding.gyp. Five clipboard manifests have libc restrictions
missing from root lock. GNU clipboard binaries/Photon WASM present; BOTH musl
clipboard archives lack native binary. No ABI/libc/native-load claim follows.

## Minimal proposed attempt

Use separately reviewed fresh private-network scratch, exact per-file sealed inputs,
no ambient npm/config/dependencies/credentials/loaders, intact seed and copied root
files. All effects, including npm's own execution, belong inside outer isolation.
Execute serially for each exact165 networkArchives filename:

```text
NODE NPM_CLI cache add ARCHIVE --cache=CACHE --offline --ignore-scripts \
  --no-audit --no-fund --update-notifier=false
NODE NPM_CLI ci --cache=CACHE --offline --ignore-scripts \
  --include=dev --include=optional --no-bin-links \
  --no-audit --no-fund --update-notifier=false
```

NPM_CLI is the intact seed's package/bin/npm-cli.js. Exactly one ci attempt; first
failure stops, no retry, fallback online, lock rewrite or additional acquisition.
Cache-add itself temporarily extracts, chmods bins and removes temporary state:
seed package/lib/commands/cache.js:164–182 and
package/node_modules/pacote/lib/file.js:19–33,60–66. Admission must cover these
private effects, not claim cache writes alone. Preserve hidden lock and verify
root package/lock bytes after install. No scripts/native-load/SDK scenario executed.

## Remaining implementation and execution gates

Read-only explorer `dispatch-1789055035740` identifies real incompatibilities:
acquisition's256mount ceiling (111existing+165archives already exceeds it), flat
0600nonempty-file exporter, incomplete Python/Node closure for provisioning, and
ordinary direct-helper reap cannot prove npm descendant settlement. Use a distinct
provisioning-only contract/export/lifetime path; do not loosen acquisition or add
more tracer machinery. Proposed as-pid-1 topology requires its own review/proof.

Next: independent audit/disposition review; explicit controller decision scoped to
three pairs; minimal provisioning source and exact resource/input/output plan;
source tests and independent exact effect/source review; fresh workstation-owner
admission; one execution; independent tree/exit/preservation verification. Resource
policies must distinguish hard enforcement from trusted-code assumptions, monitoring
and post-run inventory. No speculative universal host audit or silent new policy.

Qualification, conditional baseline alignment, explicit owner-slice composition,
exact combined-candidate just ci and coordinated landing remain separate gates.
