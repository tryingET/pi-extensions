/**
summary: "Fit the complete rendered packet, preserving explicit omissions and host headroom."
read_when:
  - "Changing output ceilings, tokenizer fallback, or post-render selection."
*/
import { compactSessionContextUsage } from "./session-context.js";
import {
  buildDogfoodObservationTemplate,
  buildMeasurementHints,
  buildMeasurementReceipt,
} from "./session-measurement.js";

const bytes = (text) => Buffer.byteLength(text, "utf8");
const nonnegative = (value) => Number.isSafeInteger(value) && value >= 0;

export function outputLimits(budget = {}, env = {}) {
  const configured = nonnegative(budget.maxTokens) ? budget.maxTokens : 40_000;
  const reserve = nonnegative(budget.reserveTokens) ? budget.reserveTokens : 0;
  const usage = compactSessionContextUsage(env.contextUsage);
  const remaining = nonnegative(env.remainingInputTokens)
    ? env.remainingInputTokens
    : nonnegative(usage.tokens) && nonnegative(usage.windowTokens)
      ? Math.max(0, usage.windowTokens - usage.tokens)
      : null;
  const tokens = Math.max(0, Math.min(configured, remaining ?? configured) - reserve);
  // An estimate is not a tokenizer guarantee. The independently enforced byte cap is exact.
  const exactCounter = typeof env.countTokens === "function" ? env.countTokens : null;
  const maxBytes = Math.min(
    nonnegative(budget.maxBytes) ? budget.maxBytes : configured * 4,
    exactCounter ? Number.MAX_SAFE_INTEGER : tokens * 2,
  );
  return { tokens, maxBytes, remaining, reserve, exactCounter };
}

function refresh(result) {
  const { packet, plan } = result;
  const sections = packet.sections;
  for (const section of sections) {
    section.bytes = section.items.reduce((sum, item) => sum + item.bytes, 0);
    section.estimatedTokens = section.items.reduce((sum, item) => sum + item.estimatedTokens, 0);
  }
  const estimatedTokens = sections.reduce((sum, section) => sum + section.estimatedTokens, 0);
  packet.totals = {
    ...packet.totals,
    estimatedTokens,
    bytes: sections.reduce((sum, section) => sum + section.bytes, 0),
    candidatesSelected: sections.reduce((sum, section) => sum + section.items.length, 0),
    candidatesOmitted: packet.omissions.length,
  };
  packet.measurementReceipt = buildMeasurementReceipt({
    estimatedTokens,
    sections,
    omissions: packet.omissions,
    budget: packet.budget,
    sessionAwareness: packet.measurementReceipt.sessionAwareness,
  });
  packet.measurementHints = buildMeasurementHints(packet.measurementReceipt, packet.budget);
  packet.dogfoodObservationTemplate = buildDogfoodObservationTemplate({
    objective: packet.objective,
    generatedAt: packet.generatedAt,
    totals: packet.totals,
    sections,
    omissions: packet.omissions,
    measurementReceipt: packet.measurementReceipt,
    providerPlans: plan.providerPlans,
  });
}

/** The input is never mutated. A budget too small for a refusal gets empty error content. */
export function fitRenderedPacket(input, env, render) {
  const limits = outputLimits(input.plan?.budget ?? input.packet?.budget, env);
  const result = structuredClone(input);
  let removedItems = 0;
  let reason = input.ok ? null : "invalid_request";
  const cost = (text) => {
    const value = limits.exactCounter ? limits.exactCounter(text) : Math.ceil(bytes(text) / 2);
    if (!nonnegative(value)) throw new Error("Invalid tokenizer result");
    return value;
  };
  const fits = (text) => bytes(text) <= limits.maxBytes && cost(text) <= limits.tokens;
  let text = "";
  try {
    if (result.ok) {
      refresh(result);
      text = render(result, env.diagnostics === true);
      while (!fits(text) && result.packet.sections.some((section) => section.items.length)) {
        const section = result.packet.sections.findLast((entry) => entry.items.length);
        section.items.pop();
        removedItems++;
        result.packet.sections = result.packet.sections.filter((entry) => entry.items.length);
        result.packet.omissions = result.packet.omissions.filter(
          (entry) => entry.reason !== "rendered_budget",
        );
        result.packet.omissions.push({
          provider: "packet",
          reason: "rendered_budget",
          detail: `${removedItems} item(s) omitted to fit complete output. Narrow scope or raise the budget.`,
        });
        refresh(result);
        text = render(result, env.diagnostics === true);
      }
      if (!fits(text)) reason = "insufficient_output_budget";
    }
    if (reason) {
      text = `Context packet refused: ${reason}. Narrow the request or provide more headroom.`;
      if (!fits(text)) text = "";
    }
    return {
      ok: !reason,
      result,
      text,
      accounting: {
        scope: "complete_model_visible_text",
        method: limits.exactCounter
          ? "host_tokenizer"
          : "conservative_estimate_2_utf8_bytes_per_token",
        exactTokens: Boolean(limits.exactCounter),
        bytes: bytes(text),
        tokens: cost(text),
        maxBytes: limits.maxBytes,
        maxTokens: limits.tokens,
        reserveTokens: limits.reserve,
        hostRemainingTokens: limits.remaining,
        removedItems,
        reason,
      },
    };
  } catch {
    return {
      ok: false,
      result,
      text: "",
      accounting: { reason: "token_accounting_failed", bytes: 0, removedItems },
    };
  }
}
