// Fixed browser program. All owner/source content is read from escaped inert DOM attributes.
export const DASHBOARD_ATLAS_SCRIPT = `(() => {
  const root = document.getElementById('atlas');
  if (!root) return;
  const panels = Array.from(root.querySelectorAll('[data-atlas-panel]'));
  const cells = Array.from(root.querySelectorAll('[data-atlas-cell]'));
  const picks = Array.from(root.querySelectorAll('[data-stack-pick]'));
  const search = document.getElementById('atlas-search');
  const filter = document.getElementById('atlas-filter');
  const left = document.getElementById('stack-left');
  const right = document.getElementById('stack-right');
  const evidence = document.getElementById('stack-evidence');
  const key = 'autoresearch-atlas:' + location.pathname;
  const data = new Map(panels.map(p => [p.id, JSON.parse(p.dataset.atlasFacts)]));
  let selected = panels[0]?.id || '';
  let selectedAttempt = '';
  let remembered = {};
  function storageFailed() {
    // The marker survives startup ordering; the event stops an already scheduled refresh.
    root.setAttribute('data-atlas-storage-failed', 'true');
    document.dispatchEvent(new Event('autoresearch-atlas-storage-failed'));
  }
  try { remembered = JSON.parse(sessionStorage.getItem(key) || '{}') || {}; } catch { storageFailed(); }
  if (typeof remembered.selected === 'string') selected = data.has(remembered.selected) ? remembered.selected : '';
  if (!selected && panels.length) document.getElementById('atlas-selection-notice').textContent = 'The previously selected experiment is absent. Choose a node; no identity is reassigned.';
  if (typeof remembered.search === 'string') search.value = remembered.search;
  if (['all', 'signal', 'against', 'unknown'].includes(remembered.filter)) filter.value = remembered.filter;
  for (const pick of picks) pick.checked = !pick.disabled && Array.isArray(remembered.picks) && remembered.picks.includes(pick.dataset.stackPick);
  function save() {
    try { sessionStorage.setItem(key, JSON.stringify({ selected, selectedAttempt,
      search: search.value, filter: filter.value,
      picks: picks.filter(p => p.checked).map(p => p.dataset.stackPick),
      left: left.value, right: right.value
    })); } catch { storageFailed(); }
  }
  function select(id, attempt) {
    if (!data.has(id)) { for (const p of panels) p.hidden = true; return; }
    selected = id;
    selectedAttempt = '';
    for (const p of panels) { p.hidden = p.id !== id; p.open = p.id === id; }
    for (const link of root.querySelectorAll('[data-atlas-node]')) {
      if (link.dataset.atlasNode === id) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    const target = attempt && document.getElementById(attempt);
    if (target && document.getElementById(id).contains(target)) {
      target.open = true; selectedAttempt = attempt;
    }
    document.getElementById('atlas-selection-notice').textContent = 'Inspecting ' + data.get(id).label + ' / ' + data.get(id).campaignLabel + ' · source reports, not verified effects.';
  }
  function applyFilter() {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const cell of cells) {
      const info = data.get(cell.dataset.atlasCell);
      const text = (cell.textContent + ' ' + JSON.stringify(info)).toLocaleLowerCase();
      cell.hidden = !text.includes(query) || (filter.value !== 'all' && !cell.dataset.categories.split(' ').includes(filter.value));
      if (!cell.hidden) visible++;
    }
    for (const island of root.querySelectorAll('[data-atlas-island]')) {
      island.hidden = !Array.from(island.querySelectorAll('[data-atlas-cell]')).some(c => !c.hidden);
    }
    document.getElementById('atlas-count').textContent = visible + ' of ' + cells.length + ' nodes shown' + (cells.some(c => c.dataset.atlasCell === selected && c.hidden) ? ' · inspector selection is outside this filter' : '');
    document.getElementById('atlas-no-results').hidden = visible !== 0 || cells.length === 0;
  }
  function text(tag, content, className) {
    const el = document.createElement(tag); el.textContent = content;
    if (className) el.className = className;
    return el;
  }
  function drawPair() {
    evidence.replaceChildren();
    const a = data.get(left.value), b = data.get(right.value);
    if (!a || !b || left.value === right.value) {
      evidence.append(text('p', 'Choose two different selected experiments. Every pair can be explored, even without compatibility evidence.', 'empty'));
      save(); return;
    }
    evidence.append(text('p', 'A: ' + a.label + ' / ' + a.campaignLabel, 'caption'));
    evidence.append(text('p', 'B: ' + b.label + ' / ' + b.campaignLabel, 'caption'));
    evidence.append(text('p', a.campaign === b.campaign ?
      'Same campaign containment only. This is not a shared test.' :
      'Different campaigns — isolated evidence. This pair is a conceptual comparison only.', 'stack-boundary'));
    for (const name of ['Hypothesis', 'Scenario', 'Subject', 'Base', 'Changed files']) {
      const af = a.facts[name], bf = b.facts[name];
      const same = af.complete && bf.complete && JSON.stringify([...af.values].sort()) === JSON.stringify([...bf.values].sort());
      const shared = af.values.filter(v => bf.values.includes(v));
      const row = text('section', '', 'stack-fact');
      row.append(text('h4', name));
      row.append(text('p', !af.complete || !bf.complete ? 'Unknown / incomplete evidence' :
        same ? 'Same reported fields — not compatibility' : name === 'Changed files' ?
          (shared.length ? 'Reported file overlap — interaction untested' : 'No reported file overlap — interaction untested') : 'Different reported fields — interaction untested', 'caption'));
      for (const [label, value] of [[a.label, af], [b.label, bf]]) {
        row.append(text('p', label + ': ' + (value.values.join(' · ') || (value.complete ? 'Explicit empty list' : 'unknown')) + (value.complete ? '' : ' · incomplete / unknown')));
      }
      evidence.append(row);
    }
    save();
  }
  function stack(preferredLeft, preferredRight) {
    const chosen = picks.filter(p => p.checked).map(p => p.dataset.stackPick);
    const previous = [preferredLeft || left.value, preferredRight || right.value];
    for (const [index, control] of [left, right].entries()) {
      control.replaceChildren();
      for (const id of chosen) {
        const option = text('option', data.get(id).label + ' / ' + data.get(id).campaignLabel);
        option.value = id; control.append(option);
      }
      control.disabled = chosen.length < 2;
      control.value = chosen.includes(previous[index]) ? previous[index] : chosen[index] || chosen[0] || '';
    }
    if (left.value === right.value && chosen.length > 1) right.value = chosen.find(id => id !== left.value);
    document.getElementById('stack-count').textContent = chosen.length + ' selected · selection is not a tested stack. Choose any pair below.';
    drawPair();
  }
  for (const link of root.querySelectorAll('[data-atlas-node]')) link.addEventListener('click', () => {
    select(link.dataset.atlasNode, link.dataset.atlasAttempt); save();
    const target = document.getElementById(selectedAttempt || selected);
    target?.querySelector('summary')?.focus({ preventScroll: true });
  });
  for (const pick of picks) pick.addEventListener('change', () => stack());
  for (const control of [search, filter]) control.addEventListener('input', () => { applyFilter(); save(); });
  document.getElementById('atlas-reset').addEventListener('click', () => { search.value = ''; filter.value = 'all'; applyFilter(); save(); });
  document.getElementById('stack-clear').addEventListener('click', () => { for (const p of picks) p.checked = false; stack(); });
  left.addEventListener('change', drawPair); right.addEventListener('change', drawPair);
  function fromHash() {
    const target = document.getElementById(location.hash.slice(1));
    const p = target?.closest('[data-atlas-panel]');
    if (p) { select(p.id, target === p ? '' : target.id); save(); }
  }
  select(selected, remembered.selectedAttempt);
  fromHash(); applyFilter(); stack(remembered.left, remembered.right);
  window.addEventListener('hashchange', fromHash);
  for (const control of root.querySelectorAll('[data-atlas-enhanced]')) control.hidden = false;
})();`;
