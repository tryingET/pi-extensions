import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative as relativePath } from "node:path";
import test from "node:test";
import {
  deleteMode,
  loadModes,
  MODE_PROMPT_MAX_BYTES,
  modeDefinitionFingerprint,
  type ResolvedMode,
  saveMode,
} from "../src/mode-definitions.ts";
import { projectApprovalDigest, projectConfirmationBody } from "../src/project-mode-approvals.ts";
import { harness, harnessOptions, project } from "./project-mode-harness.ts";

// A mode's prompt may live in <key>.md beside <key>.json (agreed with james-tindal on #223): the
// file replaces an inline systemPrompt, is read safely, and is part of what the operator confirms.

const definition = (key: string, strategy = "append", extra: Record<string, unknown> = {}) =>
  JSON.stringify({ schemaVersion: 2, key, label: key, promptStrategy: strategy, ...extra });

function modesIn(dir: string) {
  const loaded = loadModes({
    globalDir: join(dir, "none"),
    projectDirs: [dir],
    projectTrusted: true,
  });
  const find = (key: string): ResolvedMode | undefined =>
    loaded.modes.find((mode) => mode.key === key);
  const problem = (key: string) =>
    loaded.diagnostics.find((item) => item.path.endsWith(`${key}.json`))?.message;
  return { find, problem };
}

