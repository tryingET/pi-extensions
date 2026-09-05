// summary: banked-reset expiry urgency, boundary colors, and compact Overview presentation.
// read_when: changing reset-credit expiry warnings or countdown visibility.

import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { creditExpiryTone } from "../lib/limits-dashboard-format.ts";
import { renderAccountDetails } from "../lib/limits-dashboard-render.ts";
import {
  bankedResetSummary,
  needsAttention,
  overviewCells,
  renderOverview,
  renderTimeline,
} from "../lib/limits-runway.ts";

const now = Date.parse("2026-09-05T12:00:00Z"),
  day = 86400000;
const row = (offsets, count = offsets.length) => ({
  account: { provider: "openai-codex", label: "Codex", models: [], authenticated: true },
  status: "ready",
  snapshot: {
    provider: "openai-codex",
    fetchedAt: now,
    usage: {
      windows: [
        {
          label: "Week",
          primary: true,
          remainingPercent: 90,
          resetAt: new Date(now + 7 * day).toISOString(),
        },
      ],
    },
    credits: {
      availableCount: count,
      credits: offsets.map((offset) => ({
        status: "available",
        ...(offset === undefined ? {} : { expiresAt: new Date(now + offset).toISOString() }),
      })),
    },
  },
});
const theme = { fg: (_color, text) => text, bg: (_color, text) => text, bold: (text) => text };

test("five independent cells show the displayed weekly or 5h quota renewal beside bank count and expiry", () => {
  const entry = row([2 * day, 4 * day, 6 * day]);
  entry.snapshot.usage.windows.push({
    label: "5h",
    primary: true,
    remainingPercent: 95,
    resetAt: new Date(now + 5 * 3600000).toISOString(),
  });
  for (const [remaining, quota, renewal] of [
    [95, "90% Week", "7d 0h"],
    [20, "20% 5h", "5h 0m"],
  ]) {
    entry.snapshot.usage.windows[1].remainingPercent = remaining;
    assert.deepEqual(overviewCells(entry, true, theme, "openai-codex", now, 18).slice(1), [
      quota,
      renewal,
      "↺3",
      "!2d 0h",
    ]);
    for (const [width, ranges] of [
      [
        71,
        [
          [19, 34],
          [35, 45],
          [46, 52],
          [53, 68],
        ],
      ],
      [
        120,
        [
          [29, 47],
          [48, 60],
          [61, 67],
          [68, 83],
        ],
      ],
    ]) {
      const line = renderOverview(
        [entry],
        entry,
        theme,
        width,
        10,
        "openai-codex",
        "active",
        false,
        now,
      )[1];
      // Literal coordinate assertions intentionally do not reuse the implementation's widths helper.
      assert.deepEqual(
        ranges.map(([start, end]) => line.slice(start, end).trim()),
        [quota, renewal, "↺3", "!2d 0h"],
        `${width} / ${quota}`,
      );
    }
  }
  delete entry.snapshot.usage.windows[1].resetAt;
  assert.equal(overviewCells(entry, false, theme, undefined, now, 18)[2], "unknown");
  entry.snapshot.usage.windows[1].resetAt = new Date(now - day).toISOString();
  assert.equal(overviewCells(entry, false, theme, undefined, now, 18)[2], "past ↻");
});

test("separate bank and expiry cells preserve zero, missing, partial dates, passed dates and non-Codex", () => {
  const cases = [
    [row([]), ["↺0", "none"]],
    [row([undefined]), ["↺1", "unknown ?"]],
    [row([2 * day, undefined]), ["↺2", "!2d 0h?"]],
    [row([-1, undefined]), ["↺2", "!!past? ↻"]],
  ];
  const missing = row([]);
  delete missing.snapshot.credits;
  cases.push([missing, ["↺?", "unknown ?"]]);
  const other = row([day]);
  other.account.provider = "xai";
  cases.push([other, ["—", "—"]]);
  for (const [entry, expected] of cases)
    assert.deepEqual(overviewCells(entry, false, theme, undefined, now, 18).slice(3), expected);
  const consumed = row([2 * day]);
  consumed.snapshot.credits.credits.push({
    status: "consumed",
    expiresAt: new Date(now - day).toISOString(),
  });
  assert.deepEqual(overviewCells(consumed, false, theme, undefined, now, 18).slice(3), [
    "↺1",
    "!2d 0h",
  ]);
});

