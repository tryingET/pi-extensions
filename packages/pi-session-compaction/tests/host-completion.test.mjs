import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { completeWithHostModelRegistry } from "../extensions/session-compaction/host-completion.js";

describe("host-owned completion adapter", () => {
  it("delegates to the live model registry with its receiver and request options", async () => {
    const model = { provider: "custom", id: "summary", api: "custom-api" };
    const context = { messages: [] };
    const options = { reasoning: "high", maxTokens: 123 };
    const expected = { role: "assistant", content: [], stopReason: "stop" };
    let observed;
    const registry = {
      async completeSimple(actualModel, actualContext, actualOptions) {
        observed = { receiver: this, actualModel, actualContext, actualOptions };
        return expected;
      },
    };

    const result = await completeWithHostModelRegistry(
      { modelRegistry: registry },
      model,
      context,
      options,
    );

    assert.equal(result, expected);
    assert.deepEqual(observed, {
      receiver: registry,
      actualModel: model,
      actualContext: context,
      actualOptions: options,
    });
  });

  it("fails clearly when the host predates the completion surface", async () => {
    await assert.rejects(
      completeWithHostModelRegistry({ modelRegistry: {} }, {}, { messages: [] }),
      /update the Pi host before enabling custom compaction/,
    );
  });
});
