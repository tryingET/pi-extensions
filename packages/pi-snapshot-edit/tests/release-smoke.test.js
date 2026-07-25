import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const smokeScript = readFileSync(new URL("../scripts/release-smoke.sh", import.meta.url), "utf8");

const runPhaseMatch = smokeScript.match(/^run_phase\(\) \{\n([\s\S]*?)^\}$/m);
assert.ok(runPhaseMatch, "release smoke must keep one shared run_phase implementation");
const runPhase = runPhaseMatch[1];
const runPhaseDefinition = runPhaseMatch[0];
const shellQuote = (value) => `'${value.replaceAll("'", `'"'"'`)}'`;
const envInvocationMatch = runPhase.match(/env -i \\\n([\s\S]*?)\n\s+"\$PI_BIN" --offline/);
assert.ok(envInvocationMatch, "release smoke must invoke the resolved Pi binary through env -i");
const envMembrane = envInvocationMatch[1];

test("fresh and restart smokes explicitly load the exact verified installed extension", () => {
  const explicitInstalledExtension =
    '--extension "$INSTALLED_PACKAGE_ROOT/extensions/snapshot-edit.ts"';

  assert.equal(runPhase.split(explicitInstalledExtension).length - 1, 1);
  assert.match(runPhase, /--no-extensions/);
  assert.deepEqual(
    [...smokeScript.matchAll(/^run_phase (fresh|restart)$/gm)].map((match) => match[1]),
    ["fresh", "restart"],
  );
});

test("provider-free phases use one exact Pi binary and a minimal isolated environment", () => {
  assert.equal(smokeScript.match(/^PI_BIN="\$\(command -v pi\)"$/gm)?.length, 1);
  assert.match(smokeScript, /^\[\[ -x "\$PI_BIN" \]\]/m);
  assert.equal(runPhase.match(/"\$PI_BIN" --offline/g)?.length, 1);

  assert.match(smokeScript, /^SMOKE_PATH="\$\(dirname "\$NODE_BIN"\):\/usr\/bin:\/bin"$/m);
  assert.match(
    smokeScript,
    /^SMOKE_HOME="\$PI_CODING_AGENT_DIR\/release-smoke-home"\nSMOKE_TMPDIR="\$PI_CODING_AGENT_DIR\/release-smoke-tmp"\nSMOKE_CACHE_HOME="\$SMOKE_HOME\/\.cache"\nmkdir -p -m 700 "\$SMOKE_HOME" "\$SMOKE_TMPDIR" "\$SMOKE_CACHE_HOME"\nchmod 700 "\$SMOKE_HOME" "\$SMOKE_TMPDIR" "\$SMOKE_CACHE_HOME"$/m,
  );
  assert.deepEqual(
    [...envMembrane.matchAll(/^\s+([A-Za-z_][A-Za-z0-9_]*)=/gm)].map((match) => match[1]),
    [
      "PATH",
      "HOME",
      "TMPDIR",
      "TMP",
      "TEMP",
      "XDG_CACHE_HOME",
      "PI_CODING_AGENT_DIR",
      "NPM_CONFIG_PREFIX",
      "npm_config_prefix",
      "PI_OFFLINE",
      "PI_SNAPSHOT_EDIT_RELEASE_SMOKE",
      "PI_SNAPSHOT_EDIT_RELEASE_SMOKE_PHASE",
    ],
  );
  assert.match(envMembrane, /^\s+PATH="\$SMOKE_PATH"/m);
  assert.match(envMembrane, /^\s+HOME="\$SMOKE_HOME"/m);
  for (const variable of ["TMPDIR", "TMP", "TEMP"]) {
    assert.match(envMembrane, new RegExp(`^\\s+${variable}="\\$SMOKE_TMPDIR"`, "m"));
  }
  assert.match(envMembrane, /^\s+XDG_CACHE_HOME="\$SMOKE_CACHE_HOME"/m);
  assert.match(envMembrane, /^\s+PI_OFFLINE=1/m);
});

