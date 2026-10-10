// summary: proves the trusted TypeScript prompt compiler is byte-identical to the ratified L0 v2 fixture.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  compileFleetSystemPrompt,
  FLEET_COMPILED_PROMPT_PATH,
  FLEET_PERSONA_DIR,
  FLEET_PERSONA_FILES,
} from "../src/fleet-prompt-compiler.ts";
import { expandTildePath } from "../src/registry.ts";

import {
  assertContractPaths,
  assertFixtureReceipt,
  assertLiveContract,
  COMPILED_PATH,
  COMPILED_SHA256,
  FIXTURE_SHA256,
  KNOWN_METADATA_PREFIX,
  METADATA_COMPILED_SHA256,
  RATIFIED_FIXTURE_COMMIT,
  readContractFiles,
  SOURCE_FIXTURE_PATH,
  sha256,
  vendoredFixture,
} from "./fleet-prompt-fixture.mjs";

const templateRepo = join(expandTildePath("~/ai-society"), "core", "tpl-template-repo");
// AK5982: only the manifest and entire persona directory; unrelated resyncs are allowed.
const CONTRACT_PATHS = ["agent.json", FLEET_PERSONA_DIR].map(
  (path) => `${SOURCE_FIXTURE_PATH}/${path}`,
);
const compile = (files) =>
  compileFleetSystemPrompt({
    manifestBytes: files.get("agent.json"),
    readFile: async (path) => files.get(path),
  });

// This proof never reads the external checkout, and must never skip.
test("offline compiler matches all receipted ratified fixture bytes", async () => {
  const pinned = readContractFiles(vendoredFixture);
  assert.equal(Object.keys(FIXTURE_SHA256).length, 9);
  for (const path of [
    "agent.json",
    FLEET_COMPILED_PROMPT_PATH,
    ...FLEET_PERSONA_FILES.map((name) => `${FLEET_PERSONA_DIR}/${name}`),
  ]) {
    assert.ok(Object.hasOwn(FIXTURE_SHA256, path), `contract path not pinned: ${path}`);
  }
  assertFixtureReceipt(pinned);
  const compiled = await compile(pinned);
  assert.deepEqual(compiled.expected, pinned.get(COMPILED_PATH));
  assert.equal(compiled.expectedSha256, COMPILED_SHA256);
  assert.match(compiled.inputSha256, /^[0-9a-f]{64}$/u);
  assert.equal(
    sha256(Buffer.concat([Buffer.from(KNOWN_METADATA_PREFIX), compiled.expected])),
    METADATA_COMPILED_SHA256,
  );
});

