import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertAgentVentPathSmokeOutput,
  assertExactHostContract,
  assertInstalledArtifactPackage,
  assertLocalTarballInstallSource,
  assertPackageSpecInstalled,
  buildLocalPathArtifactSettings,
  executeInstalledArtifactToolPathSmoke,
  packageSourcesFromSettings,
} from "../scripts/release-smoke-check.mjs";

test("release smoke release-age bypass is gated by one exact host contract", () => {
  const packageJson = {
    devDependencies: {
      "@earendil-works/pi-ai": "0.80.6",
      "@earendil-works/pi-coding-agent": "0.80.6",
    },
  };
  assert.equal(assertExactHostContract({ packageJson, hostVersion: "0.80.6" }), "0.80.6");
  assert.throws(
    () => assertExactHostContract({ packageJson, hostVersion: "^0.80.6" }),
    /requires an exact Pi host version/,
  );
  assert.throws(
    () => assertExactHostContract({ packageJson, hostVersion: "0.80.7" }),
    /host contract mismatch/,
  );
});

test("release smoke settings check accepts only unfiltered string package entries", () => {
  const settings = {
    packages: [
      "npm:/tmp/pkg-a.tgz",
      { source: "npm:/tmp/pi-agent-vent.tgz", extensions: ["extensions/agent-vent.ts"] },
      { source: 42 },
      null,
    ],
  };

  assert.deepEqual(packageSourcesFromSettings(settings), [
    "npm:/tmp/pkg-a.tgz",
    "npm:/tmp/pi-agent-vent.tgz",
  ]);
  assert.doesNotThrow(() =>
    assertPackageSpecInstalled({ settings, packageSpec: "npm:/tmp/pkg-a.tgz" }),
  );
  assert.throws(
    () => assertPackageSpecInstalled({ settings, packageSpec: "npm:/tmp/pi-agent-vent.tgz" }),
    /requires an unfiltered package entry/,
  );
});

test("release smoke settings check fails closed when package spec is missing", () => {
  assert.throws(
    () => assertPackageSpecInstalled({ settings: { packages: [] }, packageSpec: "" }),
    /PACKAGE_SPEC is required/,
  );
  assert.throws(
    () =>
      assertPackageSpecInstalled({
        settings: { packages: ["npm:/tmp/other.tgz"] },
        packageSpec: "npm:/tmp/pi-agent-vent.tgz",
      }),
    /Installed package spec not found/,
  );
});

test("release smoke validates local npm tarball specs as install sources only", () => {
  assert.deepEqual(assertLocalTarballInstallSource({ packageSpec: "npm:/tmp/pi-agent-vent.tgz" }), {
    tarballPath: "/tmp/pi-agent-vent.tgz",
  });

  assert.throws(
    () => assertLocalTarballInstallSource({ packageSpec: "" }),
    /PACKAGE_SPEC is required/,
  );
  assert.throws(
    () => assertLocalTarballInstallSource({ packageSpec: "/tmp/pi-agent-vent.tgz" }),
    /expected an npm: tarball install source/,
  );
  assert.throws(
    () => assertLocalTarballInstallSource({ packageSpec: "npm:../pi-agent-vent.tgz" }),
    /expected npm:<absolute \.tgz path>/,
  );
  assert.throws(
    () => assertLocalTarballInstallSource({ packageSpec: "npm:/tmp/pi-agent-vent.zip" }),
    /expected npm:<absolute \.tgz path>/,
  );
});

