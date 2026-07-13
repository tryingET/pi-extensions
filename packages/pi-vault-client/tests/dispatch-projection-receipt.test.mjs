import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
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