// Default live alarm remains distinct from the always-run offline proof.
// Source files are data, not executables; a mode change remains a contract drift.
test("contract file executable-bit drift is refused", () => {
  const root = mkdtempSync(join(tmpdir(), "ratified-mode-control-"));
  try {
    cpSync(vendoredFixture, root, { recursive: true });
    renameSync(join(root, "agent.json.fixture"), join(root, "agent.json"));
    chmodSync(join(root, "agent.json"), 0o755);
    assert.throws(() => readContractFiles(root), /contract file became executable/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("live L0 contract retains the ratified inputs and only the exact known metadata prefix", (t) => {
  if (!existsSync(templateRepo)) {
    t.skip("external L0 checkout is unavailable (offline compiler proof still runs)");
    return;
  }
  const git = (...args) =>
    execFileSync("git", ["-C", templateRepo, ...args], {
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
  const pathsAt = (ref) =>
    git("ls-tree", "-r", "--name-only", ref, "--", ...CONTRACT_PATHS)
      .trim()
      .split("\n")
      .map((path) => {
        assert.ok(path.startsWith(`${SOURCE_FIXTURE_PATH}/`), `unexpected source path: ${path}`);
        return path.slice(SOURCE_FIXTURE_PATH.length + 1);
      });
  assertLiveContract(
    readContractFiles(join(templateRepo, SOURCE_FIXTURE_PATH)),
    readContractFiles(vendoredFixture),
    {
      lastManifestCommit: git("log", "-1", "--format=%H", "--", CONTRACT_PATHS[0]).trim(),
      pinnedPaths: pathsAt(RATIFIED_FIXTURE_COMMIT),
      trackedPaths: pathsAt("HEAD"),
      status: git("status", "--porcelain", "--untracked-files=all", "--", ...CONTRACT_PATHS),
    },
  );
});

function cleanObservation() {
  return {
    lastManifestCommit: RATIFIED_FIXTURE_COMMIT,
    status: "",
    pinnedPaths: Object.keys(FIXTURE_SHA256),
    trackedPaths: Object.keys(FIXTURE_SHA256),
  };
}

test("live alarm accepts only pinned bytes or the exact receipted seven-line prefix", () => {
  const pinned = readContractFiles(vendoredFixture);
  assertLiveContract(pinned, pinned, cleanObservation());
  const withMetadata = new Map(pinned);
  withMetadata.set(
    COMPILED_PATH,
    Buffer.concat([Buffer.from(KNOWN_METADATA_PREFIX), pinned.get(COMPILED_PATH)]),
  );
  assertLiveContract(withMetadata, pinned, cleanObservation());
});

for (const [name, mutate] of [
  [
    "arbitrary frontmatter",
    (files) =>
      files.set(
        COMPILED_PATH,
        Buffer.concat([Buffer.from("---\nsummary: arbitrary\n---\n\n"), files.get(COMPILED_PATH)]),
      ),
  ],
  [
    "changed known frontmatter",
    (files) =>
      files.set(
        COMPILED_PATH,
        Buffer.concat([
          Buffer.from(KNOWN_METADATA_PREFIX.replace("type: reference", "type: other")),
          files.get(COMPILED_PATH),
        ]),
      ),
  ],
  [
    "extra blank after prefix",
    (files) =>
      files.set(
        COMPILED_PATH,
        Buffer.concat([Buffer.from(`${KNOWN_METADATA_PREFIX}\n`), files.get(COMPILED_PATH)]),
      ),
  ],
  [
    "duplicate prefix",
    (files) =>
      files.set(
        COMPILED_PATH,
        Buffer.concat([Buffer.from(KNOWN_METADATA_PREFIX.repeat(2)), files.get(COMPILED_PATH)]),
      ),
  ],
  [
    "body drift behind allowed prefix",
    (files) =>
      files.set(
        COMPILED_PATH,
        Buffer.concat([
          Buffer.from(KNOWN_METADATA_PREFIX),
          files.get(COMPILED_PATH),
          Buffer.from("drift\n"),
        ]),
      ),
  ],
  [
    "body drift without prefix",
    (files) =>
      files.set(COMPILED_PATH, Buffer.concat([files.get(COMPILED_PATH), Buffer.from("drift\n")])),
  ],
  [
    "manifest input drift",
    (files) => files.set("agent.json", Buffer.concat([files.get("agent.json"), Buffer.from("\n")])),
  ],
  [
    "persona input frontmatter",
    (files) =>
      files.set(
        "docs/person/identity.md",
        Buffer.concat([Buffer.from(KNOWN_METADATA_PREFIX), files.get("docs/person/identity.md")]),
      ),
  ],
  ["noncompiler contract drift", (files) => files.set("docs/person/.gitkeep", Buffer.alloc(0))],
]) {
  test(`live alarm rejects ${name}`, () => {
    const pinned = readContractFiles(vendoredFixture);
    const files = new Map(pinned);
    mutate(files);
    assert.throws(() => assertLiveContract(files, pinned, cleanObservation()), /live bytes drift/);
  });
}

for (const path of Object.keys(FIXTURE_SHA256)) {
  test(`offline receipt rejects missing or tampered ${path}`, () => {
    const files = readContractFiles(vendoredFixture);
    files.delete(path);
    assert.throws(() => assertFixtureReceipt(files), /contract file-set drift/);
    files.set(path, Buffer.from("tampered\n"));
    assert.throws(() => assertFixtureReceipt(files), /fixture SHA256 mismatch/);
  });
}

test("file-set and Git observations fail closed, including clean-looking byte exceptions", () => {
  const pinned = readContractFiles(vendoredFixture);
  const files = new Map(pinned);
  files.set("docs/person/arbitrary-extra.md", Buffer.from("extra\n"));
  assert.throws(() => assertFixtureReceipt(files), /contract file-set drift/);
  assert.throws(
    () => assertLiveContract(files, pinned, cleanObservation()),
    /contract file-set drift/,
  );
  files.delete("docs/person/arbitrary-extra.md");
  files.delete("docs/person/.gitkeep");
  assert.throws(
    () => assertLiveContract(files, pinned, cleanObservation()),
    /contract file-set drift/,
  );
  assert.throws(() => assertContractPaths([]), /contract file-set drift/);
  for (const key of ["pinnedPaths", "trackedPaths"]) {
    for (const paths of [[], [...Object.keys(FIXTURE_SHA256), "docs/person/extra.md"]]) {
      assert.throws(
        () => assertLiveContract(pinned, pinned, { ...cleanObservation(), [key]: paths }),
        /contract file-set drift/,
      );
    }
  }
  assert.throws(
    () =>
      assertLiveContract(pinned, pinned, {
        ...cleanObservation(),
        lastManifestCommit: "1f141661cdbf55e58ef8fc4244c974b679a3d6fe",
      }),
    /manifest commit drift/,
  );
  const allowedBytes = new Map(pinned);
  allowedBytes.set(
    COMPILED_PATH,
    Buffer.concat([Buffer.from(KNOWN_METADATA_PREFIX), pinned.get(COMPILED_PATH)]),
  );
  for (const status of [
    " M docs/person/system-prompt.md\n",
    "M  agent.json\n",
    "?? docs/person/extra.md\n",
  ]) {
    assert.throws(
      () => assertLiveContract(allowedBytes, pinned, { ...cleanObservation(), status }),
      /uncommitted drift/,
    );
  }
});

test("compiler input mutations are not hidden by the live metadata exception", async () => {
  const pinned = readContractFiles(vendoredFixture);
  const original = await compile(pinned);
  for (const path of original.inputPaths) {
    const changed = new Map(pinned);
    changed.set(
      path,
      path === "agent.json"
        ? Buffer.from(JSON.stringify({ ...JSON.parse(pinned.get(path)), role: "negative control" }))
        : Buffer.concat([pinned.get(path), Buffer.from("negative control\n")]),
    );
    const compiled = await compile(changed);
    assert.notDeepEqual(compiled.expected, original.expected, path);
    assert.notEqual(compiled.inputSha256, original.inputSha256, path);
    assert.throws(() => assertFixtureReceipt(changed), /fixture SHA256 mismatch/);
  }
});

test("compiler uses Python code-point key order, normalizes universal newlines, and rejects numeric ambiguity", async () => {
  const readFile = async () => Buffer.from("persona\r\n", "utf8");
  const compiled = await compileFleetSystemPrompt({
    manifestBytes: Buffer.from(
      JSON.stringify({
        schema: "ai-society.agent/1",
        Z: true,
        _: true,
        a: true,
        ä: true,
      }),
    ),
    readFile,
  });
  const text = compiled.expected.toString("utf8");
  assert.ok(text.indexOf('"Z"') < text.indexOf('"_"'));
  assert.ok(text.indexOf('"_"') < text.indexOf('"a"'));
  assert.ok(text.indexOf('"a"') < text.indexOf('"ä"'));
  assert.doesNotMatch(text, /\r/u);

  await assert.rejects(
    compileFleetSystemPrompt({
      manifestBytes: Buffer.from('{"schema":"ai-society.agent/1","additive":1.0}'),
      readFile,
    }),
    /numeric additive manifest value cannot be proven byte-identical/,
  );
});

test("manifest BOM and unpaired surrogates fail closed while persona BOM remains content", async () => {
  const personaWithBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("persona\n")]);
  const compiled = await compileFleetSystemPrompt({
    manifestBytes: Buffer.from('{"schema":"ai-society.agent/1"}'),
    readFile: async () => personaWithBom,
  });
  assert.match(compiled.expected.toString("utf8"), /\ufeffpersona/u);

  await assert.rejects(
    compileFleetSystemPrompt({
      manifestBytes: Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from('{"schema":"ai-society.agent/1"}'),
      ]),
      readFile: async () => Buffer.from("persona\n"),
    }),
    /agent.json is not valid JSON/,
  );
  await assert.rejects(
    compileFleetSystemPrompt({
      manifestBytes: Buffer.from('{"schema":"ai-society.agent/1","role":"\\ud800"}'),
      readFile: async () => Buffer.from("persona\n"),
    }),
    /unpaired surrogate cannot be encoded/,
  );
});
