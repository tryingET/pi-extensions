import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  exportAutoresearchDashboardToBrowser,
  stopAutoresearchDashboardBrowserExport,
} from "../extensions/pi-autoresearch/dashboardUi.ts";
import {
  AUTORESEARCH_AUTOPLAN_TOOL_NAME,
  AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  AUTORESEARCH_CONTROL_TOOL_NAME,
  AUTORESEARCH_FINALIZE_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
  AUTORESEARCH_LOOP_TOOL_NAME,
  AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
  AUTORESEARCH_RESUME_APPLY_TOOL_NAME,
  AUTORESEARCH_RUN_TOOL_NAME,
  AUTORESEARCH_SELF_HOSTING_TOOL_NAME,
  AUTORESEARCH_SETUP_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
  AUTORESEARCH_VLLM_CAMPAIGN_TOOL_NAME,
} from "../extensions/pi-autoresearch/eagerContract.ts";
import type { AutoresearchRuntimeModule } from "../extensions/pi-autoresearch/lazyModules.ts";
import { createAutoresearchSessionEffects } from "../extensions/pi-autoresearch/sessionEffects.ts";
import {
  type PiAutoresearchExtensionOptions,
  registerPiAutoresearchExtension,
} from "../extensions/pi-autoresearch.ts";

interface RegisteredCommand {
  handler: (args: string, ctx: unknown) => Promise<void>;
}

interface RegisteredTool {
  name: string;
  parameters: unknown;
  execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: { cwd?: string },
  ) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }>;
}

function registerHarness(options: PiAutoresearchExtensionOptions = {}) {
  const tools = new Map<string, RegisteredTool>();
  const commands = new Map<string, RegisteredCommand>();
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  registerPiAutoresearchExtension(
    {
      registerCommand(name: string, command: RegisteredCommand) {
        commands.set(name, command);
      },
      registerTool(tool: RegisteredTool) {
        tools.set(tool.name, tool);
      },
      on(event: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(event, handler);
      },
    } as never,
    {
      triggerSurface: {
        registerPickerInteraction() {
          return { unregister() {} };
        },
      },
      ...options,
    },
  );
  return { commands, handlers, tools };
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
}

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(predicate(), true, "condition did not become true before timeout");
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CANONICAL_EAGER_TOOL_PARAMETERS = JSON.parse(
  readFileSync(path.join(packageRoot, "tests/fixtures/eager-tool-parameters.json"), "utf8"),
) as Record<string, unknown>;

const EXPECTED_TOOL_NAMES = [
  AUTORESEARCH_AUTOPLAN_TOOL_NAME,
  AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  AUTORESEARCH_CONTROL_TOOL_NAME,
  AUTORESEARCH_FINALIZE_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
  AUTORESEARCH_LOOP_TOOL_NAME,
  AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
  AUTORESEARCH_RESUME_APPLY_TOOL_NAME,
  AUTORESEARCH_RUN_TOOL_NAME,
  AUTORESEARCH_SELF_HOSTING_TOOL_NAME,
  AUTORESEARCH_SETUP_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
  AUTORESEARCH_VLLM_CAMPAIGN_TOOL_NAME,
].sort();

test("extension startup sources contain no static value import of core implementations", () => {
  const extensionRoot = path.join(packageRoot, "extensions");
  const extensionFiles = (readdirSync(extensionRoot, { recursive: true }) as string[])
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => path.join(extensionRoot, entry));
  const forbiddenStaticImports: string[] = [];
  for (const file of extensionFiles) {
    const source = readFileSync(file, "utf8");
    const staticCoreImport = /import\s+(?!type\b)[^;]+\sfrom\s+["'][^"']*src\/core\/[^"']+["'];/gu;
    if (staticCoreImport.test(source))
      forbiddenStaticImports.push(path.relative(packageRoot, file));
  }
  assert.deepEqual(forbiddenStaticImports, []);
});

