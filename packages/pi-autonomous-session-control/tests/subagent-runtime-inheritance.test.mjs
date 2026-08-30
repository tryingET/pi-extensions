import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BETTER_OPENAI_FAST_STATE_EVENT,
  registerSubagentRuntimeInheritance,
} from "../extensions/self/subagent-runtime-inheritance.ts";

const FAST_CHILD_EXTENSION_SOURCE = fileURLToPath(
  new URL("../../pi-better-openai/extensions/fast-child.ts", import.meta.url),
);
const FAST_EXTENSION_SOURCE = fileURLToPath(
  new URL("../../pi-better-openai/extensions/fast.ts", import.meta.url),
);
const BETTER_OPENAI_PACKAGE_ROOT = fileURLToPath(
  new URL("../../pi-better-openai", import.meta.url),
);

function harness() {
  const busHandlers = new Map();
  const lifecycle = new Map();
  return {
    lifecycle,
    pi: {
      events: {
        emit(channel, payload) {
          busHandlers.get(channel)?.(payload);
        },
        on(channel, handler) {
          busHandlers.set(channel, handler);
          return () => busHandlers.delete(channel);
        },
      },
      on(name, handler) {
        lifecycle.set(name, handler);
      },
      getCommands() {
        return [
          {
            name: "fast",
            source: "extension",
            sourceInfo: {
              path: FAST_EXTENSION_SOURCE,
              baseDir: BETTER_OPENAI_PACKAGE_ROOT,
              origin: "package",
            },
          },
        ];
      },
    },
  };
}

test("runtime inheritance tracks only valid Better OpenAI fast-state events", () => {
  const { pi, lifecycle } = harness();
  const provider = registerSubagentRuntimeInheritance(pi);

  pi.events.emit(BETTER_OPENAI_FAST_STATE_EVENT, {
    schema: "wrong",
    mode: "on",
    childExtensionSource: "/tmp/fast-child.ts",
  });
  assert.equal(provider(), undefined);

  pi.events.emit(BETTER_OPENAI_FAST_STATE_EVENT, {
    schema: "pi.better_openai.fast_state.v1",
    mode: "on",
    childExtensionSource: "/tmp/ignored-untrusted-payload-path.ts",
  });
  assert.equal(provider().betterOpenAIFast.childExtensionSource, FAST_CHILD_EXTENSION_SOURCE);

  pi.events.emit(BETTER_OPENAI_FAST_STATE_EVENT, {
    schema: "pi.better_openai.fast_state.v1",
    mode: "off",
    childExtensionSource: FAST_CHILD_EXTENSION_SOURCE,
  });
  assert.deepEqual(provider(), {
    betterOpenAIFast: {
      mode: "off",
      childExtensionSource: FAST_CHILD_EXTENSION_SOURCE,
    },
  });

  lifecycle.get("session_shutdown")();
  pi.events.emit(BETTER_OPENAI_FAST_STATE_EVENT, {
    schema: "pi.better_openai.fast_state.v1",
    mode: "on",
    childExtensionSource: "/opt/other.ts",
  });
  assert.equal(provider().betterOpenAIFast.mode, "off");
});
