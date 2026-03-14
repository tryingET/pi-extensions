export function createStripHtml({ interactive = false } = {}) {
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
        --panel-strong: rgba(14, 21, 35, 0.94);
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

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
        font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
        pointer-events: ${pointerEvents};
      }

      body {
        padding: 4px 10px 6px;
      }

      .strip {
        display: grid;
        grid-template-columns: 146px minmax(0, 1fr);
        gap: 8px;
        width: 100%;
        height: 100%;
      }

      .brand,
      .cards {
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

      .brand__eyebrow,
      .meta,
      .tool,
      .card__state,
      .placeholder__eyebrow {
        font-family: "IBM Plex Mono", "JetBrains Mono", monospace;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .brand__eyebrow,
      .placeholder__eyebrow {
        color: var(--accent);
        font-size: 10px;
      }

      .brand__title {
        margin-top: 6px;
        color: var(--text);
        font-size: 20px;
        font-weight: 650;
        line-height: 1;
      }

      .brand__subtitle {
        margin-top: 6px;
        color: var(--muted);
        font-size: 11px;
        line-height: 1.35;
      }

      .meta {
        color: var(--dim);
        font-size: 11px;
      }

      .cards {
        display: flex;
        gap: 8px;
        align-items: stretch;
        min-width: 0;
        padding: 6px 8px 8px;
        border-radius: 20px;
        background: linear-gradient(180deg, rgba(10, 16, 28, 0.9), rgba(6, 10, 18, 0.74));
      }

      .cards--empty {
        align-items: center;
        justify-content: center;
      }

      .card,
      .placeholder {
        position: relative;
        overflow: hidden;
        border-radius: 16px;
        border: 1px solid var(--line-strong);
        background: linear-gradient(180deg, rgba(13, 20, 35, 0.96), rgba(9, 14, 24, 0.84));
      }

      .card {
        display: grid;
        grid-template-rows: auto auto 1fr;
        gap: 6px;
        min-width: 0;
        flex: 1 1 220px;
        padding: 10px 12px 10px;
      }

      .card::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 3px;
        background: var(--state-color, var(--accent));
      }

      .card__header,
      .card__footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .card__label {
        min-width: 0;
      }

      .card__repo {
        color: var(--text);
        font-size: 13px;
        font-weight: 650;
        line-height: 1.15;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .card__cwd {
        margin-top: 2px;
        color: var(--dim);
        font-size: 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .card__state {
        flex: 0 0 auto;
        padding: 4px 7px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--state-color, var(--accent)) 14%, transparent);
        border: 1px solid color-mix(in srgb, var(--state-color, var(--accent)) 34%, transparent);
        color: var(--state-color, var(--accent));
        font-size: 9px;
        line-height: 1;
      }

      .card__phase {
        color: var(--text);
        font-size: 12px;
        font-weight: 600;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .card__detail {
        color: var(--muted);
        font-size: 11px;
        line-height: 1.2;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
        min-height: 3.6em;
      }

      .tool,
      .elapsed {
        color: var(--dim);
        font-size: 9px;
      }

      .placeholder {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 8px;
        width: 100%;
        max-width: 420px;
        padding: 18px 20px;
      }

      .placeholder__title {
        color: var(--text);
        font-size: 16px;
        font-weight: 650;
      }

      .placeholder__copy {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.45;
      }
    </style>
  </head>
  <body>
    <div class="strip">
      <section class="brand">
        <div>
          <div class="brand__eyebrow">π telemetry ribbon</div>
          <div class="brand__title">Activity</div>
          <div class="brand__subtitle">Live Pi session detail across your active tabs.</div>
        </div>
        <div class="meta" id="meta">Waiting for sessions…</div>
      </section>
      <section class="cards cards--empty" id="cards"></section>
    </div>

    <script>
      const meta = document.getElementById("meta");
      const cards = document.getElementById("cards");
      const api = window.activityStrip || { subscribe() { return () => {}; } };
      let snapshot = { generatedAt: Date.now(), sessions: [] };

      const STATE_LABELS = {
        idle: "idle",
        thinking: "thinking",
        tool: "tool",
        waiting: "waiting",
        success: "done",
        error: "error",
      };

      const STATE_COLORS = {
        idle: "var(--accent)",
        thinking: "var(--thinking)",
        tool: "var(--tool)",
        waiting: "var(--waiting)",
        success: "var(--success)",
        error: "var(--error)",
      };

      function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => {
          switch (character) {
            case "&": return "&amp;";
            case "<": return "&lt;";
            case ">": return "&gt;";
            case '"': return "&quot;";
            case "'": return "&#39;";
            default: return character;
          }
        });
      }

      function formatElapsed(session) {
        const anchor = Number(session.agentStartedAt || session.startedAt || snapshot.generatedAt || Date.now());
        const totalSeconds = Math.max(0, Math.floor((Date.now() - anchor) / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return String(minutes) + ":" + String(seconds).padStart(2, "0");
      }

      function placeholderHtml() {
        return [
          '<div class="placeholder">',
          '<div class="placeholder__eyebrow">ready</div>',
          '<div class="placeholder__title">No active Pi sessions yet</div>',
          '<div class="placeholder__copy">Open Pi in Ghostty, install this package, and the ribbon will populate automatically as sessions stream status into the broker.</div>',
          '</div>',
        ].join("");
      }

      function sessionCardHtml(session) {
        const stateColor = STATE_COLORS[session.state] || "var(--accent)";
        const stateLabel = STATE_LABELS[session.state] || session.state || "idle";
        const repoLabel = escapeHtml(session.repoLabel || "pi session");
        const cwd = escapeHtml(session.cwd || "");
        const phase = escapeHtml(session.phase || "Idle");
        const detail = escapeHtml(session.detail || session.assistantPreview || "Ready");
        const tool = escapeHtml(session.toolName || session.toolTarget || "monitoring");
        const elapsed = escapeHtml(formatElapsed(session));

        return [
          '<article class="card" style="--state-color:' + stateColor + '">',
          '<header class="card__header">',
          '<div class="card__label">',
          '<div class="card__repo">' + repoLabel + '</div>',
          '<div class="card__cwd">' + cwd + '</div>',
          '</div>',
          '<div class="card__state">' + escapeHtml(stateLabel) + '</div>',
          '</header>',
          '<div>',
          '<div class="card__phase">' + phase + '</div>',
          '<div class="card__detail">' + detail + '</div>',
          '</div>',
          '<footer class="card__footer">',
          '<div class="tool">' + tool + '</div>',
          '<div class="elapsed">' + elapsed + '</div>',
          '</footer>',
          '</article>',
        ].join("");
      }

      function render() {
        const sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
        meta.textContent = sessions.length
          ? String(sessions.length) + ' live ' + (sessions.length === 1 ? 'session' : 'sessions')
          : 'Waiting for sessions…';

        if (sessions.length === 0) {
          cards.classList.add('cards--empty');
          cards.innerHTML = placeholderHtml();
          return;
        }

        cards.classList.remove('cards--empty');
        cards.innerHTML = sessions.map((session) => sessionCardHtml(session)).join('');
      }

      setInterval(() => render(), 1000);
      api.subscribe((nextSnapshot) => {
        snapshot = nextSnapshot || { generatedAt: Date.now(), sessions: [] };
        render();
      });
      render();
    </script>
  </body>
</html>`;
}