test("registration keeps exact canonical names and deep schemas eager without evaluating implementations", () => {
  let runtimeLoadCount = 0;
  const { tools } = registerHarness({
    moduleLoaders: {
      runtime: async () => {
        runtimeLoadCount += 1;
        throw new Error("runtime should not load during registration");
      },
    },
  });

  assert.equal(runtimeLoadCount, 0);
  assert.deepEqual([...tools.keys()].sort(), EXPECTED_TOOL_NAMES);
  const actualParameters = Object.fromEntries(
    [...tools.values()]
      .map((tool) => [tool.name, tool.parameters] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  assert.deepEqual(actualParameters, CANONICAL_EAGER_TOOL_PARAMETERS);
});

test("fresh-process startup loads no core implementation and emits the exact eager contract", () => {
  const traceRoot = mkdtempSync(path.join(os.tmpdir(), "autoresearch-startup-trace-"));
  const tracePath = path.join(traceRoot, "imports.log");
  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--experimental-loader",
        path.join(packageRoot, "tests/fixtures/trace-extension-loads.mjs"),
        path.join(packageRoot, "tests/fixtures/fresh-process-startup.ts"),
      ],
      {
        cwd: packageRoot,
        encoding: "utf8",
        env: { ...process.env, PI_AUTORESEARCH_IMPORT_TRACE: tracePath },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), CANONICAL_EAGER_TOOL_PARAMETERS);
    const trace = readFileSync(tracePath, "utf8");
    assert.doesNotMatch(trace, /\/src\/core\//u);
  } finally {
    rmSync(traceRoot, { recursive: true, force: true });
  }
});

test("read-profile guards reject before the lazy runtime importer is called", async () => {
  let runtimeLoadCount = 0;
  const { tools } = registerHarness({
    effectProfile: "read",
    moduleLoaders: {
      runtime: async () => {
        runtimeLoadCount += 1;
        throw new Error("guard did not run before import");
      },
    },
  });

  const runTool = tools.get(AUTORESEARCH_RUN_TOOL_NAME);
  assert.ok(runTool);
  await assert.rejects(
    () =>
      runTool.execute(
        "read-profile-run",
        { description: "must stay blocked" },
        undefined,
        undefined,
        { cwd: process.cwd() },
      ),
    /read profile/u,
  );
  assert.equal(runtimeLoadCount, 0);
});

test("concurrent first use shares one in-flight import and caches load failure truth", async () => {
  const pendingRuntime = deferred<AutoresearchRuntimeModule>();
  let runtimeLoadCount = 0;
  const { tools } = registerHarness({
    moduleLoaders: {
      runtime: () => {
        runtimeLoadCount += 1;
        return pendingRuntime.promise;
      },
    },
  });
  const statusTool = tools.get(AUTORESEARCH_STATUS_TOOL_NAME);
  assert.ok(statusTool);

  const first = statusTool.execute(
    "status-a",
    { action: "status", cwd: "/tmp/lazy-a" },
    undefined,
    undefined,
    { cwd: "/tmp/lazy-a" },
  );
  const second = statusTool.execute(
    "status-b",
    { action: "status", cwd: "/tmp/lazy-b" },
    undefined,
    undefined,
    { cwd: "/tmp/lazy-b" },
  );
  await Promise.resolve();
  assert.equal(runtimeLoadCount, 1);

  const marker = new Error("cached runtime load failure");
  pendingRuntime.reject(marker);
  const failures = await Promise.allSettled([first, second]);
  assert.equal(failures[0]?.status, "rejected");
  assert.equal(failures[1]?.status, "rejected");
  if (failures[0]?.status === "rejected" && failures[1]?.status === "rejected") {
    assert.equal(failures[0].reason, marker);
    assert.equal(failures[1].reason, marker);
  }
  await assert.rejects(
    () =>
      statusTool.execute(
        "status-c",
        { action: "status", cwd: "/tmp/lazy-c" },
        undefined,
        undefined,
        { cwd: "/tmp/lazy-c" },
      ),
    (error) => error === marker,
  );
  assert.equal(runtimeLoadCount, 1);
});

