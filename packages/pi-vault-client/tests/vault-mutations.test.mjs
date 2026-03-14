import assert from "node:assert/strict";
import test from "node:test";
import { withTranspiledModuleHarness } from "./helpers/transpiled-module-harness.mjs";

const VAULT_MUTATION_FILES = [
  "src/vaultTypes.ts",
  "src/companyContext.ts",
  "src/templateRenderer.js",
  "src/vaultMutations.ts",
];

function makeContracts() {
  return {
    ontology: {
      facets: {
        artifact_kind: ["cognitive", "procedure", "session"],
        control_mode: ["one_shot", "router", "loop"],
        formalization_level: ["napkin", "bounded", "structured", "workflow"],
      },
    },
    controlledVocabulary: {
      dimensions: {
        routing_context: ["analysis_followup", "review_followup", "review_closeout"],
        activity_phase: ["post_analysis", "post_review", "closeout"],
        input_artifact: ["analysis_output", "review_findings", "review_summary"],
        transition_target_type: ["framework_mode"],
        selection_principles: ["evidence_based", "constraint_preserving", "minimal_change"],
        output_commitment: ["exact_next_prompt"],
      },
      router_required_dimensions: [
        "routing_context",
        "activity_phase",
        "input_artifact",
        "transition_target_type",
        "selection_principles",
        "output_commitment",
      ],
    },
    companyVisibility: {
      companies: ["core", "software", "finance"],
      defaults: {
        owner_company: "core",
        visibility_companies: ["core", "software", "finance"],
      },
    },
  };
}

function makeTemplate(overrides = {}) {
  return {
    id: 7,
    name: "analysis-router",
    description: "Original description",
    content: "Original content",
    artifact_kind: "procedure",
    control_mode: "router",
    formalization_level: "structured",
    owner_company: "core",
    visibility_companies: ["core", "software"],
    controlled_vocabulary: {
      routing_context: "review_followup",
      activity_phase: "post_review",
      input_artifact: "review_findings",
      transition_target_type: "framework_mode",
      selection_principles: ["constraint_preserving"],
      output_commitment: "exact_next_prompt",
    },
    status: "active",
    export_to_pi: true,
    version: 4,
    ...overrides,
  };
}

test("resolveMutationActorContext preserves explicit -> env -> cwd precedence", async () => {
  await withTranspiledModuleHarness(
    {
      prefix: "vault-mutations-",
      files: VAULT_MUTATION_FILES,
    },
    async ({ importModule }) => {
      const { resolveMutationActorContext } = await importModule("src/vaultMutations.js");

      assert.deepEqual(
        resolveMutationActorContext(
          { actorCompany: "software" },
          {
            env: {
              PI_COMPANY: "finance",
              VAULT_CURRENT_COMPANY: "core",
            },
            processCwd: "/tmp/not-a-company/project",
          },
        ),
        {
          status: "ok",
          actorCompany: "software",
          source: "explicit:actorCompany",
        },
      );

      assert.deepEqual(
        resolveMutationActorContext(undefined, {
          env: {
            PI_COMPANY: "finance",
            VAULT_CURRENT_COMPANY: "core",
          },
          processCwd: "/tmp/not-a-company/project",
        }),
        {
          status: "ok",
          actorCompany: "finance",
          source: "env:PI_COMPANY",
        },
      );

      assert.deepEqual(
        resolveMutationActorContext(
          {
            cwd: "/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client",
          },
          { env: {} },
        ),
        {
          status: "ok",
          actorCompany: "software",
          source:
            "cwd:/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client",
        },
      );
    },
  );
});

test("resolveMutationActorContext fails closed when ambient cwd fallback is disabled", async () => {
  await withTranspiledModuleHarness(
    {
      prefix: "vault-mutations-",
      files: VAULT_MUTATION_FILES,
    },
    async ({ importModule }) => {
      const { resolveMutationActorContext } = await importModule("src/vaultMutations.js");

      assert.deepEqual(
        resolveMutationActorContext(
          { allowAmbientCwdFallback: false },
          {
            env: {},
            processCwd: "/tmp/not-a-company/project",
          },
        ),
        {
          status: "error",
          message:
            "Explicit company context is required for vault mutations. Set PI_COMPANY or run from a company-scoped cwd.",
        },
      );
    },
  );
});

test("insertTemplate seam rejects duplicate names before executing SQL", async () => {
  await withTranspiledModuleHarness(
    {
      prefix: "vault-mutations-",
      files: VAULT_MUTATION_FILES,
    },
    async ({ importModule }) => {
      const { insertTemplate } = await importModule("src/vaultMutations.js");
      let executed = false;
      let committed = false;

      const result = insertTemplate(
        "analysis-router",
        "Body",
        "description",
        "procedure",
        "one_shot",
        "structured",
        "core",
        ["core"],
        null,
        { actorCompany: "core" },
        {
          contracts: makeContracts(),
          queryVaultJson() {
            return { rows: [{ id: 7 }] };
          },
          execVault() {
            executed = true;
            return true;
          },
          execVaultWithRowCount() {
            return 1;
          },
          commitVault() {
            committed = true;
          },
          escapeSql(value) {
            return String(value).replace(/'/g, "''");
          },
          getActiveTemplateByName() {
            return null;
          },
        },
      );

      assert.deepEqual(result, {
        status: "error",
        message: "Template already exists: analysis-router. Use vault_update for in-place edits.",
      });
      assert.equal(executed, false);
      assert.equal(committed, false);
    },
  );
});

test("updateTemplate seam applies owner-scoped optimistic locking and reports stale writers", async () => {
  await withTranspiledModuleHarness(
    {
      prefix: "vault-mutations-",
      files: VAULT_MUTATION_FILES,
    },
    async ({ importModule }) => {
      const { updateTemplate } = await importModule("src/vaultMutations.js");
      const committed = [];
      let capturedSql = "";

      const result = updateTemplate(
        "analysis-router",
        { description: "Updated description" },
        { actorCompany: "core" },
        {
          contracts: makeContracts(),
          queryVaultJson() {
            return { rows: [] };
          },
          execVault() {
            return true;
          },
          execVaultWithRowCount(sql) {
            capturedSql = sql;
            return 0;
          },
          commitVault(message, tables) {
            committed.push({ message, tables });
          },
          escapeSql(value) {
            return String(value).replace(/'/g, "''");
          },
          getActiveTemplateByName() {
            return makeTemplate({
              owner_company: "core",
              visibility_companies: ["core", "software"],
              control_mode: "one_shot",
              controlled_vocabulary: null,
              version: 4,
            });
          },
        },
      );

      assert.deepEqual(result, {
        status: "error",
        message:
          "Template 'analysis-router' changed during update. Refresh and retry with the latest version.",
      });
      assert.match(capturedSql, /UPDATE prompt_templates/);
      assert.match(capturedSql, /description = 'Updated description'/);
      assert.match(capturedSql, /AND owner_company = 'core'/);
      assert.match(capturedSql, /AND version = 4/);
      assert.deepEqual(committed, []);
    },
  );
});
