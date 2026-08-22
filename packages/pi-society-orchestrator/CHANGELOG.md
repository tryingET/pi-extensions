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

## [0.10.0](https://github.com/tryingET/pi-extensions/compare/pi-society-orchestrator-v0.9.0...pi-society-orchestrator-v0.10.0) (2026-08-22)


### Features

* **orchestrator:** add Agent Kernel custody for release evidence ([#139](https://github.com/tryingET/pi-extensions/issues/139)) ([b7a14ec](https://github.com/tryingET/pi-extensions/commit/b7a14ec1517537a3a1454d2640f067910f27cb4b))
* **orchestrator:** consume negative-only execution memory ([3fb5f20](https://github.com/tryingET/pi-extensions/commit/3fb5f200597f53a74786ad5288b98bd230682e45))
* **orchestrator:** expose direction controller readback ([53481db](https://github.com/tryingET/pi-extensions/commit/53481dbcd9c9ce56075a1f5f55f2821e0a8da3f0))
* **orchestrator:** gate D2E transfer completion ([a04b007](https://github.com/tryingET/pi-extensions/commit/a04b0074f55ecea1fc5063d8e6b7ae2962b63d41))
* **orchestrator:** integrate D2E transfer gate ([b00f3ec](https://github.com/tryingET/pi-extensions/commit/b00f3ec463c6ed120002f397143bba203338be23))
* **pi-society-orchestrator:** checkpoint terminal loop KES ([dec3f93](https://github.com/tryingET/pi-extensions/commit/dec3f93c68916e24cb09508161079d35b900deb9))
* **pi-society-orchestrator:** replace footer routing with fast mode and Git status ([8944cd8](https://github.com/tryingET/pi-extensions/commit/8944cd88a5068e51e0b425990ea505075fa3e578))
* **pi-society-orchestrator:** verify telemetry review KES handoff ([#131](https://github.com/tryingET/pi-extensions/issues/131)) ([d38a469](https://github.com/tryingET/pi-extensions/commit/d38a46950894435f8411a88ddbe7c7b0fba3b2af))
* preflight governed deep review runtime ([1a65188](https://github.com/tryingET/pi-extensions/commit/1a651888ef4038a1520cf42986c9541e02b12d6d))


### Bug Fixes

* **asc:** fail closed on proc snapshot churn ([97ee000](https://github.com/tryingET/pi-extensions/commit/97ee000377be9e6249ec6faa6fa5d20f5d8737c9))
* **asc:** fence shared capacity recovery ([d5f33c5](https://github.com/tryingET/pi-extensions/commit/d5f33c58178a0977126dbea726d749bdc82f9b75))
* **ci:** prepare governed materialization policy ([91dd9bf](https://github.com/tryingET/pi-extensions/commit/91dd9bf6264e5cfb5e5ef602e21d65555501b966))
* close governed deep-review provenance gaps ([c70967a](https://github.com/tryingET/pi-extensions/commit/c70967acd34dd321f889ca48f97ce0f5e0c31e7e))
* harden governed preflight owner attestation ([a0a72e4](https://github.com/tryingET/pi-extensions/commit/a0a72e4c7ee8ae77420048e77ed61777f9aa0235))
* harden installed runtime composition ([8852cbf](https://github.com/tryingET/pi-extensions/commit/8852cbf79004c50035408225fd6cd18b021cba2d))
* materialize pinned Pi host peers ([d353f15](https://github.com/tryingET/pi-extensions/commit/d353f15676c5d5d95eebc9105c46ee84c36ef07d))
* **orchestrator:** adopt ASC 0.3 ([9f452b2](https://github.com/tryingET/pi-extensions/commit/9f452b289cc75c2063fae97958b6ab466694978c))
* **orchestrator:** classify pre-spawn dispatch failures as confirmed_no_effects ([5e6e061](https://github.com/tryingET/pi-extensions/commit/5e6e0611a5e014987ec9c3987312ab8cfe61d766))
* **orchestrator:** close execution-memory consumer gaps ([695726e](https://github.com/tryingET/pi-extensions/commit/695726e0c30dc9bb68e994e46103896d02dbf11f))
* **orchestrator:** derive npm age proof from effective before; never write before= ([542bed3](https://github.com/tryingET/pi-extensions/commit/542bed3d12797712f6a5300202e29b202ca0dfda))
* **orchestrator:** harden governed runtime materialization proof ([e0854d9](https://github.com/tryingET/pi-extensions/commit/e0854d9f340d72445368ea91bb326ba3f27f8de2))
* **orchestrator:** resolve ambient company for cognitive tools; stop test pollution of live loop-run state ([6f47553](https://github.com/tryingET/pi-extensions/commit/6f4755391ff3e511688c284a8028757d39bcb91f))
* **orchestrator:** restore ASC ^0.5.0 dep pin reverted by release-merge race ([c89598d](https://github.com/tryingET/pi-extensions/commit/c89598d294ca5c965a8b55366742712b73e5f591))
* **orchestrator:** route candidate cleanup through lifecycle v2 ([e6e36f2](https://github.com/tryingET/pi-extensions/commit/e6e36f242768fc597c2a9b0dbe37ee8e30877ab8))
* **orchestrator:** verify complete D2E commit history ([b665590](https://github.com/tryingET/pi-extensions/commit/b6655903b42b5c2238cd0d4332af30db2fc0d955))
* **pi-society-orchestrator:** prove declared ASC registry range before release readiness ([5052cf9](https://github.com/tryingET/pi-extensions/commit/5052cf9b9ca43f4dc6a74b2a0e8c891ad21c4a7f))
* **pi-society-orchestrator:** provision governed-npm policy fixture in tests ([b545eed](https://github.com/tryingET/pi-extensions/commit/b545eeda947154c57a799f815fda997b6d71a268))
* **pi-society-orchestrator:** restore registry typebox pin in package lock ([fbd5e05](https://github.com/tryingET/pi-extensions/commit/fbd5e058e98ab478080e20abece61f9e3e969b22))
* **release:** CI-portable release checks and orchestrator ASC dep pin ([ea76ff9](https://github.com/tryingET/pi-extensions/commit/ea76ff95e5d41480cc02651a63c1f6299bcbb3f1))
* **release:** complete ASC registry cutover to ^0.4.0 ([39180ba](https://github.com/tryingET/pi-extensions/commit/39180ba4657142341568c7ffac4bd267d474bdb7))
* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))
* **release:** unblock ASC ^0.4.0 bootstrap via sanctioned transitional bundled bridge ([ab95c2b](https://github.com/tryingET/pi-extensions/commit/ab95c2ba9d25395b6ee7c724da6afc0888279a2a))
* verify import-only Pi host peers ([edb96b4](https://github.com/tryingET/pi-extensions/commit/edb96b46eabe59f0269a65b875c8f468c29a2cbe))
* **visible-loop:** govern deep-review workflow dispatch ([f5384ff](https://github.com/tryingET/pi-extensions/commit/f5384ff524a92e78ea9af07c4d5c634bb31356d1))

## [0.9.0](https://github.com/tryingET/pi-extensions/compare/pi-society-orchestrator-v0.8.0...pi-society-orchestrator-v0.9.0) (2026-08-21)


### Features

* **orchestrator:** add Agent Kernel custody for release evidence ([#139](https://github.com/tryingET/pi-extensions/issues/139)) ([b7a14ec](https://github.com/tryingET/pi-extensions/commit/b7a14ec1517537a3a1454d2640f067910f27cb4b))

## [0.8.0](https://github.com/tryingET/pi-extensions/compare/pi-society-orchestrator-v0.7.1...pi-society-orchestrator-v0.8.0) (2026-08-20)


### Features

* **pi-society-orchestrator:** verify telemetry review KES handoff ([#131](https://github.com/tryingET/pi-extensions/issues/131)) ([d38a469](https://github.com/tryingET/pi-extensions/commit/d38a46950894435f8411a88ddbe7c7b0fba3b2af))


### Bug Fixes

* **orchestrator:** derive npm age proof from effective before; never write before= ([542bed3](https://github.com/tryingET/pi-extensions/commit/542bed3d12797712f6a5300202e29b202ca0dfda))

## [0.7.1](https://github.com/tryingET/pi-extensions/compare/pi-society-orchestrator-v0.7.0...pi-society-orchestrator-v0.7.1) (2026-08-16)


### Bug Fixes

* **asc:** fail closed on proc snapshot churn ([97ee000](https://github.com/tryingET/pi-extensions/commit/97ee000377be9e6249ec6faa6fa5d20f5d8737c9))
* **asc:** fence shared capacity recovery ([d5f33c5](https://github.com/tryingET/pi-extensions/commit/d5f33c58178a0977126dbea726d749bdc82f9b75))
* **orchestrator:** classify pre-spawn dispatch failures as confirmed_no_effects ([5e6e061](https://github.com/tryingET/pi-extensions/commit/5e6e0611a5e014987ec9c3987312ab8cfe61d766))

## [0.7.0](https://github.com/tryingET/pi-extensions/compare/pi-society-orchestrator-v0.6.0...pi-society-orchestrator-v0.7.0) (2026-08-15)


### Features

* **orchestrator:** consume negative-only execution memory ([3fb5f20](https://github.com/tryingET/pi-extensions/commit/3fb5f200597f53a74786ad5288b98bd230682e45))
* **orchestrator:** expose direction controller readback ([53481db](https://github.com/tryingET/pi-extensions/commit/53481dbcd9c9ce56075a1f5f55f2821e0a8da3f0))
* **orchestrator:** gate D2E transfer completion ([a04b007](https://github.com/tryingET/pi-extensions/commit/a04b0074f55ecea1fc5063d8e6b7ae2962b63d41))
* **orchestrator:** integrate D2E transfer gate ([b00f3ec](https://github.com/tryingET/pi-extensions/commit/b00f3ec463c6ed120002f397143bba203338be23))
* **pi-society-orchestrator:** checkpoint terminal loop KES ([dec3f93](https://github.com/tryingET/pi-extensions/commit/dec3f93c68916e24cb09508161079d35b900deb9))
* **pi-society-orchestrator:** replace footer routing with fast mode and Git status ([8944cd8](https://github.com/tryingET/pi-extensions/commit/8944cd88a5068e51e0b425990ea505075fa3e578))
* preflight governed deep review runtime ([1a65188](https://github.com/tryingET/pi-extensions/commit/1a651888ef4038a1520cf42986c9541e02b12d6d))


### Bug Fixes

* close governed deep-review provenance gaps ([c70967a](https://github.com/tryingET/pi-extensions/commit/c70967acd34dd321f889ca48f97ce0f5e0c31e7e))
* harden governed preflight owner attestation ([a0a72e4](https://github.com/tryingET/pi-extensions/commit/a0a72e4c7ee8ae77420048e77ed61777f9aa0235))
* harden installed runtime composition ([8852cbf](https://github.com/tryingET/pi-extensions/commit/8852cbf79004c50035408225fd6cd18b021cba2d))
* materialize pinned Pi host peers ([d353f15](https://github.com/tryingET/pi-extensions/commit/d353f15676c5d5d95eebc9105c46ee84c36ef07d))
* **orchestrator:** adopt ASC 0.3 ([9f452b2](https://github.com/tryingET/pi-extensions/commit/9f452b289cc75c2063fae97958b6ab466694978c))
* **orchestrator:** close execution-memory consumer gaps ([695726e](https://github.com/tryingET/pi-extensions/commit/695726e0c30dc9bb68e994e46103896d02dbf11f))
* **orchestrator:** harden governed runtime materialization proof ([e0854d9](https://github.com/tryingET/pi-extensions/commit/e0854d9f340d72445368ea91bb326ba3f27f8de2))
* **orchestrator:** resolve ambient company for cognitive tools; stop test pollution of live loop-run state ([6f47553](https://github.com/tryingET/pi-extensions/commit/6f4755391ff3e511688c284a8028757d39bcb91f))
* **orchestrator:** route candidate cleanup through lifecycle v2 ([e6e36f2](https://github.com/tryingET/pi-extensions/commit/e6e36f242768fc597c2a9b0dbe37ee8e30877ab8))
* **orchestrator:** verify complete D2E commit history ([b665590](https://github.com/tryingET/pi-extensions/commit/b6655903b42b5c2238cd0d4332af30db2fc0d955))
* **pi-society-orchestrator:** prove declared ASC registry range before release readiness ([5052cf9](https://github.com/tryingET/pi-extensions/commit/5052cf9b9ca43f4dc6a74b2a0e8c891ad21c4a7f))
* **pi-society-orchestrator:** provision governed-npm policy fixture in tests ([b545eed](https://github.com/tryingET/pi-extensions/commit/b545eeda947154c57a799f815fda997b6d71a268))
* **release:** complete ASC registry cutover to ^0.4.0 ([39180ba](https://github.com/tryingET/pi-extensions/commit/39180ba4657142341568c7ffac4bd267d474bdb7))
* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))
* **release:** unblock ASC ^0.4.0 bootstrap via sanctioned transitional bundled bridge ([ab95c2b](https://github.com/tryingET/pi-extensions/commit/ab95c2ba9d25395b6ee7c724da6afc0888279a2a))
* verify import-only Pi host peers ([edb96b4](https://github.com/tryingET/pi-extensions/commit/edb96b46eabe59f0269a65b875c8f468c29a2cbe))
* **visible-loop:** govern deep-review workflow dispatch ([f5384ff](https://github.com/tryingET/pi-extensions/commit/f5384ff524a92e78ea9af07c4d5c634bb31356d1))

## [0.6.0](https://github.com/tryingET/pi-extensions/compare/pi-society-orchestrator-v0.5.1...pi-society-orchestrator-v0.6.0) (2026-08-15)


### Features

* **orchestrator:** consume negative-only execution memory ([3fb5f20](https://github.com/tryingET/pi-extensions/commit/3fb5f200597f53a74786ad5288b98bd230682e45))
* **pi-society-orchestrator:** checkpoint terminal loop KES ([dec3f93](https://github.com/tryingET/pi-extensions/commit/dec3f93c68916e24cb09508161079d35b900deb9))
* **pi-society-orchestrator:** replace footer routing with fast mode and Git status ([8944cd8](https://github.com/tryingET/pi-extensions/commit/8944cd88a5068e51e0b425990ea505075fa3e578))


### Bug Fixes

* harden installed runtime composition ([8852cbf](https://github.com/tryingET/pi-extensions/commit/8852cbf79004c50035408225fd6cd18b021cba2d))
* **orchestrator:** close execution-memory consumer gaps ([695726e](https://github.com/tryingET/pi-extensions/commit/695726e0c30dc9bb68e994e46103896d02dbf11f))
* **orchestrator:** harden governed runtime materialization proof ([e0854d9](https://github.com/tryingET/pi-extensions/commit/e0854d9f340d72445368ea91bb326ba3f27f8de2))
* **orchestrator:** resolve ambient company for cognitive tools; stop test pollution of live loop-run state ([6f47553](https://github.com/tryingET/pi-extensions/commit/6f4755391ff3e511688c284a8028757d39bcb91f))
* **orchestrator:** route candidate cleanup through lifecycle v2 ([e6e36f2](https://github.com/tryingET/pi-extensions/commit/e6e36f242768fc597c2a9b0dbe37ee8e30877ab8))
* **pi-society-orchestrator:** prove declared ASC registry range before release readiness ([5052cf9](https://github.com/tryingET/pi-extensions/commit/5052cf9b9ca43f4dc6a74b2a0e8c891ad21c4a7f))
* **release:** complete ASC registry cutover to ^0.4.0 ([39180ba](https://github.com/tryingET/pi-extensions/commit/39180ba4657142341568c7ffac4bd267d474bdb7))
* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))
* **release:** unblock ASC ^0.4.0 bootstrap via sanctioned transitional bundled bridge ([ab95c2b](https://github.com/tryingET/pi-extensions/commit/ab95c2ba9d25395b6ee7c724da6afc0888279a2a))

## [0.5.1](https://github.com/tryingET/pi-extensions/compare/pi-society-orchestrator-v0.5.0...pi-society-orchestrator-v0.5.1) (2026-08-01)


### Bug Fixes

* **orchestrator:** adopt ASC 0.3 ([9f452b2](https://github.com/tryingET/pi-extensions/commit/9f452b289cc75c2063fae97958b6ab466694978c))

## [0.5.0](https://github.com/tryingET/pi-extensions/compare/pi-society-orchestrator-v0.4.0...pi-society-orchestrator-v0.5.0) (2026-08-01)


### Features

* **orchestrator:** expose direction controller readback ([53481db](https://github.com/tryingET/pi-extensions/commit/53481dbcd9c9ce56075a1f5f55f2821e0a8da3f0))
* **orchestrator:** gate D2E transfer completion ([a04b007](https://github.com/tryingET/pi-extensions/commit/a04b0074f55ecea1fc5063d8e6b7ae2962b63d41))
* **orchestrator:** integrate D2E transfer gate ([b00f3ec](https://github.com/tryingET/pi-extensions/commit/b00f3ec463c6ed120002f397143bba203338be23))
* preflight governed deep review runtime ([1a65188](https://github.com/tryingET/pi-extensions/commit/1a651888ef4038a1520cf42986c9541e02b12d6d))


### Bug Fixes

* close governed deep-review provenance gaps ([c70967a](https://github.com/tryingET/pi-extensions/commit/c70967acd34dd321f889ca48f97ce0f5e0c31e7e))
* harden governed preflight owner attestation ([a0a72e4](https://github.com/tryingET/pi-extensions/commit/a0a72e4c7ee8ae77420048e77ed61777f9aa0235))
* materialize pinned Pi host peers ([d353f15](https://github.com/tryingET/pi-extensions/commit/d353f15676c5d5d95eebc9105c46ee84c36ef07d))
* **orchestrator:** verify complete D2E commit history ([b665590](https://github.com/tryingET/pi-extensions/commit/b6655903b42b5c2238cd0d4332af30db2fc0d955))
* verify import-only Pi host peers ([edb96b4](https://github.com/tryingET/pi-extensions/commit/edb96b46eabe59f0269a65b875c8f468c29a2cbe))
* **visible-loop:** govern deep-review workflow dispatch ([f5384ff](https://github.com/tryingET/pi-extensions/commit/f5384ff524a92e78ea9af07c4d5c634bb31356d1))

## [0.4.0](https://github.com/tryingET/pi-extensions/compare/pi-society-orchestrator-v0.3.0...pi-society-orchestrator-v0.4.0) (2026-07-13)


### Features

* add fail-closed loop continuation checkpoints ([de0c6b6](https://github.com/tryingET/pi-extensions/commit/de0c6b69f85c5632ae370233666a57adf1d395a8))
* add matrix executor and self continuation ([35d0f6b](https://github.com/tryingET/pi-extensions/commit/35d0f6b993deadf25fe6ff73ece26410e9879df7))
* adopt engineering-core package surfaces ([c4a28c1](https://github.com/tryingET/pi-extensions/commit/c4a28c12c6077ba5b17909bcde3354bb1249e8d0))
* bind loop continuation to ASC effect receipts ([4b94648](https://github.com/tryingET/pi-extensions/commit/4b94648a2889c04809bd2e725f3f89aa1f5cd5ad))
* **cleanup:** close exact candidate peer processes ([9f6a5b1](https://github.com/tryingET/pi-extensions/commit/9f6a5b11546e918ef80a076b5337212c2cdb5bcf))
* **extensions:** harden runtime quality across packages ([1ff1eb0](https://github.com/tryingET/pi-extensions/commit/1ff1eb0cf10a3f8f60cf391ccf246b238951a848))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))
* **orchestrator:** add finalizer closeout receipt ([a3d0fea](https://github.com/tryingET/pi-extensions/commit/a3d0fea5f7851beda8477dc285968cf89487cf3b))
* **orchestrator:** add Level-4 candidate closeout packet ([388ff27](https://github.com/tryingET/pi-extensions/commit/388ff27bf93780fc3bbec3d44a3c0b9dd0e6dfca))
* **orchestrator:** expose Level-4 packet inventory ([e406b52](https://github.com/tryingET/pi-extensions/commit/e406b527d2c9552864ed89e1580b80b45ad57f7b))
* **orchestrator:** forward model context to ASC subagent for child extension selection ([6c3c72a](https://github.com/tryingET/pi-extensions/commit/6c3c72a911a289168ddf7b245a5770825f13613b))
* **orchestrator:** render discovery posture without active wave ([6e8b0b7](https://github.com/tryingET/pi-extensions/commit/6e8b0b7dc8e8dd3a1e128b33b561458e7c721578))
* **orchestrator:** route Level-4 cleanup to cleanup tool ([7d4413c](https://github.com/tryingET/pi-extensions/commit/7d4413ce8d17150dc874170d872cf9f503f4c60d))
* **orchestrator:** surface cleanup registry status ([2c6aa22](https://github.com/tryingET/pi-extensions/commit/2c6aa2264213571b33074eee6f64ca4e96c5257a))
* **orchestrator:** surface Level-4 cleanup closeout packet ([b629c6c](https://github.com/tryingET/pi-extensions/commit/b629c6cc5f2375d6a19b7eb45a16822b9cfaeb73))
* **orchestrator:** surface post-fan-in promotion handoff ([82074cf](https://github.com/tryingET/pi-extensions/commit/82074cf8d83370a0aaf16591016bba8ed8ab778c))
* **orchestrator:** validate candidate peer registry cleanup ([75708d5](https://github.com/tryingET/pi-extensions/commit/75708d544d1dcd5edd641713e10831ee026fd6ed))
* prune loop checkpoints after seven days ([caeda34](https://github.com/tryingET/pi-extensions/commit/caeda34ebd9ae80cfb3c45121397149b47081c02))
* retry provable pre-spawn loop failures ([7382b10](https://github.com/tryingET/pi-extensions/commit/7382b10b779f743bf5b880241aa3842cd9146851))


### Bug Fixes

* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))
* enforce workflow concurrency and cancellation ([df146d3](https://github.com/tryingET/pi-extensions/commit/df146d3c7089b48d69bb181184b0269b9b7275f3))
* **orchestrator:** emit safe candidate peer lane names ([172d7a4](https://github.com/tryingET/pi-extensions/commit/172d7a4fe3084045fcacdd5ed3dedde4ae81b9fb))
* **orchestrator:** fail closed on missing cognitive tools ([33e2329](https://github.com/tryingET/pi-extensions/commit/33e2329f14426f884661f3f0b189274f8760ee23))
* **orchestrator:** gate level4 cleanup packets on exact ids ([9b8dd57](https://github.com/tryingET/pi-extensions/commit/9b8dd57eff7f99f46d904c3980b8a7b5b0b3f291))
* **release:** harden publish workflow package checks ([a55740c](https://github.com/tryingET/pi-extensions/commit/a55740cd55c2e6bfff84968de2793460db5e7acb))

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-society-orchestrator-v0.2.0...pi-society-orchestrator-v0.3.0) (2026-07-11)


### Features

* add fail-closed loop continuation checkpoints ([de0c6b6](https://github.com/tryingET/pi-extensions/commit/de0c6b69f85c5632ae370233666a57adf1d395a8))
* add matrix executor and self continuation ([35d0f6b](https://github.com/tryingET/pi-extensions/commit/35d0f6b993deadf25fe6ff73ece26410e9879df7))
* bind loop continuation to ASC effect receipts ([4b94648](https://github.com/tryingET/pi-extensions/commit/4b94648a2889c04809bd2e725f3f89aa1f5cd5ad))
* **extensions:** harden runtime quality across packages ([1ff1eb0](https://github.com/tryingET/pi-extensions/commit/1ff1eb0cf10a3f8f60cf391ccf246b238951a848))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))
* **orchestrator:** forward model context to ASC subagent for child extension selection ([6c3c72a](https://github.com/tryingET/pi-extensions/commit/6c3c72a911a289168ddf7b245a5770825f13613b))
* **orchestrator:** render discovery posture without active wave ([6e8b0b7](https://github.com/tryingET/pi-extensions/commit/6e8b0b7dc8e8dd3a1e128b33b561458e7c721578))
* prune loop checkpoints after seven days ([caeda34](https://github.com/tryingET/pi-extensions/commit/caeda34ebd9ae80cfb3c45121397149b47081c02))
* retry provable pre-spawn loop failures ([7382b10](https://github.com/tryingET/pi-extensions/commit/7382b10b779f743bf5b880241aa3842cd9146851))


### Bug Fixes

* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))
* enforce workflow concurrency and cancellation ([df146d3](https://github.com/tryingET/pi-extensions/commit/df146d3c7089b48d69bb181184b0269b9b7275f3))
* **orchestrator:** fail closed on missing cognitive tools ([33e2329](https://github.com/tryingET/pi-extensions/commit/33e2329f14426f884661f3f0b189274f8760ee23))

## [Unreleased]

## [0.2.0] - 2026-05-17

### Changed

- Routed runtime `sqlite3`, `dolt`, and `rocs-cli` read paths through async, timeout-bound supervised helpers instead of synchronous runtime `execFileSync` calls.
- Tightened cognitive-tool lookup by name so non-cognitive prompt templates cannot be injected into dispatch or loop execution.
- Made explicit `societyDb` targeting outrank ambient `AK_DB` for `ak`-backed runtime calls.
- Expanded `society_query` read-only gating to allow valid read-only `WITH ... SELECT ...` diagnostics while still rejecting mutating or stacked SQL.
- Isolated `npm run release:check` installs behind a temporary `NPM_CONFIG_PREFIX` so routine release validation does not mutate the default global npm package space.
- Routed `cognitive_dispatch` evidence recording through a shared `ak`-first helper instead of a bespoke direct SQL insert.
- Centralized evidence-write behavior behind `recordEvidence(...)`, keeping SQL fallback explicit while aligning `runAk(...)` with the configured `SOCIETY_DB` / `AK_DB` target.
- Migrated `ontology_context` and `/ontology` from raw ontology SQL reads to a shared `rocs-cli` adapter that resolves ROCS build/index artifacts against the configured ontology repo.
- Replaced package-local `docs/dev/` usage with `docs/project/` + `docs/adr/` nomenclature and updated package handoff/README links accordingly.
- Clarified monorepo AK task/work-item guidance in AGENTS/README: use the repo-root `ak` wrapper (or `../.ak` from this package) instead of treating a package folder as an independent repo root.
- Updated the package template in parallel so new monorepo package scaffolds inherit the same docs placement and AK-wrapper guidance.
- Moved `/evidence` off raw sqlite reads onto `ak evidence search` and isolated `society_query` behind a dedicated bounded diagnostic-exception helper.
- Gated Level-4 post-integration cleanup packets so cleanup dry-runs require exact peer run ids with valid candidate-peer registry sidecars, executable cleanup/fallback commands require exact peer ids, worktrees, branches, and successful integration closeout, and Level-4 reports surface compact registry-sidecar readiness.
- Made Level-4 cleanup reports explicitly distinguish blocked, dry-run-ready, and execute-ready cleanup posture so destructive cleanup readiness is visible without reading raw tool details.
- Added a Level-4 post-fan-in promotion handoff packet/report section that carries measured-packet fan-in, owner review, finalizer-token request, AK evidence, and post-closeout cleanup sequencing as one visible owner-gated tail.
- Added a post-fan-in finalizer closeout receipt to make `review_blocked`, `committed_cleaned`, and `failed_closed` outcomes auditable across validation, finalizer apply, evidence handoff, and cleanup handoff without executing owner-gated mutations.

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.