test("session shutdown prevents a delayed first-use widget load from registering UI", async () => {
  const pendingRuntime = deferred<AutoresearchRuntimeModule>();
  let runtimeLoadCount = 0;
  let widgetRegistrations = 0;
  const { handlers } = registerHarness({
    moduleLoaders: {
      runtime: () => {
        runtimeLoadCount += 1;
        return pendingRuntime.promise;
      },
    },
  });

  handlers.get("session_start")?.(
    {},
    {
      cwd: "/tmp/lazy-shutdown",
      hasUI: true,
      ui: {
        setWidget() {
          widgetRegistrations += 1;
        },
      },
    },
  );
  await Promise.resolve();
  assert.equal(runtimeLoadCount, 1);
  handlers.get("session_shutdown")?.();
  pendingRuntime.resolve({} as AutoresearchRuntimeModule);
  await pendingRuntime.promise;
  await Promise.resolve();
  assert.equal(widgetRegistrations, 0);
});

test("a widget factory retained by the host becomes inert after shutdown", async () => {
  let widgetFactory:
    | ((tui: { requestRender(): void }) => {
        render(width: number): string[];
        dispose(): void;
      })
    | undefined;
  let renderRequests = 0;
  const { handlers } = registerHarness({
    moduleLoaders: { runtime: async () => ({}) as unknown as AutoresearchRuntimeModule },
  });
  handlers.get("session_start")?.(
    {},
    {
      cwd: "/tmp/retained-widget",
      hasUI: true,
      ui: {
        setWidget(_id: string, widget: unknown) {
          if (typeof widget === "function") widgetFactory = widget as typeof widgetFactory;
        },
      },
    },
  );
  await waitFor(() => typeof widgetFactory === "function");
  handlers.get("session_shutdown")?.();

  const component = widgetFactory?.({
    requestRender() {
      renderRequests += 1;
    },
  });
  assert.ok(component);
  assert.deepEqual(component.render(120), []);
  component.dispose();
  assert.equal(renderRequests, 0);
});

test("overlay factories retained by the host commit nothing after shutdown", async () => {
  for (const args of ["overlay", "review"]) {
    const customResult = deferred<unknown>();
    let retainedFactory:
      | ((
          tui: { requestRender(): void },
          theme: unknown,
          keybindings: unknown,
          done: (result: unknown) => void,
        ) => { render(width: number): string[]; dispose?: () => void })
      | undefined;
    let doneCalls = 0;
    let renderRequests = 0;
    const notifications: string[] = [];
    const { commands, handlers } = registerHarness({
      moduleLoaders: { runtime: async () => ({}) as unknown as AutoresearchRuntimeModule },
    });
    const command = commands.get("autoresearch");
    assert.ok(command);

    const operation = command.handler(args, {
      cwd: `/tmp/retained-${args}`,
      hasUI: true,
      ui: {
        custom(factory: unknown) {
          retainedFactory = factory as typeof retainedFactory;
          return customResult.promise;
        },
        notify(message: string) {
          notifications.push(message);
        },
      },
    });
    await waitFor(() => typeof retainedFactory === "function");
    handlers.get("session_shutdown")?.();

    const component = retainedFactory?.(
      {
        requestRender() {
          renderRequests += 1;
        },
      },
      {},
      {},
      () => {
        doneCalls += 1;
      },
    );
    assert.ok(component);
    assert.deepEqual(component.render(120), []);
    component.dispose?.();
    assert.equal(doneCalls, 0);
    assert.equal(renderRequests, 0);
    assert.deepEqual(notifications, []);

    customResult.resolve(args === "review" ? null : undefined);
    await operation;
  }
});

test("editor opened before shutdown cannot commit its retained notification afterward", async () => {
  const editorResult = deferred<string | undefined>();
  const notifications: string[] = [];
  let editorCalls = 0;
  const { commands, handlers } = registerHarness({
    moduleLoaders: {
      runtime: async () =>
        ({
          buildAutoresearchRuntimeStatus() {
            return {};
          },
          formatAutoresearchDashboard() {
            return "dashboard";
          },
        }) as unknown as AutoresearchRuntimeModule,
    },
  });
  const command = commands.get("autoresearch");
  assert.ok(command);

  const operation = command.handler("dashboard", {
    cwd: "/tmp/editor-shutdown",
    hasUI: true,
    ui: {
      editor() {
        editorCalls += 1;
        return editorResult.promise;
      },
      notify(message: string) {
        notifications.push(message);
      },
    },
  });
  await waitFor(() => editorCalls === 1);
  handlers.get("session_shutdown")?.();
  editorResult.reject(new Error("editor rejected after shutdown"));
  await operation;

  assert.equal(editorCalls, 1);
  assert.deepEqual(notifications, []);
});

