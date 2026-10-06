/**
 * OzonFlow · 交互层：悬停展开的三级侧栏、命令面板 (Ctrl/⌘K)、说明收纳为悬停提示、KPI 数字滚动、卡片光标高光、进场动效
 */
window.OFUX = (function () {
  const doc = document, body = doc.body;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const sidebar = doc.querySelector('.sidebar');
  const PIN_KEY = 'ozonflow_nav_pinned';
  let current = 'dashboard', currentFilter = null, navAt = 0;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* ---------- 侧栏：图标轨 + 悬停展开 + 手风琴分组 ---------- */
  const groups = [...doc.querySelectorAll('.nav-group')];
  let _ptr = canHover ? 'mouse' : 'touch';
  doc.addEventListener('pointerdown', e => { _ptr = e.pointerType || 'mouse'; }, true);
  const lastPtrType = () => _ptr;
  const groupOf = v => { const b = doc.querySelector('.nav-item[data-view="' + v + '"]'); return b ? b.closest('.nav-group') : null; };
  function setGroupOpen(g, open) {
    if (!g) return;
    g.classList.toggle('open', open);
    const h = g.querySelector('.nav-group-head'); if (h) h.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function resetGroups(extra) {
    const act = groupOf(current);
    groups.forEach(g => setGroupOpen(g, g === act || g === extra));
  }
  let openT = 0, closeT = 0;
  function openNav(fromGroup) {
    clearTimeout(closeT);
    if (body.classList.contains('nav-open')) { if (fromGroup) setGroupOpen(fromGroup, true); return; }
    resetGroups(fromGroup);
    body.classList.add('nav-open');
  }
  function closeNav(now) {
    clearTimeout(openT);
    if (body.classList.contains('nav-pinned')) return;
    const run = () => { body.classList.remove('nav-open'); resetGroups(); };
    if (now) run(); else closeT = setTimeout(run, 260);
  }
  if (sidebar) {
    let hoverGroup = null, lastPtr = canHover ? 'mouse' : 'touch';
    doc.addEventListener('pointerdown', e => { lastPtr = e.pointerType || 'mouse'; }, true);
    sidebar.addEventListener('pointerenter', e => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      clearTimeout(closeT);
      const at = doc.elementFromPoint(e.clientX, e.clientY);
      hoverGroup = at && at.closest ? at.closest('.nav-group') : null;
      openT = setTimeout(() => openNav(hoverGroup), 70);
    });
    sidebar.addEventListener('pointerleave', e => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      clearTimeout(openT); closeNav();
    });
    // 触屏：先点开侧栏，再点具体菜单
    sidebar.addEventListener('click', e => {
      if (lastPtr !== 'touch') return;
      if (!body.classList.contains('nav-open') && !body.classList.contains('nav-pinned')) {
        if (e.target.closest('.nav-item, .nav-group-head, .nav-util, .nav-leaf')) { e.preventDefault(); e.stopPropagation(); openNav(e.target.closest('.nav-group')); }
      }
    }, true);
    doc.addEventListener('click', e => { if (lastPtr === 'touch' && !sidebar.contains(e.target)) closeNav(true); });
    sidebar.addEventListener('focusin', () => openNav());
    sidebar.addEventListener('focusout', e => { if (!sidebar.contains(e.relatedTarget)) closeNav(); });
    sidebar.addEventListener('keydown', e => { if (e.key === 'Escape') { closeNav(true); doc.activeElement && doc.activeElement.blur(); } });
    doc.addEventListener('click', e => {
      const h = e.target.closest('.nav-group-head');
      if (h) { const g = h.closest('.nav-group'); setGroupOpen(g, !g.classList.contains('open')); return; }
      const leaf = e.target.closest('.nav-leaf');
      if (leaf) { currentFilter = leaf.dataset.leafFilter; window.navigate(leaf.dataset.leafView, { filter: currentFilter }); markLeaves(); if (lastPtrType() === 'touch') closeNav(true); return; }
      if (e.target.closest('.nav-item[data-view]') && lastPtrType() === 'touch') closeNav(true);
    });
  }
  // 页内筛选签与三级菜单同步
  doc.addEventListener('click', e => {
    const t = e.target.closest('[data-order-filter],[data-return-filter],[data-cs-tab]');
    if (!t) return;
    currentFilter = t.dataset.orderFilter || t.dataset.returnFilter || t.dataset.csTab;
    markLeaves();
  });
  function markLeaves() {
    doc.querySelectorAll('.nav-leaf').forEach(l => {
      const on = l.dataset.leafView === current && l.dataset.leafFilter === currentFilter;
      l.classList.toggle('active', on);
      if (on) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current');
    });
    doc.querySelectorAll('.nav-leaves').forEach(w => w.classList.toggle('show', w.dataset.leavesOf === current));
  }
  function setPinned(on) {
    body.classList.toggle('nav-pinned', on);
    if (on) body.classList.add('nav-open'); else closeNav(true);
    const b = doc.getElementById('btnPinNav'); if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const l = doc.getElementById('pinNavLabel'); if (l) l.textContent = on ? '取消固定' : '固定侧栏';
    try { localStorage.setItem(PIN_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  const pinBtn = doc.getElementById('btnPinNav');
  if (pinBtn) pinBtn.addEventListener('click', () => setPinned(!body.classList.contains('nav-pinned')));
  try { if (localStorage.getItem(PIN_KEY) === '1') setPinned(true); } catch (e) { /* ignore */ }

  // 分组徽标：合计组内待办数
  function updateGroupBadges() {
    groups.forEach(g => {
      let n = 0, alert = false;
      g.querySelectorAll('.nav-item .badge').forEach(b => {
        if (b.style.display === 'none' || b.hidden || b.closest('.nav-item').style.display === 'none') return;
        const t = (b.textContent || '').trim();
        if (t === '!') alert = true; else n += parseInt(t, 10) || 0;
      });
      const el = g.querySelector('.ng-badge');
      if (!el) return;
      if (n || alert) { el.hidden = false; el.textContent = n ? (n > 99 ? '99+' : n) : '!'; el.classList.toggle('alert', alert); }
      else el.hidden = true;
    });
  }

  /* ---------- 面包屑 ---------- */
  function crumb(view) {
    const g = groupOf(view), el = doc.getElementById('pageCrumb');
    if (el) el.textContent = g ? g.querySelector('.ng-label').textContent : '';
    groups.forEach(x => x.classList.toggle('has-active', x === g));
  }

  /* ---------- 导航钩子 ---------- */
  function beforeRender(view, opts) {
    navAt = performance.now();
    if (view !== current || !(opts && opts.filter)) currentFilter = (opts && opts.filter) || null;
    current = view;
    const v = doc.getElementById('view-' + view);
    if (v && !reduce) { v.classList.remove('entering'); void v.offsetWidth; v.classList.add('entering'); clearTimeout(v._entT); v._entT = setTimeout(() => v.classList.remove('entering'), 900); }
  }
  function onNavigate(view, opts) {
    crumb(view);
    if (!body.classList.contains('nav-open')) resetGroups();
    else { const g = groupOf(view); setGroupOpen(g, true); }
    markLeaves();
    const c = doc.querySelector('.content'); if (c) c.scrollTop = 0;
    updateGroupBadges();
    closePalette();
  }

  /* ---------- 说明文字收纳：段落说明 → 卡片标题旁的悬停提示 ---------- */
  const tip = doc.createElement('div');
  tip.className = 'ux-tip'; tip.setAttribute('role', 'tooltip'); tip.id = 'uxTip';
  body.appendChild(tip);
  const INFO = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.01"/></svg>';
  const RCODE = /\s*[（(]R\d+(?:[\s·\/、,，]+R?\d+)*[)）]|\s*[·・]\s*R\d+(?=[)）])/g;
  function declutter(root) {
    (root || doc).querySelectorAll('.card-title:not([data-rc]), .kpi-label:not([data-rc]), .content h3:not([data-rc])').forEach(h => {
      h.dataset.rc = '1';
      h.childNodes.forEach(n => { if (n.nodeType === 3 && RCODE.test(n.nodeValue)) { RCODE.lastIndex = 0; n.nodeValue = n.nodeValue.replace(RCODE, ''); } RCODE.lastIndex = 0; });
    });
    (root || doc).querySelectorAll('.ofs-note:not([data-ux])').forEach(n => {
      n.dataset.ux = '1';
      const card = n.closest('.card');
      const head = card && card.querySelector(':scope > .card-header');
      if (head) {
        const b = doc.createElement('button');
        b.type = 'button'; b.className = 'info-tip'; b.setAttribute('aria-label', '说明'); b.innerHTML = INFO;
        const store = doc.createElement('template'); store.innerHTML = n.innerHTML;
        b._tip = n.innerHTML;
        const title = head.querySelector('.card-title');
        if (title) title.appendChild(b); else head.appendChild(b);
        n.remove();
      } else {
        n.classList.add('note-fold');
        n.setAttribute('tabindex', '0');
      }
    });
  }
  function showTip(el, html) {
    tip.innerHTML = html; tip.classList.add('show');
    const r = el.getBoundingClientRect(), tw = Math.min(360, window.innerWidth - 24);
    tip.style.maxWidth = tw + 'px';
    const w = tip.offsetWidth, hgt = tip.offsetHeight;
    let x = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
    let y = r.bottom + 8; if (y + hgt > window.innerHeight - 8) y = r.top - hgt - 8;
    tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    el.setAttribute('aria-describedby', 'uxTip');
  }
  function hideTip() { tip.classList.remove('show'); }
  doc.addEventListener('mouseover', e => {
    const b = e.target.closest('.info-tip,[data-tip]');
    if (b) showTip(b, b._tip || esc(b.dataset.tip));
  });
  doc.addEventListener('mouseout', e => { const b = e.target.closest('.info-tip,[data-tip]'); if (b && !b.contains(e.relatedTarget)) hideTip(); });
  doc.addEventListener('focusin', e => { const b = e.target.closest('.info-tip,[data-tip]'); if (b) showTip(b, b._tip || esc(b.dataset.tip)); });
  doc.addEventListener('focusout', e => { if (e.target.closest('.info-tip,[data-tip]')) hideTip(); });
  doc.addEventListener('click', e => { const b = e.target.closest('.info-tip'); if (b) { e.stopPropagation(); tip.classList.contains('show') ? hideTip() : showTip(b, b._tip || esc(b.dataset.tip)); } }, true);
  doc.addEventListener('scroll', hideTip, true);

  /* ---------- KPI 数字滚动 ---------- */
  const lastVal = {};
  function countUp(root) {
    if (reduce) return;
    const fresh = false; // 只在数值变化时滚动，进页面不做表演
    (root || doc).querySelectorAll('.kpi-value:not([data-cu])').forEach(el => {
      el.dataset.cu = '1';
      if (el.children.length) return;
      const txt = el.textContent, m = txt.match(/^(\D*?)(-?\d(?:[\d\s\u00a0\u202f]*\d)?(?:[.,]\d+)?)(.*)$/);
      if (!m) return;
      const card = el.closest('.kpi-card'), lab = card && card.querySelector('.kpi-label');
      const key = current + '|' + (lab ? lab.textContent : '');
      const raw = m[2], dec = (raw.match(/[.,](\d+)$/) || [, ''])[1].length, sep = raw.match(/[,.](?=\d+$)/), grouped = /[\s\u00a0\u202f]/.test(raw);
      const target = parseFloat(raw.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
      const prev = lastVal[key];
      lastVal[key] = target;
      if (isNaN(target) || (!fresh && prev === target) || (prev === undefined && !fresh)) return;
      const from = prev === undefined || fresh ? 0 : prev;
      if (from === target) return;
      const t0 = performance.now(), D = 700;
      const fmt = v => {
        let s = dec ? v.toFixed(dec) : String(Math.round(v));
        if (grouped) { const [i, d] = s.split('.'); s = i.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + (d ? '.' + d : ''); }
        if (sep && sep[0] === ',') s = s.replace('.', ',');
        return m[1] + s + m[3];
      };
      const step = now => {
        if (!el.isConnected) return;
        const p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(2, -10 * p);
        el.textContent = p >= 1 ? txt : fmt(from + (target - from) * e);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------- 命令面板 ---------- */
  const pal = doc.createElement('div');
  pal.className = 'cmdk'; pal.hidden = true;
  pal.innerHTML = '<div class="cmdk-backdrop" data-cmdk-close></div><div class="cmdk-panel" role="dialog" aria-modal="true" aria-label="搜索功能或输入指令">' +
    '<div class="cmdk-input-row"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
    '<input id="cmdkInput" autocomplete="off" placeholder="去哪个页面，或直接说要做什么" aria-label="搜索功能或输入指令" /><kbd>Esc</kbd></div>' +
    '<div class="cmdk-list" id="cmdkList" role="listbox"></div></div>';
  body.appendChild(pal);
  const inp = pal.querySelector('#cmdkInput'), list = pal.querySelector('#cmdkList');
  let items = [], sel = 0;
  function catalog() {
    const out = [];
    doc.querySelectorAll('.nav-item[data-view]').forEach(b => {
      if (b.style.display === 'none') return;
      const g = b.closest('.nav-group'), label = (b.querySelector('span') || b).textContent.trim();
      out.push({ kind: '页面', label, sub: g ? g.querySelector('.ng-label').textContent : '', run: () => window.navigate(b.dataset.view) });
      doc.querySelectorAll('.nav-leaf[data-leaf-view="' + b.dataset.view + '"]').forEach(l =>
        out.push({ kind: '页面', label: label + ' · ' + l.textContent, sub: g ? g.querySelector('.ng-label').textContent : '', run: () => { currentFilter = l.dataset.leafFilter; window.navigate(b.dataset.view, { filter: l.dataset.leafFilter }); } }));
    });
    const quick = [
      ['一键跑全部 Agent', '自动化', () => { const b = doc.getElementById('btnRunAllAgentsDash'); if (b) b.click(); }],
      ['同步店铺数据', '数据连接', () => runAI('同步店铺数据')],
      ['打开开店引导', '工作台', () => { const b = doc.getElementById('btnOpenWizard'); if (b) b.click(); }],
    ];
    quick.forEach(q => out.push({ kind: '操作', label: q[0], sub: q[1], run: q[2] }));
    return out;
  }
  function runAI(text) {
    window.navigate('copilot');
    setTimeout(() => { const i = doc.getElementById('cpInput'), r = doc.getElementById('cpRun'); if (i && r) { i.value = text; r.click(); } }, 60);
  }
  function score(it, q) {
    if (!q) return 1;
    const hay = (it.label + ' ' + it.sub).toLowerCase();
    if (hay.includes(q)) return 3 - hay.indexOf(q) / 100;
    let i = 0; for (const ch of q) { i = hay.indexOf(ch, i); if (i < 0) return 0; i++; }
    return 1;
  }
  function draw() {
    const q = inp.value.trim().toLowerCase();
    items = catalog().map(it => ({ it, s: score(it, q) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.it).slice(0, 9);
    if (q) items.push({ kind: 'AI', label: '让 AI 执行：' + inp.value.trim(), sub: 'AI 指令台', run: () => runAI(inp.value.trim()) });
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = items.map((x, i) => `<div class="cmdk-item${i === sel ? ' sel' : ''}" role="option" aria-selected="${i === sel}" data-i="${i}"><span class="cmdk-kind k-${x.kind === '页面' ? 'page' : x.kind === 'AI' ? 'ai' : 'act'}">${x.kind}</span><span class="cmdk-label">${esc(x.label)}</span><span class="cmdk-sub">${esc(x.sub)}</span></div>`).join('') || '<div class="cmdk-empty">没有匹配项</div>';
  }
  function openPalette() { pal.hidden = false; requestAnimationFrame(() => pal.classList.add('show')); inp.value = ''; sel = 0; draw(); inp.focus(); }
  function closePalette() { if (pal.hidden) return; pal.classList.remove('show'); setTimeout(() => { pal.hidden = true; }, reduce ? 0 : 160); }
  function choose(i) { const x = items[i]; if (!x) return; closePalette(); x.run(); }
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, items.length); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % Math.max(1, items.length); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
    else if (e.key === 'Escape') closePalette();
  });
  list.addEventListener('mousemove', e => { const r = e.target.closest('.cmdk-item'); if (r && +r.dataset.i !== sel) { sel = +r.dataset.i; list.querySelectorAll('.cmdk-item').forEach((n, i) => { n.classList.toggle('sel', i === sel); n.setAttribute('aria-selected', i === sel); }); } });
  list.addEventListener('click', e => { const r = e.target.closest('.cmdk-item'); if (r) choose(+r.dataset.i); });
  pal.addEventListener('click', e => { if (e.target.closest('[data-cmdk-close]')) closePalette(); });
  const trig = doc.getElementById('btnCmdk'); if (trig) trig.addEventListener('click', openPalette);
  if (trig && !/Mac|iPhone|iPad/.test(navigator.platform)) { /* Ctrl K */ } else if (trig) trig.querySelector('kbd').textContent = '⌘K';
  doc.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); pal.hidden ? openPalette() : closePalette(); }
    else if (e.key === '/' && pal.hidden && !/INPUT|TEXTAREA|SELECT/.test((doc.activeElement || {}).tagName || '') && !(doc.activeElement || {}).isContentEditable) { e.preventDefault(); openPalette(); }
  });

  /* ---------- 渲染观察：每次视图重绘后收纳说明、滚动数字 ---------- */
  const content = doc.querySelector('.content');
  let moT = 0;
  const after = () => { declutter(content); countUp(content); updateGroupBadges(); };
  if (content) new MutationObserver(() => { cancelAnimationFrame(moT); moT = requestAnimationFrame(after); }).observe(content, { childList: true, subtree: true });
  if (window.OzonFlowStore && OzonFlowStore.subscribe) OzonFlowStore.subscribe(() => setTimeout(updateGroupBadges, 0));

  // 初始化：同步当前视图
  const act = doc.querySelector('.nav-item.active[data-view]');
  current = act ? act.dataset.view : 'dashboard';
  navAt = performance.now();
  crumb(current); resetGroups(); markLeaves(); after();
  body.classList.add('ux-ready');

  return { beforeRender, onNavigate, openPalette, closePalette, setPinned, declutter };
})();
