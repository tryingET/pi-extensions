---
summary: "Changelog for scaffold evolution."
read_when:
  - "Preparing a release or reviewing history."
system4d:
  container: "Release log for this extension package."
  compass: "Track meaningful deltas per version."
  engine: "Document changes at release boundaries."
  fog: "Versioning policy may evolve with team preference."
---

# Changelog

All notable changes to this project should be documented here.

## [0.5.2](https://github.com/tryingET/pi-extensions/compare/pi-autonomous-session-control-v0.5.1...pi-autonomous-session-control-v0.5.2) (2026-08-20)


### Bug Fixes

* **pi-autonomous-session-control:** stabilize startup-noise host canary ([#132](https://github.com/tryingET/pi-extensions/issues/132)) ([f8060ea](https://github.com/tryingET/pi-extensions/commit/f8060ea91de9b1a9bcf87b314b7aee32b44465de))

## [0.5.1](https://github.com/tryingET/pi-extensions/compare/pi-autonomous-session-control-v0.5.0...pi-autonomous-session-control-v0.5.1) (2026-08-16)


### Bug Fixes

* **asc:** fail closed on proc snapshot churn ([87aa22c](https://github.com/tryingET/pi-extensions/commit/87aa22cee7773e50eda0e4c8535cf926a466a038))
* **asc:** fence shared capacity recovery ([d5f33c5](https://github.com/tryingET/pi-extensions/commit/d5f33c58178a0977126dbea726d749bdc82f9b75))
* **asc:** ignore foreign rewind commits in retention ([bd74a59](https://github.com/tryingET/pi-extensions/commit/bd74a59fd9d53e3227599a923cfb02e0c0e9b1c5))
* **asc:** recover stranded subagent capacity safely ([b21406a](https://github.com/tryingET/pi-extensions/commit/b21406a73c8aa29beec608109067b63bd63eb17a))

## [0.5.0](https://github.com/tryingET/pi-extensions/compare/pi-autonomous-session-control-v0.4.0...pi-autonomous-session-control-v0.5.0) (2026-08-15)


### Features

* **asc:** add self runtime-health resolver and reconcile dispatch objective bound with main policy ([8be9708](https://github.com/tryingET/pi-extensions/commit/8be970871ee2318271bd832e05245e95dd1f2eb3))
* **asc:** bound rewind store retention ([1e48570](https://github.com/tryingET/pi-extensions/commit/1e48570e4b8036c2c9f156ae46be8334e3b8ddf9))
* **asc:** bounded self-driving follow-up send policy ([049bb4f](https://github.com/tryingET/pi-extensions/commit/049bb4f99e1179b59c554d667ce2174c17a68acf))
* **asc:** improve subagent cache locality ([269740b](https://github.com/tryingET/pi-extensions/commit/269740baafebdf0f5cbfa101c1f650d8a2467a07))
* **asc:** integrate retained self routing and memory retrieval ([8e4c841](https://github.com/tryingET/pi-extensions/commit/8e4c841809661464038a3fcf9c1c2be7b705f1cc))
* bind loop continuation to ASC effect receipts ([4b94648](https://github.com/tryingET/pi-extensions/commit/4b94648a2889c04809bd2e725f3f89aa1f5cd5ad))
* **pi-autonomous-session-control:** add live runtime proof guard ([3ff494f](https://github.com/tryingET/pi-extensions/commit/3ff494f22e044f2d898260d0c56a0eb3e599d30e))
* **pi-autonomous-session-control:** harden live proof reload evidence ([269e132](https://github.com/tryingET/pi-extensions/commit/269e132d0078d729351342b61e09de4c7a2bba56))
* **pi-autonomous-session-control:** harden long-running execution ([1214f47](https://github.com/tryingET/pi-extensions/commit/1214f47c7db97b23cc7fb8b7925433a285340657))
* retry provable pre-spawn loop failures ([7382b10](https://github.com/tryingET/pi-extensions/commit/7382b10b779f743bf5b880241aa3842cd9146851))
* route ASC autoresearch launches through slash UX ([f0b7606](https://github.com/tryingET/pi-extensions/commit/f0b7606ad146e73ffdf8f57c8ea58d791a87e871))
* **self-evolution:** close typed candidate loop ([61873a7](https://github.com/tryingET/pi-extensions/commit/61873a7874087f64f23495b1143c0ef554fbbf93))


### Bug Fixes

* **agent-vent:** align self diagnostic handoff ([827ea92](https://github.com/tryingET/pi-extensions/commit/827ea92ecec5f0f0d3771beb364e07622ecbf9aa))
* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))
* **asc:** defer nested visible-loop launches ([1f58932](https://github.com/tryingET/pi-extensions/commit/1f58932afb33319b6aa9f347d025a60a045e96ef))
* **asc:** disambiguate topic retrieval routing ([60441b4](https://github.com/tryingET/pi-extensions/commit/60441b46fb32ac7d47396e1c0d9582830c6d7271))
* **asc:** expose canonical subagent resume handles ([c11c5d2](https://github.com/tryingET/pi-extensions/commit/c11c5d2396d759d749cae074734a0a9c5a65f6a0))
* **asc:** fail closed insight promotion cues ([3557489](https://github.com/tryingET/pi-extensions/commit/3557489d37b08d71a4079930f5c702f9cec0d2f8))
* **asc:** narrow trap list precedence ([abd111f](https://github.com/tryingET/pi-extensions/commit/abd111f5a059adfb545cfc7ecf8591f7a5fb0b57))
* **asc:** preserve pre-settlement transport diagnostics ([937488e](https://github.com/tryingET/pi-extensions/commit/937488e559cabae577fa95ee29851f1a9dec24f8))
* **asc:** retry quality gate temp cleanup ([2b81c97](https://github.com/tryingET/pi-extensions/commit/2b81c97ca5833f79e8d4bb31cd801492d4a749db))
* **asc:** route self-evolution continuation alias ([9aa6ec4](https://github.com/tryingET/pi-extensions/commit/9aa6ec49f6d5f52dd67d3585a45801eeef0907b6))
* **asc:** surface insight promotion closeout cues ([2986982](https://github.com/tryingET/pi-extensions/commit/29869826b735cdd038d61fcd608c300ac166ec7c))
* **asc:** version subagent transport protocol graph ([bd59f92](https://github.com/tryingET/pi-extensions/commit/bd59f92d49d3da08825fa6037cc7e2b7987f1861))
* **ci:** make release checks reproducible ([c33eae9](https://github.com/tryingET/pi-extensions/commit/c33eae9f3cc58f75a53d1d476134bc09b9008401))
* exhaust deep-review blockers from the session commit wave ([0689d42](https://github.com/tryingET/pi-extensions/commit/0689d4279f92caa24c0b5b739c38de5f24c57fb6))
* harden delegated commit dispatch admission ([84b7ad9](https://github.com/tryingET/pi-extensions/commit/84b7ad988eca709f9b705792815152e47809225d))
* harden installed runtime composition ([8852cbf](https://github.com/tryingET/pi-extensions/commit/8852cbf79004c50035408225fd6cd18b021cba2d))
* **pi-autonomous-session-control:** soften tester role prompt to avoid classifier false positives ([4b81842](https://github.com/tryingET/pi-extensions/commit/4b81842be2c7c3fabb92fbb9e80a9515b4eaa12f))
* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))

## [0.4.0](https://github.com/tryingET/pi-extensions/compare/pi-autonomous-session-control-v0.3.0...pi-autonomous-session-control-v0.4.0) (2026-08-14)

### Features

- `self` tool runtime-health resolver: runtime-health / agent-doctor / install-drift queries execute the repo-owned agent doctor and mirror broker liveness, session storage pressure, npm release-age gate, and provenance drift status
- `dispatch_subagent` pre-dispatch failure attestations with machine-readable failure metadata on the tool error surface
- schema-level objective admission bound (maxLength 100000) restoring oversized-delegation rejection below the execve E2BIG limit

### Bug Fixes

- runtime-health doctor resolution path (was one directory short in installed layouts)
- installed runtime composition hardening; rewind store retention bounds; subagent transport protocol versioning
- tester role prompt classifier false positives; agent-vent self diagnostic handoff alignment

### Maintenance

- host alignment with Pi 0.83/0.84; package pack JSON normalization under npm 12; git-date pinning for rewind-retention SHA stability

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-autonomous-session-control-v0.2.1...pi-autonomous-session-control-v0.3.0) (2026-08-01)


### Features

* **asc:** integrate retained self routing and memory retrieval ([8e4c841](https://github.com/tryingET/pi-extensions/commit/8e4c841809661464038a3fcf9c1c2be7b705f1cc))


### Bug Fixes

* **asc:** disambiguate topic retrieval routing ([60441b4](https://github.com/tryingET/pi-extensions/commit/60441b46fb32ac7d47396e1c0d9582830c6d7271))
* **asc:** narrow trap list precedence ([abd111f](https://github.com/tryingET/pi-extensions/commit/abd111f5a059adfb545cfc7ecf8591f7a5fb0b57))
* **asc:** preserve pre-settlement transport diagnostics ([937488e](https://github.com/tryingET/pi-extensions/commit/937488e559cabae577fa95ee29851f1a9dec24f8))

## [0.2.1](https://github.com/tryingET/pi-extensions/compare/pi-autonomous-session-control-v0.2.0...pi-autonomous-session-control-v0.2.1) (2026-07-13)


### Bug Fixes

* **asc:** expose canonical subagent resume handles ([c11c5d2](https://github.com/tryingET/pi-extensions/commit/c11c5d2396d759d749cae074734a0a9c5a65f6a0))

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-autonomous-session-control-v0.1.5...pi-autonomous-session-control-v0.2.0) (2026-07-11)


### Features

* add matrix executor and self continuation ([35d0f6b](https://github.com/tryingET/pi-extensions/commit/35d0f6b993deadf25fe6ff73ece26410e9879df7))
* adopt engineering-core package surfaces ([c4a28c1](https://github.com/tryingET/pi-extensions/commit/c4a28c12c6077ba5b17909bcde3354bb1249e8d0))
* **agent-vent:** add local diagnostic capture ([9f0a1ae](https://github.com/tryingET/pi-extensions/commit/9f0a1aeaf5df66eda49d090ce79a1b426ced0901))
* **asc:** add diagnostic review continuation ([dcf68e5](https://github.com/tryingET/pi-extensions/commit/dcf68e5fce1ad285a0f6795a1c5f3e68e54c1b45))
* **asc:** add mirror-only self handoff summary ([cf90493](https://github.com/tryingET/pi-extensions/commit/cf90493701958e405f3051699341a21281add224))
* **asc:** add self diagnostic review ([9794d45](https://github.com/tryingET/pi-extensions/commit/9794d45ed6c599f2f1964b2d38549b17b42c83f2))
* **asc:** add self reflection guard ([5a3a92a](https://github.com/tryingET/pi-extensions/commit/5a3a92a55e30f36f7c0bf96b790d80249eb819f1))
* **asc:** add self-evolution candidates ([40f977d](https://github.com/tryingET/pi-extensions/commit/40f977dfe11d306c730ec0e6ccf7573c9271edf6))
* **asc:** add self-evolution feedback ledger ([d58b94e](https://github.com/tryingET/pi-extensions/commit/d58b94edae7eaa9f4ed47d2de05d44e96b34ece5))
* **asc:** contextualize self diagnostic candidates ([5b8da87](https://github.com/tryingET/pi-extensions/commit/5b8da8757b27ab5799ab2edf10ea82440e028b45))
* **asc:** emit replay artifact provenance ([6580865](https://github.com/tryingET/pi-extensions/commit/65808651c9c41e92ddc19989e34dd2ee1cce83b4))
* **asc:** persist self action state for dogfood loops ([f8907cd](https://github.com/tryingET/pi-extensions/commit/f8907cde5e06a98c3811fec33092e0fcb0f0181a))
* **asc:** rank continuation slices ([031f57a](https://github.com/tryingET/pi-extensions/commit/031f57af277521c2984bfb88231409c07701cf37))
* **asc:** reuse session validation provenance ([7609d5a](https://github.com/tryingET/pi-extensions/commit/7609d5a7e10d6fdb9555bdfb8afda6b88c353771))
* **asc:** store subagent traces in native pi sessions ([eeb946e](https://github.com/tryingET/pi-extensions/commit/eeb946e74143130584b231d94e47b003cedb1fec))
* **asc:** suggest harness moves in handoff ([328c09f](https://github.com/tryingET/pi-extensions/commit/328c09f602e377e7b51695b67e7a7b42138529db))
* **asc:** surface insight promotion cues ([ac8790e](https://github.com/tryingET/pi-extensions/commit/ac8790e619f427af011f94b5a1c22c14698658af))
* **asc:** surface reflection check provenance ([ea272af](https://github.com/tryingET/pi-extensions/commit/ea272aff758063a713135305c8b94e0e930d51aa))
* bind loop continuation to ASC effect receipts ([4b94648](https://github.com/tryingET/pi-extensions/commit/4b94648a2889c04809bd2e725f3f89aa1f5cd5ad))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))
* **pi-autonomous-session-control:** add live runtime proof guard ([3ff494f](https://github.com/tryingET/pi-extensions/commit/3ff494f22e044f2d898260d0c56a0eb3e599d30e))
* **pi-autonomous-session-control:** harden live proof reload evidence ([269e132](https://github.com/tryingET/pi-extensions/commit/269e132d0078d729351342b61e09de4c7a2bba56))
* retry provable pre-spawn loop failures ([7382b10](https://github.com/tryingET/pi-extensions/commit/7382b10b779f743bf5b880241aa3842cd9146851))
* route ASC autoresearch launches through slash UX ([f0b7606](https://github.com/tryingET/pi-extensions/commit/f0b7606ad146e73ffdf8f57c8ea58d791a87e871))
* **self-evolution:** close typed candidate loop ([61873a7](https://github.com/tryingET/pi-extensions/commit/61873a7874087f64f23495b1143c0ef554fbbf93))
* **self:** add safe continuation aliases ([ca39234](https://github.com/tryingET/pi-extensions/commit/ca39234cb9cf2900eae0c950dacac849811e19d4))
* **self:** bridge handoff cues to compaction schema ([dce8615](https://github.com/tryingET/pi-extensions/commit/dce8615f3d1342308bef81382cde6b9459a193c3))
* **self:** explain autonomy levels ([c2e3533](https://github.com/tryingET/pi-extensions/commit/c2e35330f0d02b18aa4fb84d1558eb3313cba667))
* **self:** expose continuation candidate status ([e2c9508](https://github.com/tryingET/pi-extensions/commit/e2c9508d79ef53fc4bb2b0e4b9f9a6e606437b02))
* **self:** mirror caller intent in handoffs ([7825a14](https://github.com/tryingET/pi-extensions/commit/7825a146dcab18a467e1b9390004165c1bceaf88))
* **self:** persist continuation candidates ([0fd35d4](https://github.com/tryingET/pi-extensions/commit/0fd35d41adb50042543f48d7bf48e145cbfc3e5f))
* **self:** persist handoff continuation candidates ([c829e15](https://github.com/tryingET/pi-extensions/commit/c829e15c75f12b61598f1b6b37eeb12144108052))
* **self:** prefill autoresearch campaign route ([29dbadc](https://github.com/tryingET/pi-extensions/commit/29dbadc4df6cd7ac399971566052648a7c92231a))
* **self:** prefill visible-loop self-evolution route ([3361b46](https://github.com/tryingET/pi-extensions/commit/3361b469e07cb7fb15a62d99ea86fc1be66de446))
* **self:** prioritize explicit continuation after reload ([3edec12](https://github.com/tryingET/pi-extensions/commit/3edec12560d9fe07692e1964a9b1c79f2c4a9ff7))
* **self:** record explicit continuation candidates ([3707d60](https://github.com/tryingET/pi-extensions/commit/3707d608d9c24706016ce792017e71a71cfdddcf))
* **self:** report memory lifecycle status ([a957bc7](https://github.com/tryingET/pi-extensions/commit/a957bc77cc1e44f874c9458a48a61b27c5bae6f9))
* streamline self scoutpeer continuation ([6209c52](https://github.com/tryingET/pi-extensions/commit/6209c521e90e1624926c5ba47d8f60eb93809fd0))
* surface file budget intelligence ([4b65d63](https://github.com/tryingET/pi-extensions/commit/4b65d634ac747c73d93a014e8c92097bab8d23e0))


### Bug Fixes

* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))
* **asc:** add compaction handoff prompt ([7bc3227](https://github.com/tryingET/pi-extensions/commit/7bc322751cfca163df8a6af2c785d179f3533922))
* **asc:** align diagnostic vent prefill schema ([029dc82](https://github.com/tryingET/pi-extensions/commit/029dc8288318716f1773f7e0b1d5c33b82aa1bfb))
* **asc:** align subagent liveness reporting ([5e31c8e](https://github.com/tryingET/pi-extensions/commit/5e31c8e71b97ad404a76ed9f00162da936db8bdd))
* **asc:** clarify action summary scope ([7f1458d](https://github.com/tryingET/pi-extensions/commit/7f1458d23f5de0c690afd7a87d5c4a7ea15e5a4f))
* **asc:** classify file budget cues after path resolution ([d1947f2](https://github.com/tryingET/pi-extensions/commit/d1947f2d700aef48ae413d287140949997ef5ae1))
* **asc:** clean owned orphan session locks ([81b8b18](https://github.com/tryingET/pi-extensions/commit/81b8b18c4885b31cbbb2a93a3d7026c89bd0521e))
* **asc:** close retention cleanup gaps ([d45913c](https://github.com/tryingET/pi-extensions/commit/d45913c81c35de8bb3bbaf980d60c5a1000c6079))
* **asc:** contextualize self loop advisories ([4392bf5](https://github.com/tryingET/pi-extensions/commit/4392bf504e6f8ce562619959ff7bbccb21eb4ae0))
* **asc:** defer nested visible-loop launches ([1f58932](https://github.com/tryingET/pi-extensions/commit/1f58932afb33319b6aa9f347d025a60a045e96ef))
* **asc:** expose evolution candidate kind in self text ([2f1e7a6](https://github.com/tryingET/pi-extensions/commit/2f1e7a6db2d83c76720e945ce71cc66819d670cc))
* **asc:** expose verbatim recall for self dogfood ([8ae6bf3](https://github.com/tryingET/pi-extensions/commit/8ae6bf3ab9fb1046059b7dbda9e650d66817f886))
* **asc:** fail closed insight promotion cues ([3557489](https://github.com/tryingET/pi-extensions/commit/3557489d37b08d71a4079930f5c702f9cec0d2f8))
* **asc:** gate slash-command notifications to prefill ([a1ab1ec](https://github.com/tryingET/pi-extensions/commit/a1ab1ecb0f698894353030f59380d766e467aa1f))
* **asc:** harden insight promotion cue status ([852247c](https://github.com/tryingET/pi-extensions/commit/852247c39af3e69491c844bb8a1d1c2ddaca84ca))
* **asc:** harden native subagent session cleanup ([241e7b7](https://github.com/tryingET/pi-extensions/commit/241e7b7a096d1a1a72c311fd78f913158f50e31d))
* **asc:** harden reflection guard status ([5989f52](https://github.com/tryingET/pi-extensions/commit/5989f529ec99c43deb54ec4503b747fc40c3c413))
* **asc:** harden subagent cleanup recovery ([05dbede](https://github.com/tryingET/pi-extensions/commit/05dbedee108c9bfffa5a5d07c6b7c93629f524b0))
* **asc:** harden subagent session cleanup ([3bd3b98](https://github.com/tryingET/pi-extensions/commit/3bd3b984af922e668d89972cd6888813521ed139))
* **asc:** honor diagnostic correction context ([5c9e437](https://github.com/tryingET/pi-extensions/commit/5c9e437e80a713ad1d1780f5f7f946bc142aea73))
* **asc:** honor diagnostic surface constraints ([f59bdb8](https://github.com/tryingET/pi-extensions/commit/f59bdb8acc3124a29483e8efdf2d291e03ba4c46))
* **asc:** make self prefill update editor ([2773c2d](https://github.com/tryingET/pi-extensions/commit/2773c2d93541366fca5d5299919a65f97185b69d))
* **asc:** mark recovered handoff failures as history ([b9a46ba](https://github.com/tryingET/pi-extensions/commit/b9a46ba07f08d32048d9cc9dd4282eb0c3b0f0f4))
* **asc:** narrow recovery evidence for slice ranking ([7c56925](https://github.com/tryingET/pi-extensions/commit/7c569254de43a59937332fe29146fde00a024d64))
* **asc:** prefill peer slash command ([e6fc337](https://github.com/tryingET/pi-extensions/commit/e6fc337076d66e12736cefc58140c7a1434bbb3c))
* **asc:** preserve quoted prefill commands ([6e2ec11](https://github.com/tryingET/pi-extensions/commit/6e2ec11034a707fd6ee50761bbe7fcf047be66ef))
* **asc:** preserve required reflection check status ([e878b39](https://github.com/tryingET/pi-extensions/commit/e878b39bbcc89686823eb3b4adbc22507cf5c10d))
* **asc:** preserve subagent sessions by default ([6354672](https://github.com/tryingET/pi-extensions/commit/6354672329a68bb292f01eb8c8c8bcca5231b4d7))
* **asc:** preview diagnostic vents before record ([25ea939](https://github.com/tryingET/pi-extensions/commit/25ea93983fdec2ca2ecff0842994d59e7bb1fa61))
* **asc:** prioritize explicit self directives ([d3c3c10](https://github.com/tryingET/pi-extensions/commit/d3c3c10c59a391b89b9d116e4583cf74bccca034))
* **asc:** prioritize explicit user-message actions ([c8b5f2f](https://github.com/tryingET/pi-extensions/commit/c8b5f2fd1d7953cd11587e11179ee7483d5f2526))
* **asc:** prioritize reflection guard checks ([3817989](https://github.com/tryingET/pi-extensions/commit/381798930bd9852bed23c240ed07aec2ab62cc24))
* **asc:** recognize self evolution diagnostics ([675780e](https://github.com/tryingET/pi-extensions/commit/675780edecf98b0edca11a2f442872294d4e7cb6))
* **asc:** reject stale subagent pid reuse ([f0a7167](https://github.com/tryingET/pi-extensions/commit/f0a716784f4e063ca39bf6e8c77bc597f3c5787e))
* **asc:** report actual prefill delivery state ([d716a37](https://github.com/tryingET/pi-extensions/commit/d716a37ec7b7d53090b3b454b78a1bd2bf71824a))
* **asc:** require explicit deferral destination ([8260c1a](https://github.com/tryingET/pi-extensions/commit/8260c1a1e131aca97d51d047ed457ffdda54d124))
* **asc:** require owned session markers for inspection ([e432cd4](https://github.com/tryingET/pi-extensions/commit/e432cd42875c71d43d56635f823647b6d12c3e99))
* **asc:** retry quality gate temp cleanup ([2b81c97](https://github.com/tryingET/pi-extensions/commit/2b81c97ca5833f79e8d4bb31cd801492d4a749db))
* **asc:** route compound failure cue queries ([d460b5a](https://github.com/tryingET/pi-extensions/commit/d460b5a1e2449b6127c8f0ebf6bf72b8dc256a95))
* **asc:** route explicit user messages through self ([2510315](https://github.com/tryingET/pi-extensions/commit/2510315ea470250f4bf70eabb5f910303e8a8dd9))
* **asc:** route self-evolution continuation alias ([9aa6ec4](https://github.com/tryingET/pi-extensions/commit/9aa6ec49f6d5f52dd67d3585a45801eeef0907b6))
* **asc:** scope recovery ranking to active failures ([c7fdaaf](https://github.com/tryingET/pi-extensions/commit/c7fdaaf8976f94b5c883298cb1e9c64378b37876))
* **asc:** suppress recovered failure loop cues ([6a843de](https://github.com/tryingET/pi-extensions/commit/6a843de53b9bd2a3c7e41d19e055aebd0200ed2b))
* **asc:** surface context pressure handoff cues ([4412ffd](https://github.com/tryingET/pi-extensions/commit/4412ffd853e26a959d4742f8d616660a798a7e94))
* **asc:** surface insight promotion closeout cues ([2986982](https://github.com/tryingET/pi-extensions/commit/29869826b735cdd038d61fcd608c300ac166ec7c))
* **asc:** surface reflection guard check status ([006fc6a](https://github.com/tryingET/pi-extensions/commit/006fc6a885d6fb9f6e8c1598c36285ed430ae02c))
* **asc:** tighten action delivery classification ([4912fcf](https://github.com/tryingET/pi-extensions/commit/4912fcf4fcfb75ee28eaea3090cb437b91c75684))
* **asc:** tighten recovery slice recurrence ([dc6f300](https://github.com/tryingET/pi-extensions/commit/dc6f3002e3b27f868701ff5b082f0f3761587952))
* **ci:** make release checks reproducible ([c33eae9](https://github.com/tryingET/pi-extensions/commit/c33eae9f3cc58f75a53d1d476134bc09b9008401))
* **compaction:** own fresh session handoff prompts ([4300ea9](https://github.com/tryingET/pi-extensions/commit/4300ea95025703465c586d5050f3181230d030f2))
* harden nexus review boundaries ([f5ce094](https://github.com/tryingET/pi-extensions/commit/f5ce094538eb0d6a2f15f224a701051d113fd8b0))
* **pi-autonomous-session-control:** harden reflection guard trust tiers ([117a2b8](https://github.com/tryingET/pi-extensions/commit/117a2b875886a7e9b39e85ea24a9c4b93e0a4144))
* **validation:** align file budget classifiers ([b3dffa7](https://github.com/tryingET/pi-extensions/commit/b3dffa7b5c73a681f12995ff057d88b2f5fc855d))
* **validation:** close file budget audit gaps ([4263a6c](https://github.com/tryingET/pi-extensions/commit/4263a6ce16a73bef0609491cbef02cb87b046f18))
* **validation:** codify file budget policy boundary ([4498376](https://github.com/tryingET/pi-extensions/commit/4498376e3da50d13cc45a01ac2d6b08754ac24dd))
* **validation:** cover jsx file budget paths ([e69b3af](https://github.com/tryingET/pi-extensions/commit/e69b3af6e177551c77bcf88cbcced1f86ce32e7d))
* **validation:** harden file budget analysis ([f89eb9c](https://github.com/tryingET/pi-extensions/commit/f89eb9c530acea2a0aaffcd084069eb97331ceb7))

## [Unreleased]

### Added

- `self` action state now supports `action summary` / checkpoint / follow-up listing for restart-aware dogfood loops.
- Scoped self-memory persistence now round-trips action checkpoints and follow-ups alongside crystallization/protection memories.
- `self` perception now diagnoses malformed bash tool-call inputs and suspicious relative `dev/null` redirects instead of inventing unprovable command history.

### Changed

- `self` persists scoped memory after action writes so Level-4 handoff/dogfood checkpoints survive extension restarts.
- `dispatch_subagent` now defaults child session traces to the ASC-owned `asc-subagents/` subdirectory inside Pi's native `~/.pi/agent/sessions/--<encoded-cwd>--/` store, while keeping `PI_SUBAGENT_SESSIONS_DIR` as an explicit separate-store override.
- `/subagent-clear` and `/subagent-cleanup` now preserve subagent traces by default and require an explicit `--delete` flag before pruning ASC-owned artifacts.
- Legacy startup cleanup env flags no longer delete session traces; startup now preserves by policy and destructive pruning is command-explicit.
- Destructive pruning no longer trusts arbitrary contained `sessionFile` paths; only expected ASC trace names (`<session>.jsonl` / legacy `<session>.json`) are deletion candidates.
- Running-session liveness now records process start ticks when available, marks unsupported process-identity platforms explicitly, rejects mismatched PID identity on restart, keeps unsupported-identity live sessions while their PID is alive, abandons stale legacy running sidecars that lack process identity after a bounded grace window, and reports the same identity-aware live-owner state in subagent inspection.
- `dispatch_subagent` now probes the exact child `pi --version`, requires one complete parent-reclassified settlement handshake before lifecycle events, enforces ordered `agent_settled` finality on Pi >=0.80, and confines the clean-exit `agent_end.willRetry=false` fallback to explicitly identified Pi 0.76 hosts.
- Cross-process capacity lease and reclaim payloads are privately completed before atomic hard-link publication; identity-bearing compare/delete claims fence stale takeover and release against suspended creators and concurrent replacements.

## [0.1.5] - 2026-05-12

### Added

- Scoped self-memory lifecycle wiring in `extensions/self/memory-lifecycle.ts` (load, hydrate, persist, validate)
- Environment override `PI_SELF_MEMORY_PATH` for deterministic memory snapshot location
- Persistence safety coverage in `tests/self-memory-persistence.test.mjs`:
  - cross-lifecycle round-trip for crystallization + protection domains
  - malformed payload fail-safe recovery
- ASC-owned rewind core scaffold under `extensions/self/rewind/`:
  - temp-index git snapshot capture
  - tree-SHA deduplicated snapshot creation
  - single-ref keepalive storage helpers
  - exact restore + undo core
  - owned session-ledger schema guards
  - pure retention-planning helper
- ASC-owned rewind runtime wiring in `extensions/self/rewind/runtime.ts`:
  - session bootstrap and reconstruction for ASC-owned rewind metadata
  - exact rewind-point capture on `turn_start` / `turn_end` / `agent_settled`
  - compaction alias recording on `session_compact`
  - integration with Pi's built-in `/fork` and `/tree` flows via `session_before_fork`, `session_start` (`reason: "fork"`), `session_before_tree`, and `session_tree`
  - footer/status publication for rewind point visibility in interactive sessions
- Optional Replay Fabric recovery projection in `extensions/self/rewind/replay-fabric-projection.ts`:
  - bounded `restore.started`, `restore.completed`, `restore.failed`, and `restore.undo` milestone emission
  - repo-local `.git/pi-rewind/manifests/*.json` artifact manifests for replay follow-through
  - opt-in activation through `ASC_REWIND_REPLAY_FABRIC_URL`
- Focused rewind tests:
  - `tests/rewind-git-snapshot.test.mjs`
  - `tests/rewind-exact-restore.test.mjs`
  - `tests/rewind-session-ledger.test.mjs`
  - `tests/rewind-retention.test.mjs`
  - `tests/rewind-runtime.test.mjs`
- Rewind integration design note: `docs/project/2026-04-22-rewind-salvage-and-integration-plan.md`
- Explicit live prompt-vault test script `npm run test:live:prompt-vault`, gated by `ASC_RUN_LIVE_PROMPT_VAULT_TESTS=1`.

### Changed

- `self` runtime now awaits memory hydration before query resolution
- README docs map now links to the rewind salvage/integration plan so the new rewind slice work stays discoverable from the package entrypoint
- `self` persists scoped domains (`crystallization`, `protection`) after successful domain writes
- `dispatch_subagent` now routes raw `pi --mode json` output through a package-local assistant-only filter helper before ASC parses the stream, dropping aggregate Pi events that the runtime does not semantically need and treating the helper protocol as the only accepted parent-side seam
- Subagents now inherit the current session-selected model when available; `PI_SUBAGENT_MODEL` still overrides, and `openai-codex/gpt-5.4` remains the fallback when no live model is available
- `dispatch_subagent` now records selected child model plus explicit child bootstrap details (`requestedModel`, `effectiveModel`, `loadedExtensions`, `extensionWarnings`) on execution results
- `self-prompt-vault-compat` now uses a feature/manifest policy for the ASC autonomy floor instead of certifying arbitrary low checked manifest versions, and its Dolt schema probe is timeout-bounded.
- Documentation updated to reflect scoped cross-session persistence, filtered subagent transport, and new memory contract surfaces
- Default `npm run check` now keeps prompt-vault parser/unit contract tests while host-dependent live prompt-vault DB/vault-client probes live in explicit `.live.mjs` files run only by `npm run test:live:prompt-vault`, so default checks report zero live prompt-vault skips.

### Fixed

- Malformed persisted memory payloads now degrade safely (no crash) and are repaired on next successful scoped persistence write
- Oversized aggregate Pi JSON lines no longer trip ASC's main subagent parser before assistant output can be recovered; raw upstream buffering is now isolated inside the filter helper with separate raw vs filtered buffer controls
- Timeout/abort shutdown now tears down the raw `pi` child before the parent-side helper force kill window closes, preventing orphaned subprocesses
- Subagents no longer fail at startup when the live session model comes from a numeric-suffix extension provider alias such as `openai-codex-2`; ASC now preserves the alias and explicitly bootstraps `pi-multi-pass` into the child runtime instead of collapsing to the base provider
- Extensionless raw-child runs now use an isolated Pi agent dir with sanitized child settings, so unrelated global default-model warnings from extension-backed provider aliases no longer leak into subagent stderr
- `self-prompt-vault-compat` no longer reports the current ASC package below its own autonomy-version floor when source feature shape proves prompt-envelope support, but it also no longer certifies arbitrary low package manifests such as `0.0.1`.
- Empty or whitespace-only subagent model selections now fail before spawn as structured `model_selection_failed` results without leaking `activeCount` / `maxConcurrent`.
- `DispatchSubagentRequest.env` is now fail-closed to `PI_PROVENANCE_*` keys so request callers cannot override child control-plane env such as `PATH`, `NODE_OPTIONS`, or `PI_CODING_AGENT_DIR`; rejected env fails before spawn as `env_policy_failed` without leaking `activeCount`.
- Capability-map wording inside explicit crystallization/protection directives (for example `Remember: capability map stale` or `Mark as trap: capability map ...`) no longer hijacks routing into capability discovery.
- `tests/public-execution-contract.test.mjs` now resolves package paths from the test module location so it can pass from the repo root as well as the package root.
- Live prompt-vault harness readiness now discovers the monorepo sibling `pi-vault-client` package when the legacy installed extension path is absent, avoids treating non-runtime `@earendil-works/pi-coding-agent` package-root exports as unavailable, and parses current `vault_retrieve` output that omits a closing content fence.
- Exact rewind restore now attempts to roll back to the captured undo snapshot if the destructive delete/restore flow fails, and ASC rewind ledger guards reject malformed snapshot arrays and out-of-bounds binding/current/undo indices.

## [0.1.4] - 2026-03-04

### Added

- Reproducible recipe for live cross-extension harness execution in `docs/project/prompt-vault-cross-extension-harness.md`
- `vault_rate` FK behavior contract documentation with integration guidance
- **Subagent timeout**: New `timeout` parameter (seconds) on `dispatch_subagent` with 5-minute default
- **Unique session names**: Session name collision now auto-generates unique suffixes to prevent overwrites
- **Rate limiting**: `maxConcurrent` limit (default: 5) prevents resource exhaustion from unbounded spawning
- **Session cleanup**: New `subagent-cleanup` command removes old sessions (age/count-based)
- **Session stats**: Enhanced `subagent-status` command shows session count and oldest age
- **Subagent model env var**: `PI_SUBAGENT_MODEL` environment variable for custom subagent model selection
- **Upstream proposals**: Draft proposals for vault-client improvements:
  - `docs/upstream-proposals/vault-rate-fk-fallback-proposal.md`
  - `docs/upstream-proposals/vault-client-json-output-proposal.md`

### Fixed

- Session file cleanup errors are now logged instead of silently swallowed
- Session name collision prevention (`a/b` and another `a/b` now get unique files)
- Subagent model selection now uses `openai-codex/gpt-5.3-codex-spark` with explicit provider prefix to avoid pi model resolver ambiguity

### Changed

- `docs/dev/status.md` now includes Known Upstream Behaviors table for cross-repo contract tracking
- Extracted `subagent-profiles.ts`, `subagent-session.ts`, and `subagent-commands.ts` modules to reduce file size
- `createSubagentState` now accepts optional `{ maxConcurrent }` parameter

## [0.1.3] - 2026-03-03

### Added

- `dispatch_subagent` prompt envelope contract:
  - New optional params: `prompt_name`, `prompt_content`, `prompt_tags`, `prompt_source`
  - Prompt envelope content is now injected deterministically into subagent system prompts
  - Tool result `details` now includes prompt provenance (`prompt_name`, `prompt_source`, `prompt_tags`, `prompt_applied`)
- Focused top-level tests for dispatch contract behavior:
  - prompt-envelope + no-envelope dispatch paths
  - fallback behavior for partial/invalid envelopes
  - integration-oriented mocked vault payload flow
  - `tests/dispatch-subagent.test.mjs`
  - `tests/prompt-vault-dispatch-integration.test.mjs`
  - live prompt-vault DB path (currently `tests/prompt-vault-db-integration.live.mjs`)

### Changed

- Refactored prompt-envelope logic into `extensions/self/subagent-prompt-envelope.ts` for a stable integration seam and testability.
- `registerSubagentTool(...)` now supports an injectable spawner (defaults to runtime `spawnSubagent`) to enable deterministic tests.
- Invalid/partial prompt envelopes now fail soft with actionable `prompt_warning` guidance in both tool output and result details.
- Quality gate test discovery now includes nested suites (`tests/**/*.test.*`), and the self harness now stubs subagent imports so self test suites run in CI.
- Package `files` manifest now includes `extensions/self/` so published builds ship required runtime modules imported by `extensions/self.ts`.
- Default extension entrypoint now registers delegation runtime (`dispatch_subagent` + subagent commands) by default, with sessions dir resolved from `PI_SUBAGENT_SESSIONS_DIR` or `./.pi-subagent-sessions`.
- README quickstart/package file references now point at `extensions/self.ts` and `extensions/self/`.
- SOP prompt maintenance check now targets `extensions/self.ts` (instead of legacy `extensions/autonomy-control.ts`).
- Legacy architecture/explorer docs now include explicit historical-path notes for `autonomy-control/*` references.
- Fixed bash command perception tracking to store the real command string (instead of tool call IDs).
- Subagent state now refreshes when `createExtension(...)` is called with a different sessions directory.
- `dispatch_subagent` now sanitizes session names before creating session files to prevent path traversal via `name`.
- `dispatch_subagent` now converts thrown spawner exceptions into structured tool error results.
- Prompt envelope metadata is sanitized to single-line header values, and empty `prompt_tags` no longer trigger false-positive fallback warnings.
- Added runtime compatibility self-check command (`self-prompt-vault-compat`) that reports autonomy version × vault-client version × prompt-vault schema version matrix status.
- Added compatibility probe module (`extensions/self/prompt-vault-compat.ts`) and focused matrix tests (`tests/prompt-vault-compat.test.mjs`).
- Added live cross-extension harness support:
  - harness helpers in `extensions/self/cross-extension-harness.ts`
  - live integration test `tests/prompt-vault-cross-extension.live.mjs` chaining real vault-client tools (`vault_query` + `vault_retrieve`) into `dispatch_subagent`
  - deterministic skip gating when vault-client runtime dependencies/environment are unavailable
  - package-layout-aware vault-client entry discovery (`index.ts` and package-defined extension paths)
  - prompt envelope extraction now preserves template bodies containing internal `---` markdown separators

## [0.1.2] - 2026-03-02

### Changed

- **Extracted `prompt_eval` to vault-client extension**
  - Removed `prompt-eval.ts` and `prompt-eval-core.ts`
  - Prompt A/B testing now lives in `~/.pi/agent/extensions/vault-client/evaluator.ts`
  - Reduces duplication (vault client code was duplicated)
  - Cleaner separation: autonomy tools here, prompt tools in vault-client

### Removed

- `extensions/self/prompt-eval.ts`
- `extensions/self/prompt-eval-core.ts`

## [0.1.1] - 2026-02-21

### Added

- Wired `prompt_eval` tool into `createExtension` entry point
- Added `SubagentSpawner` adapter for prompt evaluation with local vLLM
- Configurable evaluator via optional `evalConfig` parameter

### Changed

- `createExtension` now accepts optional `evalConfig` parameter for customization
- Updated imports in self.ts to include prompt-eval types and functions

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.
