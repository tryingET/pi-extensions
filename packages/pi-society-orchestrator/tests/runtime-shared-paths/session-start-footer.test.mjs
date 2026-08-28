import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import extension from "../../extensions/society-orchestrator.ts";
import { createContextUsage, createSessionUsageManager, waitForFooterMatch } from "./helpers.mjs";

test("session_start keeps routing in its notice while the footer shows fast and Git state", async () => {
  const events = new Map();
  extension({
    async exec(command, args, options) {
      assert.equal(command, "git");
      assert.deepEqual(args.slice(0, 3), ["status", "--porcelain=v2", "--branch"]);
      assert.equal(options.cwd, process.cwd());
      return {
        stdout: [
          "# branch.head main",
          "# branch.upstream origin/main",
          "# branch.ab +8 -0",
          "1 .M N... 100644 100644 100644 a a a modified.txt",
          "? untracked.txt",
          "",
        ].join("\n"),
        stderr: "",
        code: 0,
        killed: false,
      };
    },
    registerTool() {},
    registerCommand() {},
    on(name, handler) {
      events.set(name, handler);
    },
  });

  const sessionStart = events.get("session_start");
  assert.ok(sessionStart, "expected session_start handler to register");

  const notifications = [];
  let footerFactory;
  await sessionStart(
    {},
    {
      hasUI: true,
      cwd: process.cwd(),
      model: { id: "test-model" },
      sessionManager: createSessionUsageManager(),
      getContextUsage() {
        return createContextUsage();
      },
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
        setFooter(factory) {
          footerFactory = factory;
        },
      },
    },
  );

  assert.equal(notifications.length, 1);
  assert.match(notifications[0].message, /Routing: all agents/);
  assert.match(notifications[0].message, /\/agents-team\s+Select routing scope/);
  assert.match(notifications[0].message, /\/runtime-status\s+Inspect runtime truth/);
  assert.doesNotMatch(notifications[0].message, /Team: full/);
  assert.ok(footerFactory, "expected session_start to register a footer");

  let rerenders = 0;
  const footer = footerFactory(
    {
      requestRender() {
        rerenders += 1;
      },
    },
    {
      fg(_color, text) {
        return text;
      },
    },
    {
      getGitBranch() {
        return "main";
      },
      getExtensionStatuses() {
        return new Map([["better-openai-fast", "🐢"]]);
      },
      onBranchChange() {
        return () => {};
      },
    },
  );
  const rendered = await waitForFooterMatch(footer, 120, /⇡8/);
  assert.match(rendered, /orchestrator→ASC/);
  assert.match(rendered, /ctx 20k/);
  assert.match(rendered, /↑1\.2k ↺500 ↓400/);
  assert.match(rendered, /🐢/);
  assert.match(rendered, /🌱 main 📝🤷⇡8/);
  assert.doesNotMatch(rendered, /Routing:/);
  assert.match(rendered, /DB(?:✓|✗)/);
  assert.match(rendered, /Vault(?:✓|✗)/);
  assert.doesNotMatch(rendered, /· orchestra(?:\s|$)/);
  assert.ok(rerenders >= 1, "expected Git refresh to request a footer rerender");

  const compactRendered = footer.render(40)[0];
  assert.match(compactRendered, /🐢/);
  assert.match(compactRendered, /🌱 main/);
  assert.doesNotMatch(compactRendered, /Routing:/);
  assert.doesNotMatch(compactRendered, /ctx 20k/);
  assert.doesNotMatch(compactRendered, /↑1\.2k/);
  assert.doesNotMatch(compactRendered, /DB(?:✓|✗)/);
  assert.doesNotMatch(compactRendered, /Vault(?:✓|✗)/);

  const narrowRendered = footer.render(20)[0];
  assert.match(narrowRendered, /🐢/);
  assert.match(narrowRendered, /🌱 main/);
  assert.doesNotMatch(narrowRendered, /Routing:/);
  assert.doesNotMatch(narrowRendered, /orchestrator→ASC/);
  assert.doesNotMatch(narrowRendered, /DB(?:✓|✗)/);
  assert.doesNotMatch(narrowRendered, /Vault(?:✓|✗)/);
});

