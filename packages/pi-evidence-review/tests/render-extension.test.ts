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
import { EvidenceReviewPanel, reviewDisplayLines, sanitizePlainText } from "../src/render.ts";
import { validateEvidenceReview } from "../src/validation.ts";

const valid = validateEvidenceReview(
  JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "valid.json"), "utf8")),
);

test("sanitizes terminal, bidi, markdown, HTML, URI, and command-shaped strings as plain text", () => {
  const hostile =
    "\u001b]8;;https://evil.example\u0007CLICK\u001b]8;;\u0007\u202e\u200b # <img src=x> [run](command:rm -rf /) `sudo`\rOVERWRITE";
  const rendered = sanitizePlainText(hostile);
  assert.equal(rendered.includes(String.fromCodePoint(27)), false);
  assert.equal(rendered.includes(String.fromCodePoint(7)), false);
  assert.equal(rendered.includes(String.fromCodePoint(0x202e)), false);
  assert.equal(rendered.includes(String.fromCodePoint(0x200b)), false);
  assert.doesNotMatch(rendered, /[#<>[\]()`]/u);
  assert.match(rendered, /command:rm -rf/);
  assert.match(rendered, /⏎/);
});

test("display preserves selected/recommended/observed, preview/applied, limitations, authority and blocked handoff", () => {
  const output = reviewDisplayLines(valid).join("\n");
  for (const expected of [
    "Command posture: selected=",
    "recommended-minimum=",
    "previewOnly=",
    "applied=",
    "evidenceArtifacts[0].observedStatus",
    "limitations[0].severity",
    "authorityBoundaries[0].boundary",
    "Handoff: status=blocked",
    "displayed only; never accepted",
  ]) {
    assert.match(output, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  }
});

test("component never exceeds line width and scroll/escape lifecycle is inert", () => {
  let closed = false;
  const panel = new EvidenceReviewPanel(
    reviewDisplayLines(valid),
    () => {
      closed = true;
    },
    8,
  );
  const initial = panel.render(31);
  assert.equal(initial.length, 8);
  assert.ok(initial.every((line) => visibleWidth(line) <= 31));
  panel.handleInput("\u001b[B");
  const scrolled = panel.render(31);
  assert.notDeepEqual(scrolled, initial);
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
