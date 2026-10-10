# Offline production dependency fixture

`ipaddr.js-2.2.0.tgz` is the unmodified npm registry artifact from
<https://registry.npmjs.org/ipaddr.js/-/ipaddr.js-2.2.0.tgz> (MIT license, retained
inside the archive). Registry artifact size: 15149 bytes. SHA-512 SRI:

```text
sha512-Ag3wB2o37wslZS19hZqorUnrnzSkpOVy+IiiDEiTqNubEYpYuHWIf6K4psgN2ZWKExS4xhVCrRVfb/wfW8fWJA==
```

The test consumer selects this exact tarball locally; the packed extension stays
unmodified. Installation uses `--offline`, an empty per-run npm cache, isolated
npmrc/home and an unreachable registry. Authentic host loading, extraction,
commands and duplicate-host warnings remain tested. Fixtures do not ship in the
published package.

`production-fixture.ts` verifies archive bytes against the authored lock and
manifest, and the artifact test also verifies the installed version/integrity.
A production dependency change must update the fixture and these assertions.
Tests reject corrupt/truncated bytes and stale version/integrity/dependency pins.
There is no time-based expiry: invalidation is content- and contract-bound.

For an owner-authorized dependency update, download the exact registry artifact,
verify its integrity against the new lock, and explicitly stage this one fixture
(`git add -f tests/fixtures/ipaddr.js-<version>.tgz` because `*.tgz` is otherwise
ignored). Do not seed a shared cache, repack installed source as registry proof,
or remove offline/integrity assertions to make tests pass.
