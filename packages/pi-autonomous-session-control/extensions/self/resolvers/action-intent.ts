// summary: bounded action grammar; mentioning a command does not invoke it.
export const SELF_EVOLUTION_CONTINUATION_PREFILL_ALIASES = [
  "continue with self-evolution",
  "continue self-evolution",
  "continue visible self-evolution",
] as const;

function normalizeCommand(query: string): string {
  // Do not compatibility-normalize command separators: payload extraction uses
  // the original query, so accepting a different separator could change meaning.
  return query.replace(/\s+/gu, " ").trim().toLowerCase();
}

export function isSelfEvolutionContinuationPrefillQuery(query: string): boolean {
  const command = normalizeCommand(query)
    .replace(/\s*[.!]+$/u, "")
    .trim();
  return SELF_EVOLUTION_CONTINUATION_PREFILL_ALIASES.some((alias) => command === alias);
}

function acceptsPayload(command: string, head: RegExp, unquotedPrefix: RegExp): boolean {
  const match = command.match(head);
  if (!match) return false;
  const tail = command.slice(match[0].length).trim();
  // Explicit colon/quoted payloads are data, including questions and negations.
  if (!tail || tail.startsWith(":") || /^("[^"]*"|'[^']*')$/u.test(tail)) return true;
  // Non-colon conveniences are intentionally narrow, not natural-language
  // authorization parsing. Use colon syntax for arbitrary payload text.
  return (
    unquotedPrefix.test(tail) &&
    !/[?;]/u.test(tail) &&
    !/\b(?:not|don't|never|avoid|cancel|instead|no)\b/u.test(tail.replace(/[‘’ʼ]/gu, "'"))
  );
}

/** Strip only established editor opt-outs, never arbitrary trailing prose. */
function previewCommand(command: string): string | undefined {
  const [head, ...tail] = command.split(/[,;]/u);
  if (tail.length === 0) return command;
  const optOut = tail
    .join(";")
    .trim()
    .replace(/[‘’ʼ]/gu, "'")
    .replace(/[‐‑‒–—―]/gu, "-");
  return /^(?:show[- ]only|(?:do[- ]not|don't|no|never|avoid)[- ]prefill)$/u.test(optOut)
    ? head.trim()
    : undefined;
}

/** Prevent rejected action-like requests from falling into stateful observation routes. */
export function isUnsupportedActionRequest(query: string): boolean {
  // Normalize refusal typography only for rejection, never for authorization.
  const command = normalizeCommand(query)
    .replace(/[‘’ʼ]/gu, "'")
    .replace(/^["'`“]/u, "")
    .replace(/^please /u, "")
    .replace(
      /^(?:do[- ]not|don't|never|no|avoid|explain|describe|(?:should|can|could|would) i|what (?:is|does)|how (?:do|does)) /u,
      "",
    );
  // Keep every supported action family here, including route/diagnostic heads.
  // This is a rejection envelope, not a second permissive command parser.
  return (
    /^(?:(?:create|show(?: prefill)?|prefill) (?:the )?)?(?:(?:compaction|fresh[- ]session|self-contained) )?handoff prompt\b/u.test(
      command,
    ) ||
    /^(?:prefill\b|(?:create|mark) checkpoint\b|save point\b|queue follow[- ]?up\b|remind me\b|continue (?:safely|suggested next move)\b|(?:send|advance) suggested next move\b|next (?:autonomous|safe) step\b|(?:record|queue) continuation candidate\b|remember next autonomous step\b|notify (?:operator|user)\b|message operator\b|send (?:operator message|user ?message)\b|sendusermessage\b)/u.test(
      command,
    ) ||
    /^continue (?:(?:with |visible )?self-evolution|diagnostic review|self diagnostic)\b/u.test(
      command,
    ) ||
    /^send diagnostic (?:review|follow-?up)\b/u.test(command) ||
    /^(?:launch|run|start) (?:visible[- ]loop self-evolution|self-evolution (?:visible-loop|loop)|autoresearch campaign|measured campaign)\b/u.test(
      command,
    ) ||
    /^record this friction\b/u.test(command)
  );
}

/** Unknown requests fail closed. Payloads belong to their explicit command head. */
export function mapActionIntent(query: string): string {
  const command = normalizeCommand(query).replace(/^please /u, "");
  if (/^prefill\s*:/u.test(command)) return "prefill_editor";
  if (
    /^(?:notify operator|notify user|message operator|send operator message|sendusermessage)(?:\s*:|$)/u.test(
      command,
    ) ||
    /^send user\s*message\s*:/u.test(command)
  )
    return "send_user_message";
  if (
    /^(?:record continuation candidate|queue continuation candidate|remember next autonomous step)(?:\s*:|$)/u.test(
      command,
    )
  ) {
    return "record_continuation_candidate";
  }
  if (
    acceptsPayload(
      command,
      /^(?:(?:create|mark) checkpoint|save point)(?=\s|:|$)/u,
      /^(?:before|after|for)\s+\S/u,
    )
  ) {
    return "create_checkpoint";
  }
  if (
    acceptsPayload(
      command,
      /^(?:queue follow[- ]?up|remind me)(?=\s|:|$)/u,
      /^(?:later(?: to)?|to|for)\s+\S/u,
    )
  ) {
    return "queue_followup";
  }

  const queryAlias = command.replace(/[.!?]+$/u, "").trim();
  if (
    [
      "action summary",
      "what checkpoints",
      "list checkpoints",
      "what followups",
      "list followups",
      "pending followups",
      "what follow-ups",
      "list follow-ups",
    ].includes(queryAlias)
  ) {
    return "list_action_state";
  }
  const exact = command.replace(/[.!]+$/u, "").trim();
  if (
    [
      "continue suggested next move",
      "continue safely",
      "next autonomous step",
      "next safe step",
      "send suggested next move",
      "advance suggested next move",
      "send user message",
    ].includes(exact)
  )
    return "continue_suggested_next_move";
  if (isSelfEvolutionContinuationPrefillQuery(command))
    return "prefill_visible_loop_self_evolution";
  if (
    [
      "continue diagnostic review",
      "continue self diagnostic",
      "send diagnostic review",
      "send diagnostic followup",
      "send diagnostic follow-up",
    ].includes(exact)
  )
    return "continue_diagnostic_review";
  if (
    /^(?:prefill|launch|run|start) (?:visible[- ]loop self-evolution|self-evolution (?:visible-loop|loop))(?: for self-evolution)?$/u.test(
      exact,
    )
  ) {
    return exact.startsWith("prefill")
      ? "prefill_visible_loop_self_evolution"
      : "launch_visible_loop_self_evolution";
  }
  if (
    /^(?:prefill|launch|run|start) (?:autoresearch campaign|measured campaign)(?: for self-evolution)?$/u.test(
      exact,
    )
  ) {
    return exact.startsWith("prefill")
      ? "prefill_autoresearch_campaign"
      : "launch_autoresearch_campaign";
  }
  if (
    /^prefill (?:diagnostic record|agent_vent record|vent record)$/u.test(exact) ||
    /^record this friction(?:\s*:|$)/u.test(command)
  )
    return "prefill_diagnostic_record";

  const preview = previewCommand(command);
  // Handoff generation returns text; the separate editor policy owns any write.
  if (
    preview &&
    /^(?:(?:create|show(?: prefill)?|prefill) (?:the )?)?(?:(?:compaction|fresh[- ]session|self-contained) )?handoff prompt[.!]?$/u.test(
      preview,
    )
  ) {
    return "self_contained_handoff_prompt";
  }
  // Preserve the established non-colon preview alias. Structural prefill
  // ownership suppresses sends at delivery, even when an opt-out is present.
  if (preview === "prefill continue safely") return "continue_suggested_next_move";
  if (
    /^prefill(?: editor| (?:the )?(?:suggested )?next move|\s+"[^"]*"|\s+'[^']*')?$/u.test(exact)
  ) {
    return "prefill_editor";
  }
  return "unknown";
}
