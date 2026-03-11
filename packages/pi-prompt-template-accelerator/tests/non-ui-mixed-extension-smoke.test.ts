import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getBroker, resetBroker } from "@tryinget/pi-trigger-adapter";
import ptxExtension from "../extensions/ptx.ts";

type InputEvent = { source: "user" | "extension"; text: string };
type InputResult = { action: "continue" | "handled" | "transform"; text?: string };
type InputHandler = (event: InputEvent, ctx: any) => Promise<InputResult> | InputResult;

type ExtensionEntrypoint = (pi: any) => void;

function createNonUiContext(cwd: string) {
  return {
    hasUI: false,
    cwd,
    sessionManager: {
      getBranch() {
        return [];
      },
    },
  };
}

function createTriggerLikeContext(cwd: string) {
  return {
    hasUI: false,
    cwd,
  };
}

function createRuntime(options: { commands?: any[]; extensions: ExtensionEntrypoint[] }): InputHandler[] {
  const handlers: InputHandler[] = [];
  const commands = options.commands ?? [];

  const pi = {
    on(eventName: string, handler: InputHandler) {
      if (eventName === "input") handlers.push(handler);
    },
    registerCommand() {
      // Not needed for non-UI input smoke.
    },
    getCommands() {
      return commands;
    },
    async exec() {
      // Avoid shelling out to git in tests.
      return { code: 1, stdout: "", stderr: "" };
    },
  };

  for (const extension of options.extensions) {
    extension(pi);
  }

  return handlers;
}

