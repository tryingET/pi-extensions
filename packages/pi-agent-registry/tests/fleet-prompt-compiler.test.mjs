// summary: proves the trusted TypeScript prompt compiler is byte-identical to the ratified L0 v2 fixture.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  compileFleetSystemPrompt,
  FLEET_COMPILED_PROMPT_PATH,
  FLEET_PERSONA_DIR,
  FLEET_PERSONA_FILES,
} from "../src/fleet-prompt-compiler.ts";
import { expandTildePath } from "../src/registry.ts";

const templateRepo = join(expandTildePath("~/ai-society"), "core", "tpl-template-repo");
const fixture = join(templateRepo, "fixtures", "l2", "tpl-agent-repo");
const RATIFIED_FIXTURE_COMMIT = "3eba942c0df2726fd5f4e0e138d5007cc356f4ab";
// Only the compiler contract is pinned: the manifest plus the persona directory, which
// holds every persona input and the compiled system-prompt.md. Template resyncs of other
// fixture files (scripts, README, ignore files) must not fail this gate (AK task 5982).
const CONTRACT_PATHS = ["agent.json", FLEET_PERSONA_DIR].map((path) =>
  join("fixtures", "l2", "tpl-agent-repo", path),
);

test("trusted compiler matches the exact ratified tpl-agent-repo v2 fixture bytes", async (t) => {
  if (!existsSync(join(fixture, "agent.json"))) {
    t.skip("ratified L0 fixture is unavailable");
    return;
  }
  const lastFixtureCommit = execFileSync(
    "git",
    ["-C", templateRepo, "log", "-1", "--format=%H", "--", "fixtures/l2/tpl-agent-repo/agent.json"],
    { encoding: "utf8" },
  ).trim();
  assert.equal(lastFixtureCommit, RATIFIED_FIXTURE_COMMIT);
  // A pathspec that matches nothing would let the diff below pass vacuously.
  const pinnedFiles = execFileSync(
    "git",
    [
      "-C",
      templateRepo,
      "ls-tree",
      "-r",
      "--name-only",
      RATIFIED_FIXTURE_COMMIT,
      "--",
      ...CONTRACT_PATHS,
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n");
  for (const path of [
    "agent.json",
    FLEET_COMPILED_PROMPT_PATH,
    ...FLEET_PERSONA_FILES.map((name) => `${FLEET_PERSONA_DIR}/${name}`),
  ]) {
    assert.ok(
      pinnedFiles.includes(`fixtures/l2/tpl-agent-repo/${path}`),
      `contract path not pinned: ${path}`,
    );
  }
  execFileSync("git", [
    "-C",
    templateRepo,
    "diff",
    "--quiet",
    RATIFIED_FIXTURE_COMMIT,
    "--",
    ...CONTRACT_PATHS,
  ]);
  const changed = execFileSync(
    "git",
    ["-C", templateRepo, "status", "--porcelain", "--", ...CONTRACT_PATHS],
    { encoding: "utf8" },
  );
  assert.equal(changed, "", "ratified fixture bytes have uncommitted drift");

  const compiled = await compileFleetSystemPrompt({
    manifestBytes: readFileSync(join(fixture, "agent.json")),
    readFile: async (path) => {
      try {
        return readFileSync(join(fixture, path));
      } catch {
        return undefined;
      }
    },
  });
  assert.deepEqual(compiled.expected, readFileSync(join(fixture, "docs/person/system-prompt.md")));
  assert.match(compiled.inputSha256, /^[0-9a-f]{64}$/u);
  assert.match(compiled.expectedSha256, /^[0-9a-f]{64}$/u);
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
