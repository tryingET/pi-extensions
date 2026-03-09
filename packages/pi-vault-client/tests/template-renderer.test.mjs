import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRenderContext,
  detectTemplateRenderEngine,
  parseTemplateFrontmatter,
  prepareTemplateForExecution,
  renderTemplateContent,
  stripFrontmatter,
} from "../src/templateRenderer.js";

test("plain templates remain unchanged", () => {
  const raw = "You are a focused assistant.\nDo the thing.";
  const rendered = renderTemplateContent(raw, {
    args: ["ignored"],
    currentCompany: "software",
  });

  assert.equal(rendered.engine, "none");
  assert.equal(rendered.rendered, raw);
});

test("literal pi-vars syntax is preserved by default on generic execution paths", () => {
  const raw = "Code sample: echo $1 && echo $ARGUMENTS";
  const rendered = renderTemplateContent(raw, {
    args: ["api-client", "triage"],
    currentCompany: "software",
  });

  assert.equal(rendered.engine, "none");
  assert.equal(rendered.rendered, raw);
});

test("legacy pi-vars auto-detection only runs when a caller explicitly opts in", () => {
  const raw = `Review $1 with context: ${String.fromCharCode(36)}{@:2}`;
  const rendered = renderTemplateContent(raw, {
    args: ["api-client", "focus", "regressions"],
    currentCompany: "software",
    allowLegacyPiVarsAutoDetect: true,
  });

  assert.equal(rendered.engine, "pi-vars");
  assert.equal(rendered.rendered, "Review api-client with context: focus regressions");
});

test("explicit pi-vars templates fail clearly when no positional args are available", () => {
  const raw = `---
render_engine: pi-vars
---
Objective: $1`;

  assert.throws(
    () => renderTemplateContent(raw, { currentCompany: "software" }),
    /Pi-vars render failed: Pi-vars template requires positional args, but this execution path supplied none/,
  );
});

test("explicit pi-vars templates fail clearly when required args are missing", () => {
  const raw = `---
render_engine: pi-vars
---
Objective: $2`;

  assert.throws(
    () => renderTemplateContent(raw, { args: ["only-one"], currentCompany: "software" }),
    /Pi-vars render failed: Pi-vars template requires at least 2 positional arg\(s\), but received 1/,
  );
});

test("opt-in nunjucks templates render with governed context through the safe subset", () => {
  const raw = `---
render_engine: nunjucks
---
Objective: {{ args[0] }}
Company: {{ current_company }}
Context: {{ context }}
Argument line: {{ arguments }}`;
  const rendered = renderTemplateContent(raw, {
    args: ["ship templating"],
    currentCompany: "software",
    context: "phase-1",
  });

  assert.equal(rendered.engine, "nunjucks");
  assert.equal(
    rendered.rendered,
    "Objective: ship templating\nCompany: software\nContext: phase-1\nArgument line: ship templating",
  );
  assert.deepEqual(rendered.usedRenderKeys.sort(), [
    "args",
    "arguments",
    "context",
    "current_company",
  ]);
});

test("nunjucks blocks are rejected clearly", () => {
  const raw = `---
render_engine: nunjucks
---
{% if args[0] %}broken{% endif %}`;

  assert.throws(
    () => renderTemplateContent(raw, { args: ["x"] }),
    /Nunjucks render failed: Unsupported Nunjucks syntax:/,
  );
});

test("unsafe nunjucks expressions are rejected clearly", () => {
  const raw = `---
render_engine: nunjucks
---
{{ ''.constructor.constructor("return process")() }}`;

  assert.throws(
    () => renderTemplateContent(raw, { args: ["x"] }),
    /Nunjucks render failed: Unsafe Nunjucks expression:/,
  );
});

test("invalid explicit render_engine fails clearly", () => {
  const raw = `---
render_engine: liquid
---
hello`;

  assert.throws(() => renderTemplateContent(raw), /Unsupported render_engine: liquid/);
});