function vaultStubExtension(pi: any) {
  pi.on("input", async (event: InputEvent): Promise<InputResult> => {
    if (event.source === "extension") return { action: "continue" };

    const text = event.text.trim();
    if (text.startsWith("/vault")) {
      return { action: "transform", text: "VAULT_STUB_NEXUS" };
    }

    return { action: "continue" };
  });
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Pipeline timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function waitForLiveTrigger(id: string, timeoutMs = 1500): Promise<void> {
  const broker = getBroker();
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (broker.get(id)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for live trigger: ${id}`);
}

async function runInputPipeline(
  handlers: InputHandler[],
  input: string,
  ctx: any,
  maxPasses = 12,
): Promise<{ action: "continue" | "handled" | "transform"; text?: string }> {
  let event: InputEvent = { source: "user", text: input };
  let transformed = false;

  for (let pass = 0; pass < maxPasses; pass++) {
    let restartFromFirstHandler = false;

    for (const handler of handlers) {
      const result = await handler(event, ctx);
      if (!result || result.action === "continue") continue;

      if (result.action === "handled") {
        return { action: "handled" };
      }

      if (result.action === "transform") {
        const nextText = String(result.text ?? "");

        // If an extension keeps returning the same transformed payload,
        // this would loop forever in a naïve pipeline.
        if (event.source === "extension" && nextText === event.text) {
          throw new Error(`Transform loop detected (pass=${pass + 1}, input=${input})`);
        }

        event = { source: "extension", text: nextText };
        transformed = true;
        restartFromFirstHandler = true;
        break;
      }

      throw new Error(`Unsupported action: ${(result as { action?: string }).action}`);
    }

    if (!restartFromFirstHandler) {
      return transformed ? { action: "transform", text: event.text } : { action: "continue", text: event.text };
    }
  }

  throw new Error(`Pipeline exceeded maxPasses=${maxPasses} for input: ${input}`);
}

async function withTempTemplate(
  templateContent: string,
  run: (templatePath: string, cwd: string) => Promise<void>,
): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ptx-non-ui-smoke-"));
  const templatePath = path.join(tempDir, "inv.md");
  await writeFile(templatePath, templateContent, "utf8");

  try {
    await run(templatePath, tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("non-UI: '$$' returns deterministic usage transform error", async () => {
  const handlers = createRuntime({ extensions: [ptxExtension] });
  const result = await runWithTimeout(runInputPipeline(handlers, "$$", createNonUiContext(process.cwd())), 1500);

  assert.equal(result.action, "transform");
  assert.equal(result.text, "PTX input error: expected '/template' after '$$'.");
});

test("non-UI: malformed '$$' selector parse returns deterministic transform error", async () => {
  const handlers = createRuntime({ extensions: [ptxExtension] });
  const result = await runWithTimeout(
    runInputPipeline(handlers, "$$ /inv \"unterminated", createNonUiContext(process.cwd())),
    1500,
  );

  assert.equal(result.action, "transform");
  assert.equal(result.text, "PTX parse error: Unclosed quote: \"");
});

test("non-UI: slash-only '$$ /' selector invocation returns deterministic transform error", async () => {
  const handlers = createRuntime({ extensions: [ptxExtension] });
  const result = await runWithTimeout(
    runInputPipeline(handlers, "$$ /", createNonUiContext(process.cwd())),
    1500,
  );

  assert.equal(result.action, "transform");
  assert.equal(result.text, "PTX input error: expected slash command after '$$'.");
});

test("non-UI: invalid '$$' selector invocation returns deterministic transform error", async () => {
  const handlers = createRuntime({ extensions: [ptxExtension] });
  const result = await runWithTimeout(
    runInputPipeline(handlers, "$$ not-a-slash-command", createNonUiContext(process.cwd())),
    1500,
  );

  assert.equal(result.action, "transform");
  assert.equal(result.text, "PTX input error: expected slash command after '$$'.");
});

test("non-UI: optional rest args (${@:4}) are omitted when no extras are inferred", async () => {
  await withTempTemplate(
    "Primary objective: $1\nWorkflow context: $2\nSystem4D mode: $3\nOptional overrides/context-pack: ${@:4}\n",
    async (templatePath, cwd) => {
      const commands = [
        {
          name: "next-10-expert-suggestions",
          source: "prompt",
          description: "Next 10 suggestions template",
          path: templatePath,
        },
      ];

      const handlers = createRuntime({ commands, extensions: [ptxExtension] });
      const result = await runWithTimeout(
        runInputPipeline(handlers, "$$ /next-10-expert-suggestions", createNonUiContext(cwd)),
        2000,
      );

      assert.equal(result.action, "transform");
      assert.match(
        result.text ?? "",
        /^\/next-10-expert-suggestions\s+"[^"]+"\s+"[^"]+"\s+"lite"\s*$/,
      );
      assert.doesNotMatch(result.text ?? "", /"none"/);
    },
  );
});

test("non-UI: trigger-like context without sessionManager still builds PTX suggestion", async () => {
  await withTempTemplate("Task: $1\nContext: $2\n", async (templatePath, cwd) => {
    const commands = [
      {
        name: "workflow",
        source: "prompt",
        description: "Workflow template",
        path: templatePath,
      },
    ];

    const handlers = createRuntime({ commands, extensions: [ptxExtension] });
    const result = await runWithTimeout(
      runInputPipeline(
        handlers,
        '$$ /workflow "fix trigger live picker"',
        createTriggerLikeContext(cwd),
      ),
      2000,
    );

    assert.equal(result.action, "transform");
    assert.match(result.text ?? "", /^\/workflow\s+"fix trigger live picker"\s+"[^"]+"\s*$/);
  });
});

test("non-UI: prompt command without template path falls back to prefilling raw slash command", async () => {
  const commands = [
    {
      name: "analysis-router",
      source: "prompt",
      description: "Router template without file path",
    },
  ];

  const handlers = createRuntime({ commands, extensions: [ptxExtension] });
  const result = await runWithTimeout(
    runInputPipeline(handlers, "$$ /analysis-router", createTriggerLikeContext(process.cwd())),
    2000,
  );

  assert.equal(result.action, "transform");
  assert.equal(result.text, "/analysis-router");
});

test("non-UI: duplicate prompt names use the single prefillable match deterministically", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ptx-single-prefillable-"));
  const templatePath = path.join(tempDir, "same.md");
  await writeFile(templatePath, "Task: $1\nContext: $2\n", "utf8");

  try {
    const commands = [
      {
        name: "same",
        source: "prompt",
        description: "missing path first",
      },
      {
        name: "same",
        source: "prompt",
        description: "valid second",
        path: templatePath,
      },
    ];

    const handlers = createRuntime({ commands, extensions: [ptxExtension] });
    const result = await runWithTimeout(
      runInputPipeline(handlers, '$$ /same "fix this"', createNonUiContext(tempDir)),
      2000,
    );

    assert.equal(result.action, "transform");
    assert.match(result.text ?? "", /^\/same\s+"fix this"\s+"[^"]+"\s*$/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("non-UI: duplicate prefillable prompt names return explicit ambiguity", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ptx-ambiguous-"));
  const templateA = path.join(tempDir, "same-a.md");
  const templateB = path.join(tempDir, "same-b.md");
  await writeFile(templateA, "Task: $1\n", "utf8");
  await writeFile(templateB, "Context: $2\n", "utf8");

  try {
    const commands = [
      {
        name: "same",
        source: "prompt",
        description: "first duplicate",
        path: templateA,
      },
      {
        name: "same",
        source: "prompt",
        description: "second duplicate",
        path: templateB,
      },
    ];

    const handlers = createRuntime({ commands, extensions: [ptxExtension] });
    const result = await runWithTimeout(
      runInputPipeline(handlers, "$$ /same", createNonUiContext(tempDir)),
      2000,
    );

    assert.equal(result.action, "transform");
    assert.equal(
      result.text,
      "Template name is ambiguous: /same (2 prefillable matches, 2 total). Use picker or '/ptx-select same'.",
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("non-UI: PTX policy is loaded from ctx.cwd and honors passthrough fallback", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ptx-policy-cwd-"));
  const templatePath = path.join(tempDir, "blocked.md");
  await mkdir(path.join(tempDir, ".pi"), { recursive: true });
  await writeFile(
    path.join(tempDir, ".pi", "ptx-config.json"),
    JSON.stringify({ templates: { blocked: { policy: "block", fallback: "passthrough" } } }),
    "utf8",
  );
  await writeFile(templatePath, "Task: $1\nContext: $2\n", "utf8");

  try {
    const commands = [
      {
        name: "blocked",
        source: "prompt",
        description: "blocked template",
        path: templatePath,
      },
    ];

    const handlers = createRuntime({ commands, extensions: [ptxExtension] });
    const result = await runWithTimeout(
      runInputPipeline(handlers, '$$ /blocked "x"', createNonUiContext(tempDir)),
      2000,
    );

    assert.equal(result.action, "transform");
    assert.equal(result.text, '/blocked "x"');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("non-UI: invalid repo-local PTX policy config returns deterministic error", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ptx-policy-invalid-"));
  const templatePath = path.join(tempDir, "allowed.md");
  await mkdir(path.join(tempDir, ".pi"), { recursive: true });
  await writeFile(path.join(tempDir, ".pi", "ptx-config.json"), "{ not valid json", "utf8");
  await writeFile(templatePath, "Task: $1\n", "utf8");

  try {
    const commands = [
      {
        name: "allowed",
        source: "prompt",
        description: "allowed template",
        path: templatePath,
      },
    ];

    const handlers = createRuntime({ commands, extensions: [ptxExtension] });
    const result = await runWithTimeout(
      runInputPipeline(handlers, '$$ /allowed "x"', createNonUiContext(tempDir)),
      2000,
    );

    assert.equal(result.action, "transform");
    assert.match(result.text ?? "", /^PTX policy config error at .*\.pi\/ptx-config\.json:/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("live trigger: duplicate prompt names keep selected command identity and prefill transformed command", async () => {
  const previousPath = process.env.PATH;
  process.env.PATH = "/__missing_fzf_path__";
  resetBroker();

  try {
    await withTempTemplate("Create an implementation plan for this request: $@\n", async (templatePath, cwd) => {
      const commands = [
        {
          name: "implementation-planning",
          source: "prompt",
          description: "Draft an implementation plan for a requested change",
        },
        {
          name: "implementation-planning",
          source: "prompt",
          description: "Draft an implementation plan for a requested change",
          path: templatePath,
        },
      ];

      const pi = {
        on() {
          // Input handlers are not needed for broker-driven live trigger verification.
        },
        registerCommand() {
          // Not needed for this test.
        },
        getCommands() {
          return commands;
        },
        async exec() {
          return { code: 1, stdout: "", stderr: "" };
        },
      };

      ptxExtension(pi as any);
      await waitForLiveTrigger("ptx-template-picker");

      const broker = getBroker();
      let editorText = "";
      const notifications: Array<{ message: string; level?: string }> = [];

      broker.setAPI({
        setText(text: string) {
          editorText = text;
        },
        async select(_title: string, options: string[]) {
          return options.find((option) => !option.includes("no template path")) ?? options[0] ?? null;
        },
        notify(message: string, level?: string) {
          notifications.push({ message, level });
        },
      });

      const input = "$$ /implementation-planning";
      await runWithTimeout(
        broker.checkAndFire({
          fullText: input,
          textBeforeCursor: input,
          textAfterCursor: "",
          cursorLine: 0,
          cursorColumn: input.length,
          totalLines: 1,
          isLive: true,
          cwd,
          sessionKey: "ptx-live-duplicate-test",
        }),
        2500,
      );

      assert.match(editorText, /^\/implementation-planning\s+"<MUST_REPLACE_PRIMARY_OBJECTIVE>"$/);
      assert.equal(
        notifications.some((entry) => /Unable to build suggestion|Template not found/.test(entry.message)),
        false,
      );
    });
  } finally {
    process.env.PATH = previousPath;
    resetBroker();
  }
});

test("mixed-extension non-UI smoke: both load orders handle '$$ /...' and '/vault...' without hanging", async () => {
  await withTempTemplate("Task: $1\nContext: $2\n", async (templatePath, cwd) => {
    const commands = [
      {
        name: "inv",
        source: "prompt",
        description: "Inversion test template",
        path: templatePath,
      },
      {
        name: "vault",
        source: "extension",
        description: "Vault extension command",
      },
    ];

    const orders: Array<{ label: string; extensions: ExtensionEntrypoint[] }> = [
      { label: "ptx-then-vault", extensions: [ptxExtension, vaultStubExtension] },
      { label: "vault-then-ptx", extensions: [vaultStubExtension, ptxExtension] },
    ];

    const previousPath = process.env.PATH;
    process.env.PATH = "/__missing_fzf_path__";

    try {
      for (const order of orders) {
        const handlers = createRuntime({ commands, extensions: order.extensions });

        const ptxResult = await runWithTimeout(
          runInputPipeline(handlers, "$$ /inv", createNonUiContext(cwd)),
          2000,
        );
        assert.equal(ptxResult.action, "transform", `${order.label}: '$$ /inv' should transform`);
        assert.match(ptxResult.text ?? "", /^\/inv\b/, `${order.label}: '$$ /inv' should produce /inv command text`);

        const vaultResult = await runWithTimeout(
          runInputPipeline(handlers, "/vault:nex", createNonUiContext(cwd)),
          2000,
        );
        assert.equal(vaultResult.action, "transform", `${order.label}: '/vault:nex' should transform`);
        assert.equal(vaultResult.text, "VAULT_STUB_NEXUS", `${order.label}: '/vault:nex' should be handled by vault flow`);
      }
    } finally {
      process.env.PATH = previousPath;
    }
  });
});
