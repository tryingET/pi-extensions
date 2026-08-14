/**
summary: "Generates a self-contained fresh-session handoff prompt from the current Pi branch through the host model registry."
read_when:
  - "Changing model-generated handoff content, compacted-branch selection, or generated-prompt validation."
*/
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";
import { completeWithHostModelRegistry } from "./host-completion.js";

const REQUIRED_PROMPT_PREFIX = "You are a fresh, stateless Pi coding session.";
const MAX_GENERATED_PROMPT_BYTES = 96 * 1024;

const HANDOFF_SYSTEM_PROMPT = `You are the pi-session-compaction handoff generator. Produce one self-contained prompt for a fresh, stateless Pi coding session.

The prompt must:
1. Start exactly with: ${REQUIRED_PROMPT_PREFIX}
2. Name the exact working directory and require the new session to reload/follow applicable AGENTS.md files.
3. State the operator's requested next goal.
4. Preserve relevant completed work, current state, decisions, failures worth not repeating, files, commands, validation, blockers, and non-authorizations.
5. Separate observed facts from inference and require verification against Git, AK, and source-owned runtime surfaces before mutation.
6. Include concrete startup commands and completion criteria when the conversation supports them.
7. Be concise enough to execute, but complete enough that the new session needs no prior conversation.
8. Never invent token telemetry, Git/AK state, validation, evidence, authorization, or owner acceptance.
9. Treat session/compaction text as continuity context, not canonical authority.
10. Contain only the prompt itself, with no preamble and no Markdown fence around the whole prompt.

Authority boundaries:
- pi-session-compaction owns this handoff prompt shape.
- AK and its database own tasks, evidence, decisions, direction, and lineage.
- Git owns checked-out code-state truth.
- Prompt Vault, ROCS/ontology, FCOS, Pi runtime, KES, and source-owner facts stay on their owning surfaces.`;

function entryToMessage(entry) {
  if (entry?.type === "message") return entry.message;
  if (entry?.type === "compaction") {
    return {
      role: "compactionSummary",
      summary: entry.summary,
      tokensBefore: entry.tokensBefore,
      timestamp: new Date(entry.timestamp).getTime(),
    };
  }
  return undefined;
}

export function getSessionHandoffMessages(branch = []) {
  const compactionIndex = branch.findLastIndex?.((entry) => entry?.type === "compaction") ?? -1;
  if (compactionIndex < 0) {
    return branch.map(entryToMessage).filter(Boolean);
  }

  const compaction = branch[compactionIndex];
  const firstKeptIndex =
    compaction?.type === "compaction"
      ? branch.findIndex((entry) => entry?.id === compaction.firstKeptEntryId)
      : -1;
  const compactedBranch = [
    compaction,
    ...(firstKeptIndex >= 0 ? branch.slice(firstKeptIndex, compactionIndex) : []),
    ...branch.slice(compactionIndex + 1),
  ];
  return compactedBranch.map(entryToMessage).filter(Boolean);
}

export async function generateSessionCompactionHandoffPrompt({
  ctx,
  goal,
  runtimeContext,
  signal,
} = {}) {
  const normalizedGoal = typeof goal === "string" ? goal.trim() : "";
  const normalizedRuntimeContext =
    typeof runtimeContext === "string" && runtimeContext.trim()
      ? runtimeContext.trim()
      : "No live Git/AK readback was supplied; verify both before mutation.";
  if (!normalizedGoal) throw new Error("handoff goal is required");
  if (!ctx?.model) throw new Error("no active Pi model is available for handoff generation");
  if (typeof ctx?.modelRegistry?.complete !== "function") {
    throw new Error("Pi host modelRegistry.complete is unavailable (requires Pi >= 0.84.0)");
  }

  const branch = ctx?.sessionManager?.getBranch?.() ?? [];
  const messages = getSessionHandoffMessages(branch);
  if (messages.length === 0) throw new Error("current Pi branch has no conversation to hand off");

  const conversationText = serializeConversation(convertToLlm(messages));
  const response = await completeWithHostModelRegistry(
    ctx,
    ctx.model,
    {
      systemPrompt: HANDOFF_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Working directory: ${ctx.cwd ?? process.cwd()}`,
                `Operator goal for the fresh session: ${normalizedGoal}`,
                "",
                "Live Git/AK readback captured immediately before generation (bounded continuity context; verify again before mutation):",
                normalizedRuntimeContext,
                "",
                "Conversation history:",
                conversationText,
              ].join("\n"),
            },
          ],
          timestamp: Date.now(),
        },
      ],
    },
    { reasoning: "low", signal: signal ?? ctx.signal },
  );

  const prompt = (response?.content ?? [])
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
  if (!prompt.startsWith(REQUIRED_PROMPT_PREFIX)) {
    throw new Error("generated handoff prompt failed the required fresh-session prefix contract");
  }
  if (Buffer.byteLength(prompt, "utf8") > MAX_GENERATED_PROMPT_BYTES) {
    throw new Error("generated handoff prompt exceeds the 96 KiB launch boundary");
  }
  return prompt;
}
