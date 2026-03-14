import * as templateRenderer from "./templateRenderer.js";

function asErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function prepareFromRenderedContent(rendered, options = {}) {
  const context = options.context ? String(options.context) : "";
  const appendContextSection = options.appendContextSection ?? true;
  const referencesContext = Array.isArray(rendered?.usedRenderKeys)
    ? rendered.usedRenderKeys.includes("context")
    : false;
  const contextAppended = Boolean(context) && appendContextSection && !referencesContext;

  return {
    ok: true,
    ...rendered,
    prepared: contextAppended
      ? `${rendered.rendered}\n\n## CONTEXT\n${context}`
      : rendered.rendered,
    contextAppended,
  };
}

export function detectTemplatePreparationMode(renderer = templateRenderer) {
  if (typeof renderer?.prepareTemplateForExecution === "function") return "native";
  if (typeof renderer?.renderTemplateContent === "function") return "render-content-fallback";
  return "unavailable";
}

export function prepareTemplateForExecutionCompat(raw, options = {}, renderer = templateRenderer) {
  const mode = detectTemplatePreparationMode(renderer);

  if (mode === "native") {
    return renderer.prepareTemplateForExecution(raw, options);
  }

  if (mode === "render-content-fallback") {
    try {
      const rendered = renderer.renderTemplateContent(raw, options);
      return prepareFromRenderedContent(rendered, options);
    } catch (error) {
      return {
        ok: false,
        error: asErrorMessage(error),
      };
    }
  }

  return {
    ok: false,
    error:
      "templateRenderer contract unavailable: expected prepareTemplateForExecution or renderTemplateContent",
  };
}
