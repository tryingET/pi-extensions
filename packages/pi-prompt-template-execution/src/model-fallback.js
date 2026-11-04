/**
 * summary: "owns one prompt override attempt and safe pre-output fallback at final settlement."
 * read_when:
 *   - "changing initial provider-error recovery, no-replay guards, or session-state ownership."
 */
import {
  executePromptTemplateCommand,
  restorePromptTemplateSessionState,
} from "./command-runner.js";
import { renderPromptForResolvedModel } from "./execution-plan.js";
import { createPiPromptTemplateHostAdapter } from "./host-adapter.js";

const sameModel = (a, b) => Boolean(a && b && a.provider === b.provider && a.id === b.id);
const modelRef = (model) => `${model.provider}/${model.id}`;
const hasContent = (message) =>
  message?.role === "assistant" &&
  message.content?.some(
    (part) =>
      part.type === "toolCall" ||
      (part.type === "text"
        ? part.text?.length
        : part.type === "thinking"
          ? part.thinking?.length
          : true),
  );
const userText = (message) =>
  message?.role === "user" &&
  Array.isArray(message.content) &&
  message.content.every((part) => part.type === "text")
    ? message.content.map((part) => part.text).join("\n")
    : undefined;

export function createLivePromptRunner(pi) {
  let active;
  let internalModel;
  // Events can arrive after their originating run settles. Retain only their
  // expected transition records, never the whole completed invocation.
  const transitions = [];
  const owns = (run) => active === run && !run.cancelled;

  function consumeThinking(event) {
    const index = transitions.findIndex(
      ({ from, to }) => from === event.previousLevel && to === event.level,
    );
    if (index >= 0) transitions.splice(index, 1);
    else if (active) {
      active.cancelled = true;
      active.manualThinking = event.level;
    }
  }

  function hostFor(ctx, run) {
    const host = createPiPromptTemplateHostAdapter(pi, ctx);
    const setModel = host.setModel;
    const setThinking = host.setThinking;
    function begin() {
      run.mutations++;
      return {
        thinking: pi.getThinkingLevel?.(),
        ids: new Set(ctx.sessionManager?.getBranch?.().map((entry) => entry.id) ?? []),
      };
    }
    function end(before, model) {
      let from = before.thinking;
      let to = pi.getThinkingLevel?.();
      if (model) {
        // Pi appends model_change immediately before its synchronous default
        // thinking change. Use those public session entries, not an aggregate
        // across the await that could also contain a manual thinking selection.
        const branch = ctx.sessionManager?.getBranch?.() ?? [];
        const index = branch.findLastIndex(
          (entry) =>
            !before.ids.has(entry.id) &&
            entry.type === "model_change" &&
            entry.provider === model.provider &&
            entry.modelId === model.id,
        );
        to = undefined;
        if (index >= 0 && branch[index + 1]?.type === "thinking_level_change") {
          for (const entry of branch.slice(0, index)) {
            if (entry.type === "thinking_level_change") from = entry.thinkingLevel;
          }
          to = branch[index + 1].thinkingLevel;
        }
      }
      if (to !== undefined && from !== to) transitions.push({ from, to });
      if (--run.mutations === 0) {
        for (const event of run.thinkingEvents.splice(0)) consumeThinking(event);
      }
    }
    async function switchOwned(model) {
      const before = begin();
      internalModel = model;
      try {
        return await setModel(model);
      } finally {
        internalModel = undefined;
        end(before, model);
      }
    }
    host.setModel = async (model) => {
      const ok = await switchOwned(model);
      // A manual selection during the await wins, even if the in-flight setter
      // completes afterward. Reconcile that exact selection; never dispatch.
      if (run.cancelled && run.manualModel && !sameModel(ctx.model, run.manualModel)) {
        await switchOwned(run.manualModel);
      }
      if (run.cancelled && Object.hasOwn(run, "manualThinking")) {
        const before = begin();
        try {
          setThinking(run.manualThinking);
        } finally {
          end(before);
        }
      }
      return ok;
    };
    host.setThinking = (level) => {
      if (!owns(run)) return;
      const before = begin();
      try {
        return setThinking(level);
      } finally {
        end(before);
      }
    };
    return host;
  }

  pi.on("model_select", (event) => {
    if (active && !sameModel(event.model, internalModel)) {
      active.cancelled = true;
      active.manualModel = event.model;
      active.manualThinking = pi.getThinkingLevel?.();
    }
  });
  pi.on("thinking_level_select", (event) => {
    // Pi emits this event without awaiting preceding extension handlers. Keep
    // expected transitions across settlement until their events are consumed.
    if (active?.mutations) active.thinkingEvents.push(event);
    else consumeThinking(event);
  });
  pi.on("input", (event) => {
    if (!active) return;
    if (!active.inputSeen && event.source === "extension" && event.text === active.plan?.content) {
      active.inputSeen = true;
    } else {
      active.blocked = true;
      if (active.preparing) active.cancelled = true;
    }
  });
  pi.on("before_agent_start", (event) => {
    if (!active) return;
    if (active.started || event.prompt !== active.plan?.content) active.blocked = true;
    active.started = true;
  });
  for (const name of ["message_update", "message_end"]) {
    pi.on(name, (event) => {
      if (active && hasContent(event.message)) active.blocked = true;
    });
  }
  pi.on("tool_execution_start", () => {
    if (active) active.blocked = true;
  });
  pi.on("turn_end", (event) => {
    if (!active) return;
    if (event.toolResults?.length || hasContent(event.message)) active.blocked = true;
    active.failure =
      event.message?.role === "assistant" && event.message.stopReason === "error"
        ? { message: event.message, id: event.messageEntryId }
        : undefined;
  });

  pi.on("agent_before_settle", async (event, ctx) => {
    const run = active;
    if (
      !run ||
      !owns(run) ||
      run.blocked ||
      !run.started ||
      run.attempted ||
      event.outcome !== "error" ||
      event.continue ||
      event.context?.pendingMessages?.length ||
      ctx.hasPendingMessages?.() ||
      ctx.signal?.aborted ||
      !run.failure?.id ||
      !sameModel(ctx.model, run.plan.selectedModel.model) ||
      sameModel(ctx.model, run.currentModel)
    )
      return;
    const failure = run.failure.message;
    if (
      failure.provider !== ctx.model.provider ||
      failure.model !== ctx.model.id ||
      hasContent(failure)
    )
      return;
    const projected = event.context?.contextEntries;
    if (!Array.isArray(projected)) return;
    const fresh = projected.filter((entry) => !run.beforeIds.has(entry.sourceEntry.id));
    const users = fresh
      .flatMap((entry) => entry.messages)
      .filter((message) => message.role === "user");
    const last = fresh.filter((entry) => entry.messages.length).at(-1);
    if (
      users.length !== 1 ||
      userText(users[0]) !== run.plan.content ||
      last?.sourceEntry.id !== run.failure.id ||
      last.messages.length !== 1 ||
      last.messages[0].stopReason !== "error"
    )
      return;
    const rendered = renderPromptForResolvedModel(run.prompt, run.args, run.currentModel);
    // Never continue instructions rendered for a different model's conditional.
    if (rendered.empty || rendered.content !== run.plan.content) return;

    run.attempted = true;
    // Settlement restoration must not retry the very same failed fallback.
    run.restore = undefined;
    const host = hostFor(ctx, run);
    try {
      const ok = await host.setModel(run.currentModel);
      if (ok === false) {
        host.notify(`Prompt /${run.prompt.name}: active-model fallback switch failed.`, "error");
        return;
      }
      // Recheck after the await: input, abort, or manual changes may have arrived.
      if (
        !owns(run) ||
        run.blocked ||
        ctx.signal?.aborted ||
        ctx.hasPendingMessages?.() ||
        !sameModel(ctx.model, run.currentModel)
      )
        return;
      host.setThinking(run.previousThinking ?? "off");
      if (!owns(run)) return;
      host.notify(
        `Prompt /${run.prompt.name}: falling back to ${modelRef(run.currentModel)} after an empty provider error; no prompt or tools replayed.`,
        "warning",
      );
      return {
        entries: [
          ...event.entries,
          { type: "context_edit", targetId: run.failure.id, replacement: null },
        ],
        continue: true,
      };
    } catch {
      host.notify(
        `Prompt /${run.prompt.name}: active-model fallback failed; not retrying.`,
        "error",
      );
    }
  });

  async function finish(_event, ctx) {
    const run = active;
    if (!run || run.finishing) return;
    run.finishing = true;
    try {
      if (owns(run) && run.restore && sameModel(ctx.model, run.plan.selectedModel.model)) {
        await restorePromptTemplateSessionState(run.restore, ctx, hostFor(ctx, run));
      }
    } finally {
      if (active === run) active = undefined;
    }
  }
  pi.on("agent_settled", finish);
  pi.on("session_shutdown", finish);
  for (const name of ["session_start", "session_switch", "session_fork", "session_tree"]) {
    pi.on(name, () => {
      active = undefined;
    });
  }

  return async function runPrompt(prompt, args, ctx) {
    if (active || ctx.isIdle?.() === false || ctx.hasPendingMessages?.()) {
      ctx.ui?.notify?.(
        "Wait for the active run before executing a prompt-template command.",
        "warning",
      );
      return { ok: false, reason: "session_busy" };
    }
    // Reserve ownership before selection or switching can await authentication.
    const run = {
      prompt: { ...prompt },
      args,
      currentModel: ctx.model,
      preparing: true,
      mutations: 0,
      thinkingEvents: [],
    };
    active = run;
    const host = hostFor(ctx, run);
    try {
      const result = await executePromptTemplateCommand(prompt, args, ctx, host, {
        restoreTiming: "agent_settled",
        fallbackToCurrentModel: true,
        ownsSession: () => owns(run),
        onDispatch(plan, previousThinking) {
          run.plan = plan;
          run.previousThinking = previousThinking;
          run.beforeIds = new Set(ctx.sessionManager?.getBranch?.().map((entry) => entry.id) ?? []);
          run.restore = plan.restore
            ? {
                ...(plan.actions.restoreModel ? { model: run.currentModel } : {}),
                ...(plan.actions.restoreModel || plan.thinking
                  ? { thinking: previousThinking ?? "off" }
                  : {}),
              }
            : undefined;
        },
      });
      if (!result.ok && active === run) active = undefined;
      return result;
    } catch (error) {
      if (active === run) active = undefined;
      throw error;
    } finally {
      run.preparing = false;
    }
  };
}