test("key and wallet remain independently labelled at every table width; no quota renewal is invented", () => {
  const entry = row([]);
  entry.account.provider = "openrouter";
  entry.snapshot.money = {
    keyRemaining: 12345.67,
    walletRemaining: 9876.54,
    keyLimit: 20000,
    currency: "USD",
  };
  for (const width of [15, 18, 47]) {
    const cells = overviewCells(entry, false, theme, undefined, now, width);
    assert.ok(visibleWidth(cells[1]) <= width, cells[1]);
    assert.match(cells[1], /^K\S+ W\S+$/);
    assert.deepEqual(cells.slice(2), ["—", "—", "—"]);
  }
  entry.snapshot.money.keyLimit = null;
  entry.snapshot.money.walletRemaining = 12;
  assert.equal(overviewCells(entry, false, theme, undefined, now, 18)[1], "K∞ W$12.00");
  entry.snapshot.money.walletUnavailable = true;
  const cells = overviewCells(entry, false, theme, undefined, now, 18);
  assert.match(cells[0], /~ Codex/);
  assert.equal(cells[1], "K∞ W?");
});

test("compact table headings and narrower Left retain both rendered monetary tokens", () => {
  const entry = row([]);
  entry.account.provider = "openrouter";
  for (const [width, start, end] of [
    [60, 15, 29],
    [71, 19, 34],
    [120, 29, 47],
  ]) {
    for (const amount of [undefined, 0, 5, 12345.67, 1e12]) {
      entry.snapshot.money = {
        keyRemaining: amount,
        walletRemaining: amount,
        keyLimit: 1e13,
        currency: "USD",
      };
      const lines = renderOverview(
        [entry],
        entry,
        theme,
        width,
        10,
        undefined,
        "active",
        false,
        now,
      );
      assert.match(lines[0], /SUBSCRIPTION +LEFT +(QUOTA )?RENEWS +BANKED +EXPIRES/);
      assert.doesNotMatch(lines[0], /BANKED RESETS|CREDITS EXPIRE|BALANCE LEFT/);
      assert.equal(lines[0].slice(start, end).trim(), "LEFT");
      const expected = overviewCells(entry, true, theme, undefined, now, end - start)[1];
      assert.equal(lines[1].slice(start, end).trim(), expected);
      assert.match(expected, /^K\S+ W\S+$/);
      assert.ok(lines.every((line) => visibleWidth(line) <= width));
    }
  }
});

test("credit expiry has inclusive 72h yellow and 24h red boundaries; unknown is not safe", () => {
  for (const [offset, expected] of [
    [3 * day + 1, "text"],
    [3 * day, "warning"],
    [day + 1, "warning"],
    [day, "error"],
    [0, "error"],
    [-day, "error"],
  ])
    assert.equal(creditExpiryTone(now + offset, now), expected, String(offset));
  assert.equal(creditExpiryTone(undefined, now), "dim");
  assert.equal(creditExpiryTone(NaN, now), "dim");
});

test("summary shows total banked resets and earliest eligible expiry, not quota renewal", () => {
  const entry = row([10 * day, 2 * day, 6 * day]);
  entry.snapshot.credits.credits.push({
    status: "consumed",
    expiresAt: new Date(now - day).toISOString(),
  });
  assert.deepEqual(bankedResetSummary(entry, now), { text: "↺3 !2d 0h", tone: "warning" });
  assert.deepEqual(bankedResetSummary(row([12 * 3600000]), now), {
    text: "↺1 !!12h 0m",
    tone: "error",
  });
  assert.deepEqual(bankedResetSummary(row([-1]), now), { text: "↺1 !!past", tone: "error" });
});

test("zero, missing and partially undated credits remain distinct; other providers have no banked resets", () => {
  assert.match(bankedResetSummary(row([]), now).text, /↺0.*none/);
  assert.equal(bankedResetSummary(row([undefined]), now).text, "↺1 expiry?");
  assert.equal(bankedResetSummary(row([2 * day, undefined]), now).text, "↺2 !2d 0h?");
  const missing = row([]);
  delete missing.snapshot.credits;
  assert.equal(bankedResetSummary(missing, now).text, "↺? expiry?");
  missing.account.provider = "xai";
  assert.equal(bankedResetSummary(missing, now), undefined);
});