test("frontmatter helpers strip metadata and expose render contract", () => {
  const raw = `---
render_engine: none
description: demo
---
Body`;
  const parsed = parseTemplateFrontmatter(raw);
  const detected = detectTemplateRenderEngine(raw);

  assert.equal(parsed.attributes.render_engine, "none");
  assert.equal(stripFrontmatter(raw), "Body");
  assert.equal(detected.engine, "none");
  assert.equal(detected.explicitEngine, "none");
});

test("frontmatter parsing accepts CRLF-authored templates", () => {
  const raw = `---\r
render_engine: nunjucks\r
description: demo\r
---\r
Company: {{ current_company }}`;
  const parsed = parseTemplateFrontmatter(raw);
  const detected = detectTemplateRenderEngine(raw);
  const rendered = renderTemplateContent(raw, { currentCompany: "software" });

  assert.equal(parsed.attributes.render_engine, "nunjucks");
  assert.equal(detected.engine, "nunjucks");
  assert.equal(rendered.rendered, "Company: software");
});

test("buildRenderContext exposes only explicit governed fields", () => {
  const context = buildRenderContext({
    args: ["a", "b"],
    currentCompany: "software",
    context: "ctx",
    templateName: "demo-template",
    data: { workflow: "ship" },
  });

  assert.deepEqual(context.args, ["a", "b"]);
  assert.equal(context.arguments, "a b");
  assert.equal(context.current_company, "software");
  assert.equal(context.context, "ctx");
  assert.equal(context.template_name, "demo-template");
  assert.equal(context.arg1, "a");
  assert.equal(context.arg2, "b");
  assert.equal(context.workflow, "ship");
  assert.equal(Object.hasOwn(context, "env"), false);
});

test("buildRenderContext does not let extra data override governed keys", () => {
  const context = buildRenderContext({
    args: ["a"],
    currentCompany: "software",
    context: "ctx",
    templateName: "demo-template",
    data: {
      current_company: "overridden",
      context: "shadow",
      template_name: "shadowed",
      arg1: "shadowed",
      arguments: "shadowed",
      workflow: "ship",
    },
  });

  assert.equal(context.current_company, "software");
  assert.equal(context.context, "ctx");
  assert.equal(context.template_name, "demo-template");
  assert.equal(context.arg1, "a");
  assert.equal(context.arguments, "a");
  assert.equal(context.workflow, "ship");
});

test("prepareTemplateForExecution appends context for nunjucks templates that do not reference it", () => {
  const raw = `---
render_engine: nunjucks
---
Company: {{ current_company }}
Template: {{ template_name }}`;
  const prepared = prepareTemplateForExecution(raw, {
    currentCompany: "software",
    templateName: "demo-template",
    context: "ctx",
  });

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.engine, "nunjucks");
  assert.equal(prepared.prepared, "Company: software\nTemplate: demo-template\n\n## CONTEXT\nctx");
  assert.equal(prepared.contextAppended, true);
});

test("prepareTemplateForExecution does not append context when a nunjucks template references it explicitly", () => {
  const raw = `---
render_engine: nunjucks
---
Company: {{ current_company }}
Context: {{ context }}`;
  const prepared = prepareTemplateForExecution(raw, {
    currentCompany: "software",
    context: "ctx",
  });

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.prepared, "Company: software\nContext: ctx");
  assert.equal(prepared.contextAppended, false);
});

test("prepareTemplateForExecution preserves literal braces from substituted values", () => {
  const raw = `---
render_engine: nunjucks
---
Context: {{ context }}`;
  const prepared = prepareTemplateForExecution(raw, {
    currentCompany: "software",
    context: "literal {{user.name}} token",
  });

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.prepared, "Context: literal {{user.name}} token");
  assert.equal(prepared.contextAppended, false);
});

test("prepareTemplateForExecution returns structured failure", () => {
  const raw = `---
render_engine: nunjucks
---
{{ ''.constructor.constructor("return process")() }}`;
  const prepared = prepareTemplateForExecution(raw, {
    args: ["x"],
    currentCompany: "software",
  });

  assert.deepEqual(prepared.ok, false);
  if (prepared.ok) return;
  assert.match(prepared.error, /Nunjucks render failed: Unsafe Nunjucks expression:/);
});