test("session_start footer composes selected lightweight extension statuses when width allows", async () => {
  const events = new Map();
  extension({
    registerTool() {},
    registerCommand() {},
    on(name, handler) {
      events.set(name, handler);
    },
  });

  const sessionStart = events.get("session_start");
  assert.ok(sessionStart, "expected session_start handler to register");

  let footerFactory;
  await sessionStart(
    {},
    {
      hasUI: true,
      cwd: process.cwd(),
      model: { id: "test-model" },
      sessionManager: createSessionUsageManager(),
      getContextUsage() {
        return createContextUsage();
      },
      ui: {
        notify() {},
        setFooter(factory) {
          footerFactory = factory;
        },
      },
    },
  );

  assert.ok(footerFactory, "expected session_start to register a footer");
  const footer = footerFactory(
    undefined,
    {
      fg(_color, text) {
        return text;
      },
    },
    {
      getGitBranch() {
        return "feature/footer";
      },
      getExtensionStatuses() {
        return new Map([
          ["asc-rewind", "◆ 2 rewind points / 2 snapshots"],
          ["society-context", "Society ctx✓"],
          ["stash", "stash: 34"],
          ["better-openai-fast", "🐇"],
          ["unrelated-status", "idle"],
        ]);
      },
      onBranchChange() {
        return () => {};
      },
    },
  );

  const rendered = footer.render(200)[0];
  assert.match(rendered, /rw 2\/2/);
  assert.match(rendered, /Society ctx✓/);
  assert.match(rendered, /stash 34/);
  assert.match(rendered, /🐇/);
  assert.match(rendered, /🌱 feature\/footer/);
  assert.doesNotMatch(rendered, /Routing:/);
  assert.doesNotMatch(rendered, /◆ 2 rewind points/);
  assert.doesNotMatch(rendered, /idle/);

  const compactRendered = footer.render(80)[0];
  assert.match(compactRendered, /🐇/);
  assert.match(compactRendered, /🌱 feature\/footer/);
  assert.doesNotMatch(compactRendered, /Routing:/);
  assert.doesNotMatch(compactRendered, /rw 2\/2/);
  assert.doesNotMatch(compactRendered, /Society ctx✓/);
  assert.doesNotMatch(compactRendered, /stash 34/);
});

test("session_start footer refreshes vault health after startup drift", async () => {
  const previousVaultDir = process.env.VAULT_DIR;
  const previousPiCompany = process.env.PI_COMPANY;
  const previousRefreshMs = process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS;
  const tempVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-footer-health-"));
  execFileSync("dolt", ["init"], { cwd: tempVaultDir, stdio: "ignore" });
  process.env.VAULT_DIR = tempVaultDir;
  process.env.PI_COMPANY = "software";
  process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS = "0";

  try {
    const events = new Map();
    extension({
      registerTool() {},
      registerCommand() {},
      on(name, handler) {
        events.set(name, handler);
      },
    });

    const sessionStart = events.get("session_start");
    assert.ok(sessionStart, "expected session_start handler to register");

    let footerFactory;
    let rerenders = 0;
    await sessionStart(
      {},
      {
        hasUI: true,
        cwd: process.cwd(),
        model: { id: "test-model" },
        ui: {
          notify() {},
          setFooter(factory) {
            footerFactory = factory;
          },
        },
      },
    );

    assert.ok(footerFactory, "expected session_start to register a footer");
    const footer = footerFactory(
      {
        requestRender() {
          rerenders += 1;
        },
      },
      {
        fg(_color, text) {
          return text;
        },
      },
      undefined,
    );

    const initial = footer.render(120)[0];
    assert.match(initial, /Vault✗/);
    await new Promise((resolve) => setTimeout(resolve, 100));

    execFileSync(
      "dolt",
      [
        "sql",
        "-q",
        [
          "create table prompt_templates (",
          "id int primary key,",
          "name varchar(64) not null,",
          "description text,",
          "content text,",
          "artifact_kind varchar(32) not null,",
          "control_mode varchar(32) not null,",
          "formalization_level varchar(32) not null,",
          "owner_company varchar(32) not null,",
          "visibility_companies json not null,",
          "controlled_vocabulary json,",
          "status varchar(16) not null,",
          "export_to_pi boolean not null,",
          "version int not null,",
          "unique key prompt_templates_name (name)",
          ");",
          "insert into prompt_templates values (1, 'inv', 'desc', 'body', 'cognitive', 'one_shot', 'bounded', 'software', '[\"software\"]', NULL, 'active', true, 1);",
        ].join(" "),
      ],
      { cwd: tempVaultDir, stdio: "ignore" },
    );

    const refreshed = await waitForFooterMatch(footer, 120, /Vault✓/);
    assert.match(refreshed, /Vault✓/);
    assert.ok(rerenders >= 1, "expected footer health refresh to request a rerender");
  } finally {
    if (previousVaultDir === undefined) {
      delete process.env.VAULT_DIR;
    } else {
      process.env.VAULT_DIR = previousVaultDir;
    }
    if (previousPiCompany === undefined) {
      delete process.env.PI_COMPANY;
    } else {
      process.env.PI_COMPANY = previousPiCompany;
    }
    if (previousRefreshMs === undefined) {
      delete process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS;
    } else {
      process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS = previousRefreshMs;
    }
    fs.rmSync(tempVaultDir, { recursive: true, force: true });
  }
});