test("Overview keeps count and expiry visible at normal and narrow widths, independent of missing usage", () => {
  const entry = row([2 * day, 4 * day, 6 * day]);
  delete entry.snapshot.usage;
  for (const width of [32, 45, 59, 60, 71, 120]) {
    const lines = renderOverview(
      [entry],
      entry,
      theme,
      width,
      10,
      "openai-codex",
      "active",
      false,
      now,
    );
    assert.ok(
      lines.every((line) => visibleWidth(line) <= width),
      String(width),
    );
    const text = lines.join("\n");
    assert.match(text, /↺3/);
    assert.match(text, /!2d 0h/);
    assert.match(text, /unknown/);
    if (width < 60) {
      assert.match(text, /Narrow: selected only/);
      assert.match(text, /Renews +unknown/);
      assert.match(text, /Banked +↺3/);
      assert.match(text, /Expires +!2d 0h/);
    }
  }
  entry.error = "Request failed";
  assert.match(
    renderOverview([entry], entry, theme, 71, 10, undefined, "active", false, now).join("\n"),
    /old Codex.*↺3.*!2d 0h/,
  );
});

test("Overview, Subscription and Horizon use the same expiry colors", () => {
  for (const [offset, expected] of [
    [5 * day, "text"],
    [2 * day, "warning"],
    [12 * 3600000, "error"],
  ]) {
    const entry = row([offset]);
    const calls = [];
    const colored = {
      ...theme,
      fg: (color, text) => {
        calls.push({ color, text });
        return text;
      },
    };
    renderOverview([entry], entry, colored, 71, 10, undefined, "active", false, now);
    const expiry = overviewCells(entry, false, theme, undefined, now, 18)[4];
    assert.ok(calls.some((call) => call.text === expiry && call.color === expected));
    assert.ok(calls.some((call) => call.text === "↺1" && call.color === "dim"));
    assert.ok(calls.some((call) => call.text === "7d 0h" && call.color === "dim"));
    assert.ok(
      !calls.some(
        (call) => call.text.startsWith("↺1") && ["warning", "error"].includes(call.color),
      ),
    );
    calls.length = 0;
    renderAccountDetails(entry, colored, false, now);
    assert.ok(calls.some((call) => call.text.startsWith("1. Expires") && call.color === expected));
    calls.length = 0;
    renderTimeline([entry], colored, now);
    assert.ok(
      calls.some((call) => call.text.includes("credit expires") && call.color === expected),
    );
  }
});

test("attention filter catches expiring banked resets even with ample quota (callback-safe)", () => {
  const clock = Date.now;
  Date.now = () => now;
  try {
    const safe = row([5 * day]),
      warning = row([2 * day]),
      critical = row([day]);
    assert.deepEqual([safe, warning, critical].filter(needsAttention), [warning, critical]);
  } finally {
    Date.now = clock;
  }
});

test("banked expiry never hides loading, queued, partial or stale health in either layout", () => {
  for (const width of [45, 71]) {
    const cases = [
      ["ready", {}, "○ Codex"],
      ["loading", {}, "○ ↻ Codex"],
      ["queued", {}, "○ … Codex"],
      ["ready", { usageError: "Usage unavailable" }, "○ ~ Codex"],
      ["ready", { creditsError: "Resets unavailable" }, "○ ~ Codex"],
      ["error", {}, "○ old Codex"],
    ];
    for (const [status, partial, expected] of cases) {
      const entry = row([2 * day]);
      entry.status = status;
      Object.assign(entry.snapshot, partial);
      const text = renderOverview(
        [entry],
        entry,
        theme,
        width,
        10,
        undefined,
        "active",
        false,
        now,
      ).join("\n");
      assert.ok(text.includes(expected), `${width} / ${status} / ${expected}`);
      assert.match(text, /↺1/);
      assert.match(text, /!2d 0h/);
      assert.match(text, /7d 0h/);
    }
  }
});
