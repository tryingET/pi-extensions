// summary: proves Fleet template-ownership parsing matches the ratified L0 owner implementation.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  parseFleetCopierSource,
  parseFleetTemplateOwnership,
  validateFleetTemplateOwnershipPolicy,
} from "../src/fleet-lint-provenance.ts";
import { expandTildePath } from "../src/registry.ts";

const templateRepo = join(expandTildePath("~/ai-society"), "core", "tpl-template-repo");
const ownerRelative = "copier-template/copier/tpl-agent-repo/scripts/lib/propagate_template.py";
const ownerScript = join(templateRepo, ownerRelative);
const RATIFIED_OWNER_COMMIT = "3eba942c0df2726fd5f4e0e138d5007cc356f4ab";

const valid = `schema: ai-society.template-ownership/1
template_owned:
  - scripts/**
agent_owned:
  - agent.json
`;

const vectors = [
  { name: "minimal valid map", text: valid, accepted: true },
  {
    name: "comments, repeated sections, and universal newlines",
    text: "# header\u2028schema: ai-society.template-ownership/1\r\ntemplate_owned:\n  - scripts/**\ntemplate_owned:\n  - policy/**\nagent_owned:\n  - agent.json\n",
    accepted: true,
  },
  {
    name: "owner-limited wildcard intersection remains accepted",
    text: "schema: ai-society.template-ownership/1\ntemplate_owned:\n  - a/*\nagent_owned:\n  - a/x\n",
    accepted: true,
  },
  {
    name: "duplicate pattern",
    text: "schema: ai-society.template-ownership/1\ntemplate_owned:\n  - a\n  - a\nagent_owned:\n  - b\n",
    accepted: false,
  },
  {
    name: "literal overlap",
    text: "schema: ai-society.template-ownership/1\ntemplate_owned:\n  - a\nagent_owned:\n  - a\n",
    accepted: false,
  },
  {
    name: "subtree overlap",
    text: "schema: ai-society.template-ownership/1\ntemplate_owned:\n  - docs///**\nagent_owned:\n  - docs/person/**\n",
    accepted: false,
  },
  {
    name: "unsupported syntax",
    text: `${valid}other: value\n`,
    accepted: false,
  },
  {
    name: "malformed indentation",
    text: "schema: ai-society.template-ownership/1\ntemplate_owned:\n - scripts/**\nagent_owned:\n  - agent.json\n",
    accepted: false,
  },
  {
    name: "absolute pattern",
    text: "schema: ai-society.template-ownership/1\ntemplate_owned:\n  - /absolute\nagent_owned:\n  - agent.json\n",
    accepted: false,
  },
  {
    name: "parent traversal pattern",
    text: "schema: ai-society.template-ownership/1\ntemplate_owned:\n  - a/../b\nagent_owned:\n  - agent.json\n",
    accepted: false,
  },
  {
    name: "empty section",
    text: "schema: ai-society.template-ownership/1\ntemplate_owned:\nagent_owned:\n  - agent.json\n",
    accepted: false,
  },
  {
    name: "UTF-8 BOM is content, not a stripped marker",
    text: `\ufeff${valid}`,
    accepted: false,
  },
  {
    name: "U+FEFF is not Python whitespace",
    text: `${valid}\ufeff\n`,
    accepted: false,
  },
  {
    name: "U+001F is Python whitespace",
    text: `${valid}\u001f\n`,
    accepted: true,
  },
  {
    name: "U+FEFF remains part of an ownership pattern",
    text: "schema: ai-society.template-ownership/1\ntemplate_owned:\n  - a\ufeff\nagent_owned:\n  - a\n",
    accepted: true,
  },
  {
    name: "U+001F is stripped from an ownership pattern",
    text: "schema: ai-society.template-ownership/1\ntemplate_owned:\n  - a\u001f\nagent_owned:\n  - a\n",
    accepted: false,
  },
];

const answersVectors = [
  { name: "plain scalar", text: "_src_path: source/path\n", value: "source/path" },
  { name: "double-quoted scalar", text: '_src_path: "source path"\n', value: "source path" },
  { name: "single-quoted scalar", text: "_src_path: 'source''s path'\n", value: "source's path" },
  { name: "missing source", text: "_commit: abc\n", value: null },
  { name: "duplicate source", text: "_src_path: one\n_src_path: two\n", value: null },
  { name: "BOM-prefixed key", text: "\ufeff_src_path: source\n", value: null },
  { name: "inline comment", text: "_src_path: source # comment\n", value: null },
  { name: "unsupported YAML tag", text: "_src_path: !env source\n", value: null },
  { name: "U+FEFF after quote", text: "_src_path: 'source'\ufeff\n", value: null },
  { name: "U+001F after plain scalar", text: "_src_path: source\u001f\n", value: "source" },
];

