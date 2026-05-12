import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const packageRoot = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(packageRoot, relativePath), "utf8");
}

const files = {
  readme: read("README.md"),
  adr: read("docs/adr/2026-03-11-control-plane-boundaries.md"),
  boundaryMap: read("docs/project/subagent-execution-boundary-map.md"),
  subagent: read("src/runtime/subagent.ts"),
};

const routeFixtures = [
  {
    label: "coordination/control-plane routing",
    checks: [
      ["README.md", files.readme, "## Fresh-context route adjudication"],
      [
        "README.md",
        files.readme,
        "`pi-society-orchestrator` — loops, routing selection, `/runtime-status`, `/evidence`, exact supervision flows",
      ],
      [
        "docs/project/subagent-execution-boundary-map.md",
        files.boundaryMap,
        "| loops, routing selection, `/runtime-status`, `/evidence`, or exact supervision flows that compose lower-plane owners | `pi-society-orchestrator` | coordination/control-plane owner |",
      ],
      [
        "docs/adr/2026-03-11-control-plane-boundaries.md",
        files.adr,
        "Start in `pi-society-orchestrator` only for the latter:",
      ],
    ],
  },
  {
    label: "execution-plane routing",
    checks: [
      [
        "README.md",
        files.readme,
        "`pi-autonomous-session-control` — subagent runtime behavior, prompt-envelope application, session artifacts, dashboard/inspection surfaces, and execution-plane invariants",
      ],
      [
        "docs/project/subagent-execution-boundary-map.md",
        files.boundaryMap,
        "| subagent runtime behavior, prompt-envelope application, session artifacts, or execution invariants | `pi-autonomous-session-control` | execution-plane owner |",
      ],
      [
        "docs/adr/2026-03-11-control-plane-boundaries.md",
        files.adr,
        "- ASC for execution-plane runtime behavior and subagent lifecycle semantics",
      ],
    ],
  },
  {
    label: "prompt-plane routing",
    checks: [
      [
        "README.md",
        files.readme,
        "`pi-vault-client` — Prompt Vault query/retrieve/mutate/rate flows, schema diagnostics, and prompt-plane governance",
      ],
      [
        "docs/project/subagent-execution-boundary-map.md",
        files.boundaryMap,
        "| Prompt Vault retrieval, schema/governance, or prompt-plane preparation | `pi-vault-client` | prompt-plane owner |",
      ],
      [
        "docs/adr/2026-03-11-control-plane-boundaries.md",
        files.adr,
        "- `pi-vault-client` for prompt-plane retrieval, governance, and schema truth",
      ],
    ],
  },
  {
    label: "ontology and society owner routing",
    checks: [
      [
        "README.md",
        files.readme,
        "`pi-ontology-workflows` / `rocs-cli` — ontology inspection/change/context questions",
      ],
      [
        "README.md",
        files.readme,
        "`ak` — canonical society-state authority for tasks, evidence, decisions, and repo registration truth",
      ],
      [
        "docs/project/subagent-execution-boundary-map.md",
        files.boundaryMap,
        "| ontology inspect/change/context questions | `pi-ontology-workflows` / `rocs-cli` | ontology workflow owner |",
      ],
      [
        "docs/project/subagent-execution-boundary-map.md",
        files.boundaryMap,
        "| task/evidence/decision DB truth | `ak` | canonical society-state owner |",
      ],
    ],
  },
];

test("discoverability route fixtures document overloaded owner cues consistently", () => {
  for (const fixture of routeFixtures) {
    for (const [fileName, content, needle] of fixture.checks) {
      assert.equal(
        content.includes(needle),
        true,
        `${fixture.label} should be documented in ${fileName}`,
      );
    }
  }

  assert.equal(
    files.adr.includes(
      "This adjudication rule is discoverability guidance only; it does not create a second owner layer above those packages.",
    ),
    true,
  );
  assert.equal(
    files.boundaryMap.includes(
      "This map is for adjudication, not for flattening ownership. If the lower-plane owner is already clear, go there directly; return here only when the coordination between owners is the real problem.",
    ),
    true,
  );
});

test("subagent consumer route stays bound to the ASC public execution seam", () => {
  assert.match(files.subagent, /from "@tryinget\/pi-autonomous-session-control\/execution"/);
  assert.match(files.subagent, /createAscExecutionRuntime\s*\(/);
  assert.equal(files.subagent.includes("extensions/self"), false);
});
