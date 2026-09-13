// summary: truthful self action receipts; suggestions and failed sends never imply editor writes.
// read_when: changing self action output or follow-up safety fallback reporting.
import type { EditorDelivery } from "./editor-prefill.ts";
import type { FollowUpSendEvaluation } from "./follow-up-policy.ts";

export interface ActionDelivery {
  hasActionText: boolean;
  prefillSuggested: boolean;
  editor: EditorDelivery;
  didSendUserMessage: boolean;
  blockedSlashPolicy: boolean;
  blockedFollowUpPolicy: boolean;
  sendEvaluation: FollowUpSendEvaluation | undefined;
  sendFailed: boolean;
}

export function shapeActionDeliveryData(data: unknown, delivery: ActionDelivery): unknown {
  if (!delivery.hasActionText || typeof data !== "object" || data === null || Array.isArray(data))
    return data;
  const source = data as Record<string, unknown>;
  const { editor, sendEvaluation } = delivery;
  return {
    ...source,
    dispatchMode:
      source.dispatchMode === "operator_submit_required" && editor.outcome !== "prefilled"
        ? "operator_manual_submit_required"
        : source.dispatchMode,
    userMessageSent: delivery.didSendUserMessage,
    ...(source.launchMechanism === "operator_reviews_prefilled_editor_then_presses_enter" &&
    editor.outcome !== "prefilled"
      ? { launchMechanism: "operator_reviews_returned_text_then_submits" }
      : {}),
    editorDelivery: editor,
    prefillSuggested: delivery.prefillSuggested,
    prefillRequested: editor.requested,
    prefillPerformed: editor.outcome === "prefilled",
    prefillAvailable: editor.available,
    ...(editor.requested ? { requestedDispatchMode: source.dispatchMode } : {}),
    ...(["no_ui", "editor_state_unavailable"].includes(editor.outcome)
      ? { prefillUnavailableReason: editor.outcome }
      : {}),
    ...(["nonempty_draft", "draft_changed", "write_failed", "write_unconfirmed"].includes(
      editor.outcome,
    )
      ? { prefillBlockedReason: editor.outcome }
      : {}),
    ...(delivery.blockedSlashPolicy
      ? {
          userMessageBlockedReason: "unapproved_slash_command_send_user_message",
          safetyPrefillPerformed: false,
        }
      : {}),
    ...(delivery.sendFailed ? { userMessageSendFailed: true, safetyPrefillPerformed: false } : {}),
    ...(delivery.blockedFollowUpPolicy && sendEvaluation
      ? {
          userMessageBlockedReason: `self_driving_${sendEvaluation.blockedReason}`,
          followUpClass: sendEvaluation.followUpClass,
          followUpMode: sendEvaluation.mode,
          ...(sendEvaluation.blockedReason === "budget_exhausted"
            ? {
                consecutiveFollowUpSends: sendEvaluation.consecutive,
                maxConsecutiveFollowUpSends: sendEvaluation.maxConsecutive,
              }
            : {}),
          safetyPrefillPerformed: false,
        }
      : {}),
  };
}

export function formatActionDeliveryText(
  answer: string,
  delivery: ActionDelivery,
  text: string,
): string {
  const { editor, sendEvaluation } = delivery;
  if (editor.outcome === "prefilled")
    return answer.replace("Editor prefill suggested", "Editor prefilled");
  const suggestion = `Editor unchanged. Copy/review manually before acting. Text:\n\n${text}`;
  if (editor.requested) {
    const reason = {
      no_ui: "Editor prefill unavailable (no UI)",
      editor_state_unavailable:
        "Editor prefill unavailable (draft cannot be safely observed in this UI)",
      nonempty_draft: "Editor prefill blocked (existing operator draft preserved)",
      draft_changed: "Editor prefill blocked (intervening operator edit preserved)",
      write_failed:
        "Editor prefill failed; editor state may have changed. No retry or fallback send attempted",
      write_unconfirmed:
        "Editor prefill could not be confirmed by readback. No retry or fallback send attempted",
      shown: "Editor prefill not performed",
      prefilled: "Editor prefilled",
    }[editor.outcome];
    return `${reason}. Manual operator review/submission required. Text:\n\n${text}`;
  }
  if (delivery.blockedSlashPolicy)
    return `User-message dispatch blocked by ASC slash-command policy. ${suggestion}`;
  if (delivery.sendFailed)
    return `Follow-up user message failed at the pi.sendUserMessage seam. No editor fallback was requested. ${suggestion}`;
  if (delivery.blockedFollowUpPolicy && sendEvaluation) {
    const reason =
      sendEvaluation.blockedReason === "budget_exhausted"
        ? `Self-driving budget exhausted: ${sendEvaluation.consecutive}/${sendEvaluation.maxConsecutive} consecutive extension-originated follow-ups since the last operator message.`
        : sendEvaluation.blockedReason === "dedup_suppressed"
          ? "Identical follow-up text was already sent inside the dedup cooldown window; suppressing to avoid a silent retry loop."
          : `Self-driving mode '${sendEvaluation.mode}' does not allow '${sendEvaluation.followUpClass}' follow-up sends.`;
    return `${reason} ${suggestion}`;
  }
  if (delivery.prefillSuggested) return `No explicit editor prefill requested. ${suggestion}`;
  if (delivery.didSendUserMessage)
    return answer
      .replace("User-message continuation suggested", "User-message continuation sent")
      .replace("User-message dispatch suggested", "User-message dispatch sent")
      .replace("Owner-bridge launch suggested", "Owner-bridge launch sent")
      .replace("Diagnostic-review continuation suggested", "Diagnostic-review continuation sent");
  return answer;
}