test("session_start footer health retries respect the refresh interval", async () => {
  const previousVaultDir = process.env.VAULT_DIR;
  const previousPiCompany = process.env.PI_COMPANY;
  const previousRefreshMs = process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS;
  const tempVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-footer-throttle-"));
  execFileSync("dolt", ["init"], { cwd: tempVaultDir, stdio: "ignore" });
  process.env.VAULT_DIR = tempVaultDir;
  process.env.PI_COMPANY = "software";
  process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS = "1000";

  try {
    const events = new Map();
    extension({
      registerTool() {},
      registerCommand() {},
      on(name, handler) {
        events.set(name, handler);
      },
    });

    const sessionStart = events.get("session_start");
    assert.ok(sessionStart, "expected session_start handler to register");

    let footerFactory;
    let rerenders = 0;
    await sessionStart(
      {},
      {
        hasUI: true,
        cwd: process.cwd(),
        model: { id: "test-model" },
        ui: {
          notify() {},
          setFooter(factory) {
            footerFactory = factory;
          },
        },
      },
    );

    assert.ok(footerFactory, "expected session_start to register a footer");
    const footer = footerFactory(
      {
        requestRender() {
          rerenders += 1;
        },
      },
      {
        fg(_color, text) {
          return text;
        },
      },
      undefined,
    );

    const initial = footer.render(120)[0];
    assert.match(initial, /Vault✗/);

    execFileSync(
      "dolt",
      [
        "sql",
        "-q",
        [
          "create table prompt_templates (",
          "id int primary key,",
          "name varchar(64) not null,",
          "description text,",
          "content text,",
          "artifact_kind varchar(32) not null,",
          "control_mode varchar(32) not null,",
          "formalization_level varchar(32) not null,",
          "owner_company varchar(32) not null,",
          "visibility_companies json not null,",
          "controlled_vocabulary json,",
          "status varchar(16) not null,",
          "export_to_pi boolean not null,",
          "version int not null,",
          "unique key prompt_templates_name (name)",
          ");",
          "insert into prompt_templates values (1, 'inv', 'desc', 'body', 'cognitive', 'one_shot', 'bounded', 'software', '[\"software\"]', NULL, 'active', true, 1);",
        ].join(" "),
      ],
      { cwd: tempVaultDir, stdio: "ignore" },
    );

    footer.render(120);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stillStale = footer.render(120)[0];
    assert.match(stillStale, /Vault✗/);
    assert.equal(rerenders, 0, "expected footer retries to stay throttled before the interval");
  } finally {
    if (previousVaultDir === undefined) {
      delete process.env.VAULT_DIR;
    } else {
      process.env.VAULT_DIR = previousVaultDir;
    }
    if (previousPiCompany === undefined) {
      delete process.env.PI_COMPANY;
    } else {
      process.env.PI_COMPANY = previousPiCompany;
    }
    if (previousRefreshMs === undefined) {
      delete process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS;
    } else {
      process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS = previousRefreshMs;
    }
    fs.rmSync(tempVaultDir, { recursive: true, force: true });
  }
});
