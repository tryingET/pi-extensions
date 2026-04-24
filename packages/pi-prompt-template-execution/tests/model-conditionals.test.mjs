import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderModelConditionals } from "../src/model-conditionals.js";

function model(overrides = {}) {
  return { provider: "zai", id: "glm-5.1", ...overrides };
}

describe("model conditional renderer parity", () => {
  it("supports exact ids, provider/model specs, provider wildcards, and comma specs", () => {
    assert.equal(
      renderModelConditionals('<if-model is="glm-5.1">yes<else>no</if-model>', model()).content,
      "yes",
    );
    assert.equal(
      renderModelConditionals('<if-model is="zai/glm-5.1">yes<else>no</if-model>', model()).content,
      "yes",
    );
    assert.equal(
      renderModelConditionals('<if-model is="zai/*">yes<else>no</if-model>', model()).content,
      "yes",
    );
    assert.equal(
      renderModelConditionals(
        '<if-model is="anthropic/claude,zai/glm-5.1">yes<else>no</if-model>',
        model(),
      ).content,
      "yes",
    );
  });

  it("supports nested conditionals and else branches", () => {
    const rendered = renderModelConditionals(
      '<if-model is="zai/*">A <if-model is="glm-5.1">B<else>C</if-model><else>D</if-model>',
      model(),
    );
    assert.deepEqual(rendered, { content: "A B" });
  });

  it("leaves invalid markup unchanged and returns an external-compatible warning", () => {
    const input = '<if-model is="zai/glm-5.1">missing close';
    const rendered = renderModelConditionals(input, model(), "broken");
    assert.equal(rendered.content, input);
    assert.equal(
      rendered.error,
      "Invalid <if-model> markup in prompt `broken`: Missing closing `</if-model>` tag.",
    );
  });

  it("reports invalid attributes, orphan else, bad else close, and invalid specs", () => {
    assert.match(
      renderModelConditionals('<if-model when="x">bad</if-model>', model(), "bad").error,
      /Unknown attribute|requires an `is` attribute/,
    );
    assert.match(renderModelConditionals("<else>bad", model(), "bad").error, /orphan `<else>`/);
    assert.match(renderModelConditionals("</else>", model(), "bad").error, /not valid/);
    assert.match(
      renderModelConditionals('<if-model is="zai/*/bad">bad</if-model>', model(), "bad").error,
      /Invalid model spec/,
    );
  });
});
