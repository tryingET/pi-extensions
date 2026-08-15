/**
 * Direct user-message action helpers for ASC/self.
 *
 * Explicit low-risk notifications may be sent through pi.sendUserMessage by
 * the tool wrapper. Risky directives and likely secrets fail closed to prefill.
 */

import { normalizeInput, normalizeString } from "../edge-contract-kernel.ts";
import {
  isAffirmativelyLowRiskContinuationCommand,
  messageLooksActionDirective,
  messageLooksSensitive,
  messageLooksSlashCommand,
} from "../follow-up-policy.ts";
import type { SelfQuery, SelfResponse } from "../types.ts";
import { extractQuotedContent } from "./helpers.ts";

const DECLARED_MESSAGE_KINDS = new Set(["notification", "status", "continuation"]);

export function handleDirectUserMessage(query: SelfQuery): SelfResponse {
  const context = normalizeInput(query.context);
  const declaredKind = readDeclaredKind(context);
  const text = extractDirectUserMessageText(query, context);

  if (!text) {
    return {
      understood: true,
      intent: "action",
      answer:
        "sendUserMessage is available through self, but I need explicit message text. Use `notify operator: <message>` or provide context.text/message.",
      data: {
        sendUserMessage: false,
        prefill: false,
        dispatchMode: "missing_message_text",
        availableAction: "pi.sendUserMessage",
      },
      suggestions: [
        "notify operator: I finished validation and need reload for live dogfood.",
        "send user message: Continuing autonomously with the verified local slice.",
      ],
    };
  }

  if (messageLooksSensitive(text)) {
    return {
      understood: true,
      intent: "action",
      answer:
        "User message was not sent because the text looks like it may contain secret material. Prefill or rewrite a sanitized notification instead.",
      data: {
        text,
        sendUserMessage: false,
        prefill: false,
        dispatchMode: "blocked_sensitive_message",
        boundary:
          "self may send explicit low-risk operator notifications through pi.sendUserMessage, but it must not transmit likely secrets or raw credentials.",
      },
      suggestions: ["notify operator: Sanitized status summary without secrets"],
    };
  }

  if (messageLooksSlashCommand(text)) {
    return buildPrefillResponse(text, {
      sendUserMessage: false,
      dispatchMode: "operator_submit_required",
      reason:
        "Direct user-message text contains a slash-command-looking token; keep it as editor prefill so the operator can submit it through Pi's slash-command parser.",
      boundary:
        "Extension-originated pi.sendUserMessage does not invoke Pi slash-command expansion. ASC/self must not inject command-looking text as a follow-up or become a hidden loop runner.",
    });
  }

  if (messageLooksActionDirective(text)) {
    return buildPrefillResponse(text, {
      sendUserMessage: false,
      dispatchMode: "operator_review_required",
      reason:
        "Direct user-message text looks like an action directive or high-risk control-plane instruction; keep it as editor prefill instead of injecting it as a follow-up.",
      boundary:
        "Explicit sendUserMessage is for low-risk status/continuation notifications. Commands, peer/harness work, compaction, commits, deletes, durable records, and owner-surface writes require operator review.",
    });
  }

  if (declaredKind === "continuation" && !hasLowRiskContinuationAction(text)) {
    return buildPrefillResponse(text, {
      sendUserMessage: false,
      dispatchMode: "operator_review_required",
      declaredKind,
      reason:
        "Declared continuation messages must name an affirmatively low-risk local validation command; the text scan found none, so the declaration fails closed to editor prefill.",
      boundary:
        "Declarations do not bypass validation. A declared continuation is only sendable when its action line matches the shared low-risk continuation allowlist and the denylist scans stay clean.",
    });
  }

  return {
    understood: true,
    intent: "action",
    answer: `User-message dispatch suggested: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`,
    data: {
      text,
      sendUserMessage: true,
      prefill: false,
      dispatchMode: "operator_notification",
      ...(declaredKind ? { declaredKind } : {}),
      boundary:
        "Explicit low-risk operator notification only; not AK evidence, not a decision, and not durable diagnostic recording.",
    },
  };
}

function extractDirectUserMessageText(query: SelfQuery, context: Record<string, unknown>): string {
  const fromContext =
    normalizeString(context.text) ||
    normalizeString(context.message) ||
    normalizeString(context.notification);
  if (fromContext) return clampUserMessageText(fromContext);

  const colonMatch = query.query.match(
    /(?:notify\s+(?:operator|user)|message\s+operator|send\s+(?:operator\s+message|user\s*message|usermessage)|sendusermessage)\s*:\s*([\s\S]+)$/i,
  );
  const text = normalizePrefillText(colonMatch?.[1]) || extractQuotedContent(query.query);
  return text ? clampUserMessageText(text) : "";
}

function readDeclaredKind(context: Record<string, unknown>): string | undefined {
  const declared = normalizeString(context.kind);
  return declared && DECLARED_MESSAGE_KINDS.has(declared) ? declared : undefined;
}

function hasLowRiskContinuationAction(text: string): boolean {
  return text.split("\n").some((line) => isAffirmativelyLowRiskContinuationCommand(line.trim()));
}

function clampUserMessageText(text: string): string {
  return text.trim().slice(0, 2000);
}

function buildPrefillResponse(text: string, extraData: Record<string, unknown> = {}): SelfResponse {
  const operatorSubmitSuffix =
    extraData.dispatchMode === "operator_submit_required"
      ? ". Operator submission required: review the editor text, then press Enter to send it through Pi's slash-command parser."
      : "";
  return {
    understood: true,
    intent: "action",
    answer: `Editor prefill suggested: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"${operatorSubmitSuffix}`,
    data: { text, prefill: true, ...extraData },
  };
}

function normalizePrefillText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const quoted = trimmed.match(/^"([\s\S]*)"$/) || trimmed.match(/^'([\s\S]*)'$/);
  return (quoted?.[1] ?? trimmed).replace(/\\"/g, '"').replace(/\\'/g, "'");
}
