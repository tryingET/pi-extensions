// Browser observation only: preserve reading state across local-file reloads, never dispatch.
export const DASHBOARD_REFRESH_SCRIPT = `(() => {
  const button = document.getElementById('watch-toggle');
  const notice = document.getElementById('watch-notice');
  button.hidden = false;
  const manual = document.getElementById('watch-reload');
  if (manual) manual.hidden = false;
  const key = 'autoresearch-observatory:' + location.pathname;
  const performanceChanged = document.getElementById('performance')?.hasAttribute('data-performance-state-changed') === true;
  let paused = performanceChanged;
  let failed = false;
  let timer;
  const details = () => Array.from(document.querySelectorAll('details'));
  const label = d => d.querySelector('summary')?.textContent || '';
  const layout = () => JSON.stringify(details().map(d => [d.id || '', label(d)]));
  function paint() {
    button.textContent = paused ? 'Resume' : 'Pause';
    button.setAttribute('aria-label', paused ? 'Resume live view' : 'Pause live view');
    button.setAttribute('aria-pressed', String(!paused));
    notice.textContent = paused ? 'Paused · snapshot' :
      'Auto-refresh · 2s';
  }
  function save() {
    const active = document.activeElement;
    sessionStorage.setItem(key, JSON.stringify({ paused, y: scrollY, layout: layout(),
      opened: details().map((d, i) => ({ i, id: d.id || '', label: label(d), open: d.open })),
      scrollPorts: Array.from(document.querySelectorAll('[data-reading-scroll]')).map(el => ({ id: el.id, x: el.scrollLeft, y: el.scrollTop })),
      focusId: active?.id || '',
      focus: details().findIndex(d => d.querySelector('summary') === active)
    }));
  }
  function unavailable(reason = 'browser reading-state storage is blocked') {
    failed = true; paused = true; clearTimeout(timer); paint(); button.disabled = true;
    notice.textContent = 'Live view unavailable: ' + reason + '. Reload manually; unsaved reading state may be lost.';
    try { save(); } catch {}
  }
  document.getElementById('watch-reload')?.addEventListener('click', () => {
    try { save(); } catch { unavailable(); }
    location.reload();
  });
  function performanceUnavailable() { unavailable('performance state cannot be stored'); }
  document.addEventListener('autoresearch-performance-storage-failed', performanceUnavailable);
  if (document.getElementById('performance')?.hasAttribute('data-performance-storage-failed')) { performanceUnavailable(); return; }
  function atlasUnavailable() { unavailable('atlas state cannot be stored'); }
  document.addEventListener('autoresearch-atlas-storage-failed', atlasUnavailable);
  if (document.getElementById('atlas')?.hasAttribute('data-atlas-storage-failed')) { atlasUnavailable(); return; }
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (saved) {
      paused = saved.paused === true || performanceChanged;
      const current = details();
      const unchanged = saved.layout === layout();
      if (!unchanged) paused = true;
      for (const item of saved.opened || []) {
        const d = item.id ? current.find(d => d.id === item.id) : unchanged ? current[item.i] : null;
        // Atlas script owns selected panel visibility/open state; nested reading details are restored here.
        if (d && !d.hasAttribute('data-atlas-panel') && !d.hasAttribute('data-perf-detail') && label(d) === item.label) d.open = item.open;
      }
      requestAnimationFrame(() => {
        const focus = saved.focusId ? document.getElementById(saved.focusId) : unchanged ? current[saved.focus]?.querySelector('summary') : null;
        if (focus && !focus.closest('[hidden]')) focus.focus({ preventScroll: true });
        if (unchanged) {
          scrollTo(0, Number(saved.y) || 0);
          for (const port of saved.scrollPorts || []) {
            const el = document.getElementById(port.id);
            if (el) {
              el.scrollTop = Number.isFinite(Number(port.y)) ? Number(port.y) : 0;
              el.scrollLeft = Number.isFinite(Number(port.x)) ? Number(port.x) : 0;
            }
          }
        }
      });
    }
    save();
  } catch { unavailable(); return; }
  function schedule() {
    clearTimeout(timer);
    if (!paused && !failed) timer = setTimeout(() => {
      if (document.hidden || String(getSelection()).length) { schedule(); return; }
      try { save(); location.reload(); } catch { unavailable(); }
    }, 2000);
  }
  button.addEventListener('click', () => {
    if (failed) return;
    paused = !paused; paint();
    try { save(); schedule(); } catch { unavailable(); }
  });
  function interact(event) {
    if (event.target === button || button.contains(event.target) || paused) return;
    paused = true; clearTimeout(timer); paint();
    try { save(); } catch { unavailable(); }
  }
  for (const event of ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart', 'click']) document.addEventListener(event, interact, { capture: true, passive: true });
  window.addEventListener('pagehide', () => { try { save(); } catch {} });
  paint(); schedule();
})();`;
