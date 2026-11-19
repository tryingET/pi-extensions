import assert from "node:assert/strict";
import test from "node:test";
import { withTranspiledModuleHarness } from "./helpers/transpiled-module-harness.mjs";

const COMPANY_CONTEXT_FILES = [
  "src/companyContext.ts",
  "src/companyRegister.ts",
  "src/vaultTypes.ts",
  "src/generatedPromptVaultContract.ts",
];

test("resolveCompanyContext ignores PI_COMPANY; VAULT_CURRENT_COMPANY beats cwd", async () => {
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
        company: "software",
        source: "env:VAULT_CURRENT_COMPANY",
      });
      const onlyPi = resolveCompanyContext({
        cwd: "/home/tryinget/.config/espanso",
        defaultCompany: "core",
        env: { PI_COMPANY: "holding" },
      });
      assert.equal(onlyPi.source, "contract-default");
    },
  );
});

test("register names, aliases, no company, retired and unknown names", async () => {
  await withTranspiledModuleHarness(
    { prefix: "company-context-", files: COMPANY_CONTEXT_FILES },
    async ({ importModule }) => {
      const { resolveCompanyContext, inferCompanyFromCwd } =
        await importModule("src/companyContext.js");
      const { internalCompany, storedNamesFor, visibilitySql, isContextCompany } =
        await importModule("src/companyRegister.js");
      const env = (value) =>
        resolveCompanyContext({ cwd: "/tmp", env: { VAULT_CURRENT_COMPANY: value } });
      assert.equal(env("softwareco").company, "software");
      assert.equal(env("familyco").company, "familyco");
      assert.equal(env("none").company, "none");
      assert.equal(env("house").company, "house");
      assert.equal(internalCompany("house"), null);
      assert.equal(internalCompany("houseco"), null);
      assert.equal(internalCompany("tradingco"), "tradingco");
      assert.equal(isContextCompany("none"), false);
      assert.equal(isContextCompany("familyco"), true);
      assert.equal(inferCompanyFromCwd("/home/x/ai-society/familyco/owned/haus"), "familyco");
      assert.equal(inferCompanyFromCwd("/home/x/ai-society/houseco/owned/haus"), null);
      assert.equal(inferCompanyFromCwd("/home/x/ai-society/notacompany/owned/x"), null);
      assert.deepEqual(storedNamesFor("software").sort(), ["software", "softwareco"]);
      const none = visibilitySql("none", "v", "o");
      // no company: core rows for all, or rows naming every register company; never a single name
      assert.match(none, /^\(\(o = 'core' AND JSON_CONTAINS\(v, /);
      assert.doesNotMatch(none, /\) OR JSON_SEARCH/);
      const family = visibilitySql("familyco", "v", "o");
      assert.match(family, /JSON_SEARCH\(v, 'one', 'familyco'\)/);
      assert.match(family, /o = 'core'/);
      const { rowVisibleTo } = await importModule("src/companyRegister.js");
      const all = ["core", "software", "finance", "house", "health", "teaching", "holding"];
      assert.equal(rowVisibleTo("core", all, "none"), true);
      assert.equal(rowVisibleTo("core", all, "familyco"), true);
      assert.equal(rowVisibleTo("software", all, "familyco"), false);
      assert.equal(rowVisibleTo("software", all, "none"), false);
      assert.equal(rowVisibleTo("software", all, "teaching"), true);
      assert.equal(rowVisibleTo("core", ["core", "holding"], "holdingco"), true);
      assert.equal(rowVisibleTo("core", ["core", "holding"], "none"), false);
    },
  );
});

test("a row that names every register company reaches everyone, no company included", async () => {
  await withTranspiledModuleHarness(
    { prefix: "company-context-", files: COMPANY_CONTEXT_FILES },
    async ({ importModule }) => {
      const { rowVisibleTo, visibilitySql } = await importModule("src/companyRegister.js");
      // Given a software-owned method widened by naming all eight companies, old spellings allowed
      const widened = [
        "core",
        "software",
        "finance",
        "health",
        "teaching",
        "holding",
        "familyco",
        "tradingco",
      ];
      // Then every company and no company may read it
      for (const company of ["none", "familyco", "tradingco", "softwareco", "core"]) {
        assert.equal(rowVisibleTo("software", widened, company), true, company);
      }
      // Given one company short, or the retired house standing in for familyco
      const short = widened.filter((name) => name !== "tradingco");
      const withHouse = [...short.filter((name) => name !== "familyco"), "house", "tradingco"];
      // Then no company and the missing company may not read it
      assert.equal(rowVisibleTo("software", short, "none"), false);
      assert.equal(rowVisibleTo("software", short, "tradingco"), false);
      assert.equal(rowVisibleTo("software", withHouse, "none"), false);
      assert.equal(rowVisibleTo("software", withHouse, "familyco"), false);
      // And the SQL twin carries the same rule for no company
      const none = visibilitySql("none", "v", "o");
      assert.match(none, /tradingco/);
      assert.match(none, /familyco/);
    },
  );
});

test("resolveCompanyContext reads VAULT_CURRENT_COMPANY when it is the only setting", async () => {
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

test("inferCompanyFromCwd prefers the ai-society anchor and supports company lane aliases", async () => {
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
        inferCompanyFromCwd("/home/tryinget/ai-society/holdingco/projects/governance-kernel"),
        "holding",
      );
      assert.equal(
        inferCompanyFromCwd("/home/tryinget/ai-society/financeco/projects/ledger"),
        "finance",
      );
      assert.equal(
        inferCompanyFromCwd("C:\\Users\\tryinget\\ai-society\\core\\prompt-vault"),
        "core",
      );

      const result = resolveCompanyContext({
        cwd: "/home/tryinget/ai-society/softwareco/owned/pi-extensions",
        defaultCompany: "core",
        env: {},
      });
      assert.deepEqual(result, {
        company: "software",
        source: "cwd:/home/tryinget/ai-society/softwareco/owned/pi-extensions",
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
        "/tmp/random/softwareco/project",
        "/var/data/financeco/cache",
        "/home/user/misc/holdingco/demo",
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
      assert.equal(inferCompanyFromCwd("/home/tryinget/ai-society/houseco/projects/x"), null);
    },
  );
});
