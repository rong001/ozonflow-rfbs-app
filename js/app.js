/**
 * OzonFlow · UI 层：全模块渲染 + 事件，读写共享 Store
 * 含 Wizard / 利润定价 / 客服评价 / 退货异常 / 周报 / 多店分区 / 角色
 */
(function () {
  const Store = window.OzonFlowStore;
  const Seeds = window.OzonFlowSeeds;

  const TITLES = {
    dashboard: '经营总览',
    selection: '智能选品',
    listing: '刊登上架',
    orders: '订单履约',
    rules: '自动化规则',
    logistics: '物流与库存',
    profit: '利润定价',
    cs: '客服评价',
    returns: '退货异常',
    weekly: '经营周报',
    agents: '自动化 Agent',
    copilot: 'AI 指令台',
    approvals: '审批中心',
    capability: '能力矩阵',
  };

  let currentView = 'dashboard';
  let listFilter = 'all';
  let orderFilter = 'all';
  let ruleType = 'all';
  let csTab = 'reviews';
  let returnFilter = 'all';
  let selectedCatalogId = null;
  let openOrderId = null;
  let wizardStep = 0;
  let profitTarget = null;

  /* ---------- Toast ---------- */
  function showToast(type, msg) {
    const box = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = 'toast ' + (type || 'info');
    const icon = type === 'success' ? '✓' : type === 'info' ? 'ℹ' : '•';
    t.innerHTML = '<span>' + icon + '</span><span>' + msg + '</span>';
    box.appendChild(t);
    while (box.children.length > 4) box.firstElementChild.remove();
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(20px)';
      t.style.transition = '.3s';
      setTimeout(() => t.remove(), 300);
    }, 2800);
  }
  window.showToast = showToast;

  function thumb(name, large) {
    const label = String(name || '品').trim() || '品';
    const ch = label.charAt(0);
    const palette = [215, 199, 168, 262, 152, 28, 188];
    let n = 0;
    for (let i = 0; i < label.length; i++) n = (n + label.charCodeAt(i)) % palette.length;
    return '<span class="thumb' + (large ? ' lg' : '') + '" style="--hue:' + palette[n] + '" aria-hidden="true">' + ch + '</span>';
  }

  const TONE_BY_TODO = {
    timeout: 'danger', audit: 'warn', purchase: 'accent', review: 'warn',
    returns: 'info', track: 'info', escalate: 'danger', fund: 'accent', listing: 'info', approval: 'danger'
  };
  const TONE_BY_AGENT = {
    selection_radar: 'info', listing_publish: 'info', order_fulfill: 'ok',
    timeout_rescue: 'danger', purchase_1688: 'accent', logistics_anomaly: 'warn',
    profit_guard: 'ok', fx_commission: 'info', ru_cs: 'info', review_escalate: 'danger',
    return_claim: 'warn', inventory_restock: 'accent', weekly_report: 'info'
  };
  function mark(tone) {
    return '<span class="ui-mark tone-' + (tone || 'info') + '" aria-hidden="true"></span>';
  }

  /* ---------- Navigate ---------- */
  function navigate(view, opts) {
    opts = opts || {};
    if (!Store.canView(view)) {
      showToast('info', '当前角色「' + Store.roleLabel() + '」无权访问「' + (TITLES[view] || (window.OFS && OFS.title(view)) || view) + '」');
      return;
    }
    currentView = view;
    if (opts.filter) {
      if (view === 'orders') orderFilter = opts.filter;
      if (view === 'returns') returnFilter = opts.filter;
      if (view === 'cs') csTab = opts.filter === 'bad' ? 'reviews' : opts.filter;
    }
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const el = document.getElementById('view-' + view);
    if (el) el.classList.add('active');
    document.querySelectorAll('.nav-item[data-view]').forEach(n => n.removeAttribute('aria-current'));
    const nav = document.querySelector('.nav-item[data-view="' + view + '"]');
    if (nav) {
      nav.classList.add('active');
      nav.setAttribute('aria-current', 'page');
    }
    document.getElementById('pageTitle').textContent = TITLES[view] || (window.OFS && OFS.title(view)) || view;
    if (window.OFUX) window.OFUX.beforeRender(view, opts);
    renderAll();
    if (window.OFUX) window.OFUX.onNavigate(view, opts);
  }
  window.navigate = navigate;

  /* ---------- Role-aware action gate ---------- */
  function guard(action, fn) {
    return function () {
      if (!Store.canDo(action) && Store.get().role !== 'boss') {
        showToast('info', '当前角色「' + Store.roleLabel() + '」无权执行此操作');
        return;
      }
      return fn.apply(this, arguments);
    };
  }

  /* ---------- Topbar ---------- */
  function renderTopbar() {
    const s = Store.get();
    const shop = Store.currentShop();
    document.getElementById('currentDemo').textContent = s.meta.name;
    document.getElementById('currentShop').textContent = shop ? shop.name : s.meta.shopName;
    document.getElementById('currentRole').textContent = Store.roleLabel();

    const demoDrop = document.getElementById('demoDropdown');
    demoDrop.innerHTML = Seeds.list().map(d =>
      '<button class="demo-opt' + (d.id === s.meta.id ? ' active' : '') + '" data-demo="' + d.id + '">' +
      '<span>' + d.label + '</span><span class="demo-meta">' + d.desc + '</span></button>'
    ).join('') +
      '<div class="demo-sep"></div>' +
      '<button class="demo-opt" data-action="reset"><span>重置当前场景数据</span><span class="demo-meta">清除本场景改动</span></button>' +
      '<button class="demo-opt" data-action="wizard"><span>打开开店引导</span><span class="demo-meta">冷启动入口</span></button>';

    const shopDrop = document.getElementById('shopDropdown');
    shopDrop.innerHTML = s.shops.map(sh => {
      const oc = s.orders.filter(o => o.shopId === sh.id).length;
      const rc = s.reviews.filter(r => r.shopId === sh.id && r.rating <= 3 && !r.replied).length;
      return '<button class="shop-opt' + (sh.id === s.currentShopId ? ' active' : '') + '" data-shop-id="' + sh.id + '">' +
        '<span>' + sh.name + '</span><span class="shop-meta">rFBS · ' + oc + '单' + (rc ? ' · ' + rc + '差评' : '') + '</span></button>';
    }).join('');

    const roleDrop = document.getElementById('roleDropdown');
    roleDrop.innerHTML = Object.values(Store.ROLES).map(r =>
      '<button class="role-opt' + (r.id === s.role ? ' active' : '') + '" data-role="' + r.id + '">' +
      '<span>' + r.label + '</span><span class="role-meta">' + roleHint(r.id) + '</span></button>'
    ).join('');

    // nav visibility by role
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      const v = btn.dataset.view;
      btn.style.display = Store.canView(v) ? '' : 'none';
    });
    document.querySelectorAll('.nav-section').forEach(sec => {
      const any = [...sec.querySelectorAll('.nav-item[data-view]')].some(b => b.style.display !== 'none');
      sec.style.display = any ? '' : 'none';
    });

    const ago = s.syncAgoMin;
    document.getElementById('syncText').textContent =
      '订单同步 · ' + (ago === 0 ? '刚刚' : ago + ' 分钟前');

    const k = Store.kpi();
    document.getElementById('notifDot').style.display = (k.risk > 0 || k.badReviews > 0) ? 'block' : 'none';

    const badges = Store.badges();
    setBadge('badgeListing', badges.listing);
    setBadge('badgeOrders', badges.orders);
    setBadge('badgeCs', badges.cs);
    setBadge('badgeReturns', badges.returns);
    setBadge('badgeApprovals', badges.approvals || 0);
    const asTop = Store.agentsSummary();
    setBadge('badgeAgents', asTop.onCount);
    if (window.OFS) {
      try { OFS.ext(); } catch (e) { /* ignore */ }
      const F = window.OFS, safe = fn => { try { return fn() || 0; } catch (e) { return 0; } };
      setBadge('badge-health', safe(() => { const h = F.healthOf(Store.currentShop().id); return h.tier.fine > 0 || h.risk >= 60 ? '!' : 0; }));
      setBadge('badge-finance', safe(() => F.financeSummary().diffs));
      setBadge('badge-promo', safe(() => F.adsSummary()));
      setBadge('badge-content', safe(() => { const c = F.contentSummary(); return c.cert + c.banned; }));
      setBadge('badge-compete', safe(() => F.products().filter(p => F.priceIndex(p).color === 'red').length));
      setBadge('badge-sla', safe(() => F.slaSummary().unsynced));
      setBadge('badge-inbox', safe(() => F.shop(F.ext().inbox.chats).filter(c => !c.replied).length));
    }

    const av = document.getElementById('avatarBtn');
    av.textContent = Store.roleLabel().slice(0, 1);
    av.title = '角色：' + Store.roleLabel();
  }

  function setBadge(id, n) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = n;
    el.style.display = n ? '' : 'none';
  }

  function roleHint(id) {
    return ({
      boss: '全权限 · 看周报',
      ops: '选品刊登履约',
      warehouse: '仓配发货退货',
      cs: '评价问答退货',
      finance: '对账结算利润',
    })[id] || '';
  }

  function shopName() { const sh = Store.currentShop(); return sh ? sh.name : Store.get().meta.shopName; }

  /* ---------- Dashboard ---------- */
  function renderDashboard() {
    const s = Store.get();
    const k = Store.kpi();
    const ap = (Store.badges().approvals || 0);
    const kc = (tone, label, value, sub, nav, filter) => `<div class="kpi-card ${tone}" data-nav="${nav}"${filter ? ` data-nav-filter="${filter}"` : ''} role="link" tabindex="0"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
    document.getElementById('kpiGrid').innerHTML =
      kc('blue', '今日订单', k.todayOrders, shopName(), 'orders') +
      kc('orange', '待发货', k.pendingShip, '含待采购 ' + k.purchaseCount, 'orders', 'ship') +
      kc('red' + (k.risk ? ' is-alert' : ''), '超时风险', k.risk, '距截单 &lt; 6h', 'orders', 'risk') +
      kc('green', '预估毛利 ₽', (k.gross / 1000).toFixed(1) + 'K', '已扣退货拨备', 'profit') +
      kc('purple', '差评 / 退货', k.badReviews + k.openReturns, '差评 ' + k.badReviews + ' · 退货 ' + k.openReturns, 'cs');
    const heroBits = [];
    if (k.risk) heroBits.push(`<em class="t-danger">${k.risk}</em> 单临近超时`);
    if (ap) heroBits.push(`<em>${ap}</em> 项待审批`);
    if (k.pendingShip && heroBits.length < 2) heroBits.push(`<em>${k.pendingShip}</em> 单待发货`);
    if (k.badReviews && heroBits.length < 2) heroBits.push(`<em>${k.badReviews}</em> 条差评待回`);
    const ht = document.getElementById('heroTitle');
    if (ht) ht.innerHTML = heroBits.length ? '今天先处理 ' + heroBits.join('，') : '今日运营平稳，待办已清空';
    const hd = document.getElementById('heroDate');
    if (hd) { const d = new Date(); hd.textContent = (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · 周' + '日一二三四五六'[d.getDay()] + ' · ' + (shopName()); }


    document.getElementById('chartShopTag').textContent = s.meta.shopName;
    const vals = s.trend;
    const max = Math.max(...vals, 1);
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const chart = document.getElementById('orderChart');
    chart.setAttribute('aria-label', '近 7 日订单：' + vals.map((v, i) => '周' + days[i] + ' ' + v + ' 单').join('，'));
    chart.innerHTML = vals.map((v, i) => {
      const h = Math.round((v / max) * 112);
      const peak = v === max && max > 0 ? ' is-peak' : '';
      return `<div class="chart-bar-wrap"><div class="chart-bar${peak}" style="height:${h}px" title="${v} 单"></div><div class="chart-bar-val">${v}</div><div class="chart-bar-label">周${days[i]}</div></div>`;
    }).join('');

    const todoList = Store.todos();
    document.getElementById('todoCountHint').textContent = todoList.length + ' 项';
    document.getElementById('todoList').innerHTML = todoList.length ? todoList.map(t => `
      <li>
        <div class="ml-icon tone-${TONE_BY_TODO[t.id] || 'info'}">${mark(TONE_BY_TODO[t.id] || 'info')}</div>
        <div class="ml-text"><div class="ml-title">${t.title}</div><div class="ml-sub">${t.sub}</div></div>
        <button class="btn btn-sm ${t.cls}" data-todo-nav="${t.view}" data-todo-filter="${t.filter || ''}">${t.btn}</button>
      </li>
    `).join('') : '<li class="hint empty-panel" style="border:none">今日待办已清空</li>';

    // wizard progress card
    const wp = Store.wizardProgress();
    const card = document.getElementById('wizardProgressCard');
    if (!wp.completed) {
      card.style.display = '';
      card.innerHTML = `
        <div class="wp-head">
          <div><b>开店进度</b> · ${wp.done}/${wp.total} 步完成</div>
          <button class="btn btn-sm btn-primary" id="btnContinueWizard">继续引导</button>
        </div>
        <div class="progress" style="margin:10px 0"><div class="progress-bar" style="width:${wp.pct}%"></div></div>
        <div class="wp-steps">${wp.steps.map(st =>
          `<span class="wp-chip ${st.done ? 'done' : ''}">${st.done ? '✓' : '○'} ${st.label}</span>`
        ).join('')}</div>`;
    } else {
      card.style.display = 'none';
    }

    const products = Store.forShop(s.products);
    const inventory = Store.forShop(s.inventory);
    const hot = [...products].sort((a, b) => (b.todaySales || 0) - (a.todaySales || 0)).slice(0, 5);
    document.getElementById('hotBody').innerHTML = hot.map(p => {
      const inv = inventory.find(i => i.sku === p.sku);
      const stock = inv ? inv.local : 0;
      const stockCls = stock <= (inv ? inv.safe : 20) ? 'stock-low' : 'stock-ok';
      return `<tr>
        <td><div class="prod-cell">${thumb(p.name)}<div><div class="prod-name">${p.ru || p.name}</div><div class="prod-sku">${p.name}</div></div></div></td>
        <td class="mono">${p.ozonSku || '—'}</td>
        <td><b>${p.todaySales || 0}</b></td>
        <td>${p.price.toLocaleString('ru-RU')} ₽</td>
        <td><span class="tag tag-green">+${p.margin || 0}%</span></td>
        <td><span class="${stockCls}">${stock}</span></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="hint" style="padding:24px;text-align:center">本店暂无在售 — 请先选品认领并发布，或打开开店 Wizard</td></tr>';

    // Agent 今日已处理 strip
    const as = Store.agentsSummary();
    const countEl = document.getElementById('agentTodayCount');
    if (countEl) countEl.textContent = as.todayTotal;
    const onHint = document.getElementById('agentOnHint');
    if (onHint) onHint.textContent = as.onCount + '/' + as.agents.length + ' 个已启用';

  }

  /* ---------- Selection ---------- */
  function renderSelection() {
    const s = Store.get();
    const q = (document.getElementById('selSearch').value || '').trim().toLowerCase();
    const cat = document.getElementById('selCat').value;
    let list = s.catalog.slice();
    if (cat) list = list.filter(c => c.cat === cat);
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || c.ru.toLowerCase().includes(q) || (c.skuHint || '').toLowerCase().includes(q));

    const shopListings = Store.forShop(s.listings);
    document.getElementById('selProdGrid').innerHTML = list.map(p => {
      const claimed = s.claimedIds.includes(p.id) || shopListings.some(l => l.sku === p.skuHint);
      return `
      <div class="prod-card" data-cid="${p.id}">
        <div class="prod-card-img"><span class="rank">TOP ${p.rank}</span>${thumb(p.name)}</div>
        <div class="prod-card-body">
          <div class="prod-card-title">${p.name}</div>
          <div class="prod-card-ru">${p.ru}</div>
          <div class="prod-card-meta">
            <div class="prod-card-price">${p.price.toLocaleString('ru-RU')} ₽ <span>/ 月销 ${p.sales}</span></div>
            <span class="tag tag-green">毛利 ~${p.margin}%</span>
          </div>
          <div class="prod-card-meta" style="margin-bottom:12px">
            <span class="hint">1688 匹配度 <b style="color:var(--success)">${p.match}%</b> · ¥${p.cost}</span>
          </div>
          <div class="prod-card-actions">
            <button class="btn btn-secondary btn-sm" data-calc="${p.id}">测算利润</button>
            <button class="btn btn-primary btn-sm" data-claim="${p.id}" ${claimed ? 'disabled' : ''}>${claimed ? '已认领' : '认领'}</button>
          </div>
        </div>
      </div>`;
    }).join('') || '<div class="empty-panel">没有匹配的选品。调整类目或关键词后再试。</div>';

    document.getElementById('calcFx').textContent = s.settings.fx;
    if (selectedCatalogId) {
      const c = s.catalog.find(x => x.id === selectedCatalogId);
      if (c) fillCalc(c);
    } else if (list[0]) {
      selectedCatalogId = list[0].id;
      fillCalc(list[0]);
    }
  }

  function fillCalc(p) {
    document.getElementById('calcName').textContent = p.name;
    document.getElementById('calcPrice').value = p.price;
    document.getElementById('calcCost').value = p.cost;
    document.getElementById('calcWeight').value = p.weight;
    runProfitCalc(false);
  }

  function runProfitCalc(toast) {
    const price = parseFloat(document.getElementById('calcPrice').value) || 0;
    const cost = parseFloat(document.getElementById('calcCost').value) || 0;
    const weight = parseFloat(document.getElementById('calcWeight').value) || 0;
    const r = Store.calcProfit({ price, costCNY: cost, weight });
    document.getElementById('calcComm').textContent = Math.round(r.commission).toLocaleString('ru-RU') + ' ₽ (' + (r.commissionRate * 100).toFixed(1) + '%)';
    document.getElementById('calcShip').textContent = Math.round(r.ship).toLocaleString('ru-RU') + ' ₽';
    document.getElementById('calcFee').textContent = Math.round(r.fee + r.retProv).toLocaleString('ru-RU') + ' ₽';
    document.getElementById('calcProfit').textContent = Math.round(r.profit).toLocaleString('ru-RU') + ' ₽';
    document.getElementById('calcMargin').textContent = r.margin.toFixed(1) + '%';
    document.getElementById('calcProfit').style.color = r.profit > 0 ? '#4ade80' : '#f87171';
    if (toast !== false) showToast('success', `测算完成 · 净利 ${Math.round(r.profit)} ₽ · 利润率 ${r.margin.toFixed(1)}%`);
  }

  /* ---------- Listing ---------- */
  function renderListing() {
    const s = Store.get();
    const listings = Store.forShop(s.listings);
    const counts = {
      all: listings.length,
      draft: listings.filter(l => l.status === 'draft').length,
      mapping: listings.filter(l => l.status === 'mapping').length,
      ready: listings.filter(l => l.status === 'ready').length,
      failed: listings.filter(l => l.status === 'failed').length,
      published: listings.filter(l => l.status === 'published').length,
    };
    const tabs = [
      ['all', '全部'], ['draft', '草稿'], ['mapping', '映射中'],
      ['ready', '待发布'], ['failed', '审核失败'], ['published', '已发布'],
    ];
    document.getElementById('listingTabs').innerHTML = tabs.map(([k, label]) =>
      `<button class="filter-tab${listFilter === k ? ' active' : ''}" data-list-filter="${k}">${label} <span class="count">${counts[k] || 0}</span></button>`
    ).join('');

    const rows = listings.filter(l => listFilter === 'all' || l.status === listFilter);
    const statusMap = {
      draft: ['草稿', 'tag-gray'], mapping: ['映射中', 'tag-orange'],
      ready: ['待发布', 'tag-blue'], failed: ['审核失败', 'tag-red'],
      published: ['已发布', 'tag-green'],
    };
    document.getElementById('listingBody').innerHTML = rows.map(l => {
      const [label, tag] = statusMap[l.status] || ['?', 'tag-gray'];
      const barColor = l.map >= 90 ? 'green' : l.map >= 50 ? 'orange' : 'red';
      let actions = `<button class="btn btn-sm btn-ghost" data-adv="${l.id}">推进映射</button>`;
      if (l.status === 'ready') actions += ` <button class="btn btn-sm btn-primary" data-pub="${l.id}">发布</button>`;
      if (l.status === 'failed') actions += ` <button class="btn btn-sm btn-danger" data-fix="${l.id}">修复</button>`;
      if (l.status === 'published') actions = '<span class="hint">已上架</span>';
      actions += ` <button class="btn btn-sm btn-ghost" data-pf-listing="${l.id}">测算</button>`;
      return `<tr>
        <td><div class="prod-cell">${thumb(l.name)}<div><div class="prod-name">${l.name}</div><div class="prod-sku">${l.sku}</div></div></div></td>
        <td style="max-width:220px;font-size:12px;color:var(--text-secondary)">${l.ru}</td>
        <td style="font-size:12px">${l.cat}</td>
        <td style="min-width:120px">
          <div class="flex gap-8"><span style="font-weight:600;min-width:36px">${l.map}%</span>
          <div class="progress" style="flex:1;margin-top:6px"><div class="progress-bar ${barColor}" style="width:${l.map}%"></div></div></div>
        </td>
        <td><span class="tag ${tag}">${label}</span>${l.failReason ? '<div class="hint">' + l.failReason + '</div>' : ''}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="hint" style="padding:24px;text-align:center">本店暂无刊登 — 去「智能选品」认领，或打开开店 Wizard</td></tr>';
  }

  /* ---------- Orders ---------- */
  function renderOrders() {
    const s = Store.get();
    const orders = Store.forShop(s.orders);
    const counts = {
      all: orders.length,
      audit: orders.filter(o => o.status === 'audit').length,
      purchase: orders.filter(o => o.status === 'purchase').length,
      ship: orders.filter(o => o.status === 'ship').length,
      shipped: orders.filter(o => o.status === 'shipped').length,
      risk: orders.filter(o => o.risk || (o.etaH != null && o.etaH <= 6 && o.status !== 'shipped')).length,
    };
    const tabs = [
      ['all', '全部'], ['audit', '待审核'], ['purchase', '待采购'],
      ['ship', '待发货'], ['shipped', '已发货'], ['risk', '超时风险'],
    ];
    document.getElementById('orderTabs').innerHTML = tabs.map(([k, label]) =>
      `<button class="filter-tab${orderFilter === k ? ' active' : ''}" data-order-filter="${k}">${label} <span class="count">${counts[k] || 0}</span></button>`
    ).join('');

    const q = (document.getElementById('orderSearch').value || '').trim().toLowerCase();
    let rows = orders.filter(o => {
      if (orderFilter === 'risk') return o.risk || (o.etaH != null && o.etaH <= 6 && o.status !== 'shipped');
      if (orderFilter !== 'all' && o.status !== orderFilter) return false;
      return true;
    });
    if (q) {
      rows = rows.filter(o =>
        o.id.toLowerCase().includes(q) || o.name.toLowerCase().includes(q) ||
        o.buyer.toLowerCase().includes(q) || o.sku.toLowerCase().includes(q)
      );
    }

    const canAudit = Store.canDo('audit') || s.role === 'boss';
    const canWaybill = Store.canDo('waybill') || s.role === 'boss';
    const canShip = Store.canDo('ship') || s.role === 'boss';
    const canPurch = Store.canDo('purchase') || s.role === 'boss';

    document.getElementById('orderBody').innerHTML = rows.map(o => {
      const tag = Store.statusTag(o.status);
      const eta = o.etaH == null ? '—' : o.etaH + 'h';
      const isRisk = o.risk || (o.etaH != null && o.etaH <= 6 && o.status !== 'shipped');
      let ops = '';
      if (o.status === 'audit' && canAudit) ops += `<button class="btn btn-sm btn-secondary" data-audit="${o.id}">审单</button> `;
      if (o.status === 'purchase' && canPurch) ops += `<button class="btn btn-sm btn-secondary" data-purch="${o.id}">采购完成</button> `;
      if ((o.status === 'ship' || o.status === 'purchase') && !o.track && canWaybill) ops += `<button class="btn btn-sm btn-primary" data-waybill="${o.id}">面单</button> `;
      if ((o.status === 'ship' || o.status === 'purchase') && o.track && canShip) ops += `<button class="btn btn-sm btn-primary" data-ship="${o.id}">发货</button> `;
      return `<tr class="clickable" data-open="${o.id}">
        <td class="mono">${o.id}</td>
        <td><div class="prod-cell">${thumb(o.name)}<div><div class="prod-name">${o.name}</div><div class="prod-sku">${o.sku}</div></div></div></td>
        <td>${o.buyer}<br/><span class="hint">${o.city}</span></td>
        <td><b>${o.amount.toLocaleString('ru-RU')}</b></td>
        <td>${o.logistics === '—' ? '<span class="hint">未分配</span>' : o.logistics}</td>
        <td>${(o.auto || []).map(a => `<span class="tag tag-green" style="margin:1px">${a}</span>`).join(' ') || '<span class="hint">—</span>'}</td>
        <td><span class="tag ${tag}">${o.statusLabel}</span></td>
        <td>${isRisk ? `<span class="tag tag-red">${eta}</span>` : `<span class="hint">${eta}</span>`}</td>
        <td class="row-ops">${ops || '<span class="hint">—</span>'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="9" class="hint" style="padding:24px;text-align:center">本店暂无订单 — 点击「同步订单」拉取新订单</td></tr>';
  }

  function openOrderDrawer(id) {
    const s = Store.get();
    const o = s.orders.find(x => x.id === id);
    if (!o) return;
    openOrderId = id;
    document.getElementById('drawerTitle').textContent = '订单 ' + o.id;
    const p = Store.calcProfit({ price: o.amount, costCNY: o.cost, weight: o.weight });
    document.getElementById('drawerBody').innerHTML = `
      <div class="detail-section">
        <h4>商品信息</h4>
        <div class="prod-cell" style="margin-bottom:12px">
          ${thumb(o.name, true)}
          <div>
            <div style="font-weight:600">${o.name}</div>
            <div class="hint">${o.sku} · ${o.weight}g · 店铺 ${o.shopId || '—'}</div>
            <div style="margin-top:4px"><span class="tag ${Store.statusTag(o.status)}">${o.statusLabel}</span></div>
          </div>
        </div>
      </div>
      <div class="detail-section">
        <h4>订单信息</h4>
        <div class="detail-row"><span class="dl">买家</span><span class="dv">${o.buyer}</span></div>
        <div class="detail-row"><span class="dl">收货城市</span><span class="dv">${o.city}</span></div>
        <div class="detail-row"><span class="dl">订单金额</span><span class="dv"><b>${o.amount.toLocaleString('ru-RU')} ₽</b></span></div>
        <div class="detail-row"><span class="dl">采购成本</span><span class="dv">¥${o.cost} ≈ ${Math.round(p.costRUB)} ₽</span></div>
        <div class="detail-row"><span class="dl">预估毛利</span><span class="dv" style="color:var(--success)">≈ ${Math.round(p.profit)} ₽ (${p.margin.toFixed(1)}%)</span></div>
        <div class="detail-row"><span class="dl">物流渠道</span><span class="dv">${o.logistics}</span></div>
        ${o.track ? `<div class="detail-row"><span class="dl">运单号</span><span class="dv mono">${o.track}</span></div>` : ''}
        <div class="detail-row"><span class="dl">剩余时效</span><span class="dv">${o.etaH == null ? '—' : o.etaH + 'h'}</span></div>
      </div>
      <div class="detail-section">
        <h4>自动化轨迹</h4>
        <div class="timeline">
          ${(o.timeline || []).map(t => `<div class="timeline-item ${t.done ? 'done' : 'pending'}"><div class="timeline-time">${t.t}</div><div class="timeline-text">${t.text}</div></div>`).join('')}
          ${o.status !== 'shipped' ? '<div class="timeline-item pending"><div class="timeline-time">待执行</div><div class="timeline-text">提交平台发货</div></div>' : ''}
        </div>
      </div>
      <div class="detail-section">
        <h4>快捷操作</h4>
        <div class="flex gap-8" style="flex-wrap:wrap">
          ${o.status === 'audit' ? `<button class="btn btn-sm btn-secondary" data-audit="${o.id}">手动审单</button>` : ''}
          ${!o.logisticsId ? `<button class="btn btn-sm btn-secondary" data-assign="${o.id}">匹配物流</button>` : ''}
          ${o.status === 'purchase' ? `<button class="btn btn-sm btn-secondary" data-purch="${o.id}">采购完成</button>` : ''}
          ${!o.track && o.status !== 'shipped' ? `<button class="btn btn-sm btn-primary" data-waybill="${o.id}">申请面单</button>` : ''}
          ${o.track && o.status !== 'shipped' ? `<button class="btn btn-sm btn-primary" data-ship="${o.id}">确认发货</button>` : ''}
        </div>
      </div>
    `;
    document.getElementById('drawerOverlay').classList.add('open');
    document.getElementById('orderDrawer').classList.add('open');
  }

  function closeDrawer() {
    openOrderId = null;
    document.getElementById('drawerOverlay').classList.remove('open');
    document.getElementById('orderDrawer').classList.remove('open');
  }

  /* ---------- Rules ---------- */
  function renderRules() {
    const s = Store.get();
    let rules = s.rules;
    if (ruleType !== 'all') rules = rules.filter(r => r.type === ruleType);
    const canToggle = Store.canDo('rules') || s.role === 'boss';
    document.getElementById('ruleGrid').innerHTML = rules.map(r => `
      <div class="rule-card ${r.on ? '' : 'off'}" id="rule-${r.id}">
        <div class="rule-card-head">
          <div class="rule-icon ${r.iconClass}">${mark(r.iconClass === 'green' ? 'ok' : r.iconClass === 'orange' ? 'warn' : r.iconClass === 'purple' ? 'accent' : 'info')}</div>
          <div class="rule-info">
            <div class="rule-name">${r.name}</div>
            <div class="rule-desc">${r.desc}</div>
          </div>
          <label class="toggle" title="启用/停用">
            <input type="checkbox" data-toggle-rule="${r.id}" ${r.on ? 'checked' : ''} ${canToggle ? '' : 'disabled'} aria-label="启用或停用 ${r.name}" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="rule-conditions">${r.conditionsHtml}</div>
        <div class="rule-actions">
          <span class="rule-stats">累计命中 ${r.hits} · 今日 ${r.today}</span>
        </div>
      </div>
    `).join('') || '<div class="hint" style="padding:24px">无匹配规则</div>';
  }

  /* ---------- Logistics ---------- */
  function renderLogistics() {
    const s = Store.get();
    document.getElementById('channelGrid').innerHTML = s.channels.map(ch => `
      <div class="channel-card ${ch.connected ? 'connected' : ''}">
        <div class="channel-head">
          <div class="channel-logo" style="background:${ch.logoBg};color:${ch.logoColor}">${ch.logo}</div>
          <div>
            <div class="channel-name">${ch.name}</div>
            <div class="channel-meta">${ch.connected ? (ch.isWarehouse ? '本地仓对接' : ch.isOgl ? '组包发运已启用' : '已连接') : '未连接'}</div>
          </div>
          ${ch.connected
            ? (ch.isOgl ? '<span class="tag tag-purple" style="margin-left:auto">OGL</span>'
              : ch.isWarehouse ? '<span class="tag tag-blue" style="margin-left:auto">仓库</span>'
              : '<span class="tag tag-green" style="margin-left:auto">在线</span>')
            : `<button class="btn btn-sm btn-primary" style="margin-left:auto" data-connect="${ch.id}">连接</button>`}
        </div>
        <div class="channel-stats">
          <div><span>均价</span><br/><strong>${ch.pricePerKg == null ? '按平台计费' : ch.pricePerKg === 0 ? '—' : '¥' + ch.pricePerKg + '/kg'}</strong></div>
          <div><span>时效</span><br/><strong>${ch.eta}</strong></div>
          <div><span>${ch.isWarehouse ? '在库 SKU' : '今日'}</span><br/><strong>${ch.isWarehouse ? Store.forShop(s.inventory).length : (ch.connected ? ch.today + ' 票' : '—')}</strong></div>
        </div>
      </div>
    `).join('');

    const inv = Store.forShop(s.inventory);
    document.getElementById('invBody').innerHTML = inv.map(i => {
      const syncTag = i.sync === 'ok' ? '<span class="tag tag-green">正常</span>'
        : i.sync === 'warn' ? '<span class="tag tag-orange">低库存</span>'
        : '<span class="tag tag-red">缺货</span>';
      return `<tr>
        <td class="mono">${i.sku}</td>
        <td><div class="prod-cell">${thumb(i.name)}<div class="prod-name">${i.name}</div></div></td>
        <td><b>${i.local}</b></td>
        <td>${i.ozon}</td>
        <td>${i.safe}</td>
        <td>${syncTag}</td>
        <td><button class="btn btn-sm btn-secondary" data-restock="${i.sku}">补货 +50</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="hint" style="padding:24px;text-align:center">本店暂无库存 — 发布商品后自动创建</td></tr>';
  }

  /* ---------- Profit page ---------- */
  function renderProfit() {
    const s = Store.get();
    const set = s.settings;
    document.getElementById('rateGrid').innerHTML = `
      <div class="rate-item"><label>汇率 ¥→₽</label><input class="input" id="rateFx" type="number" step="0.01" value="${set.fx}" /></div>
      <div class="rate-item"><label>头程 ¥/kg</label><input class="input" id="rateShip" type="number" step="0.1" value="${set.shipCnyPerKg}" /></div>
      <div class="rate-item"><label>支付手续费</label><input class="input" id="rateFee" type="number" step="0.001" value="${set.paymentFee}" /></div>
      <div class="rate-item"><label>退货拨备</label><input class="input" id="rateRet" type="number" step="0.01" value="${set.returnProvision}" /></div>
      <div class="rate-tiers">
        <div class="hint" style="margin-bottom:8px">佣金阶梯（按售价 ₽）</div>
        ${(set.commissionTiers || []).map(t =>
          `<div class="tier-row"><span>${t.label}</span><b>${(t.rate * 100).toFixed(1)}%</b></div>`
        ).join('')}
      </div>
      <button class="btn btn-secondary btn-sm" id="btnSaveRates" style="margin-top:10px">保存费率</button>
    `;

    const picks = [
      ...s.catalog.slice(0, 6).map(c => ({ id: c.id, emoji: c.emoji, name: c.name, price: c.price, cost: c.cost, weight: c.weight, src: 'catalog' })),
      ...Store.forShop(s.products).slice(0, 4).map(p => ({ id: p.id, emoji: p.emoji, name: p.name, price: p.price, cost: p.cost, weight: p.weight, src: 'product' })),
    ];
    document.getElementById('profitPickBody').innerHTML = picks.map(p => `
      <tr>
        <td><div class="prod-cell">${thumb(p.name)}<div class="prod-name">${p.name}</div></div></td>
        <td>${p.price.toLocaleString('ru-RU')}</td>
        <td>¥${p.cost}</td>
        <td><button class="btn btn-sm btn-primary" data-pf-pick="${p.src}:${p.id}" data-pf-price="${p.price}" data-pf-cost="${p.cost}" data-pf-weight="${p.weight}" data-pf-name="${p.name}">测算利润</button></td>
      </tr>
    `).join('');

    renderScenarios();
  }

  function renderScenarios() {
    const price = parseFloat(document.getElementById('pfPrice').value) || 0;
    const cost = parseFloat(document.getElementById('pfCost').value) || 0;
    const weight = parseFloat(document.getElementById('pfWeight').value) || 0;
    const name = profitTarget || '自定义商品';
    const scenarios = [
      { key: 'normal', label: '日常价', tip: '当前售价' },
      { key: 'follow', label: '跟卖价', tip: '售价 × 95%' },
      { key: 'promo', label: '活动价', tip: '售价 × 90%' },
    ];
    document.getElementById('scenarioBody').innerHTML = `
      <div class="hint" style="margin-bottom:12px">测算对象：<b>${name}</b></div>
      <div class="scenario-grid">
        ${scenarios.map(sc => {
          const r = Store.calcProfit({ price, costCNY: cost, weight, scenario: sc.key });
          const ok = r.profit > 0;
          return `<div class="scenario-card ${ok ? 'ok' : 'bad'}">
            <div class="sc-label">${sc.label} <span class="hint">${sc.tip}</span></div>
            <div class="sc-price">${r.sellPrice.toLocaleString('ru-RU')} ₽</div>
            <div class="sc-row"><span>佣金 ${(r.commissionRate * 100).toFixed(1)}%</span><span>${Math.round(r.commission)} ₽</span></div>
            <div class="sc-row"><span>头程</span><span>${Math.round(r.ship)} ₽</span></div>
            <div class="sc-row"><span>手续费+拨备</span><span>${Math.round(r.fee + r.retProv)} ₽</span></div>
            <div class="sc-profit">${Math.round(r.profit).toLocaleString('ru-RU')} ₽</div>
            <div class="sc-margin">利润率 ${r.margin.toFixed(1)}%</div>
          </div>`;
        }).join('')}
      </div>
    `;
  }

  /* ---------- CS ---------- */
  function renderCs() {
    const s = Store.get();
    const reviews = Store.forShop(s.reviews);
    const qa = Store.forShop(s.qa);
    const bad = reviews.filter(r => r.rating <= 3 && !r.replied).length;
    const unanswered = qa.filter(q => !q.answered).length;
    document.getElementById('csHint').textContent = `待回差评 ${bad} · 待答问答 ${unanswered}`;

    document.querySelectorAll('[data-cs-tab]').forEach(t => {
      t.classList.toggle('active', t.dataset.csTab === csTab);
    });

    const body = document.getElementById('csBody');
    if (csTab === 'templates') {
      body.innerHTML = `<div class="card"><div class="card-body">
        <div class="template-grid">
          ${s.replyTemplates.map(t => `
            <div class="template-card">
              <div class="tpl-name">${t.name}</div>
              <div class="hint">${t.zh}</div>
              <div class="tpl-ru">${t.ru}</div>
              <button class="btn btn-sm btn-secondary" data-copy-tpl="${t.id}">复制俄语模板</button>
            </div>
          `).join('')}
        </div>
      </div></div>`;
      return;
    }

    if (csTab === 'qa') {
      body.innerHTML = `<div class="card" style="margin:0"><div class="card-body" style="padding:0">
        <table class="data-table">
          <thead><tr><th>商品</th><th>提问</th><th>回答</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            ${qa.map(q => `
              <tr>
                <td><div class="prod-name">${q.product}</div><div class="prod-sku">${q.sku}</div></td>
                <td style="max-width:260px">${q.question}</td>
                <td style="max-width:260px;font-size:12px;color:var(--text-secondary)">${q.answer || '—'}</td>
                <td>${q.answered ? '<span class="tag tag-green">已答</span>' : '<span class="tag tag-orange">待答</span>'}</td>
                <td>${q.answered ? '' : `<button class="btn btn-sm btn-primary" data-answer-qa="${q.id}">快速回答</button>`}</td>
              </tr>
            `).join('') || '<tr><td colspan="5" class="hint" style="padding:24px;text-align:center">本店暂无问答</td></tr>'}
          </tbody>
        </table>
      </div></div>`;
      return;
    }

    // reviews
    const showBad = true;
    body.innerHTML = `<div class="card" style="margin:0"><div class="card-body" style="padding:0">
      <table class="data-table">
        <thead><tr><th>商品</th><th>评分</th><th>评价内容</th><th>买家</th><th>回复</th><th>操作</th></tr></thead>
        <tbody>
          ${reviews.map(r => {
            const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
            const badCls = r.rating <= 3 ? 'tag-red' : 'tag-green';
            return `<tr class="${r.rating <= 3 && !r.replied ? 'row-alert' : ''}">
              <td><div class="prod-cell">${thumb(r.product)}<div><div class="prod-name">${r.product}</div><div class="prod-sku">${r.sku}</div></div></div></td>
              <td><span class="tag ${badCls}">${stars}</span></td>
              <td style="max-width:280px;font-size:12px">${r.text}</td>
              <td>${r.buyer}<br/><span class="hint">${r.created}</span></td>
              <td style="max-width:200px;font-size:12px;color:var(--text-secondary)">${r.replied ? r.reply : '<span class="tag tag-orange">待回复</span>'}</td>
              <td>${r.replied ? '<span class="hint">已回</span>' : `<button class="btn btn-sm btn-primary" data-reply-review="${r.id}">模板回复</button>`}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="6" class="hint" style="padding:24px;text-align:center">本店暂无评价</td></tr>'}
        </tbody>
      </table>
    </div></div>`;
  }

  /* ---------- Returns ---------- */
  function renderReturns() {
    const s = Store.get();
    const returns = Store.forShop(s.returns);
    const counts = {
      all: returns.length,
      open: returns.filter(r => r.status === 'open').length,
      investigating: returns.filter(r => r.status === 'investigating').length,
      approved: returns.filter(r => r.status === 'approved').length,
      closed: returns.filter(r => ['closed', 'refunded', 'rejected'].includes(r.status)).length,
    };
    const tabs = [
      ['all', '全部'], ['open', '待处理'], ['investigating', '调查中'],
      ['approved', '已同意'], ['closed', '已完结'],
    ];
    document.getElementById('returnTabs').innerHTML = tabs.map(([k, label]) =>
      `<button class="filter-tab${returnFilter === k ? ' active' : ''}" data-return-filter="${k}">${label} <span class="count">${counts[k] || 0}</span></button>`
    ).join('');

    let rows = returns;
    if (returnFilter === 'open') rows = returns.filter(r => r.status === 'open');
    else if (returnFilter === 'investigating') rows = returns.filter(r => r.status === 'investigating');
    else if (returnFilter === 'approved') rows = returns.filter(r => r.status === 'approved');
    else if (returnFilter === 'closed') rows = returns.filter(r => ['closed', 'refunded', 'rejected'].includes(r.status));

    const typeLabel = { cancel: '取消', return: '退货', claim: '索赔' };
    const typeTag = { cancel: 'tag-gray', return: 'tag-orange', claim: 'tag-red' };
    const statusTag = {
      open: 'tag-orange', investigating: 'tag-blue', approved: 'tag-green',
      rejected: 'tag-red', refunded: 'tag-purple', closed: 'tag-gray',
    };

    document.getElementById('returnBody').innerHTML = rows.map(r => {
      const nextBtns = [];
      if (r.status === 'open') {
        nextBtns.push(`<button class="btn btn-sm btn-secondary" data-ret-adv="${r.id}" data-ret-to="investigating">调查</button>`);
        nextBtns.push(`<button class="btn btn-sm btn-primary" data-ret-adv="${r.id}" data-ret-to="approved">同意</button>`);
        nextBtns.push(`<button class="btn btn-sm btn-danger" data-ret-adv="${r.id}" data-ret-to="rejected">拒绝</button>`);
      } else if (r.status === 'investigating') {
        nextBtns.push(`<button class="btn btn-sm btn-primary" data-ret-adv="${r.id}" data-ret-to="approved">同意</button>`);
        nextBtns.push(`<button class="btn btn-sm btn-danger" data-ret-adv="${r.id}" data-ret-to="rejected">拒绝</button>`);
      } else if (r.status === 'approved') {
        nextBtns.push(`<button class="btn btn-sm btn-primary" data-ret-adv="${r.id}" data-ret-to="refunded">退款</button>`);
      } else if (r.status === 'refunded' || r.status === 'rejected') {
        nextBtns.push(`<button class="btn btn-sm btn-ghost" data-ret-adv="${r.id}" data-ret-to="closed">关闭</button>`);
      }
      return `<tr>
        <td class="mono">${r.id}</td>
        <td class="mono">${r.orderId}</td>
        <td><span class="tag ${typeTag[r.type] || 'tag-gray'}">${typeLabel[r.type] || r.type}</span></td>
        <td><div class="prod-cell">${thumb(r.product)}<div class="prod-name">${r.product}</div></div></td>
        <td style="max-width:200px;font-size:12px">${r.reason}</td>
        <td><b>${r.amount.toLocaleString('ru-RU')}</b></td>
        <td><span class="tag ${statusTag[r.status] || 'tag-gray'}">${Store.RETURN_LABELS[r.status] || r.status}</span></td>
        <td>${nextBtns.join(' ') || '<span class="hint">—</span>'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" class="hint" style="padding:24px;text-align:center">本店暂无退货异常</td></tr>';
  }

  /* ---------- Weekly ---------- */
  function renderWeekly() {
    const report = Store.weeklyReport();
    const totalSales = report.shops.reduce((s, x) => s + x.sales, 0);
    const totalProfit = report.shops.reduce((s, x) => s + x.profit, 0);
    const avgTimeout = report.shops.length
      ? (report.shops.reduce((s, x) => s + x.timeoutRate, 0) / report.shops.length)
      : 0;
    const avgReturn = report.shops.length
      ? (report.shops.reduce((s, x) => s + x.returnRate, 0) / report.shops.length)
      : 0;

    document.getElementById('weeklyKpi').innerHTML = `
      <div class="kpi-card blue"><div class="kpi-label">本周销售额</div><div class="kpi-value">${(totalSales / 1000).toFixed(1)}K</div><div class="kpi-sub neutral">₽ · 全店合计</div></div>
      <div class="kpi-card green"><div class="kpi-label">预估净利</div><div class="kpi-value">${(totalProfit / 1000).toFixed(1)}K</div><div class="kpi-sub up">₽</div></div>
      <div class="kpi-card red"><div class="kpi-label">平均超时率</div><div class="kpi-value">${avgTimeout.toFixed(1)}%</div><div class="kpi-sub down">rFBS 时效</div></div>
      <div class="kpi-card orange"><div class="kpi-label">平均退货率</div><div class="kpi-value">${avgReturn.toFixed(1)}%</div><div class="kpi-sub neutral">含取消/索赔</div></div>
    `;

    document.getElementById('weeklyShopBody').innerHTML = report.shops.map(sh => `
      <tr class="${sh.shopId === Store.shopId() ? 'row-active' : ''}">
        <td><b>${sh.name}</b>${sh.shopId === Store.shopId() ? ' <span class="tag tag-blue">当前</span>' : ''}</td>
        <td>${sh.orders}</td>
        <td>${sh.shipped}</td>
        <td>${sh.sales.toLocaleString('ru-RU')}</td>
        <td style="color:var(--success)">${sh.profit.toLocaleString('ru-RU')}</td>
        <td><span class="tag tag-green">${sh.margin}%</span></td>
        <td><span class="tag ${sh.timeoutRate > 20 ? 'tag-red' : 'tag-orange'}">${sh.timeoutRate}%</span></td>
        <td><span class="tag ${sh.returnRate > 15 ? 'tag-red' : 'tag-gray'}">${sh.returnRate}%</span></td>
      </tr>
    `).join('');

    document.getElementById('weeklySkuBody').innerHTML = report.skus.map(sk => `
      <tr>
        <td class="mono">${sk.sku}</td>
        <td><div class="prod-cell">${thumb(sk.name)}<div class="prod-name">${sk.name}</div></div></td>
        <td>${sk.qty}</td>
        <td>${sk.sales.toLocaleString('ru-RU')}</td>
        <td style="color:var(--success)">${sk.profit.toLocaleString('ru-RU')}</td>
        <td><span class="tag tag-green">${sk.margin}%</span></td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="hint" style="padding:24px;text-align:center">当前店铺暂无订单数据</td></tr>';
  }

  /* ---------- Wizard ---------- */
  function openWizard(forceStep) {
    const wp = Store.wizardProgress();
    wizardStep = forceStep != null ? forceStep : (wp.completed ? 0 : wp.done);
    if (wizardStep > 3) wizardStep = 3;
    document.getElementById('wizardOverlay').classList.add('open');
    renderWizard();
  }

  function closeWizard() {
    document.getElementById('wizardOverlay').classList.remove('open');
  }

  function renderWizard() {
    const s = Store.get();
    const w = s.wizard;
    const steps = [
      { id: 0, label: '绑定店铺' },
      { id: 1, label: '选择 rFBS' },
      { id: 2, label: '默认物流' },
      { id: 3, label: '导入商品' },
    ];
    document.getElementById('wizardSteps').innerHTML = steps.map(st =>
      `<div class="wz-step ${st.id === wizardStep ? 'active' : ''} ${st.id < wizardStep || (st.id === 0 && w.shopBound) || (st.id === 1 && w.rfbsChosen) || (st.id === 2 && w.defaultLogistics) || (st.id === 3 && w.productsImported) ? 'done' : ''}">
        <div class="wz-num">${st.id + 1}</div><div class="wz-label">${st.label}</div>
      </div>`
    ).join('<div class="wz-line"></div>');

    const body = document.getElementById('wizardBody');
    const footer = document.getElementById('wizardFooter');

    if (wizardStep === 0) {
      body.innerHTML = `
        <h3>绑定 Ozon 店铺</h3>
        <p class="hint" style="margin:8px 0 16px">填写 Client-Id / Api-Key（本地校验，离线可用，不直连 Ozon API）</p>
        <div class="form-grid">
          <label>店铺名称 <input class="input" id="wzShopName" value="${(Store.currentShop() || {}).name || ''}" /></label>
          <label>Client-Id <input class="input" id="wzClientId" placeholder="例如 123456" value="${w.clientId && w.clientId !== 'bound-client-****' ? w.clientId : ''}" /></label>
          <label>Api-Key <input class="input" id="wzApiKey" type="password" placeholder="••••••••" value="" /></label>
        </div>
        <div class="compliance-mini">建议先在 Seller Center 开通 rFBS / 跨境直发权限</div>`;
      footer.innerHTML = `
        <button class="btn btn-ghost" id="wzSkip">跳过引导</button>
        <div style="flex:1"></div>
        <button class="btn btn-primary" id="wzNext0">绑定并继续</button>`;
    } else if (wizardStep === 1) {
      body.innerHTML = `
        <h3>选择履约模式</h3>
        <p class="hint" style="margin:8px 0 16px">Ozon Russia 跨境卖家推荐 <b>rFBS</b>（卖家自发货）</p>
        <div class="mode-grid">
          <button class="mode-card active" data-mode="rfbs">
            <div class="mode-title">rFBS · 跨境直发</div>
            <div class="hint">中国仓发俄罗斯 · 自管库存与物流 · 本中台核心场景</div>
          </button>
          <button class="mode-card" disabled>
            <div class="mode-title">FBO / FBS</div>
            <div class="hint">本地仓入驻（当前账号未开通）</div>
          </button>
        </div>
        <div class="compliance-mini">rFBS 备货时效通常 24–72h，超时将影响搜索排名</div>`;
      footer.innerHTML = `
        <button class="btn btn-ghost" id="wzBack1">上一步</button>
        <div style="flex:1"></div>
        <button class="btn btn-primary" id="wzNext1">确认 rFBS</button>`;
    } else if (wizardStep === 2) {
      body.innerHTML = `
        <h3>设置默认物流渠道</h3>
        <p class="hint" style="margin:8px 0 16px">规则引擎将优先使用此渠道匹配轻小件</p>
        <div class="mode-grid">
          ${s.channels.filter(c => c.connected && !c.isWarehouse).map(c => `
            <button class="mode-card ${w.defaultLogistics === c.id ? 'active' : ''}" data-wz-ch="${c.id}">
              <div class="mode-title">${c.name}</div>
              <div class="hint">${c.eta} · ${c.pricePerKg == null ? '平台计费' : '¥' + c.pricePerKg + '/kg'}</div>
            </button>
          `).join('')}
        </div>`;
      footer.innerHTML = `
        <button class="btn btn-ghost" id="wzBack2">上一步</button>
        <div style="flex:1"></div>
        <button class="btn btn-primary" id="wzNext2">保存物流</button>`;
    } else {
      body.innerHTML = `
        <h3>导入首批经营商品</h3>
        <p class="hint" style="margin:8px 0 16px">将 3 个爆款加入本店刊登草稿，可继续映射发布</p>
        <div class="import-preview">
          <div class="ip-item">${thumb('无线降噪耳机')} 无线降噪耳机 TWS Pro</div>
          <div class="ip-item">${thumb('数据线')} Type-C 编织数据线 2m</div>
          <div class="ip-item">${thumb('快充头')} 65W 氮化镓快充头</div>
        </div>
        <div class="compliance-mini">刊登前请补齐必填俄语属性：Бренд / Страна производитель / Состав</div>`;
      footer.innerHTML = `
        <button class="btn btn-ghost" id="wzBack3">上一步</button>
        <div style="flex:1"></div>
        <button class="btn btn-primary" id="wzFinish">导入并完成</button>`;
    }
  }


  /* ---------- Agents Hub ---------- */
  function renderAgents() {
    const as = Store.agentsSummary();
    const s = Store.get();
    document.getElementById('agentsHubHint').textContent =
      s.meta.name + ' · ' + as.onCount + ' 个启用 · 今日已处理 ' + as.todayTotal;

    const banner = document.getElementById('agentHubBanner');
    banner.innerHTML = `
      <div class="ahb-stat"><b>${as.onCount}</b><span>启用中</span></div>
      <div class="ahb-stat"><b>${as.todayTotal}</b><span>今日处理</span></div>
      <div class="ahb-stat"><b>${as.agents.length}</b><span>专业 Agent</span></div>

    `;

    document.getElementById('agentGrid').innerHTML = as.agents.map(a => {
      const last = a.lastRun || '尚未运行';
      const logs = (a.log || []).slice(0, 4);
      return `
      <div class="agent-card ${a.on ? 'on' : 'off'}" data-agent-id="${a.id}">
        <div class="agent-card-head">
          <div class="agent-icon tone-${TONE_BY_AGENT[a.id] || 'info'}">${mark(TONE_BY_AGENT[a.id] || 'info')}</div>
          <div class="agent-titles">
            <div class="agent-name">${a.name}</div>
            <div class="agent-desc">${a.desc}</div>
          </div>
          <label class="toggle" title="启用/停用">
            <input type="checkbox" data-toggle-agent="${a.id}" ${a.on ? 'checked' : ''} aria-label="启用或停用 ${a.name}" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="agent-meta">
          <span>上次：${last}</span>
          <span class="tag ${a.todayCount ? 'tag-green' : 'tag-gray'}">今日 ${a.todayCount || 0}</span>
        </div>
        <div class="agent-actions">
          <button class="btn btn-sm btn-secondary" data-run-agent="${a.id}">运行</button>
          <button class="btn btn-sm btn-ghost" data-nav="${agentNavTarget(a.id)}">查看模块 →</button>
        </div>
        <ul class="agent-mini-log">
          ${logs.length ? logs.map(l => `<li><span class="aml-t">${l.t}</span> ${escapeHtml(l.text)}</li>`).join('')
            : '<li class="hint">暂无活动日志</li>'}
        </ul>
      </div>`;
    }).join('');

    // merged feed
    const feed = [];
    as.agents.forEach(a => (a.log || []).forEach(l => feed.push({ agent: a.name, icon: a.icon, ...l })));
    feed.sort((a, b) => 0); // already newest-first per agent; keep interleave by unshift order
    // re-sort by putting all together - keep first 20 from round-robin
    const merged = [];
    as.agents.forEach(a => {
      (a.log || []).slice(0, 3).forEach(l => merged.push({ agent: a.name, icon: a.icon, t: l.t, text: l.text }));
    });
    document.getElementById('agentFeedHint').textContent = merged.length + ' 条';
    document.getElementById('agentFeed').innerHTML = merged.length
      ? merged.slice(0, 24).map(l =>
          `<li><span class="af-icon">${mark('info')}</span><div><div class="af-title">${l.agent}</div><div class="af-sub">${escapeHtml(l.text)}</div></div><span class="af-t">${l.t}</span></li>`
        ).join('')
      : '<li class="hint" style="padding:16px;justify-content:center">运行 Agent 后活动会出现在这里</li>';
  }

  function agentNavTarget(id) {
    return ({
      selection_radar: 'selection',
      listing_publish: 'listing',
      order_fulfill: 'orders',
      timeout_rescue: 'orders',
      purchase_1688: 'orders',
      logistics_anomaly: 'orders',
      profit_guard: 'profit',
      fx_commission: 'profit',
      ru_cs: 'cs',
      review_escalate: 'cs',
      return_claim: 'returns',
      inventory_restock: 'logistics',
      weekly_report: 'weekly',
    })[id] || 'dashboard';
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  /* ---------- Render all ---------- */
  function renderAll() {
    renderTopbar();
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'selection') renderSelection();
    if (currentView === 'listing') renderListing();
    if (currentView === 'orders') renderOrders();
    if (currentView === 'rules') renderRules();
    if (currentView === 'logistics') renderLogistics();
    if (currentView === 'profit') renderProfit();
    if (currentView === 'cs') renderCs();
    if (currentView === 'returns') renderReturns();
    if (currentView === 'weekly') renderWeekly();
    if (currentView === 'agents') renderAgents();
    if (window.OzonFlowOps) window.OzonFlowOps.render(currentView);
    if (window.OFS) window.OFS.render(currentView);
    if (openOrderId) openOrderDrawer(openOrderId);
  }

  Store.subscribe(() => renderAll());

  /* ---------- Event wiring ---------- */
  function on(sel, ev, fn) {
    document.addEventListener(ev, e => {
      const t = e.target.closest(sel);
      if (t) fn(e, t);
    });
  }

  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });

  on('[data-nav]', 'click', (e, t) => navigate(t.dataset.nav, t.dataset.navFilter ? { filter: t.dataset.navFilter } : undefined));
  on('[data-nav][role="link"]', 'keydown', (e, t) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(t.dataset.nav, t.dataset.navFilter ? { filter: t.dataset.navFilter } : undefined); } });
  on('[data-todo-nav]', 'click', (e, t) => {
    navigate(t.dataset.todoNav, { filter: t.dataset.todoFilter || null });
  });

  // Scenario switcher
  const demoSw = document.getElementById('demoSwitcher');
  const shopSw = document.getElementById('shopSwitcher');
  const roleSw = document.getElementById('roleSwitcher');

  demoSw.addEventListener('click', e => {
    // 下拉选项的点击交给 document 上的委托处理（否则在此被拦截，选项无法生效）
    if (e.target.closest('[data-demo],[data-action],[data-shop-id],[data-role]')) return;
    e.stopPropagation();
    demoSw.classList.toggle('open');
    shopSw.classList.remove('open');
    roleSw.classList.remove('open');
  });
  on('[data-demo]', 'click', (e, t) => {
    e.stopPropagation();
    Store.switchDemo(t.dataset.demo);
    demoSw.classList.remove('open');
    showToast('success', '已切换经营场景「' + Store.get().meta.name + '」');
    navigate('dashboard');
    // auto-open wizard for 小白冷启动
    if (t.dataset.demo === 'yiwu' && !Store.get().wizard.completed) {
      setTimeout(() => openWizard(0), 400);
    }
  });
  on('[data-action="reset"]', 'click', (e) => {
    e.stopPropagation();
    Store.resetCurrent();
    demoSw.classList.remove('open');
    showToast('info', '已重置「' + Store.get().meta.name + '」');
    navigate('dashboard');
  });
  on('[data-action="wizard"]', 'click', (e) => {
    e.stopPropagation();
    demoSw.classList.remove('open');
    Store.wizardReopen();
    openWizard(0);
  });

  // Shop switcher — REAL partition
  shopSw.addEventListener('click', e => {
    // 下拉选项的点击交给 document 上的委托处理（否则在此被拦截，选项无法生效）
    if (e.target.closest('[data-demo],[data-action],[data-shop-id],[data-role]')) return;
    e.stopPropagation();
    shopSw.classList.toggle('open');
    demoSw.classList.remove('open');
    roleSw.classList.remove('open');
  });
  on('[data-shop-id]', 'click', (e, t) => {
    e.stopPropagation();
    const r = Store.switchShop(t.dataset.shopId);
    shopSw.classList.remove('open');
    showToast(r.ok ? 'success' : 'info', r.msg);
    renderAll();
  });

  // Role switcher
  roleSw.addEventListener('click', e => {
    // 下拉选项的点击交给 document 上的委托处理（否则在此被拦截，选项无法生效）
    if (e.target.closest('[data-demo],[data-action],[data-shop-id],[data-role]')) return;
    e.stopPropagation();
    roleSw.classList.toggle('open');
    demoSw.classList.remove('open');
    shopSw.classList.remove('open');
  });
  on('[data-role]', 'click', (e, t) => {
    e.stopPropagation();
    const r = Store.setRole(t.dataset.role);
    roleSw.classList.remove('open');
    showToast('success', r.msg);
    if (!Store.canView(currentView)) navigate('dashboard');
    else renderAll();
  });

  document.addEventListener('click', () => {
    demoSw.classList.remove('open');
    shopSw.classList.remove('open');
    roleSw.classList.remove('open');
  });

  document.getElementById('btnReset').addEventListener('click', () => {
    Store.resetCurrent();
    showToast('info', '已重置当前场景数据');
    navigate('dashboard');
  });

  document.getElementById('btnNotify').addEventListener('click', () => {
    const k = Store.kpi();
    const parts = [];
    if (k.risk > 0) parts.push(k.risk + ' 笔超时');
    if (k.badReviews > 0) parts.push(k.badReviews + ' 条差评待回');
    if (k.openReturns > 0) parts.push(k.openReturns + ' 笔退货异常');
    showToast('info', parts.length ? parts.join(' · ') : '暂无紧急通知');
  });

  // Wizard buttons
  document.getElementById('btnOpenWizard').addEventListener('click', () => {
    Store.wizardReopen();
    openWizard(0);
  });
  const _dw = document.getElementById('btnDashWizard'); if (_dw) _dw.addEventListener('click', () => openWizard());
  document.getElementById('wizardClose').addEventListener('click', closeWizard);
  document.getElementById('wizardOverlay').addEventListener('click', e => {
    if (e.target.id === 'wizardOverlay') closeWizard();
  });
  on('#btnContinueWizard', 'click', () => openWizard());

  on('#wzNext0', 'click', () => {
    const r = Store.wizardBindShop({
      clientId: document.getElementById('wzClientId').value,
      apiKey: document.getElementById('wzApiKey').value,
      shopName: document.getElementById('wzShopName').value,
    });
    showToast('success', r.msg);
    wizardStep = 1;
    renderWizard();
  });
  on('#wzNext1', 'click', () => {
    const r = Store.wizardChooseRfbs();
    showToast('success', r.msg);
    wizardStep = 2;
    renderWizard();
  });
  on('#wzNext2', 'click', () => {
    const active = document.querySelector('.mode-card.active[data-wz-ch]');
    const ch = active ? active.dataset.wzCh : 'yuntu';
    const r = Store.wizardSetLogistics(ch);
    showToast('success', r.msg);
    wizardStep = 3;
    renderWizard();
  });
  on('#wzFinish', 'click', () => {
    Store.wizardImportProducts();
    const r = Store.wizardComplete();
    showToast('success', r.msg);
    closeWizard();
    navigate('listing');
  });
  on('#wzSkip', 'click', () => {
    Store.wizardComplete();
    closeWizard();
    showToast('info', '已跳过引导（标记完成）');
  });
  on('#wzBack1', 'click', () => { wizardStep = 0; renderWizard(); });
  on('#wzBack2', 'click', () => { wizardStep = 1; renderWizard(); });
  on('#wzBack3', 'click', () => { wizardStep = 2; renderWizard(); });
  on('[data-wz-ch]', 'click', (e, t) => {
    document.querySelectorAll('[data-wz-ch]').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
  });

  // Selection
  on('[data-calc]', 'click', (e, t) => {
    selectedCatalogId = t.dataset.calc;
    const c = Store.get().catalog.find(x => x.id === selectedCatalogId);
    if (c) {
      fillCalc(c);
      // also push to profit page inputs
      profitTarget = c.name;
      document.getElementById('pfPrice').value = c.price;
      document.getElementById('pfCost').value = c.cost;
      document.getElementById('pfWeight').value = c.weight;
      showToast('info', '已载入「' + c.name + '」· 也可在「利润定价」看三情景');
    }
  });
  on('[data-claim]', 'click', (e, t) => {
    const r = Store.claimProduct(t.dataset.claim);
    showToast(r.ok ? 'success' : 'info', r.msg);
    if (r.ok) navigate('listing');
  });
  document.getElementById('btnCalc').addEventListener('click', () => runProfitCalc(true));
  document.getElementById('btnClaimFromCalc').addEventListener('click', () => {
    if (!selectedCatalogId) { showToast('info', '请先选择商品'); return; }
    const r = Store.claimProduct(selectedCatalogId);
    showToast(r.ok ? 'success' : 'info', r.msg);
    if (r.ok) navigate('listing');
  });
  document.getElementById('selSearch').addEventListener('input', () => renderSelection());
  document.getElementById('selCat').addEventListener('change', () => renderSelection());
  document.getElementById('btnRefreshSel').addEventListener('click', () => {
    showToast('success', '榜单已刷新');
    renderSelection();
  });
  document.querySelectorAll('[data-sel-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-sel-tab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // Listing
  on('[data-list-filter]', 'click', (e, t) => {
    listFilter = t.dataset.listFilter;
    renderListing();
  });
  on('[data-adv]', 'click', (e, t) => {
    const r = Store.advanceListing(t.dataset.adv);
    showToast(r.ok ? 'success' : 'info', r.msg);
  });
  on('[data-pub]', 'click', (e, t) => {
    const r = Store.publishListing(t.dataset.pub);
    showToast(r.ok ? 'success' : 'info', r.msg);
  });
  on('[data-fix]', 'click', (e, t) => {
    const r = Store.advanceListing(t.dataset.fix);
    showToast(r.ok ? 'success' : 'info', r.msg || '已修复');
  });
  on('[data-pf-listing]', 'click', (e, t) => {
    const l = Store.get().listings.find(x => x.id === t.dataset.pfListing);
    if (!l) return;
    profitTarget = l.name;
    document.getElementById('pfPrice').value = l.price;
    document.getElementById('pfCost').value = l.cost;
    document.getElementById('pfWeight').value = l.weight;
    navigate('profit');
  });
  document.getElementById('btnBatchPublish').addEventListener('click', () => {
    const r = Store.publishReadyBatch();
    showToast(r.count ? 'success' : 'info', r.msg);
  });
  document.getElementById('btnSyncOrdersFromListing').addEventListener('click', () => {
    const r = Store.syncOrders(2);
    showToast(r.ok ? 'success' : 'info', r.msg);
    if (r.ok) navigate('orders');
  });

  // Orders
  on('[data-order-filter]', 'click', (e, t) => {
    orderFilter = t.dataset.orderFilter;
    renderOrders();
  });
  document.getElementById('orderSearch').addEventListener('input', () => renderOrders());
  // 操作列里的按钮由各自的委托处理；点击操作列不打开详情抽屉
  on('[data-open]', 'click', (e, t) => { if (e.target.closest('.row-ops, button, a, input')) return; openOrderDrawer(t.dataset.open); });
  on('[data-audit]', 'click', (e, t) => {
    e.stopPropagation();
    const r = Store.auditOrder(t.dataset.audit);
    showToast(r.ok ? 'success' : 'info', r.msg);
  });
  on('[data-purch]', 'click', (e, t) => {
    e.stopPropagation();
    const r = Store.markPurchased(t.dataset.purch);
    showToast(r.ok ? 'success' : 'info', r.msg);
  });
  on('[data-waybill]', 'click', (e, t) => {
    e.stopPropagation();
    const r = Store.applyWaybill(t.dataset.waybill);
    showToast(r.ok ? 'success' : 'info', r.msg);
  });
  on('[data-ship]', 'click', (e, t) => {
    e.stopPropagation();
    const r = Store.shipOrder(t.dataset.ship);
    showToast(r.ok ? 'success' : 'info', r.msg);
  });
  on('[data-assign]', 'click', (e, t) => {
    e.stopPropagation();
    const r = Store.assignLogistics(t.dataset.assign);
    showToast(r.ok ? 'success' : 'info', r.msg);
  });
  document.getElementById('btnSyncOrders').addEventListener('click', () => {
    const r = Store.syncOrders(3);
    showToast(r.ok ? 'success' : 'info', r.msg);
  });
  document.getElementById('btnAutoAudit').addEventListener('click', () => {
    const r = Store.runAutoAudit();
    showToast(r.ok ? 'success' : 'info', r.msg);
  });
  document.getElementById('btnBatchWaybill').addEventListener('click', () => {
    const r = Store.applyWaybillBatch();
    showToast(r.count ? 'success' : 'info', r.msg);
  });

  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeDrawer(); closeWizard(); }
  });

  // Rules
  on('[data-rule-type]', 'click', (e, t) => {
    document.querySelectorAll('[data-rule-type]').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    ruleType = t.dataset.ruleType;
    renderRules();
  });
  on('[data-toggle-rule]', 'change', (e, t) => {
    const r = Store.toggleRule(t.dataset.toggleRule, t.checked);
    showToast(r.ok ? (t.checked ? 'success' : 'info') : 'info', r.msg);
  });
  document.getElementById('btnRunRules').addEventListener('click', () => {
    const r = Store.runAllRules();
    showToast(r.ok ? 'success' : 'info', r.msg);
  });

  // Logistics
  on('[data-connect]', 'click', (e, t) => {
    const r = Store.connectChannel(t.dataset.connect);
    showToast('success', r.msg);
  });
  on('[data-restock]', 'click', (e, t) => {
    const r = Store.restock(t.dataset.restock, 50);
    showToast(r.ok ? 'success' : 'info', r.msg);
  });
  document.getElementById('btnSyncInv').addEventListener('click', () => {
    const r = Store.syncInventory();
    showToast('success', r.msg);
  });

  // Profit
  on('[data-pf-pick]', 'click', (e, t) => {
    profitTarget = t.dataset.pfName;
    document.getElementById('pfPrice').value = t.dataset.pfPrice;
    document.getElementById('pfCost').value = t.dataset.pfCost;
    document.getElementById('pfWeight').value = t.dataset.pfWeight;
    renderScenarios();
    showToast('info', '已载入「' + profitTarget + '」三情景');
  });
  document.getElementById('btnPfCalc').addEventListener('click', () => {
    renderScenarios();
    showToast('success', '三情景已更新');
  });
  on('#btnSaveRates', 'click', () => {
    Store.updateSettings({
      fx: parseFloat(document.getElementById('rateFx').value) || 11.85,
      shipCnyPerKg: parseFloat(document.getElementById('rateShip').value) || 18.5,
      paymentFee: parseFloat(document.getElementById('rateFee').value) || 0.0265,
      returnProvision: parseFloat(document.getElementById('rateRet').value) || 0.03,
    });
    showToast('success', '共享费率已保存');
    renderScenarios();
  });

  // CS
  on('[data-cs-tab]', 'click', (e, t) => {
    csTab = t.dataset.csTab;
    renderCs();
  });
  on('[data-reply-review]', 'click', (e, t) => {
    const templates = Store.get().replyTemplates;
    const tpl = templates.find(x => x.id === 't1') || templates[0];
    const r = Store.replyReview(t.dataset.replyReview, tpl ? tpl.ru : 'Спасибо за отзыв!');
    showToast(r.ok ? 'success' : 'info', r.msg);
  });
  on('[data-answer-qa]', 'click', (e, t) => {
    const templates = Store.get().replyTemplates;
    const tpl = templates.find(x => x.id === 't4') || templates[0];
    const r = Store.answerQa(t.dataset.answerQa, tpl ? tpl.ru : 'Спасибо за вопрос!');
    showToast(r.ok ? 'success' : 'info', r.msg);
  });
  on('[data-copy-tpl]', 'click', (e, t) => {
    const tpl = Store.get().replyTemplates.find(x => x.id === t.dataset.copyTpl);
    if (!tpl) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(tpl.ru).then(() => showToast('success', '已复制「' + tpl.name + '」')).catch(() => showToast('info', tpl.ru.slice(0, 40) + '…'));
    } else {
      showToast('info', tpl.ru.slice(0, 60) + '…');
    }
  });

  // Returns
  on('[data-return-filter]', 'click', (e, t) => {
    returnFilter = t.dataset.returnFilter;
    renderReturns();
  });
  on('[data-ret-adv]', 'click', (e, t) => {
    const r = Store.advanceReturn(t.dataset.retAdv, t.dataset.retTo);
    showToast(r.ok ? 'success' : 'info', r.msg);
  });

  // Weekly
  document.getElementById('btnRefreshWeekly').addEventListener('click', () => {
    renderWeekly();
    showToast('success', '周报已刷新 · ' + Store.weeklyReport().generatedAt);
  });
  document.getElementById('btnExportWeekly').addEventListener('click', () => {
    const shop = Store.currentShop();
    showToast('success', '已导出「' + (shop ? shop.name : '') + '」经营周报（本地导出提示）');
  });


  // Agents Hub
  function doRunAllAgents() {
    const r = Store.runAllAgents();
    showToast('success', r.msg);
    if (r.results && r.results.length) {
      const top = r.results.filter(x => x.count > 0).slice(0, 3).map(x => x.name.replace(' Agent', '') + '×' + x.count);
      if (top.length) showToast('info', '级联：' + top.join(' · '));
    }
    // if weekly snapshot, nudge
    const snap = Store.get().weeklySnapshot;
    if (snap) {
      const sales = snap.shops.reduce((s, x) => s + x.sales, 0);
      setTimeout(() => showToast('success', '周报快照已写入 · 销售 ' + sales.toLocaleString('ru-RU') + '₽'), 600);
    }
  }
  on('[data-toggle-agent]', 'change', (e, t) => {
    const r = Store.toggleAgent(t.dataset.toggleAgent, t.checked);
    showToast(r.ok ? (t.checked ? 'success' : 'info') : 'info', r.msg);
  });
  on('[data-run-agent]', 'click', (e, t) => {
    const r = Store.runAgent(t.dataset.runAgent, { manual: true, force: true });
    showToast(r.ok ? 'success' : 'info', r.msg);
  });
  const btnRunAll = document.getElementById('btnRunAllAgents');
  if (btnRunAll) btnRunAll.addEventListener('click', doRunAllAgents);
  const btnRunAllDash = document.getElementById('btnRunAllAgentsDash');
  if (btnRunAllDash) btnRunAllDash.addEventListener('click', doRunAllAgents);
  const btnTick = document.getElementById('btnTickAgents');
  if (btnTick) btnTick.addEventListener('click', () => {
    const r = Store.runEnabledAgentsTick();
    showToast(r.count ? 'success' : 'info', r.msg);
  });

  // Interval simulation: every 45s run enabled agents lightly when on dashboard/agents
  setInterval(() => {
    const as = Store.agentsSummary();
    if (!as.onCount) return;
    // only auto-tick if at least one on and page visible
    if (document.hidden) return;
    const r = Store.runEnabledAgentsTick();
    if (r.count > 0) {
      showToast('info', '⏱ Agent 定时 · +' + r.count);
    }
  }, 45000);

  // Init
  navigate('dashboard');
  const cat0 = Store.get().catalog[0];
  if (cat0) {
    selectedCatalogId = cat0.id;
    profitTarget = cat0.name;
    document.getElementById('pfPrice').value = cat0.price;
    document.getElementById('pfCost').value = cat0.cost;
    document.getElementById('pfWeight').value = cat0.weight;
  }

  // Auto-open wizard on first run of 小白冷启动
  if (Store.get().meta.id === 'yiwu' && !Store.get().wizard.completed) {
    setTimeout(() => openWizard(0), 600);
  }
})();