function parseTypeScriptSource(text) {
  try {
    return parseFleetCopierSource(text);
  } catch {
    return null;
  }
}

function parseTypeScriptOwnership(text) {
  try {
    const parsed = parseFleetTemplateOwnership(text);
    return { template: parsed.templateOwned, agent: parsed.agentOwned };
  } catch {
    return null;
  }
}

test("ownership adversarial matrix has the expected ratified semantics", () => {
  for (const vector of vectors) {
    assert.equal(parseTypeScriptOwnership(vector.text) !== null, vector.accepted, vector.name);
  }
});

test("Copier source scalar matrix has the expected ratified semantics", () => {
  for (const vector of answersVectors) {
    assert.equal(parseTypeScriptSource(vector.text), vector.value, vector.name);
  }
});

test("Fleet ownership policy requires every agent-owned manifest and persona path", () => {
  const required = [".copier-answers.yml", "agent.json", "docs/person/**"];
  for (const omitted of required) {
    assert.throws(() =>
      validateFleetTemplateOwnershipPolicy({
        templateOwned: ["scripts/**"],
        agentOwned: required.filter((entry) => entry !== omitted),
      }),
    );
  }
  assert.doesNotThrow(() =>
    validateFleetTemplateOwnershipPolicy({
      templateOwned: ["scripts/**"],
      agentOwned: required,
    }),
  );
});

test("ownership adversarial matrix matches the exact ratified Python owner", (t) => {
  if (!existsSync(ownerScript)) {
    t.skip("ratified template owner parser is unavailable");
    return;
  }
  const lastOwnerCommit = execFileSync(
    "git",
    ["-C", templateRepo, "log", "-1", "--format=%H", "--", ownerRelative],
    { encoding: "utf8" },
  ).trim();
  assert.equal(lastOwnerCommit, RATIFIED_OWNER_COMMIT);
  execFileSync("git", [
    "-C",
    templateRepo,
    "diff",
    "--quiet",
    RATIFIED_OWNER_COMMIT,
    "--",
    ownerRelative,
  ]);

  const python = `
import importlib.util
import json
import pathlib
import sys
import tempfile

spec = importlib.util.spec_from_file_location("fleet_owner", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
results = []
for text in json.load(sys.stdin):
    with tempfile.TemporaryDirectory() as raw_root:
        root = pathlib.Path(raw_root)
        path = root / "contracts" / "template-ownership.yml"
        path.parent.mkdir(parents=True)
        with path.open("w", encoding="utf-8", newline="") as handle:
            handle.write(text)
        try:
            results.append(module.load_map(root))
        except (OSError, ValueError):
            results.append(None)
print(json.dumps(results))
`;
  const ownerResults = JSON.parse(
    execFileSync("python3", ["-c", python, ownerScript], {
      encoding: "utf8",
      input: JSON.stringify(vectors.map((entry) => entry.text)),
    }),
  );
  assert.deepEqual(
    vectors.map((entry) => parseTypeScriptOwnership(entry.text)),
    ownerResults,
  );
});

test("Copier source scalar matrix matches the exact ratified Python owner", (t) => {
  if (!existsSync(ownerScript)) {
    t.skip("ratified template owner parser is unavailable");
    return;
  }
  const python = `
import importlib.util
import json
import pathlib
import sys
import tempfile

spec = importlib.util.spec_from_file_location("fleet_owner", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
results = []
for text in json.load(sys.stdin):
    with tempfile.TemporaryDirectory() as raw_root:
        path = pathlib.Path(raw_root) / ".copier-answers.yml"
        with path.open("w", encoding="utf-8", newline="") as handle:
            handle.write(text)
        try:
            results.append(module.source_from_answers(path))
        except (OSError, ValueError):
            results.append(None)
print(json.dumps(results))
`;
  const ownerResults = JSON.parse(
    execFileSync("python3", ["-c", python, ownerScript], {
      encoding: "utf8",
      input: JSON.stringify(answersVectors.map((entry) => entry.text)),
    }),
  );
  assert.deepEqual(
    answersVectors.map((entry) => parseTypeScriptSource(entry.text)),
    ownerResults,
  );
});
