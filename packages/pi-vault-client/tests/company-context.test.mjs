import assert from "node:assert/strict";
import test from "node:test";
import { withTranspiledModuleHarness } from "./helpers/transpiled-module-harness.mjs";

const COMPANY_CONTEXT_FILES = ["src/companyContext.ts", "src/vaultTypes.ts"];

test("resolveCompanyContext prefers PI_COMPANY over VAULT_CURRENT_COMPANY and cwd", async () => {
  await withTranspiledModuleHarness(
    {
      prefix: "company-context-",
      files: COMPANY_CONTEXT_FILES,
    },
    async ({ importModule }) => {
      const { resolveCompanyContext } = await importModule("src/companyContext.js");
      const result = resolveCompanyContext({
        cwd: "/home/tryinget/ai-society/softwareco/owned/pi-extensions",
        defaultCompany: "core",
        env: {
          PI_COMPANY: "finance",
          VAULT_CURRENT_COMPANY: "software",
        },
      });

      assert.deepEqual(result, {
        company: "finance",
        source: "env:PI_COMPANY",
      });
    },
  );
});

test("resolveCompanyContext falls back to VAULT_CURRENT_COMPANY when PI_COMPANY is absent", async () => {
  await withTranspiledModuleHarness(
    {
      prefix: "company-context-",
      files: COMPANY_CONTEXT_FILES,
    },
    async ({ importModule }) => {
      const { resolveCompanyContext } = await importModule("src/companyContext.js");
      const result = resolveCompanyContext({
        cwd: "/home/tryinget/ai-society/softwareco/owned/pi-extensions",
        defaultCompany: "core",
        env: {
          VAULT_CURRENT_COMPANY: "holding",
        },
      });

      assert.deepEqual(result, {
        company: "holding",
        source: "env:VAULT_CURRENT_COMPANY",
      });
    },
  );
});

test("inferCompanyFromCwd prefers the ai-society anchor and still supports exact segment aliases", async () => {
  await withTranspiledModuleHarness(
    {
      prefix: "company-context-",
      files: COMPANY_CONTEXT_FILES,
    },
    async ({ importModule }) => {
      const { inferCompanyFromCwd, resolveCompanyContext } =
        await importModule("src/companyContext.js");

      assert.equal(
        inferCompanyFromCwd("/tmp/software/other/ai-society/finance/owned/demo"),
        "finance",
      );
      assert.equal(
        inferCompanyFromCwd("/home/tryinget/ai-society/softwareco/owned/pi-extensions"),
        "software",
      );
      assert.equal(
        inferCompanyFromCwd("C:\\Users\\tryinget\\ai-society\\core\\prompt-vault"),
        "core",
      );

      const result = resolveCompanyContext({
        cwd: "/workspace/company/software/project",
        defaultCompany: "core",
        env: {},
      });
      assert.deepEqual(result, {
        company: "software",
        source: "cwd:/workspace/company/software/project",
      });
    },
  );
});

test("resolveCompanyContext avoids substring false positives and falls back cleanly", async () => {
  await withTranspiledModuleHarness(
    {
      prefix: "company-context-",
      files: COMPANY_CONTEXT_FILES,
    },
    async ({ importModule }) => {
      const { inferCompanyFromCwd, resolveCompanyContext } =
        await importModule("src/companyContext.js");

      for (const cwd of [
        "/tmp/notsoftwareco/project",
        "/tmp/softwareco-tools/project",
        "/tmp/housekeeping/project",
      ]) {
        assert.equal(inferCompanyFromCwd(cwd), null);
      }

      const result = resolveCompanyContext({
        cwd: "/tmp/notsoftwareco/project",
        defaultCompany: "core",
        env: {},
      });
      assert.deepEqual(result, {
        company: "core",
        source: "contract-default",
      });
    },
  );
});
