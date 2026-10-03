import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { linkSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createPackageTempDir } from "./helpers/transpiled-module-harness.mjs";

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

const root = createPackageTempDir("projection-receipt-");
mkdirSync(root, { recursive: true });
process.env.PI_PROMPTS_DIR = root;
const { checkProjectionFreshness } = await import(
  `../src/dispatchPosture.ts?projection=${Date.now()}`
);

const sourceVault = path.join(root, "source-vault");
mkdirSync(sourceVault);
const scopedTemplate = {
  id: 36,
  name: "scoped-napkin",
  content: "current napkin\n\n",
  version: 2,
  status: "active",
  export_to_pi: true,
  artifact_kind: "cognitive",
  control_mode: "one_shot",
  formalization_level: "napkin",
  owner_company: "core",
  visibility_companies: ["core", "software"],
  controlled_vocabulary: null,
};
const scopedFile = path.join(root, "scoped-napkin.md");
const scopedReceipt = path.join(root, ".prompt-vault-scoped-scoped-napkin.json");

function prepareScoped() {
  rmSync(scopedReceipt, { force: true });
  rmSync(scopedFile, { force: true });
  const projected = "current napkin\n";
  writeFileSync(scopedFile, projected);
  const receipt = {
    schema: "prompt-vault/pi-scoped-template-receipt/v1",
    state: "complete",
    policy: "prompt-vault/raw-pi-projection-policy/v1",
    source: { vault_dir: sourceVault, template_id: 36 },
    target: { templates_dir: root },
    template: {
      name: scopedTemplate.name,
      path: "scoped-napkin.md",
      version: 2,
      content_sha256: sha(scopedTemplate.content),
      projected_sha256: sha(projected),
      facets: {
        artifact_kind: "cognitive",
        control_mode: "one_shot",
        formalization_level: "napkin",
        owner_company: "core",
        visibility_companies: ["core", "software"],
        controlled_vocabulary: null,
      },
    },
  };
  writeFileSync(scopedReceipt, JSON.stringify(receipt));
  // Deliberately old, otherwise well-formed global evidence for the same name.
  writeFileSync(
    path.join(root, ".prompt-vault-export-state.json"),
    JSON.stringify({
      schema: "prompt-vault/pi-export-receipt/v2",
      policy: receipt.policy,
      candidate_count: 1,
      exported_count: 1,
      quarantined_count: 0,
      templates: [
        { name: scopedTemplate.name, version: 1, path: "scoped-napkin.md", sha256: sha("old\n") },
      ],
      quarantined: [],
    }),
  );
  return receipt;
}

function inspectScoped(template = scopedTemplate) {
  return checkProjectionFreshness(template, { vaultDir: sourceVault });
}

test("completed exact scoped receipt takes precedence over old global evidence", () => {
  prepareScoped();
  const result = inspectScoped();
  assert.equal(result.status, "fresh");
  assert.equal(result.freshness_scope, "template");
  assert.equal(result.global_freshness, "not_checked");
  rmSync(path.join(root, ".prompt-vault-export-state.json"));
  assert.equal(
    inspectScoped().status,
    "fresh",
    "global inventory is not needed for exact scoped proof",
  );
});

test("scoped freshness rejects pending, malformed and foreign evidence without global fallback", () => {
  for (const mutate of [
    (r) => {
      r.state = "pending";
    },
    (r) => {
      r.schema = "future";
    },
    (r) => {
      r.policy = "future";
    },
    (r) => {
      r.source.vault_dir = "/foreign-vault";
    },
    (r) => {
      r.source.template_id = 37;
    },
    (r) => {
      r.target.templates_dir = path.join(root, "elsewhere");
    },
    (r) => {
      r.template.name = "other";
    },
    (r) => {
      r.template.path = "../escape.md";
    },
  ]) {
    const receipt = prepareScoped();
    mutate(receipt);
    writeFileSync(scopedReceipt, JSON.stringify(receipt));
    assert.equal(inspectScoped().status, "error");
  }
  prepareScoped();
  writeFileSync(scopedReceipt, "{broken");
  assert.equal(inspectScoped().status, "error");
  prepareScoped();
  assert.equal(
    checkProjectionFreshness(scopedTemplate).status,
    "error",
    "source identity must be provided",
  );
});

test("scoped content, version, facets and actual file bytes must match current DB truth", () => {
  for (const mutate of [
    (r) => {
      r.template.version = 1;
    },
    (r) => {
      r.template.content_sha256 = sha("old");
    },
    (r) => {
      r.template.projected_sha256 = sha("old\n");
    },
    (r) => {
      r.template.facets.visibility_companies = ["core"];
    },
    (r) => {
      r.template.facets.formalization_level = "bounded";
    },
    (r) => {
      r.template.facets.controlled_vocabulary = {};
    },
    (r) => {
      r.extra_claim = "not owner-issued";
    },
  ]) {
    const receipt = prepareScoped();
    mutate(receipt);
    writeFileSync(scopedReceipt, JSON.stringify(receipt));
    assert.equal(inspectScoped().status, "stale");
  }
  prepareScoped();
  writeFileSync(scopedFile, scopedTemplate.content);
  assert.equal(inspectScoped().status, "stale", "projection must normalize trailing newlines");
  prepareScoped();
  assert.equal(
    inspectScoped({ ...scopedTemplate, content: "changed", version: 3 }).status,
    "stale",
  );
});

