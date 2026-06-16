import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { buildDashboardLines } from "../extensions/self/subagent-dashboard.ts";
import { writeStatus } from "./subagent-dashboard-data-harness.mjs";

test("buildDashboardLines never exceeds the requested width", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-width-"));
  const theme = {
    fg(_name, value) {
      return value;
    },
  };

  try {
    const recentDoneAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const recentTimeoutAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    await writeStatus(
      sessionsDir,
      "reviewer-2",
      "done",
      recentDoneAt,
      "Reply with exactly DIRECT_OK_GHOSTTY_SUBAGENT_ETEST_2 after inspecting the session.",
      {
        parentSessionKey: "f50f147a-7a83-4d5e-8123-123456789abc",
      },
    );
    await writeStatus(
      sessionsDir,
      "task-662-scope",
      "timeout",
      recentTimeoutAt,
      "Inspect AK task #662 scope in /home/tryinget/ai-society/softwareco/owned/pi-extensions and summarize the blast radius.",
      {
        parentSessionKey: "f50f147a-7a83-4d5e-8123-123456789abc",
      },
    );

    const baselineLines = buildDashboardLines(
      93,
      theme,
      sessionsDir,
      "f50f147a-7a83-4d5e-8123-123456789abc",
    );
    assert.ok(baselineLines.length > 0);

    for (const width of [1, 2, 3, 10, 24, 40, 60, 93]) {
      const lines = buildDashboardLines(
        width,
        theme,
        sessionsDir,
        "f50f147a-7a83-4d5e-8123-123456789abc",
      );
      for (const line of lines) {
        assert.ok(
          visibleWidth(line) <= width,
          `expected line width <= ${width}, got ${visibleWidth(line)} for ${JSON.stringify(line)}`,
        );
      }
    }
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
test("buildDashboardLines hides the widget until this live session has recent subagent activity", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-empty-"));
  const theme = {
    fg(_name, value) {
      return value;
    },
  };

  try {
    await writeStatus(
      sessionsDir,
      "other-session",
      "done",
      "2026-03-06T11:45:00.000Z",
      "This belongs to another live session and should stay hidden.",
      { parentSessionKey: "other-live-session" },
    );
    await writeStatus(
      sessionsDir,
      "current-but-stale",
      "done",
      "2026-03-06T10:00:00.000Z",
      "This current-session entry is too old for the widget.",
      { parentSessionKey: "live-session-key" },
    );

    for (const width of [1, 2, 3, 10, 24, 40]) {
      const lines = buildDashboardLines(width, theme, sessionsDir, "live-session-key");
      assert.deepEqual(lines, []);
    }
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