test("browser failure after shutdown cannot commit a stale fallback notification", async () => {
  const effects = createAutoresearchSessionEffects();
  const browserOpen = deferred<void>();
  const notifications: string[] = [];
  const intervals = new Map<string, ReturnType<typeof setInterval>>();
  let browserOpenCalls = 0;
  const cwd = "/tmp/browser-shutdown";

  const operation = exportAutoresearchDashboardToBrowser(
    {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
      },
    },
    intervals,
    {
      runtime: async () =>
        ({
          exportAutoresearchDashboardHtml() {
            return {
              fileUrl: "file:///tmp/browser-shutdown/dashboard.html",
              path: "dashboard.html",
            };
          },
        }) as unknown as AutoresearchRuntimeModule,
    } as never,
    effects,
    () => {
      browserOpenCalls += 1;
      return browserOpen.promise;
    },
  );
  await waitFor(() => browserOpenCalls === 1);
  effects.revoke();
  browserOpen.reject(new Error("deterministic browser failure"));
  await operation;
  stopAutoresearchDashboardBrowserExport(cwd, intervals);

  assert.deepEqual(notifications, []);
});

test("a replacement session gets a fresh fence while delayed work from the old session stays stale", async () => {
  const pendingRuntime = deferred<AutoresearchRuntimeModule>();
  let widgetRegistrations = 0;
  const { handlers } = registerHarness({
    moduleLoaders: { runtime: () => pendingRuntime.promise },
  });
  const context = {
    cwd: "/tmp/replacement-session",
    hasUI: true,
    ui: {
      setWidget() {
        widgetRegistrations += 1;
      },
    },
  };

  handlers.get("session_start")?.({}, context);
  await Promise.resolve();
  handlers.get("session_shutdown")?.();
  handlers.get("session_start")?.({}, context);
  pendingRuntime.resolve({} as AutoresearchRuntimeModule);
  await waitFor(() => widgetRegistrations === 1);

  assert.equal(widgetRegistrations, 1);
  handlers.get("session_shutdown")?.();
});

