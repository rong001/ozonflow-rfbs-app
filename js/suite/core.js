/**
 * OzonFlow · 经营套件核心：视图注册、业务扩展数据（按经营场景确定性生成并持久化）、通用 UI 片段、事件委托
 */
window.OFS = (function () {
  const Store = window.OzonFlowStore;
  const views = {};
  const seeds = {};
  const handlers = {};
  const ui = {}; // 每个视图的临时 UI 状态（筛选等）

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = n => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('ru-RU');
  const rub = n => fmt(n) + ' ₽';
  const cny = n => '¥' + fmt(n);
  const pct = (n, d) => (n == null || isNaN(n)) ? '—' : (Number(n).toFixed(d == null ? 1 : d) + '%');
  const toast = (t, m) => window.showToast && window.showToast(t, m);

  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = hash(String(seed)); return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const between = (r, a, b) => a + (b - a) * r();

  function S() { return Store.get(); }
  function ext() {
    const s = S();
    if (!s.suite || s.suite._scenario !== s.meta.id) s.suite = { _scenario: s.meta.id };
    Object.keys(seeds).forEach(k => {
      if (s.suite[k] === undefined) {
        try { s.suite[k] = seeds[k](s, rng(s.meta.id + ':' + k)); } catch (e) { console.error('seed ' + k, e); s.suite[k] = null; }
      }
    });
    return s.suite;
  }
  const shop = arr => Store.forShop(arr || []);
  const products = () => shop(S().products);
  const orders = () => shop(S().orders);
  function profitOf(p, price, scenario) {
    return Store.calcProfit({ price: price != null ? price : p.price, costCNY: p.cost, weight: p.weight || 300, scenario: scenario });
  }

  /* ---------- UI 片段 ---------- */
  function kpis(list) {
    return '<div class="kpi-grid">' + list.map(k => `
      <div class="kpi-card ${k.tone || 'blue'}">
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="kpi-value">${k.value}</div>
        ${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}
      </div>`).join('') + '</div>';
  }
  function card(title, body, extra, opts) {
    opts = opts || {};
    return `<div class="card${opts.cls ? ' ' + opts.cls : ''}">
      <div class="card-header"><div class="card-title">${title}</div>${extra ? `<div class="card-extra">${extra}</div>` : ''}</div>
      <div class="card-body"${opts.flush ? ' style="padding:0"' : ''}>${body}</div></div>`;
  }
  function table(head, rows, empty) {
    if (!rows.length) return `<p class="hint" style="padding:12px 16px">${esc(empty || '当前店铺没有匹配对象')}</p>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => '<tr>' + r.map(c => `<td>${c == null ? '—' : c}</td>`).join('') + '</tr>').join('')}</tbody></table></div>`;
  }
  const tag = (t, tone) => `<span class="tag tag-${tone || 'gray'}">${esc(t)}</span>`;
  const btn = (label, action, data, tone) => {
    const attrs = Object.entries(data || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
    return `<button class="btn btn-sm ${tone || 'btn-secondary'}" data-ofs="${action}"${attrs}>${label}</button>`;
  };
  const bar = (v, tone) => `<div class="progress"><div class="progress-bar" style="width:${Math.max(0, Math.min(100, v))}%;${tone ? 'background:' + tone : ''}"></div></div>`;
  const tabs = (view, key, opts, cur) => '<div class="filter-tabs">' + opts.map(o => `<button class="filter-tab${o[0] === cur ? ' active' : ''}" data-ofs="_tab" data-view="${view}" data-key="${key}" data-val="${o[0]}">${o[1]}</button>`).join('') + '</div>';
  const src = (label, url) => `<a class="hint" href="${url}" target="_blank" rel="noopener">${esc(label)} ↗</a>`;
  const note = html => `<p class="hint ofs-note">${html}</p>`;
  function uiState(view, defaults) { if (!ui[view]) ui[view] = Object.assign({}, defaults || {}); return ui[view]; }

  /* ---------- 注册与渲染 ---------- */
  function register(id, def) { views[id] = def; }
  function seed(key, fn) { seeds[key] = fn; }
  function on(name, fn) { handlers[name] = fn; }
  function title(id) { return views[id] && views[id].title; }
  function render(view) {
    const def = views[view];
    if (!def) return;
    const root = document.getElementById('ofs-' + view);
    if (!root) return;
    ext();
    try { root.innerHTML = def.render(); }
    catch (e) { console.error(e); root.innerHTML = card('页面出错', `<p class="hint">${esc(e.message)}</p>`); }
  }
  function done(r, reason) {
    if (r && r.msg) toast(r.ok === false ? 'info' : 'success', r.msg);
    Store.emit(reason || 'suite');
  }
  function act(actor, action, target, result) { Store.audit(actor || Store.roleLabel(), action, target, result); }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-ofs]');
    if (!t) return;
    const name = t.dataset.ofs;
    if (name === '_tab') { uiState(t.dataset.view)[t.dataset.key] = t.dataset.val; render(t.dataset.view); return; }
    const fn = handlers[name];
    if (!fn) return;
    try { const r = fn(t.dataset, t); if (r !== undefined) done(r, name); }
    catch (err) { console.error(err); toast('info', '操作失败：' + err.message); }
  });
  document.addEventListener('change', e => {
    const t = e.target.closest('[data-ofs-change]');
    if (!t) return;
    const fn = handlers[t.dataset.ofsChange];
    if (fn) { const r = fn(t.dataset, t); if (r !== undefined) done(r, t.dataset.ofsChange); }
  });

  function invoke(name, data) {
    const fn = handlers[name];
    if (!fn) return { ok: false, msg: '未知动作：' + name };
    const r = fn(data || {}, null);
    Store.emit('suite:' + name);
    return r || { ok: true, msg: '已执行' };
  }

  return { invoke, Store, S, ext, shop, products, orders, profitOf, esc, fmt, rub, cny, pct, toast, hash, rng, pick, between,
    kpis, card, table, tag, btn, bar, tabs, src, note, uiState, register, seed, on, title, render, done, act, views };
})();