test("provider-free smoke cannot add provider, model, API-key, token, or retry fallback", () => {
  assert.match(runPhase, /"\$PI_BIN" --offline --no-session\b/);
  assert.doesNotMatch(runPhase, /(?:^|\s)--(?:provider|model|api-key|token)(?:\s|=)/m);
  assert.doesNotMatch(envMembrane, /(?:API_KEY|TOKEN|PROVIDER|MODEL)=/i);
  assert.match(runPhase, /-p "\/snapshot-edit-release-smoke" <\/dev\/null 2>&1/);
  assert.equal(runPhase.match(/"\$PI_BIN"/g)?.length, 1, "each phase invokes Pi once");
});

test("phase output is printed before nonzero failure and the success check stays fail-closed", () => {
  assert.match(
    runPhase,
    /if output="\$\([\s\S]*?\n {2}\)"; then\n {4}rc=0\n {2}else\n {4}rc=\$\?\n {2}fi/,
  );
  const outputPrint = runPhase.indexOf(`printf '%s\\n' "$output"`);
  const rcFailure = runPhase.indexOf('if [[ "$rc" -ne 0 ]]');
  const successCheck = runPhase.indexOf(
    `grep -q "snapshot-edit packed release smoke \${phase} OK" <<<"$output"`,
  );
  assert.ok(outputPrint >= 0 && outputPrint < rcFailure);
  assert.match(runPhase.slice(rcFailure, successCheck), /return "\$rc"/);
  assert.ok(rcFailure < successCheck);
});

test("inherited stdin is closed while a failing Pi process prints output and returns once", () => {
  const directory = mkdtempSync(join(tmpdir(), "pi-snapshot-edit-release-smoke-test-"));
  try {
    const fakePi = join(directory, "pi");
    const callLog = join(directory, "calls.log");
    const stdinLog = join(directory, "stdin.log");
    const harness = join(directory, "harness.sh");
    writeFileSync(
      fakePi,
      [
        "#!/usr/bin/env bash",
        "printf '%s\\n' 'fake pi failure visible'",
        `printf '%s\\n' call >> ${shellQuote(callLog)}`,
        `cat > ${shellQuote(stdinLog)}`,
        "exit 23",
        "",
      ].join("\n"),
      { mode: 0o700 },
    );
    writeFileSync(
      harness,
      [
        "#!/usr/bin/env bash",
        "set -uo pipefail",
        `PI_BIN=${shellQuote(fakePi)}`,
        'SMOKE_PATH="/usr/bin:/bin"',
        `SMOKE_HOME=${shellQuote(join(directory, "home"))}`,
        `SMOKE_TMPDIR=${shellQuote(join(directory, "tmp"))}`,
        `SMOKE_CACHE_HOME=${shellQuote(join(directory, "home", ".cache"))}`,
        `PI_CODING_AGENT_DIR=${shellQuote(join(directory, "agent"))}`,
        `NPM_CONFIG_PREFIX=${shellQuote(join(directory, "npm"))}`,
        `INSTALLED_PACKAGE_ROOT=${shellQuote(join(directory, "installed"))}`,
        'mkdir -p -m 700 "$SMOKE_HOME" "$SMOKE_TMPDIR" "$SMOKE_CACHE_HOME"',
        runPhaseDefinition,
        "set +e",
        "run_phase fresh",
        "rc=$?",
        `printf 'HARNESS_RC=%s\\n' "$rc"`,
        "exit 0",
        "",
      ].join("\n"),
      { mode: 0o700 },
    );

    const result = spawnSync("/bin/bash", [harness], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin" },
      input: "packages/pi-society-orchestrator\npackages/pi-vault-client\n",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^fake pi failure visible$/m);
    assert.match(result.stdout, /^HARNESS_RC=23$/m);
    assert.match(result.stderr, /failed with exit 23/);
    assert.equal(readFileSync(callLog, "utf8"), "call\n");
    assert.equal(readFileSync(stdinLog, "utf8"), "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