test("scoped evidence cannot bypass loop or workflow dispatch policy", () => {
  for (const changes of [{ control_mode: "loop" }, { formalization_level: "workflow" }]) {
    prepareScoped();
    assert.equal(inspectScoped({ ...scopedTemplate, ...changes }).status, "error");
  }
});

test("scoped evidence and projection files reject symlinks, hardlinks and missing bytes", () => {
  for (const file of [scopedReceipt, scopedFile]) {
    for (const linked of [false, true]) {
      prepareScoped();
      const original = path.join(root, `original-${path.basename(file)}`);
      rmSync(original, { force: true });
      writeFileSync(
        original,
        file === scopedReceipt ? JSON.stringify(prepareScoped()) : "current napkin\n",
      );
      rmSync(file);
      if (linked) linkSync(original, file);
      else symlinkSync(original, file);
      assert.equal(inspectScoped().status, "error");
      rmSync(original);
    }
  }
  prepareScoped();
  rmSync(scopedFile);
  assert.equal(inspectScoped().status, "error");
});

test("client verifies v2 exported and quarantined projection evidence", () => {
  const exportedContent = "safe body";
  const projected = `${exportedContent}\n`;
  writeFileSync(path.join(root, "safe.md"), projected);
  writeFileSync(
    path.join(root, ".prompt-vault-export-state.json"),
    JSON.stringify({
      schema: "prompt-vault/pi-export-receipt/v2",
      policy: "prompt-vault/raw-pi-projection-policy/v1",
      candidate_count: 2,
      exported_count: 1,
      quarantined_count: 1,
      templates: [{ name: "safe", version: 1, path: "safe.md", sha256: sha(projected) }],
      quarantined: [
        {
          name: "ooda",
          version: 2,
          content_sha256: sha("loop body"),
          reason: "unbound",
          facets: {
            artifact_kind: "procedure",
            control_mode: "loop",
            formalization_level: "workflow",
            owner_company: "software",
            visibility_companies: ["software"],
            controlled_vocabulary: null,
          },
        },
      ],
    }),
  );
  const safe = checkProjectionFreshness({
    name: "safe",
    content: exportedContent,
    status: "active",
    export_to_pi: true,
    version: 1,
  });
  assert.equal(safe.status, "fresh");
  const loop = checkProjectionFreshness({
    name: "ooda",
    content: "loop body",
    artifact_kind: "procedure",
    control_mode: "loop",
    formalization_level: "workflow",
    owner_company: "software",
    visibility_companies: ["software"],
    controlled_vocabulary: null,
    status: "active",
    export_to_pi: true,
    version: 2,
  });
  assert.equal(loop.status, "quarantined");
});

test("client fails closed when a quarantined raw file reappears", () => {
  writeFileSync(path.join(root, "ooda.md"), "bypass\n");
  const result = checkProjectionFreshness({
    name: "ooda",
    content: "loop body",
    artifact_kind: "procedure",
    control_mode: "loop",
    formalization_level: "workflow",
    owner_company: "software",
    visibility_companies: ["software"],
    controlled_vocabulary: null,
    status: "active",
    export_to_pi: true,
    version: 2,
  });
  assert.equal(result.status, "stale");
});

test("client recognizes exact unknown and malformed quarantine receipts without unsafe paths", () => {
  const candidates = [
    {
      name: "unsafe-router",
      version: 1,
      content: "router body",
      artifact_kind: "procedure",
      control_mode: "router",
      formalization_level: "structured",
      owner_company: "software",
      visibility_companies: ["software"],
      controlled_vocabulary: { output_commitment: "future_value" },
      reason: "unknown",
    },
    {
      name: "../../escape",
      version: 1,
      content: "malformed body",
      artifact_kind: "procedure",
      control_mode: "one_shot",
      formalization_level: "structured",
      owner_company: "software",
      visibility_companies: ["software"],
      controlled_vocabulary: null,
      reason: "malformed",
    },
  ];
  for (const candidate of candidates) {
    const facets = {
      artifact_kind: candidate.artifact_kind,
      control_mode: candidate.control_mode,
      formalization_level: candidate.formalization_level,
      owner_company: candidate.owner_company,
      visibility_companies: candidate.visibility_companies,
      controlled_vocabulary: candidate.controlled_vocabulary,
    };
    writeFileSync(
      path.join(root, ".prompt-vault-export-state.json"),
      JSON.stringify({
        schema: "prompt-vault/pi-export-receipt/v2",
        policy: "prompt-vault/raw-pi-projection-policy/v1",
        candidate_count: 1,
        exported_count: 0,
        quarantined_count: 1,
        templates: [],
        quarantined: [
          {
            name: candidate.name,
            version: candidate.version,
            content_sha256: sha(candidate.content),
            reason: candidate.reason,
            facets,
          },
        ],
      }),
    );
    const result = checkProjectionFreshness({
      ...candidate,
      status: "active",
      export_to_pi: true,
    });
    assert.equal(result.status, "quarantined");
    if (candidate.reason === "malformed") assert.equal(result.local_file_path, null);
  }
});
