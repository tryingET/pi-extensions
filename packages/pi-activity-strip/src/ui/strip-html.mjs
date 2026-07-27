// ---
// summary: "generates the calm, interactive activity strip with accessible cards and rich detail reveal"
// read_when:
//   - "changing strip markup, styling, state rendering, ordering, or interactions"
// ---

import {
  isActiveSession,
  moveOrderItem,
  reconcileActivityOrder,
} from "../common/activity-order.mjs";
import { ACTIVITY_STRIP_ORDER_REFRESH_MS } from "../common/constants.mjs";

const ORDER_RUNTIME = [
  'const ACTIVE_STATES = new Set(["thinking", "tool", "waiting"]);',
  isActiveSession.toString(),
  reconcileActivityOrder.toString(),
  moveOrderItem.toString(),
].join("\n");

export function createStripHtml({ interactive = true } = {}) {
  const pointerEvents = interactive ? "auto" : "none";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      :root {
        color-scheme: dark;
        --panel: rgba(9, 14, 24, 0.82);
        --panel-strong: rgba(14, 21, 35, 0.96);
        --line: rgba(255, 255, 255, 0.08);
        --line-strong: rgba(255, 255, 255, 0.14);
        --text: rgba(247, 250, 255, 0.96);
        --muted: rgba(194, 205, 224, 0.74);
        --dim: rgba(167, 180, 203, 0.48);
        --accent: #79b8ff;
        --thinking: #8ab4ff;
        --tool: #ffd166;
        --waiting: #ff9f7a;
        --success: #57d9a3;
        --error: #ff7d7d;
        --shadow: 0 16px 42px rgba(0, 0, 0, 0.42);
      }

      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
        font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
        pointer-events: ${pointerEvents};
      }
      body { padding: 4px 10px 6px; }
      button { font: inherit; }

      .strip {
        display: grid;
        grid-template-columns: 146px minmax(0, 1fr);
        gap: 8px;
        width: 100%;
        height: 100%;
      }
      .brand, .cards {
        backdrop-filter: blur(18px) saturate(1.25);
        -webkit-backdrop-filter: blur(18px) saturate(1.25);
        border: 1px solid var(--line);
        box-shadow: var(--shadow);
      }
      .brand {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 10px 12px;
        border-radius: 20px;
        background: linear-gradient(180deg, rgba(12, 19, 33, 0.92), rgba(8, 13, 22, 0.82));
      }
      .brand__eyebrow, .meta, .tool, .card__state, .inspector__key, .placeholder__eyebrow {
        font-family: "IBM Plex Mono", "JetBrains Mono", monospace;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .brand__eyebrow, .placeholder__eyebrow { color: var(--accent); font-size: 9px; }
      .brand__title { margin-top: 4px; color: var(--text); font-size: 18px; font-weight: 650; line-height: 1; }
      .brand__subtitle { margin-top: 4px; color: var(--muted); font-size: 10px; line-height: 1.25; }
      .meta { color: var(--dim); font-size: 9px; line-height: 1.3; }

      .cards {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        min-width: 0;
        padding: 6px 8px 8px;
        border-radius: 20px;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
        background: linear-gradient(180deg, rgba(10, 16, 28, 0.9), rgba(6, 10, 18, 0.74));
      }
      .cards::-webkit-scrollbar { display: none; }
      .cards--empty { align-items: center; justify-content: center; }

      .card, .placeholder {
        position: relative;
        overflow: hidden;
        border-radius: 16px;
        border: 1px solid var(--line-strong);
        background: linear-gradient(180deg, rgba(13, 20, 35, 0.96), rgba(9, 14, 24, 0.9));
      }
      .card {
        appearance: none;
        display: grid;
        flex: 0 0 224px;
        height: 60px;
        padding: 8px 10px 8px 12px;
        color: inherit;
        text-align: left;
        cursor: pointer;
        transition: border-color 120ms ease, background 120ms ease, height 120ms ease;
      }
      .card::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 3px;
        background: var(--state-color, var(--accent));
      }
      .card:hover, .card:focus-visible, .card[data-open="true"] {
        border-color: color-mix(in srgb, var(--state-color, var(--accent)) 58%, white 4%);
        background: linear-gradient(180deg, rgba(18, 28, 47, 0.99), rgba(10, 16, 28, 0.96));
        outline: none;
      }
      body[data-expanded="true"] .card[data-open="true"] { height: 228px; }
      .card__header, .card__footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-width: 0; }
      .card__label { min-width: 0; }
      .card__repo { color: var(--text); font-size: 12px; font-weight: 650; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .card__phase { margin-top: 4px; color: var(--muted); font-size: 10px; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .card__state { flex: 0 0 auto; padding: 4px 6px; border-radius: 999px; background: color-mix(in srgb, var(--state-color, var(--accent)) 14%, transparent); border: 1px solid color-mix(in srgb, var(--state-color, var(--accent)) 34%, transparent); color: var(--state-color, var(--accent)); font-size: 8px; line-height: 1; }
      .card__footer { margin-top: 5px; }
      .tool, .elapsed { color: var(--dim); font-size: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tool { max-width: 120px; }

      .inspector {
        display: none;
        grid-template-columns: 58px minmax(0, 1fr);
        gap: 6px 8px;
        margin-top: 10px;
        padding-top: 9px;
        border-top: 1px solid var(--line);
      }
      body[data-expanded="true"] .card[data-open="true"] .inspector { display: grid; }
      .inspector__key { color: var(--dim); font-size: 8px; }
      .inspector__value { color: var(--muted); font-size: 10px; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      .inspector__value--path { direction: rtl; text-align: left; white-space: nowrap; text-overflow: ellipsis; display: block; }
      .activation { grid-column: 1 / -1; min-height: 14px; color: var(--dim); font-size: 9px; }
      .activation[data-kind="error"] { color: var(--error); }
      .activation[data-kind="success"] { color: var(--success); }

      .placeholder { display: flex; flex-direction: column; justify-content: center; gap: 6px; width: 100%; max-width: 420px; padding: 12px 18px; }
      .placeholder__title { color: var(--text); font-size: 14px; font-weight: 650; }
      .placeholder__copy { color: var(--muted); font-size: 11px; line-height: 1.35; }
      .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

      @media (prefers-reduced-motion: reduce) {
        .card { transition: none; }
      }
    </style>
  </head>
  <body data-expanded="false">
    <div class="strip">
      <section class="brand" aria-label="Pi activity summary">
        <div>
          <div class="brand__eyebrow">π telemetry ribbon</div>
          <div class="brand__title">Activity</div>
          <div class="brand__subtitle">Calm order · live detail</div>
        </div>
        <div class="meta" id="meta">Waiting for sessions…</div>
      </section>
      <section class="cards cards--empty" id="cards" aria-label="Live Pi sessions"></section>
      <div class="sr-only" id="announcer" aria-live="polite"></div>
    </div>

    <script>
      ${ORDER_RUNTIME}
      const ORDER_REFRESH_MS = ${ACTIVITY_STRIP_ORDER_REFRESH_MS};
      const meta = document.getElementById("meta");
      const cards = document.getElementById("cards");
      const announcer = document.getElementById("announcer");
      const api = window.activityStrip || {
        activate: async () => ({ ok: false, error: "Activity bridge unavailable" }),
        setExpanded: async () => {},
        subscribe() { return () => {}; },
      };
      let snapshot = { generatedAt: Date.now(), sessions: [] };
      let orderedIds = [];
      let nextOrderRefreshAt = 0;
      let collapseTimer = null;

      const STATE_LABELS = { idle: "idle", thinking: "thinking", tool: "tool", waiting: "waiting", success: "done", error: "error" };
      const STATE_COLORS = { idle: "var(--accent)", thinking: "var(--thinking)", tool: "var(--tool)", waiting: "var(--waiting)", success: "var(--success)", error: "var(--error)" };

      function formatDuration(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return String(minutes) + ":" + String(seconds).padStart(2, "0");
      }
      function formatElapsed(session) {
        const anchor = Number(session.agentStartedAt || session.startedAt || snapshot.generatedAt || Date.now());
        return formatDuration(Math.max(0, Math.floor((Date.now() - anchor) / 1000)));
      }
      function formatLastSeen(session) {
        const anchor = Number(session.updatedAt || snapshot.generatedAt || Date.now());
        return formatDuration(Math.max(0, Math.floor((Date.now() - anchor) / 1000)));
      }
      function sessionById(sessionId) {
        return (Array.isArray(snapshot.sessions) ? snapshot.sessions : []).find((session) => session.sessionId === sessionId);
      }
      function safeDomId(sessionId) {
        return "session-detail-" + String(sessionId).replace(/[^a-zA-Z0-9_-]/g, "-");
      }
      function setText(card, selector, value) {
        const target = card.querySelector(selector);
        if (target) target.textContent = String(value ?? "");
      }
      function cardTemplate(sessionId) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "card";
        card.dataset.sessionId = sessionId;
        card.dataset.open = "false";
        card.setAttribute("aria-expanded", "false");
        card.setAttribute("aria-describedby", safeDomId(sessionId));
        card.innerHTML = [
          '<div class="card__header"><div class="card__label"><div class="card__repo"></div><div class="card__phase"></div></div><div class="card__state"></div></div>',
          '<div class="card__footer"><div class="tool"></div><div class="elapsed"></div></div>',
          '<div class="inspector" id="' + safeDomId(sessionId) + '" role="tooltip">',
          '<div class="inspector__key">detail</div><div class="inspector__value detail"></div>',
          '<div class="inspector__key">prompt</div><div class="inspector__value prompt"></div>',
          '<div class="inspector__key">reply</div><div class="inspector__value reply"></div>',
          '<div class="inspector__key">path</div><div class="inspector__value inspector__value--path path"></div>',
          '<div class="activation" aria-live="polite"></div>',
          '</div>',
        ].join("");
        return card;
      }
      function updateCard(card, session) {
        const stateColor = STATE_COLORS[session.state] || "var(--accent)";
        const stateLabel = STATE_LABELS[session.state] || session.state || "idle";
        card.style.setProperty("--state-color", stateColor);
        card.dataset.group = isActiveSession(session) ? "active" : "settled";
        card.setAttribute("aria-label", (session.repoLabel || "Pi session") + ", " + (session.phase || "Idle") + ". Press Enter to focus its Ghostty window.");
        card.title = "Focus " + (session.repoLabel || "Pi session");
        setText(card, ".card__repo", session.repoLabel || "pi session");
        setText(card, ".card__phase", session.phase || "Idle");
        setText(card, ".card__state", stateLabel);
        setText(card, ".tool", session.toolName || session.toolTarget || "monitoring");
        setText(card, ".elapsed", formatElapsed(session) + " · " + formatLastSeen(session));
        setText(card, ".detail", session.detail || "Ready");
        setText(card, ".prompt", session.lastPromptPreview || "—");
        setText(card, ".reply", session.assistantPreview || "—");
        setText(card, ".path", session.cwd || "—");
      }
      function syncOrder(regroup) {
        const sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
        orderedIds = reconcileActivityOrder(sessions, orderedIds, { regroup });
        if (regroup) nextOrderRefreshAt = Date.now() + ORDER_REFRESH_MS;
      }
      function render() {
        const sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
        const byId = new Map(sessions.map((session) => [session.sessionId, session]));
        const activeCount = sessions.filter(isActiveSession).length;
        meta.textContent = sessions.length
          ? String(activeCount) + " active · " + String(sessions.length - activeCount) + " settled · order " + String(Math.max(0, Math.ceil((nextOrderRefreshAt - Date.now()) / 1000))) + "s"
          : "Waiting for sessions…";
        if (sessions.length === 0) {
          if (document.body.dataset.expanded === "true") setExpanded(null, false).catch(() => {});
          cards.classList.add("cards--empty");
          cards.innerHTML = '<div class="placeholder"><div class="placeholder__eyebrow">ready</div><div class="placeholder__title">No active Pi sessions yet</div><div class="placeholder__copy">Open Pi in Ghostty and the ribbon will populate automatically.</div></div>';
          return;
        }
        cards.classList.remove("cards--empty");
        cards.querySelector(".placeholder")?.remove();
        const cardById = new Map(
          [...cards.querySelectorAll(".card")].map((card) => [card.dataset.sessionId, card]),
        );
        for (const [sessionId, orphan] of cardById) {
          if (!byId.has(sessionId)) {
            orphan.remove();
            cardById.delete(sessionId);
          }
        }
        if (
          document.body.dataset.expanded === "true" &&
          !cards.querySelector('.card[data-open="true"]')
        ) {
          setExpanded(null, false).catch(() => {});
        }
        let targetIndex = 0;
        for (const sessionId of orderedIds) {
          const session = byId.get(sessionId);
          if (!session) continue;
          let card = cardById.get(sessionId);
          if (!card) {
            card = cardTemplate(sessionId);
            cardById.set(sessionId, card);
          }
          updateCard(card, session);
          const nodeAtTarget = cards.children[targetIndex] ?? null;
          if (nodeAtTarget !== card) cards.insertBefore(card, nodeAtTarget);
          targetIndex += 1;
        }
      }
      async function setExpanded(card, expanded) {
        if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
        for (const candidate of cards.querySelectorAll(".card")) {
          const isOpen = candidate === card && expanded;
          candidate.dataset.open = isOpen ? "true" : "false";
          candidate.setAttribute("aria-expanded", isOpen ? "true" : "false");
        }
        document.body.dataset.expanded = expanded ? "true" : "false";
        await api.setExpanded(Boolean(expanded));
      }
      function scheduleCollapse() {
        if (collapseTimer) clearTimeout(collapseTimer);
        collapseTimer = setTimeout(() => {
          const engagedCard = [...cards.querySelectorAll(".card")].find(
            (candidate) => candidate.matches(":hover") || candidate === document.activeElement,
          );
          if (engagedCard) {
            setExpanded(engagedCard, true).catch(() => {});
            return;
          }
          setExpanded(null, false).catch(() => {});
        }, 120);
      }
      async function activate(card) {
        const session = sessionById(card.dataset.sessionId);
        if (!session) return;
        const activation = card.querySelector(".activation");
        if (activation) { activation.dataset.kind = ""; activation.textContent = "Locating exact Ghostty session…"; }
        let result;
        try {
          result = await api.activate(session.sessionId);
        } catch {
          result = { ok: false, error: "Focus bridge failed; nothing focused." };
        }
        if (activation) {
          activation.dataset.kind = result?.ok ? "success" : "error";
          activation.textContent = result?.ok ? "Focused Ghostty window." : (result?.error || "No exact window match; nothing focused.");
        }
        announcer.textContent = activation?.textContent || "";
      }

      cards.addEventListener("pointerover", (event) => {
        const card = event.target.closest?.(".card");
        if (card && !card.contains(event.relatedTarget)) setExpanded(card, true).catch(() => {});
      });
      cards.addEventListener("pointerout", (event) => {
        const card = event.target.closest?.(".card");
        if (card && !card.contains(event.relatedTarget)) scheduleCollapse();
      });
      cards.addEventListener("focusin", (event) => {
        const card = event.target.closest?.(".card");
        if (card) setExpanded(card, true).catch(() => {});
      });
      cards.addEventListener("focusout", (event) => {
        const card = event.target.closest?.(".card");
        if (card && !card.contains(event.relatedTarget)) scheduleCollapse();
      });
      cards.addEventListener("click", (event) => {
        const card = event.target.closest?.(".card");
        if (card) activate(card).catch(() => {});
      });
      cards.addEventListener("keydown", (event) => {
        const card = event.target.closest?.(".card");
        if (!card || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        if (event.shiftKey) {
          orderedIds = moveOrderItem(orderedIds, card.dataset.sessionId, direction);
          nextOrderRefreshAt = Date.now() + ORDER_REFRESH_MS;
          render();
          const moved = [...cards.querySelectorAll(".card")].find((candidate) => candidate.dataset.sessionId === card.dataset.sessionId);
          moved?.focus();
          moved?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
          announcer.textContent = "Session card moved " + (direction < 0 ? "left" : "right") + ".";
          return;
        }
        const index = orderedIds.indexOf(card.dataset.sessionId);
        const targetId = orderedIds[Math.max(0, Math.min(orderedIds.length - 1, index + direction))];
        const target = [...cards.querySelectorAll(".card")].find((candidate) => candidate.dataset.sessionId === targetId);
        target?.focus();
        target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      });

      setInterval(() => {
        if (Date.now() >= nextOrderRefreshAt) syncOrder(true);
        render();
      }, 1000);
      api.subscribe((nextSnapshot) => {
        snapshot = nextSnapshot || { generatedAt: Date.now(), sessions: [] };
        syncOrder(orderedIds.length === 0);
        render();
      });
      syncOrder(true);
      render();
    </script>
  </body>
</html>`;
}