function scratch(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(join(tmpdir(), "pi-modes-md-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("the prompt in <key>.md is used, stripped of a BOM and trimmed like an inline prompt", (t) => {
  const dir = scratch(t);
  writeFileSync(join(dir, "notes.json"), definition("notes"));
  writeFileSync(join(dir, "notes.md"), "\uFEFF\n  Keep notes short.\n\n");
  writeFileSync(join(dir, "exact.json"), definition("exact", "replace_final"));
  writeFileSync(join(dir, "exact.md"), "\uFEFFExactly this.\n");
  const { find } = modesIn(dir);
  assert.equal(find("notes")?.systemPrompt, "Keep notes short.");
  assert.equal(find("notes")?.promptPath, join(dir, "notes.md"));
  assert.equal(
    find("exact")?.systemPrompt,
    "Exactly this.\n",
    "replace_final keeps its text exactly",
  );
});

test("a prompt in both places, an empty file, or a v1 definition with a file is refused", (t) => {
  const dir = scratch(t);
  writeFileSync(join(dir, "both.json"), definition("both", "append", { systemPrompt: "Inline." }));
  writeFileSync(join(dir, "both.md"), "From the file.");
  writeFileSync(join(dir, "blank.json"), definition("blank"));
  writeFileSync(join(dir, "blank.md"), " \n\t\n");
  writeFileSync(
    join(dir, "old.json"),
    JSON.stringify({ key: "old", label: "old", systemPrompt: "v1" }),
  );
  writeFileSync(join(dir, "old.md"), "Also here.");
  writeFileSync(join(dir, "missing.json"), definition("missing"));
  const { find, problem } = modesIn(dir);
  for (const key of ["both", "blank", "old", "missing"]) assert.equal(find(key), undefined, key);
  assert.match(problem("both") ?? "", /systemPrompt is set and both\.md exists/);
  assert.match(problem("blank") ?? "", /blank\.md is empty/);
  assert.match(problem("old") ?? "", /needs schemaVersion 2/);
  assert.match(problem("missing") ?? "", /systemPrompt is required, inline or in missing\.md/);
});

test("a prompt file that is a link, FIFO, directory or too large is refused before it is read", (t) => {
  const dir = scratch(t);
  const outside = join(dir, "..", `outside-${Date.now()}.md`);
  writeFileSync(outside, "Secret from elsewhere.");
  t.after(() => rmSync(outside, { force: true }));
  for (const key of ["linked", "fifo", "folder", "huge"])
    writeFileSync(join(dir, `${key}.json`), definition(key));
  symlinkSync(outside, join(dir, "linked.md"));
  assert.equal(spawnSync("mkfifo", [join(dir, "fifo.md")]).status, 0);
  mkdirSync(join(dir, "folder.md"));
  writeFileSync(join(dir, "huge.md"), "x".repeat(MODE_PROMPT_MAX_BYTES + 1));
  // In a child with a timeout: a regression that blocks on opening the FIFO fails, not hangs.
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { loadModes } from ${JSON.stringify(join(process.cwd(), "src", "mode-definitions.ts"))}; loadModes({ globalDir: "/nonexistent", projectDirs: [${JSON.stringify(dir)}], projectTrusted: true });`,
    ],
    { timeout: 10_000, encoding: "utf8" },
  );
  assert.equal(child.signal, null, "loading did not block on the FIFO");
  assert.equal(child.status, 0, child.stderr);
  const { find, problem } = modesIn(dir);
  for (const key of ["linked", "fifo", "folder", "huge"]) assert.equal(find(key), undefined, key);
  assert.match(problem("linked") ?? "", /must not be a symbolic link/);
  assert.match(problem("fifo") ?? "", /must be a regular file/);
  assert.match(problem("folder") ?? "", /must be a regular file/);
  assert.match(problem("huge") ?? "", /exceeds/);
});

test("moving an identical prompt into <key>.md is not a change; editing the file is", (t) => {
  const dir = scratch(t);
  writeFileSync(
    join(dir, "same.json"),
    definition("same", "append", { systemPrompt: "Same text." }),
  );
  const inline = modesIn(dir).find("same");
  writeFileSync(join(dir, "same.json"), definition("same"));
  writeFileSync(join(dir, "same.md"), "Same text.\n");
  const moved = modesIn(dir).find("same");
  assert.ok(inline && moved);
  assert.equal(modeDefinitionFingerprint(moved).digest, modeDefinitionFingerprint(inline).digest);
  assert.equal(
    projectApprovalDigest({ ...moved, scope: "project" }),
    projectApprovalDigest({ ...inline, scope: "project" }),
  );
  writeFileSync(join(dir, "same.md"), "Different text.\n");
  const edited = modesIn(dir).find("same");
  assert.ok(edited);
  assert.notEqual(
    modeDefinitionFingerprint(edited).digest,
    modeDefinitionFingerprint(moved).digest,
  );
  assert.match(projectConfirmationBody([{ ...edited, scope: "project" }]), /prompt in .*same\.md/);
});

test("saving writes the prompt back to <key>.md, keeps the JSON schema-valid, and delete removes both", (t) => {
  const dir = scratch(t);
  writeFileSync(join(dir, "kept.json"), definition("kept"));
  writeFileSync(join(dir, "kept.md"), "Old prompt.\n");
  const loaded = modesIn(dir).find("kept");
  assert.ok(loaded);
  const { scope: _scope, path: _path, promptPath, ...fields } = loaded;
  // Without knowing the prompt came from kept.md (as /mode-new does not), nothing is overwritten.
  assert.throws(
    () => saveMode(dir, { ...fields, systemPrompt: "Placeholder." }),
    /kept\.md already holds this mode's prompt/,
  );
  assert.equal(readFileSync(join(dir, "kept.md"), "utf8"), "Old prompt.\n");
  saveMode(dir, { ...fields, systemPrompt: "New prompt." }, { promptFrom: promptPath });
  const json = JSON.parse(readFileSync(join(dir, "kept.json"), "utf8")) as Record<string, unknown>;
  assert.equal("systemPrompt" in json, false, "never added to the JSON beside a prompt file");
  assert.equal(readFileSync(join(dir, "kept.md"), "utf8"), "New prompt.\n");
  const schema = JSON.parse(
    readFileSync(join(process.cwd(), "schemas", "mode.schema.json"), "utf8"),
  );
  for (const field of schema.required as string[]) assert.ok(field in json, `missing ${field}`);
  for (const field of Object.keys(json))
    assert.ok(field in schema.properties, `unexpected ${field}`);
  assert.equal(modesIn(dir).find("kept")?.systemPrompt, "New prompt.");

  saveMode(dir, {
    schemaVersion: 2,
    key: "fresh",
    label: "fresh",
    promptStrategy: "append",
    systemPrompt: "Inline.",
  });
  assert.equal(existsSync(join(dir, "fresh.md")), false, "a new mode keeps its prompt inline");
  deleteMode(join(dir, "kept.json"), dir, { promptFrom: join(dir, "kept.md") });
  assert.equal(existsSync(join(dir, "kept.md")), false);
  // A <key>.md the prompt did not come from (here a directory) is left alone.
  writeFileSync(
    join(dir, "other.json"),
    definition("other", "append", { systemPrompt: "Inline." }),
  );
  mkdirSync(join(dir, "other.md"));
  deleteMode(join(dir, "other.json"), dir);
  assert.equal(existsSync(join(dir, "other.md")), true);
});

test("the linter checks <key>.md the way the loader reads it", (t) => {
  const dir = scratch(t);
  writeFileSync(join(dir, "good.json"), definition("good"));
  writeFileSync(join(dir, "good.md"), "A prompt.");
  writeFileSync(join(dir, "both.json"), definition("both", "append", { systemPrompt: "Inline." }));
  writeFileSync(join(dir, "both.md"), "File.");
  const lint = (file: string) =>
    spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts", "mode-lint.mjs"), join(dir, file)],
      {
        encoding: "utf8",
      },
    );
  const good = lint("good.json");
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /prompt in good\.md/);
  const both = lint("both.json");
  assert.equal(both.status, 1);
  assert.match(both.stderr, /systemPrompt is set and both\.md exists/);
});

test(
  "an edited <key>.md needs confirming again, and /mode-edit saves the prompt back to it",
  harnessOptions,
  async () => {
    const p = project({ "local.json": definition("local") });
    try {
      p.write("local.md", "Local rules from the file.");
      const h = harness(p.cwd, {
        mode: "tui",
        answers: [true, true],
        edit: (text) => {
          const edited = JSON.parse(text) as Record<string, unknown>;
          assert.equal(
            edited.systemPrompt,
            "Rules changed in the file.",
            "the editor shows the prompt",
          );
          return JSON.stringify({ ...edited, systemPrompt: "Rules edited in Pi." });
        },
      });
      await h.command("mode")("+local");
      assert.match(await h.turnPrompt(), /Local rules from the file\./);
      p.write("local.md", "Rules changed in the file.");
      await h.command("mode-reapprove")("");
      assert.match(
        h.dialogs.at(-1)?.body ?? "",
        /Rules changed in the file\./,
        "asked about the new text",
      );
      assert.match(await h.turnPrompt(), /Rules changed in the file\./);

      await h.command("mode-edit")("local");
      const dir = join(p.cwd, ".pi", "modes");
      assert.equal(readFileSync(join(dir, "local.md"), "utf8"), "Rules edited in Pi.\n");
      const json = JSON.parse(readFileSync(join(dir, "local.json"), "utf8"));
      assert.equal("systemPrompt" in json, false, "the prompt stays in the file");
    } finally {
      p.restore();
    }
  },
);

test("a prompt of the largest size and a replace_final prompt starting with a BOM survive a save", (t) => {
  const dir = scratch(t);
  const largest = "x".repeat(MODE_PROMPT_MAX_BYTES);
  const exact = "\uFEFFExact prompt.";
  writeFileSync(join(dir, "big.json"), definition("big"));
  writeFileSync(join(dir, "big.md"), "placeholder");
  writeFileSync(join(dir, "final.json"), definition("final", "replace_final"));
  writeFileSync(join(dir, "final.md"), "placeholder");
  for (const [key, prompt] of [
    ["big", largest],
    ["final", exact],
  ] as const) {
    const loaded = modesIn(dir).find(key);
    assert.ok(loaded);
    const { scope: _scope, path: _path, promptPath, ...fields } = loaded;
    saveMode(dir, { ...fields, systemPrompt: prompt }, { promptFrom: promptPath });
    assert.equal(modesIn(dir).find(key)?.systemPrompt, prompt, `${key} reloads unchanged`);
  }
});

test("a file whose name is not its key is reported as such, before any prompt file is read", (t) => {
  const dir = scratch(t);
  writeFileSync(join(dir, "a.json"), definition("b"));
  writeFileSync(join(dir, "a.md"), "");
  assert.match(modesIn(dir).problem("a") ?? "", /filename must be b\.json/);
});

test(
  "an edited <key>.md is not used before it is confirmed, and /mode-delete names it",
  harnessOptions,
  async () => {
    const p = project({ "local.json": definition("local") });
    try {
      p.write("local.md", "Local rules from the file.");
      const h = harness(p.cwd, { mode: "tui", answers: [true, false] });
      await h.command("mode")("+local");
      p.write("local.md", "Rules changed in the file.");
      assert.doesNotMatch(await h.turnPrompt(), /Rules changed in the file\./);
      await h.command("mode-delete")("local");
      assert.match(h.dialogs.at(-1)?.body ?? "", /local\.md \(its prompt\) is deleted too/);
    } finally {
      p.restore();
    }
  },
);

test("a relative mode directory, a bad key and the linter all behave like the loader", (t) => {
  const dir = scratch(t);
  writeFileSync(join(dir, "rel.json"), definition("rel"));
  writeFileSync(join(dir, "rel.md"), "Relative.");
  const relative = relativePath(process.cwd(), dir);
  const loaded = loadModes({
    globalDir: relative,
    projectDirs: [],
    projectTrusted: false,
  }).modes.find((mode) => mode.key === "rel");
  assert.ok(loaded?.promptPath);
  const { scope: _scope, path: _path, promptPath, ...fields } = loaded;
  saveMode(relative, { ...fields, systemPrompt: "Saved." }, { promptFrom: promptPath });
  assert.equal(readFileSync(join(dir, "rel.md"), "utf8"), "Saved.\n");

  writeFileSync(join(dir, "nothing.json"), "null");
  writeFileSync(
    join(dir, "badkey.json"),
    JSON.stringify({
      schemaVersion: 2,
      key: "Bad Key!",
      label: "x",
      promptStrategy: "append",
      systemPrompt: "x",
    }),
  );
  writeFileSync(join(dir, "a.json"), definition("b"));
  writeFileSync(join(dir, "a.md"), "");
  const { problem } = modesIn(dir);
  assert.match(problem("nothing") ?? "", /must be a JSON object/);
  assert.match(problem("badkey") ?? "", /key must/);
  assert.match(problem("a") ?? "", /filename must be b\.json/);
  const lint = spawnSync(
    process.execPath,
    [join(process.cwd(), "scripts", "mode-lint.mjs"), join(dir, "a.json")],
    {
      encoding: "utf8",
    },
  );
  assert.match(
    lint.stderr,
    /filename must be b\.json/,
    "the linter reports what the loader reports",
  );
});

test("a prompt of the largest size saved by an editor with BOM and CRLF still loads", (t) => {
  const dir = scratch(t);
  writeFileSync(join(dir, "crlf.json"), definition("crlf"));
  writeFileSync(join(dir, "crlf.md"), `\uFEFF\r\n${"y".repeat(MODE_PROMPT_MAX_BYTES)}\r\n\r\n`);
  assert.equal(modesIn(dir).find("crlf")?.systemPrompt.length, MODE_PROMPT_MAX_BYTES);
});

test(
  "/mode-new builds the JSON around an existing <key>.md instead of overwriting it",
  harnessOptions,
  async () => {
    const p = project({});
    try {
      p.write("hand.md", "Hand-written prompt.");
      const h = harness(p.cwd, {
        mode: "tui",
        edit: (text) => {
          assert.equal(
            "systemPrompt" in JSON.parse(text),
            false,
            "the template leaves the prompt to the file",
          );
          return text;
        },
      });
      await h.command("mode-new")("--project hand");
      const dir = join(p.cwd, ".pi", "modes");
      assert.equal(readFileSync(join(dir, "hand.md"), "utf8"), "Hand-written prompt.\n");
      assert.equal(
        "systemPrompt" in JSON.parse(readFileSync(join(dir, "hand.json"), "utf8")),
        false,
      );
      assert.equal(p.mode("hand").systemPrompt, "Hand-written prompt.");
    } finally {
      p.restore();
    }
  },
);

test("/mode-edit names the file that holds hidden characters", harnessOptions, async () => {
  const p = project({ "loud.json": definition("loud") });
  try {
    p.write("loud.md", "Quiet\u202e text.");
    const h = harness(p.cwd, { mode: "tui" });
    await h.command("mode-edit")("loud");
    const message = h.notifications.at(-1) ?? "";
    assert.match(message, /edit .*loud\.md in an editor/);
    assert.doesNotMatch(message, /loud\.json/);
  } finally {
    p.restore();
  }
});