test("release smoke installed artifact check verifies package identity and extension entrypoint", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-installed-artifact-"));
  try {
    fs.mkdirSync(path.join(dir, "extensions"));
    fs.writeFileSync(
      path.join(dir, "extensions", "agent-vent.ts"),
      "export default function() {}\n",
    );
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "@tryinget/pi-agent-vent",
        version: "0.1.0",
        pi: { extensions: ["./extensions/agent-vent.ts"] },
      }),
    );

    assert.deepEqual(
      assertInstalledArtifactPackage({
        packageRoot: dir,
        packageName: "@tryinget/pi-agent-vent",
        packageVersion: "0.1.0",
      }),
      {
        packageJsonPath: path.join(dir, "package.json"),
        extensionPath: path.join(dir, "extensions", "agent-vent.ts"),
      },
    );

    assert.throws(
      () =>
        assertInstalledArtifactPackage({
          packageRoot: dir,
          packageName: "@tryinget/pi-agent-vent",
          packageVersion: "0.2.0",
        }),
      /Installed package version mismatch/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("release smoke can rewrite isolated settings to load installed artifact through local-path package discovery", () => {
  assert.deepEqual(
    buildLocalPathArtifactSettings({
      settings: {
        defaultProvider: "openai",
        defaultModel: "gpt-4o",
        packages: ["npm:/tmp/pi-agent-vent.tgz"],
        extensions: ["/tmp/escape.ts"],
      },
      packageRoot: "/tmp/isolated-prefix/lib/node_modules/@tryinget/pi-agent-vent",
    }),
    {
      defaultProvider: "openai",
      defaultModel: "gpt-4o",
      packages: ["/tmp/isolated-prefix/lib/node_modules/@tryinget/pi-agent-vent"],
      extensions: [],
    },
  );
});

test("release smoke command output check accepts isolated agent vent path output", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-smoke-ok-"));
  try {
    const output = [
      `Agent vent store: ${dir}/vents.jsonl`,
      `Agent vent review events: ${dir}/review-events.jsonl`,
      `Agent vent curation events: ${dir}/curation-events.jsonl`,
      `Agent vent retention events: ${dir}/retention-events.jsonl`,
      `Agent vent retention backups: ${dir}/backups`,
      "Schema: append-only JSONL events plus confirmation-gated local retention backup artifacts.",
      "Override: set PI_AGENT_VENT_DIR to use a different private directory.",
      "Authority boundary: records, review states, and curation projections are local diagnostics, not tasks, issues, incidents, evidence, telemetry, or ASC/self state; retention receipts and backups are local diagnostics too.",
    ].join("\n");

    assert.doesNotThrow(() => assertAgentVentPathSmokeOutput({ output, ventDir: dir }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("release smoke installed shadow registered-tool path stays isolated and does not read active stores", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-tool-smoke-"));
  try {
    const unsafeTarget = path.join(dir, "unsafe-target.jsonl");
    fs.writeFileSync(unsafeTarget, "", "utf8");
    fs.symlinkSync(unsafeTarget, path.join(dir, "vents.jsonl"));

    const result = await executeInstalledArtifactToolPathSmoke({
      packageRoot: process.cwd(),
      ventDir: dir,
    });

    assert.equal(result.executionMode, "shadow-copy");
    assert.match(result.output, /Agent vent store:/);
    assert.match(result.output, /not tasks, issues, incidents, evidence/);
    assert.equal(fs.lstatSync(path.join(dir, "vents.jsonl")).isSymbolicLink(), true);
    assert.equal(fs.existsSync(path.join(dir, "review-events.jsonl")), false);
    assert.equal(fs.existsSync(path.join(dir, "curation-events.jsonl")), false);
    assert.equal(fs.existsSync(path.join(dir, "retention-events.jsonl")), false);
    assert.equal(fs.existsSync(path.join(dir, "backups")), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("release smoke installed shadow registered-tool path fails closed when tool is not registered", async () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-no-tool-"));
  const ventDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-no-tool-store-"));
  try {
    fs.mkdirSync(path.join(packageRoot, "extensions"));
    fs.writeFileSync(
      path.join(packageRoot, "extensions", "agent-vent.ts"),
      "export default function(pi) { pi.registerCommand('agent_vent', { handler() {} }); }\n",
    );

    await assert.rejects(
      () => executeInstalledArtifactToolPathSmoke({ packageRoot, ventDir }),
      /did not register executable agent_vent tool/,
    );
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
    fs.rmSync(ventDir, { recursive: true, force: true });
  }
});

test("release smoke command output check fails closed for wrong store, missing boundary, or default store", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-smoke-bad-"));
  try {
    assert.throws(
      () =>
        assertAgentVentPathSmokeOutput({
          output: "Agent vent store: /tmp/other/vents.jsonl",
          ventDir: dir,
        }),
      /did not match the expected local diagnostic contract/,
    );

    const defaultStoreOutput = [
      `Agent vent store: ${dir}/vents.jsonl`,
      `Agent vent review events: ${dir}/review-events.jsonl`,
      `Agent vent curation events: ${dir}/curation-events.jsonl`,
      `Agent vent retention events: ${dir}/retention-events.jsonl`,
      `Agent vent retention backups: ${dir}/backups`,
      "Override: set PI_AGENT_VENT_DIR to use a different private directory.",
      "Authority boundary: records, review states, and curation projections are local diagnostics, not tasks, issues, incidents, evidence, telemetry, or ASC/self state; retention receipts and backups are local diagnostics too.",
      "accidental /.pi/agent/agent-vent/vents.jsonl leak",
    ].join("\n");

    assert.throws(
      () => assertAgentVentPathSmokeOutput({ output: defaultStoreOutput, ventDir: dir }),
      /default operator vent store/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
