import assert from "node:assert/strict";
import test from "node:test";
import { getBroker, resetBroker } from "../src/triggerAdapter.js";
import { createPickerRuntime } from "../src/vaultPicker.js";
import { LIVE_VAULT_TRIGGER_DEBOUNCE_MS, LIVE_VAULT_TRIGGER_ID } from "../src/vaultTypes.js";

function createTemplate(name, description = `${name} template`) {
  return {
    id: name.length,
    name,
    description,
    content: `# ${name}\n\nPrepared ${name} prompt.`,
    version: 1,
    artifact_kind: "cognitive",
    control_mode: "one_shot",
    formalization_level: "structured",
    owner_company: "software",
    visibility_companies: ["software"],
  };
}

function createRuntime(templates) {
  return {
    resolveCurrentCompanyContext(cwd) {
      return {
        company: "software",
        source: `cwd:${cwd ?? process.cwd()}`,
      };
    },
    getCurrentCompany() {
      return "software";
    },
    listTemplatesDetailed(_filters, context, options) {
      assert.equal(context?.currentCompany, "software");
      assert.equal(context?.requireExplicitCompany, true);
      assert.deepEqual(options, { includeContent: false });
      return { ok: true, value: templates };
    },
    getTemplateDetailed(name, context) {
      assert.equal(context?.currentCompany, "software");
      assert.equal(context?.requireExplicitCompany, true);
      return { ok: true, value: templates.find((template) => template.name === name) ?? null };
    },
    getTemplate(name) {
      return templates.find((template) => template.name === name) ?? null;
    },
    facetLabel(template) {
      return `${template.artifact_kind}/${template.control_mode}/${template.formalization_level}`;
    },
  };
}

function contextFromText(text, sessionKey = "vault-live-test") {
  return {
    fullText: text,
    textBeforeCursor: text,
    textAfterCursor: "",
    cursorLine: 0,
    cursorColumn: text.length,
    totalLines: 1,
    isLive: true,
    cwd: "/home/tryinget/ai-society/softwareco/owned/pi-extensions",
    sessionKey,
  };
}

test("picker telemetry stays instance-local across runtime creation", () => {
  const runtime = createRuntime([createTemplate("nexus")]);
  const first = createPickerRuntime(runtime);
  const second = createPickerRuntime(runtime);

  first.recordLiveTriggerTelemetry({ event: "first-instance" });
  assert.deepEqual(first.getLiveTriggerTelemetryStats(), {
    registrations: 0,
    failures: 0,
    eventCount: 1,
  });
  assert.deepEqual(second.getLiveTriggerTelemetryStats(), {
    registrations: 0,
    failures: 0,
    eventCount: 0,
  });

  second.recordLiveTriggerTelemetry({ event: "second-instance" });
  assert.deepEqual(first.getLiveTriggerTelemetryStats(), {
    registrations: 0,
    failures: 0,
    eventCount: 1,
  });
  assert.deepEqual(second.getLiveTriggerTelemetryStats(), {
    registrations: 0,
    failures: 0,
    eventCount: 1,
  });
});

test("vault live trigger executes through the shared broker with exact runtime behavior", async () => {
  const previousPath = process.env.PATH;
  process.env.PATH = "/__missing_fzf_path__";
  resetBroker();

  const templates = [
    createTemplate("nexus", "Highest leverage intervention"),
    ...Array.from({ length: 15 }, (_, index) => createTemplate(`template-${index + 1}`)),
  ];

  try {
    const runtime = createRuntime(templates);
    createPickerRuntime(runtime).registerVaultLiveTrigger();

    const broker = getBroker();
    const trigger = broker.get(LIVE_VAULT_TRIGGER_ID);
    assert.ok(trigger, "vault live trigger should register with the shared broker");
    assert.equal(trigger.debounceMs, LIVE_VAULT_TRIGGER_DEBOUNCE_MS);

    let editorText = "";
    let inputCalls = 0;
    const notifications = [];

    broker.setAPI({
      setText(text) {
        editorText = text;
      },
      insertText() {},
      notify(message, level) {
        notifications.push({ message, level });
      },
      async select(title, options) {
        assert.match(title, /Vault live picker/);
        return options.find((option) => option.includes("nexus")) ?? options[0] ?? null;
      },
      async confirm() {
        return false;
      },
      async input(title, placeholder) {
        inputCalls += 1;
        assert.equal(title, "Filter vault templates");
        assert.equal(placeholder, "Type a query (e.g. nex, inversion, security)");
        return "nex";
      },
      getText() {
        return editorText;
      },
      close() {},
      ctx: { sessionKey: "vault-live-test" },
    });

    const fired = await broker.checkAndFire(contextFromText("/vault:"));

    assert.equal(fired, true);
    assert.equal(inputCalls, 1);
    assert.match(editorText, /^# nexus\n\nPrepared nexus prompt\.$/);
    assert.ok(
      notifications.some(
        (entry) => entry.level === "info" && /Prepared: nexus/.test(entry.message),
      ),
      "expected prepared notification for the selected template",
    );
  } finally {
    process.env.PATH = previousPath;
    resetBroker();
  }
});