test("session hook consumes lazy-load rejection and reports it while active", async () => {
  const marker = new Error("widget import failure");
  const notifications: string[] = [];
  const unhandled: unknown[] = [];
  const onUnhandled = (error: unknown) => unhandled.push(error);
  process.on("unhandledRejection", onUnhandled);
  try {
    const { handlers } = registerHarness({
      moduleLoaders: {
        runtime: async () => {
          throw marker;
        },
      },
    });
    handlers.get("session_start")?.(
      {},
      {
        cwd: "/tmp/lazy-rejection",
        hasUI: true,
        ui: {
          notify(message: string) {
            notifications.push(message);
          },
          setWidget() {},
        },
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(unhandled, []);
    assert.equal(notifications.length, 1);
    assert.match(notifications[0] ?? "", /widget import failure/u);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("session shutdown suppresses a trigger callback waiting on first runtime load", async () => {
  const pendingRuntime = deferred<AutoresearchRuntimeModule>();
  const pickers: Array<Record<string, unknown>> = [];
  let inserted = "";
  const { handlers } = registerHarness({
    triggerSurface: {
      registerPickerInteraction(config: Record<string, unknown>) {
        pickers.push(config);
        return { unregister() {} };
      },
    },
    moduleLoaders: {
      runtime: () => pendingRuntime.promise,
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const picker = pickers.find((entry) => entry.id === "autoresearch-candidate-bind-picker");
  assert.ok(picker);
  const apply = (picker.applySelection as (input: unknown) => Promise<void>)({
    parsed: {
      mode: "measure",
      candidateWorktree: "/tmp/lazy-trigger-candidate",
    },
    context: { cwd: "/tmp/lazy-trigger-controller" },
    api: {
      setText(text: string) {
        inserted = text;
      },
    },
  });
  await Promise.resolve();
  handlers.get("session_shutdown")?.();
  const campaignPicker = pickers.find((entry) => entry.id === "autoresearch-campaign-start-picker");
  assert.ok(campaignPicker);
  for (const retainedPicker of [picker, campaignPicker]) {
    const loaded = await (
      retainedPicker.loadCandidates as () =>
        | { candidates: unknown[] }
        | Promise<{ candidates: unknown[] }>
    )();
    assert.deepEqual(loaded.candidates, []);
  }
  pendingRuntime.resolve({} as AutoresearchRuntimeModule);
  await apply;
  assert.equal(inserted, "");
});

test("real concurrent run/status/control behavior keeps receipts isolated by cwd", async () => {
  const firstCwd = mkdtempSync(path.join(os.tmpdir(), "autoresearch-lazy-first-"));
  const secondCwd = mkdtempSync(path.join(os.tmpdir(), "autoresearch-lazy-second-"));
  let runtimeLoadCount = 0;
  try {
    const { tools } = registerHarness({
      moduleLoaders: {
        runtime: async () => {
          runtimeLoadCount += 1;
          return import("../src/core/runtime.ts");
        },
      },
    });
    const runTool = tools.get(AUTORESEARCH_RUN_TOOL_NAME);
    const statusTool = tools.get(AUTORESEARCH_STATUS_TOOL_NAME);
    const controlTool = tools.get(AUTORESEARCH_CONTROL_TOOL_NAME);
    assert.ok(runTool);
    assert.ok(statusTool);
    assert.ok(controlTool);

    await Promise.all([
      runTool.execute(
        "run-first",
        {
          cwd: firstCwd,
          description: "first isolated run",
          name: "lazy-first",
          metricName: "score",
          direction: "higher",
          benchmarkCommand: `node -e "console.log('METRIC score=1')"`,
          checksCommand: null,
        },
        undefined,
        undefined,
        { cwd: firstCwd },
      ),
      runTool.execute(
        "run-second",
        {
          cwd: secondCwd,
          description: "second isolated run",
          name: "lazy-second",
          metricName: "score",
          direction: "higher",
          benchmarkCommand: `node -e "console.log('METRIC score=2')"`,
          checksCommand: null,
        },
        undefined,
        undefined,
        { cwd: secondCwd },
      ),
    ]);

    assert.equal(runtimeLoadCount, 1);
    const firstReceipt = readFileSync(path.join(firstCwd, "autoresearch.jsonl"), "utf8");
    const secondReceipt = readFileSync(path.join(secondCwd, "autoresearch.jsonl"), "utf8");
    assert.match(firstReceipt, /first isolated run/u);
    assert.doesNotMatch(firstReceipt, /second isolated run/u);
    assert.match(secondReceipt, /second isolated run/u);
    assert.doesNotMatch(secondReceipt, /first isolated run/u);

    const status = await statusTool.execute(
      "status-first",
      { action: "status", cwd: firstCwd },
      undefined,
      undefined,
      { cwd: firstCwd },
    );
    assert.match(status.content[0]?.text ?? "", /current-segment runs: 1 total \/ 1 successful/u);

    const control = await controlTool.execute(
      "control-second",
      { action: "status", cwd: secondCwd },
      undefined,
      undefined,
      { cwd: secondCwd },
    );
    assert.match(control.content[0]?.text ?? "", /# PI-AUTORESEARCH CONTROL/u);
    assert.equal(runtimeLoadCount, 1);
    assert.equal(existsSync(path.join(firstCwd, "autoresearch.jsonl")), true);
    assert.equal(existsSync(path.join(secondCwd, "autoresearch.jsonl")), true);
  } finally {
    rmSync(firstCwd, { recursive: true, force: true });
    rmSync(secondCwd, { recursive: true, force: true });
  }
});
