import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import evidenceReviewExtension, {
  COMMAND_NAME,
  HEADLESS_ERROR,
} from "../extensions/evidence-review.ts";
import {
  EvidenceReviewPanel,
  reviewDisplayLines,
  reviewSummaryLines,
  sanitizePlainText,
} from "../src/render.ts";
import { validateEvidenceReview } from "../src/validation.ts";

const valid = validateEvidenceReview(
  JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "valid.json"), "utf8")),
);

test("neutralizes terminal controls while preserving ordinary printable punctuation", () => {
  const hostile =
    "\u001b]8;;https://evil.example\u0007CLICK\u001b]8;;\u0007\u202e\u200b # <img src=x> [run](command:rm -rf /) `sudo`\rOVERWRITE";
  const rendered = sanitizePlainText(hostile);
  assert.equal(rendered.includes(String.fromCodePoint(27)), false);
  assert.equal(rendered.includes(String.fromCodePoint(7)), false);
  assert.equal(rendered.includes(String.fromCodePoint(0x202e)), false);
  assert.equal(rendered.includes(String.fromCodePoint(0x200b)), false);
  assert.match(rendered, /# <img src=x> \[run\]\(command:rm -rf \/\) `sudo`/u);
  assert.match(rendered, /\[control U\+001B\]/u);
  assert.match(rendered, /\[format U\+202E\]/u);
  assert.match(rendered, /\[carriage-return\]/u);
});

test("summary prioritizes operator evidence while full detail preserves normalized fields", () => {
  const summary = reviewSummaryLines(valid).join("\n");
  const detail = reviewDisplayLines(valid).join("\n");
  assert.ok(reviewSummaryLines(valid).length < reviewDisplayLines(valid).length);
  for (const expected of [
    "Outcome: checks_passed",
    "Commands: selected=",
    "-- Claims (7) --",
    "-- Limitations (2) --",
    "-- Authority boundaries (3) --",
    "Handoff: status=blocked",
    "displayed only; never accepted",
  ]) {
    assert.match(summary, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  }
  for (const expected of [
    "evidenceArtifacts[0].observedStatus",
    "limitations[0].severity",
    "authorityBoundaries[0].boundary",
    "outcome.previewOnly: true",
    "semantic-code-intelligence.evidence_review.v1",
  ]) {
    assert.match(detail, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  }
  assert.doesNotMatch(summary, /checks＿passed/u);
  assert.match(summary, /checks_passed/u);
});

test("component keeps width, scrolls, toggles detail, and closes inertly", () => {
  let closed = false;
  const panel = new EvidenceReviewPanel(
    reviewSummaryLines(valid),
    () => {
      closed = true;
    },
    8,
    reviewDisplayLines(valid),
  );
  const initial = panel.render(31);
  assert.equal(initial.length, 8);
  assert.ok(initial.every((line) => visibleWidth(line) <= 31));
  assert.match(initial.join("\n"), /EVIDENCE REVIEW - inert/u);
  panel.handleInput("\u001b[B");
  const scrolled = panel.render(31);
  assert.notDeepEqual(scrolled, initial);
  panel.handleInput("d");
  const detailed = panel.render(31);
  assert.match(detailed.join("\n"), /full\s+normalized detail/u);
  assert.ok(detailed.every((line) => visibleWidth(line) <= 31));
  panel.handleInput("\r");
  assert.match(panel.render(31).join("\n"), /EVIDENCE REVIEW - inert/u);
  panel.handleInput("\u001b");
  assert.equal(closed, true);
});

type RegisteredCommand = {
  description: string;
  handler: (args: string, ctx: unknown) => Promise<void>;
};

test("extension registers exactly the evidence-review command", () => {
  const registrations: Array<{ name: string; command: RegisteredCommand }> = [];
  const api = {
    registerCommand(name: string, command: RegisteredCommand) {
      registrations.push({ name, command });
    },
  };
  evidenceReviewExtension(api as unknown as ExtensionAPI);
  assert.deepEqual(
    registrations.map(({ name }) => name),
    [COMMAND_NAME],
  );
  const registration = registrations[0];
  assert.ok(registration);
  assert.match(registration.command.description, /Select or render/);
});

test("package manifest activates only the evidence-review extension", () => {
  const manifest = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
  ) as Record<string, unknown>;
  assert.deepEqual(manifest.pi, { extensions: ["./extensions/evidence-review.ts"] });
  assert.equal((manifest.files as string[]).includes("prompts"), false);
  const peers = manifest.peerDependencies as Record<string, unknown>;
  assert.deepEqual(Object.keys(peers).sort(), [
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-tui",
  ]);
});

test("headless command fails visibly before file or UI access", async () => {
  let command: RegisteredCommand | undefined;
  const api = {
    registerCommand(_name: string, registered: RegisteredCommand) {
      command = registered;
    },
  };
  evidenceReviewExtension(api as unknown as ExtensionAPI);
  assert.ok(command);

  let uiTouched = false;
  const context = {
    mode: "print",
    cwd: "/definitely/not/read",
    hasUI: false,
    ui: new Proxy(
      {},
      {
        get() {
          uiTouched = true;
          throw new Error("UI touched");
        },
      },
    ),
  };
  const registeredCommand = command;
  assert.ok(registeredCommand);
  await assert.rejects(() => registeredCommand.handler("review.json", context), {
    message: HEADLESS_ERROR,
  });
  assert.equal(uiTouched, false);
});

test("empty interactive invocation discovers valid files and opens a selector", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "pi-evidence-review-picker-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "evidence"));
  writeFileSync(
    join(root, "evidence", "review.json"),
    readFileSync(join(import.meta.dirname, "fixtures", "valid.json")),
  );
  writeFileSync(join(root, "unrelated.json"), "{}");

  let command: RegisteredCommand | undefined;
  evidenceReviewExtension({
    registerCommand(_name: string, registered: RegisteredCommand) {
      command = registered;
    },
  } as unknown as ExtensionAPI);
  assert.ok(command);

  let selectorTitle = "";
  let selectorOptions: string[] = [];
  let panelOpened = false;
  await command.handler("", {
    mode: "tui",
    cwd: root,
    hasUI: true,
    ui: {
      select: async (title: string, options: string[]) => {
        selectorTitle = title;
        selectorOptions = options;
        return options[0];
      },
      custom: async () => {
        panelOpened = true;
      },
      notify: () => assert.fail("valid picker flow must not notify an error"),
    },
  });

  assert.equal(selectorTitle, "Select evidence review file");
  assert.deepEqual(selectorOptions, ["evidence/review.json"]);
  assert.equal(panelOpened, true);
});

test("runtime source imports no denied capability modules or persistence APIs", () => {
  const sources = [
    "extensions/evidence-review.ts",
    "src/reader.ts",
    "src/render.ts",
    "src/validation.ts",
  ].map((path) => readFileSync(join(import.meta.dirname, "..", path), "utf8"));
  const combined = sources.join("\n");
  assert.doesNotMatch(
    combined,
    /node:(?:child_process|net|http|https|dns)|\bfetch\s*\(|\.exec\s*\(|appendEntry|sendMessage|sendUserMessage|setEditorText|writeFile|AK_DB|sqlite/,
  );
});
