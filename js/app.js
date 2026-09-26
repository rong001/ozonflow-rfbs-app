/**
 * OzonFlow · UI 层：六模块渲染 + 事件，全部读写共享 Store
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
  };

  let currentView = 'dashboard';
  let listFilter = 'all';
  let orderFilter = 'all';
  let ruleType = 'all';
  let selectedCatalogId = null;
  let openOrderId = null;

  /* ---------- Toast ---------- */
  function showToast(type, msg) {
    const box = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = 'toast ' + (type || 'info');
    const icon = type === 'success' ? '✓' : type === 'info' ? 'ℹ' : '•';
    t.innerHTML = '<span>' + icon + '</span><span>' + msg + '</span>';
    box.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(20px)';
      t.style.transition = '.3s';
      setTimeout(() => t.remove(), 300);
    }, 2800);
  }
  window.showToast = showToast;

  /* ---------- Navigate ---------- */
  function navigate(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const el = document.getElementById('view-' + view);
    if (el) el.classList.add('active');
    const nav = document.querySelector('.nav-item[data-view="' + view + '"]');
    if (nav) nav.classList.add('active');
    document.getElementById('pageTitle').textContent = TITLES[view] || view;
    renderAll();
  }
  window.navigate = navigate;

  /* ---------- Topbar meta ---------- */
  function renderTopbar() {
    const s = Store.get();
    document.getElementById('currentDemo').textContent = s.meta.name;
    document.getElementById('currentShop').textContent = s.meta.shopName;

    const demoDrop = document.getElementById('demoDropdown');
    demoDrop.innerHTML = Seeds.list().map(d =>
      '<button class="demo-opt' + (d.id === s.meta.id ? ' active' : '') + '" data-demo="' + d.id + '">' +
      '<span>' + d.label + '</span><span class="demo-meta">' + d.desc + '</span></button>'
    ).join('') +
      '<div class="demo-sep"></div>' +
      '<button class="demo-opt" data-action="reset"><span>重置当前演示数据</span><span class="demo-meta">清除本集改动</span></button>';

    const shopDrop = document.getElementById('shopDropdown');
    shopDrop.innerHTML = s.shops.map(sh =>
      '<button class="shop-opt' + (sh.name === s.meta.shopName ? ' active' : '') + '" data-shop="' + sh.name + '">' +
      '<span>' + sh.name + '</span><span class="shop-meta">rFBS · ' +
      (sh.status === 'online' ? '在线' : '同步中') + '</span></button>'
    ).join('');

    const ago = s.syncAgoMin;
    document.getElementById('syncText').textContent =
      '订单同步 · ' + (ago === 0 ? '刚刚' : ago + ' 分钟前');

    const k = Store.kpi();
    const dot = document.getElementById('notifDot');
    dot.style.display = k.risk > 0 ? 'block' : 'none';

    const badges = Store.badges();
    const bl = document.getElementById('badgeListing');
    const bo = document.getElementById('badgeOrders');
    bl.textContent = badges.listing;
    bl.style.display = badges.listing ? '' : 'none';
    bo.textContent = badges.orders;
    bo.style.display = badges.orders ? '' : 'none';
  }

  /* ---------- Dashboard ---------- */
  function renderDashboard() {
    const s = Store.get();
    const k = Store.kpi();
    document.getElementById('kpiGrid').innerHTML = `
      <div class="kpi-card blue"><div class="kpi-label">今日订单</div><div class="kpi-value">${k.todayOrders}</div><div class="kpi-sub up">演示集 · ${s.meta.name}</div></div>
      <div class="kpi-card orange"><div class="kpi-label">待发货</div><div class="kpi-value">${k.pendingShip}</div><div class="kpi-sub neutral">含待采购</div></div>
      <div class="kpi-card red"><div class="kpi-label">超时风险</div><div class="kpi-value">${k.risk}</div><div class="kpi-sub down">距截单 &lt; 6h</div></div>
      <div class="kpi-card green"><div class="kpi-label">预估毛利 (₽)</div><div class="kpi-value">${(k.gross / 1000).toFixed(1)}K</div><div class="kpi-sub up">共享费率测算</div></div>
      <div class="kpi-card purple"><div class="kpi-label">库存预警</div><div class="kpi-value">${k.lowStock}</div><div class="kpi-sub down">SKU 低于安全库存</div></div>
    `;

    document.getElementById('chartShopTag').textContent = s.meta.shopName;
    const vals = s.trend;
    const max = Math.max(...vals, 1);
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    document.getElementById('orderChart').innerHTML = vals.map((v, i) => {
      const h = Math.round((v / max) * 120);
      return `<div class="chart-bar-wrap"><div class="chart-bar" style="height:${h}px" title="${v} 单"></div><div class="chart-bar-label">${days[i]}</div></div>`;
    }).join('');

    const todos = [];
    if (k.risk > 0) todos.push({ icon: '⚠️', bg: 'var(--danger-bg)', title: k.risk + ' 笔订单临近超时', sub: '建议立即采购或申请面单', btn: '去处理', view: 'orders', cls: 'btn-danger' });
    if (k.draftCount > 0) todos.push({ icon: '📦', bg: 'var(--warning-bg)', title: k.draftCount + ' 条刊登待处理', sub: '草稿 / 映射 / 待发布', btn: '去刊登', view: 'listing', cls: 'btn-secondary' });
    const ruleHits = s.rules.reduce((a, r) => a + (r.today || 0), 0);
    if (ruleHits > 0) todos.push({ icon: '🔄', bg: 'var(--primary-light)', title: '规则今日命中 ' + ruleHits + ' 次', sub: '自动审单 / 物流 / 采购', btn: '查看', view: 'rules', cls: 'btn-ghost' });
    if (k.lowStock > 0) todos.push({ icon: '📉', bg: 'var(--purple-bg)', title: k.lowStock + ' 个 SKU 低库存', sub: '去补货或同步', btn: '去库存', view: 'logistics', cls: 'btn-ghost' });
    todos.push({ icon: '🔍', bg: 'var(--info-bg)', title: '选品池 ' + s.catalog.length + ' 个机会 SKU', sub: '认领后进入刊登草稿', btn: '去看看', view: 'selection', cls: 'btn-ghost' });

    document.getElementById('todoList').innerHTML = todos.map(t => `
      <li>
        <div class="ml-icon" style="background:${t.bg}">${t.icon}</div>
        <div class="ml-text"><div class="ml-title">${t.title}</div><div class="ml-sub">${t.sub}</div></div>
        <button class="btn btn-sm ${t.cls}" data-nav="${t.view}">${t.btn}</button>
      </li>
    `).join('');

    const hot = [...s.products].sort((a, b) => (b.todaySales || 0) - (a.todaySales || 0)).slice(0, 5);
    document.getElementById('hotBody').innerHTML = hot.map(p => {
      const inv = s.inventory.find(i => i.sku === p.sku);
      const stock = inv ? inv.local : 0;
      const stockCls = stock <= (inv ? inv.safe : 20) ? 'stock-low' : 'stock-ok';
      return `<tr>
        <td><div class="prod-cell"><div class="prod-img">${p.emoji}</div><div><div class="prod-name">${p.ru || p.name}</div><div class="prod-sku">${p.name}</div></div></div></td>
        <td class="mono">${p.ozonSku || '—'}</td>
        <td><b>${p.todaySales || 0}</b></td>
        <td>${p.price.toLocaleString('ru-RU')} ₽</td>
        <td><span class="tag tag-green">+${p.margin || 0}%</span></td>
        <td><span class="${stockCls}">${stock}</span></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="hint" style="padding:24px;text-align:center">暂无在售商品 — 请先选品认领并发布</td></tr>';
  }

  /* ---------- Selection ---------- */
  function renderSelection() {
    const s = Store.get();
    const q = (document.getElementById('selSearch').value || '').trim().toLowerCase();
    const cat = document.getElementById('selCat').value;
    let list = s.catalog.slice();
    if (cat) list = list.filter(c => c.cat === cat);
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || c.ru.toLowerCase().includes(q) || (c.skuHint || '').toLowerCase().includes(q));

    document.getElementById('selProdGrid').innerHTML = list.map(p => {
      const claimed = s.claimedIds.includes(p.id) || s.listings.some(l => l.sku === p.skuHint);
      return `
      <div class="prod-card" data-cid="${p.id}">
        <div class="prod-card-img"><span class="rank">TOP ${p.rank}</span>${p.emoji}</div>
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
    }).join('');

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
    document.getElementById('calcComm').textContent = Math.round(r.commission).toLocaleString('ru-RU') + ' ₽ (' + (r.commissionRate * 100) + '%)';
    document.getElementById('calcShip').textContent = Math.round(r.ship).toLocaleString('ru-RU') + ' ₽';
    document.getElementById('calcFee').textContent = Math.round(r.fee).toLocaleString('ru-RU') + ' ₽';
    document.getElementById('calcProfit').textContent = Math.round(r.profit).toLocaleString('ru-RU') + ' ₽';
    document.getElementById('calcMargin').textContent = r.margin.toFixed(1) + '%';
    document.getElementById('calcProfit').style.color = r.profit > 0 ? '#4ade80' : '#f87171';
    if (toast !== false) showToast('success', `测算完成 · 净利 ${Math.round(r.profit)} ₽ · 利润率 ${r.margin.toFixed(1)}%`);
  }

  /* ---------- Listing ---------- */
  function renderListing() {
    const s = Store.get();
    const counts = {
      all: s.listings.length,
      draft: s.listings.filter(l => l.status === 'draft').length,
      mapping: s.listings.filter(l => l.status === 'mapping').length,
      ready: s.listings.filter(l => l.status === 'ready').length,
      failed: s.listings.filter(l => l.status === 'failed').length,
      published: s.listings.filter(l => l.status === 'published').length,
    };
    const tabs = [
      ['all', '全部'], ['draft', '草稿'], ['mapping', '映射中'],
      ['ready', '待发布'], ['failed', '审核失败'], ['published', '已发布'],
    ];
    document.getElementById('listingTabs').innerHTML = tabs.map(([k, label]) =>
      `<button class="filter-tab${listFilter === k ? ' active' : ''}" data-list-filter="${k}">${label} <span class="count">${counts[k] || 0}</span></button>`
    ).join('');

    const rows = s.listings.filter(l => listFilter === 'all' || l.status === listFilter);
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
      return `<tr>
        <td><div class="prod-cell"><div class="prod-img">${l.emoji}</div><div><div class="prod-name">${l.name}</div><div class="prod-sku">${l.sku}</div></div></div></td>
        <td style="max-width:220px;font-size:12px;color:var(--text-secondary)">${l.ru}</td>
        <td style="font-size:12px">${l.cat}</td>
        <td style="min-width:120px">
          <div class="flex gap-8"><span style="font-weight:600;min-width:36px">${l.map}%</span>
          <div class="progress" style="flex:1;margin-top:6px"><div class="progress-bar ${barColor}" style="width:${l.map}%"></div></div></div>
        </td>
        <td><span class="tag ${tag}">${label}</span></td>
        <td>${actions}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="hint" style="padding:24px;text-align:center">暂无刊登 — 去「智能选品」认领商品</td></tr>';
  }

  /* ---------- Orders ---------- */
  function renderOrders() {
    const s = Store.get();
    const counts = {
      all: s.orders.length,
      audit: s.orders.filter(o => o.status === 'audit').length,
      purchase: s.orders.filter(o => o.status === 'purchase').length,
      ship: s.orders.filter(o => o.status === 'ship').length,
      shipped: s.orders.filter(o => o.status === 'shipped').length,
      risk: s.orders.filter(o => o.risk || (o.etaH != null && o.etaH <= 6 && o.status !== 'shipped')).length,
    };
    const tabs = [
      ['all', '全部'], ['audit', '待审核'], ['purchase', '待采购'],
      ['ship', '待发货'], ['shipped', '已发货'], ['risk', '超时风险'],
    ];
    document.getElementById('orderTabs').innerHTML = tabs.map(([k, label]) =>
      `<button class="filter-tab${orderFilter === k ? ' active' : ''}" data-order-filter="${k}">${label} <span class="count">${counts[k] || 0}</span></button>`
    ).join('');

    const q = (document.getElementById('orderSearch').value || '').trim().toLowerCase();
    let rows = s.orders.filter(o => {
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

    document.getElementById('orderBody').innerHTML = rows.map(o => {
      const tag = Store.statusTag(o.status);
      const eta = o.etaH == null ? '—' : o.etaH + 'h';
      const isRisk = o.risk || (o.etaH != null && o.etaH <= 6 && o.status !== 'shipped');
      let ops = '';
      if (o.status === 'audit') ops += `<button class="btn btn-sm btn-secondary" data-audit="${o.id}">审单</button> `;
      if (o.status === 'purchase') ops += `<button class="btn btn-sm btn-secondary" data-purch="${o.id}">采购完成</button> `;
      if ((o.status === 'ship' || o.status === 'purchase') && !o.track) ops += `<button class="btn btn-sm btn-primary" data-waybill="${o.id}">面单</button> `;
      if ((o.status === 'ship' || o.status === 'purchase') && o.track) ops += `<button class="btn btn-sm btn-primary" data-ship="${o.id}">发货</button> `;
      return `<tr class="clickable" data-open="${o.id}">
        <td class="mono">${o.id}</td>
        <td><div class="prod-cell"><div class="prod-img">${o.emoji}</div><div><div class="prod-name">${o.name}</div><div class="prod-sku">${o.sku}</div></div></div></td>
        <td>${o.buyer}<br/><span class="hint">${o.city}</span></td>
        <td><b>${o.amount.toLocaleString('ru-RU')}</b></td>
        <td>${o.logistics === '—' ? '<span class="hint">未分配</span>' : o.logistics}</td>
        <td>${(o.auto || []).map(a => `<span class="tag tag-green" style="margin:1px">${a}</span>`).join(' ') || '<span class="hint">—</span>'}</td>
        <td><span class="tag ${tag}">${o.statusLabel}</span></td>
        <td>${isRisk ? `<span class="tag tag-red">${eta}</span>` : `<span class="hint">${eta}</span>`}</td>
        <td onclick="event.stopPropagation()">${ops}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="9" class="hint" style="padding:24px;text-align:center">暂无订单 — 点击「同步订单」模拟出单</td></tr>';
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
          <div class="prod-img" style="width:56px;height:56px;font-size:28px">${o.emoji}</div>
          <div>
            <div style="font-weight:600">${o.name}</div>
            <div class="hint">${o.sku} · ${o.weight}g</div>
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
    document.getElementById('ruleGrid').innerHTML = rules.map(r => `
      <div class="rule-card ${r.on ? '' : 'off'}" id="rule-${r.id}">
        <div class="rule-card-head">
          <div class="rule-icon ${r.iconClass}">${r.icon}</div>
          <div class="rule-info">
            <div class="rule-name">${r.name}</div>
            <div class="rule-desc">${r.desc}</div>
          </div>
          <label class="toggle" title="启用/停用">
            <input type="checkbox" data-toggle-rule="${r.id}" ${r.on ? 'checked' : ''} />
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
          <div><span>${ch.isWarehouse ? '在库 SKU' : '今日'}</span><br/><strong>${ch.isWarehouse ? s.inventory.length : (ch.connected ? ch.today + ' 票' : '—')}</strong></div>
        </div>
      </div>
    `).join('');

    document.getElementById('invBody').innerHTML = s.inventory.map(i => {
      const syncTag = i.sync === 'ok' ? '<span class="tag tag-green">正常</span>'
        : i.sync === 'warn' ? '<span class="tag tag-orange">低库存</span>'
        : '<span class="tag tag-red">缺货</span>';
      return `<tr>
        <td class="mono">${i.sku}</td>
        <td><div class="prod-cell"><div class="prod-img">${i.emoji}</div><div class="prod-name">${i.name}</div></div></td>
        <td><b>${i.local}</b></td>
        <td>${i.ozon}</td>
        <td>${i.safe}</td>
        <td>${syncTag}</td>
        <td><button class="btn btn-sm btn-secondary" data-restock="${i.sku}">补货 +50</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="hint" style="padding:24px;text-align:center">暂无库存 — 发布商品后自动创建</td></tr>';
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

  on('[data-nav]', 'click', (e, t) => navigate(t.dataset.nav));

  // Demo switcher
  const demoSw = document.getElementById('demoSwitcher');
  demoSw.addEventListener('click', e => {
    e.stopPropagation();
    demoSw.classList.toggle('open');
    document.getElementById('shopSwitcher').classList.remove('open');
  });
  on('[data-demo]', 'click', (e, t) => {
    e.stopPropagation();
    Store.switchDemo(t.dataset.demo);
    demoSw.classList.remove('open');
    showToast('success', '已切换演示集「' + Store.get().meta.name + '」');
    navigate('dashboard');
  });
  on('[data-action="reset"]', 'click', (e) => {
    e.stopPropagation();
    Store.resetCurrent();
    demoSw.classList.remove('open');
    showToast('info', '已重置「' + Store.get().meta.name + '」');
    navigate('dashboard');
  });

  // Shop switcher (cosmetic within demo)
  const shopSw = document.getElementById('shopSwitcher');
  shopSw.addEventListener('click', e => {
    e.stopPropagation();
    shopSw.classList.toggle('open');
    demoSw.classList.remove('open');
  });
  on('[data-shop]', 'click', (e, t) => {
    e.stopPropagation();
    Store.get().meta.shopName = t.dataset.shop;
    shopSw.classList.remove('open');
    showToast('info', '已切换至「' + t.dataset.shop + '」');
    renderAll();
  });
  document.addEventListener('click', () => {
    demoSw.classList.remove('open');
    shopSw.classList.remove('open');
  });

  document.getElementById('btnReset').addEventListener('click', () => {
    Store.resetCurrent();
    showToast('info', '已重置当前演示数据');
    navigate('dashboard');
  });

  document.getElementById('btnNotify').addEventListener('click', () => {
    const k = Store.kpi();
    showToast('info', k.risk > 0
      ? `今日有 ${k.risk} 笔订单临近超时，请尽快处理`
      : '暂无紧急通知');
  });

  // Selection
  on('[data-calc]', 'click', (e, t) => {
    selectedCatalogId = t.dataset.calc;
    const c = Store.get().catalog.find(x => x.id === selectedCatalogId);
    if (c) { fillCalc(c); showToast('info', '已载入「' + c.name + '」'); }
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
    showToast('success', '榜单已刷新（演示数据）');
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
  on('[data-open]', 'click', (e, t) => openOrderDrawer(t.dataset.open));
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
    showToast('success', r.msg);
  });
  document.getElementById('btnBatchWaybill').addEventListener('click', () => {
    const r = Store.applyWaybillBatch();
    showToast(r.count ? 'success' : 'info', r.msg);
  });

  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

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
    showToast('success', r.msg);
  });

  // Logistics
  on('[data-connect]', 'click', (e, t) => {
    const r = Store.connectChannel(t.dataset.connect);
    showToast('success', r.msg);
  });
  on('[data-restock]', 'click', (e, t) => {
    const r = Store.restock(t.dataset.restock, 50);
    showToast('success', r.msg);
  });
  document.getElementById('btnSyncInv').addEventListener('click', () => {
    const r = Store.syncInventory();
    showToast('success', r.msg);
  });

  // Init
  navigate('dashboard');
  // pre-fill calc
  const cat0 = Store.get().catalog[0];
  if (cat0) { selectedCatalogId = cat0.id; fillCalc(cat0); }
})();
