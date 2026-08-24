// summary: "Live pin: extension/custom tools survive restrictive defaultTools configurations (upstream fix shipped in pi 0.84.2)."
// read_when:
//   - "Verifying that operator defaultTools configurations never drop this monorepo's custom tools."
//   - "Changing tool registration in toolbox-discovery, semantic-code-intelligence, session-compaction, context-packer, or autoresearch."
//
// Excluded from the default package gate because it spawns a real one-shot pi
// session against an isolated PI_CODING_AGENT_DIR (requires auth + runtime).
// Run explicitly from the monorepo root:
//   node packages/pi-toolbox-discovery/tests/live/defaulttools-survival.live.mjs
//
// Scope note: this pins OUR contract — custom tools must stay registered and
// active under any defaultTools value (upstream #8022-family fix). Whether the
// host applies defaultTools to built-ins identically in print mode is an
// upstream concern and deliberately not asserted here.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const MONOREPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const PKG = (name) => path.join(MONOREPO, name);

/**
 * One representative custom tool per package under test.
 * `configured` = present in getAllTools() after restrictive defaultTools
 * (the 0.84.2 regression class: custom tools dropped from configuration).
 * Some packages register lazily relative to the first registry refresh, so
 * `active` is asserted only where empirically stable across load modes.
 */
const EXPECTED_CUSTOM_TOOLS = [
  { packageName: "pi-toolbox-discovery", toolName: "toolbox", expectActive: true },
  {
    packageName: "pi-semantic-code-intelligence",
    toolName: "explore_symbol_impact",
    expectActive: true,
  },
  {
    packageName: "pi-session-compaction",
    toolName: "session_compaction_handoff",
    expectActive: false,
  },
  { packageName: "pi-context-packer", toolName: "context_plan", expectActive: true },
  {
    packageName: "pi-autoresearch",
    toolName: "autoresearch_runtime_status",
    expectActive: false,
  },
];

const PROBE_SOURCE = `
export default function (pi) {
  let reported = false;
  const report = () => {
    if (reported || typeof pi.getAllTools !== "function") return;
    reported = true;
    const configured = pi.getAllTools().map((t) => t?.name ?? t?.tool ?? String(t));
    let active = [];
    try { active = pi.getActiveTools(); } catch {}
    console.error("[defaulttools-probe] " + JSON.stringify({ configured, active }));
  };
  pi.on("session_start", () => report());
  pi.on("turn_end", () => report());
}
`;

test("custom tools stay registered and active under restrictive defaultTools", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "defaulttools-pin-"));
  const agentDir = path.join(scratch, "agent");
  try {
    mkdirSync(agentDir, { recursive: true });
    // Restrictive config: empty defaultTools starts with no built-in tools
    // while extension and SDK custom tools must remain enabled (settings.md#tools).
    writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ defaultTools: [] }));
    // Reuse the operator's provider auth so the one-shot session can run.
    copyFileSync(
      path.join(process.env.HOME, ".pi", "agent", "auth.json"),
      path.join(agentDir, "auth.json"),
    );

    const probePath = path.join(scratch, "probe.mjs");
    writeFileSync(probePath, PROBE_SOURCE);

    const entries = [
      PKG("pi-toolbox-discovery/extensions/toolbox.ts"),
      PKG("pi-semantic-code-intelligence/extensions/semantic-code-intelligence.ts"),
      PKG("pi-session-compaction/extensions/session-compaction.js"),
      PKG("pi-context-packer/extensions/context-pack.ts"),
      PKG("pi-autoresearch/extensions/pi-autoresearch.ts"),
    ];

    const result = spawnSync(
      "pi",
      [
        "-p",
        "-ne",
        ...entries.flatMap((entry) => ["-e", entry]),
        "-e",
        probePath,
        "Say exactly: DEFAULTTOOLS-PIN-OK",
      ],
      {
        encoding: "utf8",
        timeout: 180_000,
        env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
      },
    );

    assert.equal(result.status, 0, `one-shot run failed:\n${result.stderr}\n${result.stdout}`);
    const markerLine = (result.stderr ?? "")
      .split("\n")
      .find((line) => line.includes("[defaulttools-probe]"));
    assert.ok(markerLine, "probe did not report tool state");
    const { configured, active } = JSON.parse(
      markerLine.slice(markerLine.indexOf("defaulttools-probe]") + "defaulttools-probe]".length),
    );

    for (const { packageName, toolName, expectActive } of EXPECTED_CUSTOM_TOOLS) {
      assert.ok(
        configured.includes(toolName),
        `${packageName} custom tool '${toolName}' was dropped from configuration under restrictive defaultTools; configured: ${JSON.stringify(configured)}`,
      );
      if (expectActive) {
        assert.ok(
          active.includes(toolName),
          `${packageName} custom tool '${toolName}' expected active; active: ${JSON.stringify(active)}`,
        );
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
