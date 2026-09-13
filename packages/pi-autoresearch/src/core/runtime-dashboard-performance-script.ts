// Fixed browser code. All observations arrive through escaped inert markup, never source interpolation.
export const DASHBOARD_PERFORMANCE_SCRIPT = `(() => {
  const root = document.getElementById('performance');
  if (!root) return;
  const select = document.getElementById('performance-scope');
  const mode = document.getElementById('performance-mode');
  const notice = document.getElementById('performance-notice');
  const scopes = Array.from(root.querySelectorAll('[data-perf-scope]'));
  const key = 'autoresearch-performance:' + location.pathname;
  let selected = '';
  let failed = false;
  select.value = scopes[0]?.id || '';
  mode.value = scopes[0]?.dataset.perfNormalizable === 'true' ? 'baseline' : 'raw';
  function failure() {
    failed = true;
    root.setAttribute('data-performance-storage-failed', '');
    notice.textContent = 'Performance state storage unavailable; automatic refresh disabled. Exploration and manual reload remain available.';
    document.dispatchEvent(new Event('autoresearch-performance-storage-failed'));
  }
  function save() {
    if (failed) return;
    try { sessionStorage.setItem(key, JSON.stringify({ scope: select.value, run: selected, mode: mode.value })); }
    catch { failure(); }
  }
  function paint() {
    const scope = scopes.find(s => s.id === select.value);
    const normalized = scope?.dataset.perfNormalizable === 'true';
    mode.disabled = !normalized;
    mode.closest('label').hidden = !normalized;
    if (!normalized) mode.value = 'raw';
    for (const s of scopes) {
      s.hidden = s !== scope;
      for (const chart of s.querySelectorAll('[data-perf-chart]')) {
        if (chart.dataset.perfChart !== mode.value) chart.setAttribute('hidden', '');
        else chart.removeAttribute('hidden');
      }
      for (const value of s.querySelectorAll('[data-perf-value]')) value.hidden = value.dataset.perfValue !== mode.value;
      for (const row of s.querySelectorAll('[data-perf-row]')) row.setAttribute('aria-selected', String(row.dataset.perfRow === selected));
      for (const point of s.querySelectorAll('[data-perf-select]')) point.setAttribute('aria-current', String(point.dataset.perfSelect === selected));
      for (const detail of s.querySelectorAll('[data-perf-detail]')) {
        detail.hidden = detail.dataset.perfDetail !== selected;
        detail.open = !detail.hidden;
      }
      const hint = s.querySelector('[data-perf-hint]');
      if (hint) hint.hidden = !!selected;
    }
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (saved) {
      if (scopes.some(s => s.id === saved.scope)) {
        select.value = saved.scope;
        const scope = scopes.find(s => s.id === saved.scope);
        if (Array.from(scope.querySelectorAll('[data-perf-row]')).some(r => r.dataset.perfRow === saved.run)) selected = saved.run;
        else if (saved.run) { root.setAttribute('data-performance-state-changed', ''); notice.textContent = 'Previously selected run is absent; no replacement selected.'; }
        mode.value = saved.mode === 'baseline' ? 'baseline' : 'raw';
        if (saved.mode === 'baseline' && scope.dataset.perfNormalizable !== 'true') { root.setAttribute('data-performance-state-changed', ''); notice.textContent = 'Normalization no longer eligible; showing raw values. Refresh paused.'; }
      } else {
        root.setAttribute('data-performance-state-changed', '');
        select.value = '';
        notice.textContent = 'Previously selected scope is absent. Choose an exact scope; no replacement selected.';
      }
    } else { select.value = scopes[0]?.id || ''; mode.value = scopes[0]?.dataset.perfNormalizable === 'true' ? 'baseline' : 'raw'; }
  } catch { failure(); }
  for (const link of root.querySelectorAll('[data-perf-select]')) link.addEventListener('click', event => {
    event.preventDefault();
    selected = link.dataset.perfSelect;
    paint(); save();
    document.getElementById(selected + '-summary')?.focus({ preventScroll: true });
  });
  select.addEventListener('change', () => { selected = ''; if (!failed) notice.textContent = ''; paint(); save(); });
  mode.addEventListener('change', () => { paint(); save(); });
  // Native hash links still reveal the correct report when arriving from a bookmark.
  function hash() {
    const target = document.getElementById(location.hash.slice(1));
    const detail = target?.closest('[data-perf-detail]');
    if (!detail) return;
    select.value = detail.closest('[data-perf-scope]').id;
    selected = detail.dataset.perfDetail; paint(); save();
  }
  window.addEventListener('hashchange', hash);
  window.addEventListener('pagehide', save);
  root.querySelector('.perf-controls').hidden = false;
  paint(); hash(); save();
})();`;
