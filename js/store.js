/**
 * OzonFlow · 共享状态层（localStorage 持久化）
 * 多店真实分区 · 角色权限 · Wizard / 利润 / 客服 / 退货 / 周报
 */
window.OzonFlowStore = (function () {
  const LS_KEY = 'ozonflow_rfbs_v2';
  const LS_DEMO = 'ozonflow_rfbs_demo_id';
  const LS_LEGACY = 'ozonflow_rfbs_v1';

  const ROLES = {
    boss: { id: 'boss', label: '老板', short: '老板' },
    ops: { id: 'ops', label: '运营', short: '运营' },
    warehouse: { id: 'warehouse', label: '仓管', short: '仓管' },
    cs: { id: 'cs', label: '客服', short: '客服' },
  };

  /* 角色可见导航与可执行动作 */
  const ROLE_VIEWS = {
    boss: ['dashboard', 'selection', 'listing', 'orders', 'rules', 'logistics', 'profit', 'cs', 'returns', 'weekly', 'agents'],
    ops: ['dashboard', 'selection', 'listing', 'orders', 'rules', 'logistics', 'profit', 'cs', 'weekly', 'agents'],
    warehouse: ['dashboard', 'orders', 'logistics', 'returns', 'agents'],
    cs: ['dashboard', 'orders', 'cs', 'returns', 'agents'],
  };

  const ROLE_ACTIONS = {
    boss: '*',
    ops: ['claim', 'publish', 'audit', 'waybill', 'ship', 'rules', 'profit', 'reply', 'return', 'wizard', 'sync', 'agents'],
    warehouse: ['waybill', 'ship', 'purchase', 'restock', 'sync', 'return', 'agents'],
    cs: ['reply', 'return', 'audit_view', 'agents'],
  };

  let state = null;
  const listeners = new Set();

  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(LS_DEMO, state.meta.id);
      localStorage.removeItem(LS_LEGACY);
    } catch (e) {
      console.warn('persist failed', e);
    }
  }

  function emit(reason) {
    persist();
    listeners.forEach(fn => {
      try { fn(state, reason); } catch (e) { console.error(e); }
    });
  }

  function migrateIfNeeded(parsed) {
    if (!parsed || !parsed.meta) return null;
    if (!parsed.currentShopId && parsed.shops && parsed.shops[0]) {
      parsed.currentShopId = parsed.shops[0].id;
    }
    if (!parsed.role) parsed.role = 'boss';
    if (!parsed.wizard) {
      parsed.wizard = {
        completed: true, step: 4, shopBound: true,
        clientId: 'legacy', apiKey: '••••', rfbsChosen: true,
        defaultLogistics: 'yuntu', productsImported: true,
      };
    }
    if (!parsed.settings) parsed.settings = {};
    if (parsed.settings.returnProvision == null) parsed.settings.returnProvision = 0.03;
    if (!parsed.settings.commissionTiers) {
      parsed.settings.commissionTiers = window.OzonFlowSeeds.COMMISSION_TIERS
        ? JSON.parse(JSON.stringify(window.OzonFlowSeeds.COMMISSION_TIERS))
        : [];
    }
    if (!parsed.reviews) parsed.reviews = [];
    if (!parsed.qa) parsed.qa = [];
    if (!parsed.returns) parsed.returns = [];
    if (!parsed.replyTemplates) {
      parsed.replyTemplates = window.OzonFlowSeeds.REPLY_TEMPLATES
        ? JSON.parse(JSON.stringify(window.OzonFlowSeeds.REPLY_TEMPLATES))
        : [];
    }
    if (parsed.fundAlert == null) parsed.fundAlert = false;
    if (!parsed.agents || !Array.isArray(parsed.agents) || !parsed.agents.length) {
      parsed.agents = window.OzonFlowSeeds.defaultAgents
        ? window.OzonFlowSeeds.defaultAgents('off')
        : [];
    } else {
      // ensure all known agents exist (merge by id)
      const defs = window.OzonFlowSeeds.defaultAgents
        ? window.OzonFlowSeeds.defaultAgents('off')
        : [];
      defs.forEach(d => {
        if (!parsed.agents.find(a => a.id === d.id)) parsed.agents.push(JSON.parse(JSON.stringify(d)));
      });
    }
    if (parsed.agentTodayTotal == null) {
      parsed.agentTodayTotal = (parsed.agents || []).reduce((s, a) => s + (a.todayCount || 0), 0);
    }
    if (parsed.weeklySnapshot === undefined) parsed.weeklySnapshot = null;
    // tag shopId on entities missing it
    const sid = parsed.currentShopId || (parsed.shops && parsed.shops[0] && parsed.shops[0].id);
    ['listings', 'products', 'inventory', 'orders', 'reviews', 'qa', 'returns'].forEach(key => {
      if (Array.isArray(parsed[key])) {
        parsed[key].forEach(x => { if (!x.shopId) x.shopId = sid; });
      }
    });
    return parsed;
  }

  function loadOrSeed(demoId) {
    const id = demoId || localStorage.getItem(LS_DEMO) || 'guangzhou';
    try {
      const raw = localStorage.getItem(LS_KEY) || localStorage.getItem(LS_LEGACY);
      if (raw && !demoId) {
        const parsed = migrateIfNeeded(JSON.parse(raw));
        if (parsed && parsed.meta && parsed.meta.id === id) {
          state = parsed;
          return state;
        }
      }
    } catch (_) {}
    state = window.OzonFlowSeeds.build(id);
    persist();
    return state;
  }

  function switchDemo(demoId) {
    state = window.OzonFlowSeeds.build(demoId);
    persist();
    emit('switchDemo');
    return state;
  }

  function resetCurrent() {
    const id = state.meta.id;
    const role = state.role;
    state = window.OzonFlowSeeds.build(id);
    state.role = role;
    persist();
    emit('reset');
    return state;
  }

  function get() { return state; }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /* ---------- shop partition helpers ---------- */
  function shopId() {
    return state.currentShopId || (state.shops[0] && state.shops[0].id);
  }

  function currentShop() {
    return state.shops.find(s => s.id === shopId()) || state.shops[0];
  }

  function forShop(arr) {
    const sid = shopId();
    return (arr || []).filter(x => !x.shopId || x.shopId === sid);
  }

  function switchShop(id) {
    const sh = state.shops.find(s => s.id === id);
    if (!sh) return { ok: false, msg: '店铺不存在' };
    state.currentShopId = id;
    state.meta.shopName = sh.name;
    emit('switchShop');
    return { ok: true, msg: '已切换至「' + sh.name + '」' };
  }

  /* ---------- roles ---------- */
  function setRole(roleId) {
    if (!ROLES[roleId]) return { ok: false, msg: '未知角色' };
    state.role = roleId;
    emit('setRole');
    return { ok: true, msg: '当前角色：' + ROLES[roleId].label };
  }

  function canView(view) {
    const views = ROLE_VIEWS[state.role] || ROLE_VIEWS.boss;
    return views.includes(view);
  }

  function canDo(action) {
    const acts = ROLE_ACTIONS[state.role];
    if (acts === '*') return true;
    return (acts || []).includes(action);
  }

  function roleLabel() {
    return (ROLES[state.role] || ROLES.boss).label;
  }

  /* ---------- helpers ---------- */
  function statusLabel(status) {
    return ({ audit: '待审核', purchase: '待采购', ship: '待发货', shipped: '已发货' })[status] || status;
  }
  function statusTag(status) {
    return ({ audit: 'tag-gray', purchase: 'tag-orange', ship: 'tag-blue', shipped: 'tag-green' })[status] || 'tag-gray';
  }
  function nowLabel() {
    const d = new Date();
    return '今天 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function pushAuto(order, tag) {
    if (!order.auto.includes(tag)) order.auto.push(tag);
  }
  function pushTL(order, text) {
    order.timeline = order.timeline || [];
    order.timeline.push({ t: nowLabel(), text, done: true });
  }
  function findInv(sku) {
    return forShop(state.inventory).find(i => i.sku === sku)
      || state.inventory.find(i => i.sku === sku && i.shopId === shopId());
  }
  function channelById(id) {
    return state.channels.find(c => c.id === id);
  }

  function commissionRateForPrice(price) {
    const tiers = state.settings.commissionTiers || [];
    const t = tiers.find(x => price >= x.min && price < x.max);
    return t ? t.rate : (state.settings.commission || 0.12);
  }

  /* ---------- profit calc (shared rates + scenarios) ---------- */
  function calcProfit({ price, costCNY, weight, scenario }) {
    const s = state.settings;
    let sellPrice = price;
    if (scenario === 'promo') sellPrice = Math.round(price * 0.9);
    if (scenario === 'follow') sellPrice = Math.round(price * 0.95);

    const costRUB = costCNY * s.fx;
    const rate = commissionRateForPrice(sellPrice);
    const commission = sellPrice * rate;
    const shipPerKg = s.shipCnyPerKg * s.fx;
    const ship = Math.max(80, (weight / 1000) * shipPerKg + 45);
    const fee = sellPrice * s.paymentFee;
    const retProv = sellPrice * (s.returnProvision || 0);
    const profit = sellPrice - costRUB - commission - ship - fee - retProv;
    const margin = sellPrice > 0 ? (profit / sellPrice * 100) : 0;
    return {
      sellPrice, costRUB, commission, ship, fee, retProv, profit, margin,
      fx: s.fx, commissionRate: rate, shipCnyPerKg: s.shipCnyPerKg,
      returnProvisionRate: s.returnProvision || 0,
      scenario: scenario || 'normal',
    };
  }

  function updateSettings(patch) {
    Object.assign(state.settings, patch || {});
    emit('settings');
    return { ok: true, msg: '费率已更新' };
  }

  /* ---------- KPI (shop-scoped) ---------- */
  function kpi() {
    const orders = forShop(state.orders);
    const inventory = forShop(state.inventory);
    const listings = forShop(state.listings);
    const reviews = forShop(state.reviews);
    const returns = forShop(state.returns);
    const products = forShop(state.products);

    const pendingShip = orders.filter(o => o.status === 'ship' || o.status === 'purchase').length;
    const risk = orders.filter(o => o.risk || (o.etaH != null && o.etaH <= 6 && o.status !== 'shipped')).length;
    const auditCount = orders.filter(o => o.status === 'audit').length;
    const purchaseCount = orders.filter(o => o.status === 'purchase').length;
    const gross = orders.filter(o => o.status !== 'audit').reduce((sum, o) => {
      const p = calcProfit({ price: o.amount, costCNY: o.cost, weight: o.weight });
      return sum + Math.max(0, p.profit);
    }, 0);
    const lowStock = inventory.filter(i => i.local <= i.safe).length;
    const draftCount = listings.filter(l => l.status === 'draft' || l.status === 'ready' || l.status === 'mapping').length;
    const badReviews = reviews.filter(r => r.rating <= 3 && !r.replied).length;
    const openReturns = returns.filter(r => r.status === 'open' || r.status === 'investigating').length;
    const trackAnomaly = orders.filter(o => o.status === 'shipped' && (o.anomaly || o.trackStatus === 'stale' || o.trackStatus === 'customs_hold')).length;
    const escalateReviews = reviews.filter(r => r.rating === 1 && !r.escalated).length;
    const todaySales = products.reduce((s, p) => s + (p.todaySales || 0), 0);

    return {
      todayOrders: todaySales || (state.trend[state.trend.length - 1] || orders.length),
      pendingShip,
      risk,
      auditCount,
      purchaseCount,
      gross: Math.round(gross),
      lowStock,
      draftCount,
      badReviews,
      openReturns,
      trackAnomaly,
      escalateReviews,
      fundAlert: !!state.fundAlert,
      marginAvg: 28.4,
    };
  }

  function todos() {
    const k = kpi();
    const list = [];
    if (k.risk > 0) list.push({ id: 'timeout', icon: '⚠️', bg: 'var(--danger-bg)', title: k.risk + ' 笔超时备货', sub: '距截单 < 6h · rFBS 时效风险', btn: '去处理', view: 'orders', filter: 'risk', cls: 'btn-danger' });
    if (k.auditCount > 0) list.push({ id: 'audit', icon: '📋', bg: 'var(--warning-bg)', title: k.auditCount + ' 笔待审单', sub: '一键审单或手动审核', btn: '去审单', view: 'orders', filter: 'audit', cls: 'btn-secondary' });
    if (k.purchaseCount > 0 || k.lowStock > 0) list.push({ id: 'purchase', icon: '🛒', bg: 'var(--purple-bg)', title: (k.purchaseCount || k.lowStock) + ' 项缺货待采', sub: '待采购订单 / 低库存 SKU', btn: '去采购', view: k.purchaseCount ? 'orders' : 'logistics', filter: k.purchaseCount ? 'purchase' : null, cls: 'btn-ghost' });
    if (k.badReviews > 0) list.push({ id: 'review', icon: '⭐', bg: 'var(--warning-bg)', title: k.badReviews + ' 条差评待回', sub: '俄语模板一键回复', btn: '去回复', view: 'cs', filter: 'bad', cls: 'btn-secondary' });
    if (k.openReturns > 0) list.push({ id: 'returns', icon: '↩️', bg: 'var(--info-bg)', title: k.openReturns + ' 笔退货异常', sub: '取消 / 退货 / 索赔待处理', btn: '去处理', view: 'returns', filter: 'open', cls: 'btn-ghost' });
    if (k.trackAnomaly > 0) list.push({ id: 'track', icon: '🚚', bg: 'var(--warning-bg)', title: k.trackAnomaly + ' 笔物流轨迹异常', sub: '清关停滞 / 轨迹超 3 天未更新', btn: '去查看', view: 'orders', filter: 'shipped', cls: 'btn-secondary' });
    if (k.escalateReviews > 0) list.push({ id: 'escalate', icon: '⚠️', bg: 'var(--danger-bg)', title: k.escalateReviews + ' 条 1★ 待升级', sub: '差评预警可建退货工单', btn: '去客服', view: 'cs', filter: 'bad', cls: 'btn-danger' });
    if (k.fundAlert) list.push({ id: 'fund', icon: '💰', bg: 'var(--danger-bg)', title: '资金异常提醒', sub: '结算延迟 / 冻结款需核对', btn: '看周报', view: 'weekly', filter: null, cls: 'btn-danger' });
    if (k.draftCount > 0) list.push({ id: 'listing', icon: '📦', bg: 'var(--primary-light)', title: k.draftCount + ' 条刊登待处理', sub: '草稿 / 映射 / 待发布', btn: '去刊登', view: 'listing', filter: null, cls: 'btn-ghost' });
    return list;
  }

  /* ---------- Wizard ---------- */
  function wizardProgress() {
    const w = state.wizard;
    const steps = [
      { id: 'bind', label: '绑定店铺', done: !!w.shopBound },
      { id: 'rfbs', label: '选择 rFBS', done: !!w.rfbsChosen },
      { id: 'logistics', label: '默认物流', done: !!w.defaultLogistics },
      { id: 'products', label: '导入商品', done: !!w.productsImported },
    ];
    const done = steps.filter(s => s.done).length;
    return { steps, done, total: steps.length, pct: Math.round(done / steps.length * 100), completed: !!w.completed };
  }

  function wizardBindShop({ clientId, apiKey, shopName }) {
    const w = state.wizard;
    w.clientId = clientId || 'cid-' + Date.now().toString(36);
    w.apiKey = apiKey || 'key-' + Math.random().toString(36).slice(2, 10);
    w.shopBound = true;
    const shop = currentShop();
    if (shop) {
      shop.clientId = w.clientId;
      shop.apiKey = '••••••••';
      if (shopName) {
        shop.name = shopName;
        state.meta.shopName = shopName;
      }
    }
    w.step = Math.max(w.step, 1);
    emit('wizard');
    return { ok: true, msg: '店铺已绑定（Client-Id / Api-Key 已保存）' };
  }

  function wizardChooseRfbs() {
    state.wizard.rfbsChosen = true;
    state.wizard.step = Math.max(state.wizard.step, 2);
    const shop = currentShop();
    if (shop) shop.mode = 'rFBS';
    emit('wizard');
    return { ok: true, msg: '已选择 Ozon Russia rFBS 模式' };
  }

  function wizardSetLogistics(channelId) {
    state.wizard.defaultLogistics = channelId || 'yuntu';
    state.settings.defaultLogistics = state.wizard.defaultLogistics;
    state.wizard.step = Math.max(state.wizard.step, 3);
    emit('wizard');
    const ch = channelById(state.wizard.defaultLogistics);
    return { ok: true, msg: '默认物流：' + (ch ? ch.name : channelId) };
  }

  function wizardImportProducts() {
    const sid = shopId();
    const drafts = [
      { emoji: '🎧', name: '无线降噪耳机 TWS Pro', ru: 'Наушники TWS Pro', sku: 'OF-TWS-WIZ', price: 1890, cost: 48.5, weight: 180 },
      { emoji: '🔗', name: 'Type-C 编织数据线 2m', ru: 'Кабель USB-C 2м', sku: 'OF-CAB-WIZ', price: 290, cost: 3.2, weight: 45 },
      { emoji: '🔌', name: '65W 氮化镓快充头', ru: 'ЗУ 65W GaN', sku: 'OF-GAN-WIZ', price: 980, cost: 22.0, weight: 95 },
    ];
    drafts.forEach(d => {
      if (!forShop(state.listings).find(l => l.sku === d.sku)) {
        state.listings.unshift({
          id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          shopId: sid, emoji: d.emoji, name: d.name, ru: d.ru,
          cat: '— 待映射 —', map: 30, status: 'draft',
          price: d.price, cost: d.cost, weight: d.weight, sku: d.sku, stockInit: 50,
        });
      }
    });
    state.wizard.productsImported = true;
    state.wizard.step = Math.max(state.wizard.step, 4);
    emit('wizard');
    return { ok: true, msg: '已导入 ' + drafts.length + ' 个商品草稿' };
  }

  function wizardComplete() {
    const w = state.wizard;
    if (!w.shopBound) wizardBindShop({});
    if (!w.rfbsChosen) wizardChooseRfbs();
    if (!w.defaultLogistics) wizardSetLogistics('yuntu');
    if (!w.productsImported) wizardImportProducts();
    w.completed = true;
    w.step = 4;
    emit('wizard');
    return { ok: true, msg: '开店引导完成！开始选品刊登吧' };
  }

  function wizardReopen() {
    state.wizard.completed = false;
    state.wizard.step = 0;
    emit('wizard');
    return { ok: true };
  }

  /* ---------- Mutations (shop-scoped writes) ---------- */

  function claimProduct(catalogId) {
    if (!canDo('claim') && !canDo('*') && state.role !== 'boss') {
      return { ok: false, msg: '当前角色无权认领商品' };
    }
    const c = state.catalog.find(x => x.id === catalogId);
    if (!c) return { ok: false, msg: '商品不存在' };
    if (state.claimedIds.includes(catalogId)) {
      return { ok: false, msg: '已认领过该商品' };
    }
    const sid = shopId();
    const exists = forShop(state.listings).find(l => l.sku === c.skuHint);
    if (exists) {
      state.claimedIds.push(catalogId);
      emit('claim');
      return { ok: true, msg: '「' + c.name + '」已在刊登列表中', listingId: exists.id };
    }
    const listing = {
      id: 'L' + Date.now().toString(36),
      shopId: sid,
      emoji: c.emoji, name: c.name, ru: c.ru,
      cat: '— 待映射 —', map: 25, status: 'draft',
      price: c.price, cost: c.cost, weight: c.weight,
      sku: c.skuHint, stockInit: 50,
    };
    state.listings.unshift(listing);
    state.claimedIds.push(catalogId);
    emit('claim');
    return { ok: true, msg: '「' + c.name + '」已加入刊登草稿', listingId: listing.id };
  }

  function advanceListing(listingId) {
    const l = state.listings.find(x => x.id === listingId);
    if (!l) return { ok: false, msg: '草稿不存在' };
    if (l.status === 'draft') {
      l.status = 'mapping';
      l.map = Math.min(100, l.map + 40);
      l.cat = guessCat(l);
      emit('listing');
      return { ok: true, msg: '已开始类目/属性映射' };
    }
    if (l.status === 'mapping') {
      l.status = 'ready';
      l.map = 100;
      emit('listing');
      return { ok: true, msg: '映射完成，进入待发布' };
    }
    if (l.status === 'failed') {
      l.status = 'ready';
      l.map = 100;
      l.failReason = null;
      emit('listing');
      return { ok: true, msg: '已修复并回到待发布' };
    }
    return { ok: false, msg: '当前状态无需推进' };
  }

  function guessCat(l) {
    if (l.sku && l.sku.includes('TWS')) return 'Электроника › Наушники';
    if (l.sku && l.sku.includes('GAN')) return 'Электроника › ЗУ';
    if (l.sku && l.sku.includes('LED') && l.name.includes('台灯')) return 'Дом › Освещение';
    if (l.sku && l.sku.includes('PB')) return 'Электроника › Powerbank';
    if (l.sku && l.sku.includes('ORG')) return 'Дом › Хранение';
    if (l.sku && l.sku.includes('CAB')) return 'Электроника › Кабели';
    if (l.sku && l.sku.includes('MSE')) return 'Электроника › Мыши';
    if (l.sku && l.sku.includes('KB')) return 'Электроника › Клавиатуры';
    if (l.sku && l.sku.includes('THM')) return 'Дом › Кухня';
    if (l.sku && l.sku.includes('MIR')) return 'Красота › Зеркала';
    return 'Электроника › Прочее';
  }

  function publishListing(listingId) {
    if (!canDo('publish') && state.role !== 'boss') return { ok: false, msg: '当前角色无权发布' };
    const l = state.listings.find(x => x.id === listingId);
    if (!l) return { ok: false, msg: '草稿不存在' };
    if (l.status !== 'ready') return { ok: false, msg: '仅待发布状态可发布' };

    l.status = 'published';
    const ozonSku = String(160000000 + Math.floor(Math.random() * 9000000));
    const sid = l.shopId || shopId();
    const product = {
      id: 'P' + Date.now().toString(36),
      shopId: sid,
      emoji: l.emoji, name: l.name, ru: l.ru, sku: l.sku, ozonSku,
      price: l.price, cost: l.cost, weight: l.weight, status: 'active',
      todaySales: 0,
      margin: Math.round(calcProfit({ price: l.price, costCNY: l.cost, weight: l.weight }).margin),
    };
    state.products.unshift(product);

    if (!state.inventory.find(i => i.sku === l.sku && i.shopId === sid)) {
      state.inventory.unshift({
        sku: l.sku, name: l.name, emoji: l.emoji, shopId: sid,
        local: l.stockInit || 50, ozon: l.stockInit || 50, safe: 20, sync: 'ok',
      });
    }
    emit('publish');
    return { ok: true, msg: '「' + l.name + '」已发布上架 · Ozon SKU ' + ozonSku, product };
  }

  function publishReadyBatch() {
    const ready = forShop(state.listings).filter(l => l.status === 'ready');
    let n = 0;
    ready.forEach(l => {
      const r = publishListing(l.id);
      if (r.ok) n++;
    });
    return { ok: true, msg: '已批量发布 ' + n + ' 条商品', count: n };
  }

  function syncOrders(count) {
    count = count || 1;
    const actives = forShop(state.products).filter(p => p.status === 'active');
    if (!actives.length) return { ok: false, msg: '暂无在售商品，请先刊登发布' };
    const cities = ['Москва', 'СПб', 'Казань', 'Екб', 'Новосиб.', 'Краснодар', 'Ростов', 'Самара'];
    const names = ['Иван П.', 'Анна С.', 'Дмитрий К.', 'Елена В.', 'Ольга М.', 'Сергей Н.', 'Мария Л.'];
    const created = [];
    const sid = shopId();
    for (let i = 0; i < count; i++) {
      const p = actives[Math.floor(Math.random() * actives.length)];
      const seq = state.nextOrderSeq++;
      const prefix = state.meta.id === 'yiwu' ? 'YI' : state.meta.id === 'pressure' ? 'PR' : 'GZ';
      const order = {
        id: 'OZ-' + prefix + '-' + seq,
        shopId: sid,
        emoji: p.emoji,
        name: p.name.replace(/^无线降噪/, '').slice(0, 16),
        buyer: names[Math.floor(Math.random() * names.length)],
        city: cities[Math.floor(Math.random() * cities.length)],
        amount: p.price, logistics: '—', logisticsId: null, auto: [],
        status: 'audit', statusLabel: '待审核',
        etaH: 24 + Math.floor(Math.random() * 24), risk: false,
        weight: p.weight, sku: p.sku, cost: p.cost, track: null, note: '',
        timeline: [{ t: nowLabel(), text: '订单同步自 Ozon', done: true }],
      };
      state.orders.unshift(order);
      created.push(order);
      p.todaySales = (p.todaySales || 0) + 1;
      const inv = findInv(p.sku);
      if (inv && inv.ozon > 0) { inv.ozon--; if (inv.local > 0) inv.local--; }
    }
    state.syncAgoMin = 0;
    state.trend[state.trend.length - 1] += count;
    emit('syncOrders');
    return { ok: true, msg: '已同步 ' + count + ' 笔新订单', orders: created };
  }

  function applyRulesToOrder(order) {
    if (!order || order.status === 'shipped') return [];
    const applied = [];
    const rules = state.rules.filter(r => r.on);

    const auditRule = rules.find(r => r.type === 'audit');
    if (auditRule && order.status === 'audit') {
      const amountOk = order.amount < (auditRule.when.amountLt || 5000);
      const noteOk = !auditRule.when.noBuyerNote || !order.note;
      if (amountOk && noteOk) {
        order.status = 'ship';
        order.statusLabel = statusLabel('ship');
        pushAuto(order, '已审单');
        pushTL(order, '规则「' + auditRule.name + '」→ 自动审核通过');
        auditRule.hits++; auditRule.today++;
        applied.push(auditRule.id);
      }
    }

    if (order.status !== 'audit' && !order.logisticsId) {
      const light = rules.find(r => r.id === 'r_ship_light');
      const heavy = rules.find(r => r.id === 'r_ship_heavy');
      let ch = null;
      if (light && order.weight <= (light.when.weightLte || 500)) {
        ch = channelById(light.then.channelId);
        light.hits++; light.today++;
        applied.push(light.id);
      } else if (heavy && order.weight > (heavy.when.weightGt || 500)) {
        ch = channelById(heavy.then.channelId);
        heavy.hits++; heavy.today++;
        applied.push(heavy.id);
      }
      if (ch) {
        order.logisticsId = ch.id;
        order.logistics = ch.name;
        pushAuto(order, '已匹配物流');
        pushTL(order, '规则物流匹配 → ' + ch.name);
        ch.today = (ch.today || 0) + 1;
      }
    }

    const purchRule = rules.find(r => r.type === 'purchase');
    if (purchRule && order.status === 'ship' && order.auto.includes('已审单')) {
      const inv = findInv(order.sku);
      const local = inv ? inv.local : 0;
      if (local <= (purchRule.when.localStockLte || 5)) {
        order.status = 'purchase';
        order.statusLabel = statusLabel('purchase');
        pushAuto(order, '已标记采购');
        pushTL(order, '规则「' + purchRule.name + '」→ 本地库存 ' + local + ' ≤ 阈值，标记待采购');
        purchRule.hits++; purchRule.today++;
        applied.push(purchRule.id);
      }
    }

    if (order.etaH != null && order.etaH <= 6 && order.status !== 'shipped') {
      order.risk = true;
    }
    return applied;
  }

  function runAutoAudit() {
    if (!canDo('audit') && state.role !== 'boss') return { ok: false, msg: '当前角色无权审单' };
    let n = 0;
    forShop(state.orders).forEach(o => {
      if (o.status === 'audit') {
        const a = applyRulesToOrder(o);
        if (a.length) n++;
      }
    });
    emit('autoAudit');
    return { ok: true, msg: '自动审单完成 · 处理 ' + n + ' 笔订单', count: n };
  }

  function runAllRules() {
    if (!canDo('rules') && state.role !== 'boss') return { ok: false, msg: '当前角色无权执行规则' };
    let n = 0;
    forShop(state.orders).forEach(o => {
      if (o.status !== 'shipped') {
        const before = o.auto.length;
        applyRulesToOrder(o);
        if (o.auto.length > before) n++;
      }
    });
    const stockRule = state.rules.find(r => r.type === 'inventory');
    if (stockRule && stockRule.on) {
      const low = forShop(state.inventory).filter(i => i.local <= i.safe);
      if (low.length) {
        stockRule.hits += low.length;
        stockRule.today += low.length;
        low.forEach(i => { if (i.sync === 'ok') i.sync = 'warn'; });
      }
    }
    emit('runRules');
    return { ok: true, msg: '规则引擎已执行 · 命中更新 ' + n + ' 笔', count: n };
  }

  function toggleRule(ruleId, on) {
    if (!canDo('rules') && state.role !== 'boss') return { ok: false, msg: '当前角色无权改规则' };
    const r = state.rules.find(x => x.id === ruleId);
    if (!r) return { ok: false };
    r.on = !!on;
    emit('toggleRule');
    return { ok: true, msg: '规则「' + r.name + '」已' + (on ? '启用' : '停用') };
  }

  function auditOrder(orderId) {
    if (!canDo('audit') && state.role !== 'boss') return { ok: false, msg: '当前角色无权审单' };
    const o = state.orders.find(x => x.id === orderId);
    if (!o) return { ok: false, msg: '订单不存在' };
    if (o.status !== 'audit') return { ok: false, msg: '非待审核状态' };
    o.status = 'ship';
    o.statusLabel = statusLabel('ship');
    pushAuto(o, '已审单');
    pushTL(o, '手动审单通过');
    applyRulesToOrder(o);
    emit('audit');
    return { ok: true, msg: '已通过审单 ' + o.id };
  }

  function assignLogistics(orderId, channelId) {
    const o = state.orders.find(x => x.id === orderId);
    const ch = channelById(channelId || (o && o.weight <= 500 ? 'yuntu' : 'yanwen'));
    if (!o || !ch) return { ok: false, msg: '无法分配物流' };
    o.logisticsId = ch.id;
    o.logistics = ch.name;
    pushAuto(o, '已匹配物流');
    pushTL(o, '匹配物流 → ' + ch.name);
    ch.today = (ch.today || 0) + 1;
    if (o.status === 'audit') {
      o.status = 'ship';
      o.statusLabel = statusLabel('ship');
      pushAuto(o, '已审单');
    }
    emit('logistics');
    return { ok: true, msg: o.id + ' → ' + ch.name };
  }

  function markPurchased(orderId) {
    if (!canDo('purchase') && state.role !== 'boss') return { ok: false, msg: '当前角色无权标记采购' };
    const o = state.orders.find(x => x.id === orderId);
    if (!o) return { ok: false, msg: '订单不存在' };
    pushAuto(o, '已采购');
    pushTL(o, '1688 采购下单完成');
    if (o.status === 'purchase') {
      o.status = 'ship';
      o.statusLabel = statusLabel('ship');
    }
    const inv = findInv(o.sku);
    if (inv) { inv.local += 5; inv.ozon += 5; if (inv.local > inv.safe) inv.sync = 'ok'; }
    emit('purchase');
    return { ok: true, msg: '已标记采购完成' };
  }

  function applyWaybill(orderId) {
    if (!canDo('waybill') && state.role !== 'boss') return { ok: false, msg: '当前角色无权申请面单' };
    const o = state.orders.find(x => x.id === orderId);
    if (!o) return { ok: false, msg: '订单不存在' };
    if (!o.logisticsId) assignLogistics(orderId);
    if (o.status === 'audit') auditOrder(orderId);
    const prefix = o.logisticsId === 'ogl' ? 'OGL' : o.logisticsId === 'yanwen' ? 'YW' : 'YT';
    const track = prefix + '240926' + String(Math.floor(Math.random() * 9000) + 1000) + 'CN';
    o.track = track;
    pushAuto(o, '已取号');
    pushTL(o, '申请运单号 ' + track);
    if (o.status === 'purchase' || o.status === 'audit') {
      o.status = 'ship';
      o.statusLabel = statusLabel('ship');
    }
    const wr = state.rules.find(r => r.type === 'waybill');
    if (wr && wr.on) { wr.hits++; wr.today++; }
    emit('waybill');
    return { ok: true, msg: '运单号 ' + track, track };
  }

  function applyWaybillBatch() {
    const targets = forShop(state.orders).filter(o =>
      (o.status === 'ship' || o.status === 'purchase') && !o.track
    );
    let n = 0;
    targets.forEach(o => {
      const r = applyWaybill(o.id);
      if (r.ok) n++;
    });
    return { ok: true, msg: '已批量申请面单 × ' + n, count: n };
  }

  function shipOrder(orderId) {
    if (!canDo('ship') && state.role !== 'boss') return { ok: false, msg: '当前角色无权发货' };
    const o = state.orders.find(x => x.id === orderId);
    if (!o) return { ok: false, msg: '订单不存在' };
    if (!o.track) {
      const w = applyWaybill(orderId);
      if (!w.ok) return w;
    }
    o.status = 'shipped';
    o.statusLabel = '已发货';
    o.risk = false;
    o.etaH = null;
    pushTL(o, '提交平台发货');
    emit('ship');
    return { ok: true, msg: o.id + ' 已发货 · ' + o.track };
  }

  function syncInventory() {
    forShop(state.inventory).forEach(i => {
      i.ozon = i.local;
      i.sync = i.local <= i.safe ? 'warn' : 'ok';
    });
    const stockRule = state.rules.find(r => r.type === 'inventory');
    const low = forShop(state.inventory).filter(i => i.local <= i.safe);
    if (stockRule && stockRule.on && low.length) {
      stockRule.hits += low.length;
      stockRule.today += low.length;
    }
    state.syncAgoMin = 0;
    emit('syncInv');
    return { ok: true, msg: '库存同步完成 · 更新 ' + forShop(state.inventory).length + ' SKU · 低库存 ' + low.length, low: low.length };
  }

  function restock(sku, qty) {
    if (!canDo('restock') && state.role !== 'boss') return { ok: false, msg: '当前角色无权补货' };
    qty = qty || 50;
    const inv = findInv(sku);
    if (!inv) return { ok: false, msg: 'SKU 不存在' };
    inv.local += qty;
    inv.ozon += qty;
    inv.sync = inv.local <= inv.safe ? 'warn' : 'ok';
    emit('restock');
    return { ok: true, msg: inv.name + ' 已补货 +' + qty + ' · 本地 ' + inv.local };
  }

  function connectChannel(channelId) {
    const ch = channelById(channelId);
    if (!ch) return { ok: false };
    ch.connected = true;
    emit('channel');
    return { ok: true, msg: ch.name + ' 已连接' };
  }

  /* ---------- Reviews / CS ---------- */
  function replyReview(reviewId, text) {
    if (!canDo('reply') && state.role !== 'boss') return { ok: false, msg: '当前角色无权回复评价' };
    const r = state.reviews.find(x => x.id === reviewId);
    if (!r) return { ok: false, msg: '评价不存在' };
    r.reply = text || r.reply;
    r.replied = true;
    emit('reply');
    return { ok: true, msg: '已回复评价' };
  }

  function answerQa(qaId, text) {
    if (!canDo('reply') && state.role !== 'boss') return { ok: false, msg: '当前角色无权回答问答' };
    const q = state.qa.find(x => x.id === qaId);
    if (!q) return { ok: false, msg: '问答不存在' };
    q.answer = text || q.answer;
    q.answered = true;
    emit('qa');
    return { ok: true, msg: '已回答买家提问' };
  }

  /* ---------- Returns state machine ---------- */
  const RETURN_FLOW = {
    open: ['approved', 'rejected', 'investigating'],
    investigating: ['approved', 'rejected'],
    approved: ['refunded', 'closed'],
    rejected: ['closed'],
    refunded: ['closed'],
    closed: [],
  };
  const RETURN_LABELS = {
    open: '待处理', investigating: '调查中', approved: '已同意',
    rejected: '已拒绝', refunded: '已退款', closed: '已关闭',
  };

  function advanceReturn(returnId, nextStatus) {
    if (!canDo('return') && state.role !== 'boss') return { ok: false, msg: '当前角色无权处理退货' };
    const r = state.returns.find(x => x.id === returnId);
    if (!r) return { ok: false, msg: '退货单不存在' };
    const allowed = RETURN_FLOW[r.status] || [];
    if (!allowed.includes(nextStatus)) {
      return { ok: false, msg: '不可从「' + RETURN_LABELS[r.status] + '」转到「' + RETURN_LABELS[nextStatus] + '」' };
    }
    r.status = nextStatus;
    r.timeline = r.timeline || [];
    r.timeline.push({ t: nowLabel(), text: '状态 → ' + RETURN_LABELS[nextStatus], done: true });
    emit('return');
    return { ok: true, msg: r.id + ' → ' + RETURN_LABELS[nextStatus] };
  }

  /* ---------- Weekly report ---------- */
  function weeklyReport() {
    const shops = state.shops.map(sh => {
      const orders = state.orders.filter(o => o.shopId === sh.id);
      const shipped = orders.filter(o => o.status === 'shipped');
      const risk = orders.filter(o => o.risk || (o.etaH != null && o.etaH <= 6 && o.status !== 'shipped'));
      const rets = state.returns.filter(r => r.shopId === sh.id);
      const sales = orders.reduce((s, o) => s + o.amount, 0);
      const profit = orders.reduce((s, o) => {
        const p = calcProfit({ price: o.amount, costCNY: o.cost, weight: o.weight });
        return s + Math.max(0, p.profit);
      }, 0);
      const timeoutRate = orders.length ? (risk.length / orders.length * 100) : 0;
      const returnRate = orders.length ? (rets.length / orders.length * 100) : 0;
      const margin = sales > 0 ? (profit / sales * 100) : 0;
      return {
        shopId: sh.id, name: sh.name,
        orders: orders.length, shipped: shipped.length,
        sales: Math.round(sales), profit: Math.round(profit),
        margin: +margin.toFixed(1),
        timeoutRate: +timeoutRate.toFixed(1),
        returnRate: +returnRate.toFixed(1),
      };
    });

    const skuMap = {};
    forShop(state.orders).forEach(o => {
      if (!skuMap[o.sku]) {
        skuMap[o.sku] = { sku: o.sku, name: o.name, emoji: o.emoji, qty: 0, sales: 0, profit: 0 };
      }
      skuMap[o.sku].qty++;
      skuMap[o.sku].sales += o.amount;
      const p = calcProfit({ price: o.amount, costCNY: o.cost, weight: o.weight });
      skuMap[o.sku].profit += Math.max(0, p.profit);
    });
    const skus = Object.values(skuMap).map(x => ({
      ...x, sales: Math.round(x.sales), profit: Math.round(x.profit),
      margin: x.sales > 0 ? +((x.profit / x.sales) * 100).toFixed(1) : 0,
    })).sort((a, b) => b.sales - a.sales);

    return { shops, skus, generatedAt: nowLabel() };
  }

  function badges() {
    return {
      listing: forShop(state.listings).filter(l => ['draft', 'mapping', 'ready', 'failed'].includes(l.status)).length,
      orders: forShop(state.orders).filter(o => o.status !== 'shipped').length,
      risk: forShop(state.orders).filter(o => o.risk || (o.etaH != null && o.etaH <= 6 && o.status !== 'shipped')).length,
      cs: forShop(state.reviews).filter(r => r.rating <= 3 && !r.replied).length
        + forShop(state.qa).filter(q => !q.answered).length,
      returns: forShop(state.returns).filter(r => r.status === 'open' || r.status === 'investigating').length,
    };
  }

  /* ---------- Automation Agents ---------- */
  function ensureAgents() {
    if (!state.agents || !state.agents.length) {
      state.agents = window.OzonFlowSeeds.defaultAgents
        ? window.OzonFlowSeeds.defaultAgents('off')
        : [];
    }
    return state.agents;
  }

  function agentById(id) {
    return ensureAgents().find(a => a.id === id);
  }

  function pushAgentLog(agent, text) {
    agent.log = agent.log || [];
    agent.log.unshift({ t: nowLabel(), text: text });
    if (agent.log.length > 30) agent.log.length = 30;
  }

  function bumpAgent(agent, n) {
    n = n || 0;
    agent.lastRun = nowLabel();
    agent.todayCount = (agent.todayCount || 0) + n;
    state.agentTodayTotal = (state.agentTodayTotal || 0) + n;
  }

  function suggestedPriceForMargin(price, costCNY, weight, targetMargin) {
    // binary-search-ish: raise price until margin >= target
    let lo = price, hi = Math.max(price * 2, price + 500);
    for (let i = 0; i < 16; i++) {
      const mid = Math.round((lo + hi) / 2);
      const m = calcProfit({ price: mid, costCNY, weight }).margin;
      if (m >= targetMargin) hi = mid; else lo = mid + 1;
    }
    return hi;
  }

  function runSelectionRadar(agent) {
    const minM = (agent.config && agent.config.marginMin) || 25;
    let n = 0;
    const msgs = [];
    (state.catalog || []).forEach(c => {
      if (state.claimedIds.includes(c.id)) return;
      const p = calcProfit({ price: c.price, costCNY: c.cost, weight: c.weight });
      if (p.margin >= minM) {
        const r = claimProduct(c.id);
        if (r.ok) {
          n++;
          msgs.push('认领「' + c.name + '」毛利 ' + p.margin.toFixed(1) + '%');
        }
      }
    });
    if (!n) msgs.push('无符合毛利≥' + minM + '% 的可认领爆款');
    msgs.slice(0, 5).forEach(m => pushAgentLog(agent, m));
    bumpAgent(agent, n);
    return { ok: true, count: n, msg: '选品雷达 · 认领 ' + n + ' 个 SKU' };
  }

  function runListingPublish(agent) {
    let n = 0;
    const msgs = [];
    // advance drafts/mappings first
    forShop(state.listings).slice().forEach(l => {
      if (l.status === 'draft' || l.status === 'mapping' || l.status === 'failed') {
        const r = advanceListing(l.id);
        if (r.ok) {
          n++;
          msgs.push(l.name + ' · ' + r.msg);
        }
      }
    });
    // publish ready
    forShop(state.listings).filter(l => l.status === 'ready').forEach(l => {
      const r = publishListing(l.id);
      if (r.ok) {
        n++;
        msgs.push('已发布「' + l.name + '」');
      }
    });
    if (!n) msgs.push('暂无可推进/发布的草稿');
    msgs.slice(0, 6).forEach(m => pushAgentLog(agent, m));
    bumpAgent(agent, n);
    return { ok: true, count: n, msg: '刊登过审 · 处理 ' + n + ' 项' };
  }

  function runOrderFulfill(agent) {
    let n = 0;
    const msgs = [];
    // auto audit pending
    forShop(state.orders).filter(o => o.status === 'audit').forEach(o => {
      const r = auditOrder(o.id);
      if (r.ok) { n++; msgs.push('审单 ' + o.id); }
    });
    // assign logistics + waybill for ship/purchase without track
    forShop(state.orders).filter(o =>
      (o.status === 'ship' || o.status === 'purchase') && !o.track
    ).forEach(o => {
      if (!o.logisticsId) assignLogistics(o.id);
      const r = applyWaybill(o.id);
      if (r.ok) { n++; msgs.push('面单 ' + o.id + ' · ' + (r.track || '')); }
    });
    if (!n) msgs.push('无可履约订单');
    msgs.slice(0, 8).forEach(m => pushAgentLog(agent, m));
    bumpAgent(agent, n);
    return { ok: true, count: n, msg: '审单履约 · 处理 ' + n + ' 笔' };
  }

  function runTimeoutRescue(agent) {
    const etaMax = (agent.config && agent.config.etaMaxH) || 6;
    let n = 0;
    const msgs = [];
    const risks = forShop(state.orders).filter(o =>
      o.status !== 'shipped' && (o.risk || (o.etaH != null && o.etaH <= etaMax))
    ).sort((a, b) => (a.etaH || 99) - (b.etaH || 99));

    risks.forEach(o => {
      const inv = findInv(o.sku);
      const local = inv ? inv.local : 0;
      if (local <= 0 || o.status === 'purchase') {
        if (o.status !== 'purchase') {
          o.status = 'purchase';
          o.statusLabel = statusLabel('purchase');
          pushAuto(o, '已标记采购');
          pushTL(o, '超时抢救 Agent → 缺货标采购');
        }
        n++;
        msgs.push('⚠ ' + o.id + ' eta=' + o.etaH + 'h · 缺货→采购');
        return;
      }
      if (o.status === 'audit') auditOrder(o.id);
      if (!o.logisticsId) assignLogistics(o.id);
      if (!o.track) applyWaybill(o.id);
      if (o.track && o.status !== 'shipped') {
        const r = shipOrder(o.id);
        if (r.ok) {
          n++;
          msgs.push('🚀 ' + o.id + ' 超时抢救已发货 · ' + o.track);
        }
      } else {
        n++;
        msgs.push(o.id + ' 已推进（待发）');
      }
    });
    if (!n) msgs.push('当前无 eta≤' + etaMax + 'h 风险单');
    msgs.slice(0, 8).forEach(m => pushAgentLog(agent, m));
    bumpAgent(agent, n);
    return { ok: true, count: n, msg: '超时抢救 · 处理 ' + n + ' 笔' };
  }

  function runProfitGuard(agent) {
    const minM = (agent.config && agent.config.marginMin) || 20;
    let n = 0;
    const msgs = [];
    // check listings (drafts + ready) and active products
    forShop(state.listings).forEach(l => {
      if (l.status === 'published') return;
      const p = calcProfit({ price: l.price, costCNY: l.cost, weight: l.weight });
      if (p.margin < minM) {
        const sug = suggestedPriceForMargin(l.price, l.cost, l.weight, minM);
        l.flagged = true;
        l.marginFlag = 'below_min';
        l.suggestedPrice = sug;
        n++;
        msgs.push('旗标「' + l.name + '」毛利 ' + p.margin.toFixed(1) + '% → 建议 ' + sug + '₽');
      } else if (l.flagged) {
        l.flagged = false;
        l.marginFlag = null;
      }
    });
    forShop(state.products).forEach(pr => {
      const p = calcProfit({ price: pr.price, costCNY: pr.cost, weight: pr.weight, scenario: 'follow' });
      if (p.margin < minM) {
        const sug = suggestedPriceForMargin(pr.price, pr.cost, pr.weight, minM);
        pr.flagged = true;
        pr.suggestedPrice = sug;
        n++;
        msgs.push('跟卖风险「' + pr.name + '」建议价 ' + sug + '₽');
      }
    });
    if (!n) msgs.push('全部 SKU 毛利 ≥ ' + minM + '%');
    msgs.slice(0, 8).forEach(m => pushAgentLog(agent, m));
    bumpAgent(agent, n);
    return { ok: true, count: n, msg: '利润守门 · 标记 ' + n + ' 项' };
  }

  function runRuCs(agent) {
    let n = 0;
    const msgs = [];
    const templates = state.replyTemplates || [];
    const tpl = templates.find(t => t.id === 't1') || templates[0];
    const text = tpl ? tpl.ru : 'Здравствуйте! Приносим извинения. Напишите нам в чат — поможем!';
    forShop(state.reviews).filter(r => r.rating <= 3 && !r.replied).forEach(r => {
      const res = replyReview(r.id, text);
      if (res.ok) {
        n++;
        msgs.push('回复差评「' + (r.product || r.sku) + '」★' + r.rating);
      }
    });
    // also answer unanswered QA lightly
    forShop(state.qa).filter(q => !q.answered).slice(0, 3).forEach(q => {
      const t4 = templates.find(t => t.id === 't4') || tpl;
      const res = answerQa(q.id, t4 ? t4.ru : 'Спасибо за вопрос!');
      if (res.ok) {
        n++;
        msgs.push('回答 Q&A · ' + (q.product || q.sku));
      }
    });
    if (!n) msgs.push('无待回复差评 / 问答');
    msgs.slice(0, 8).forEach(m => pushAgentLog(agent, m));
    bumpAgent(agent, n);
    return { ok: true, count: n, msg: '俄语客服 · 处理 ' + n + ' 条' };
  }

  function runReturnClaim(agent) {
    let n = 0;
    const msgs = [];
    // return/claim decision tree
    forShop(state.returns).slice().forEach(r => {
      let next = null;
      if (r.status === 'open') {
        next = r.type === 'cancel' ? 'approved' : 'investigating';
      } else if (r.status === 'investigating') {
        // claims with damage/defect → approve; else reject lightly by reason length
        const bad = /Брак|брак|не работает|поврежд|Трещина|лопнул/i.test(r.reason || '');
        next = bad || r.type === 'return' ? 'approved' : 'rejected';
      } else if (r.status === 'approved') {
        next = r.type === 'cancel' ? 'closed' : 'refunded';
      } else if (r.status === 'refunded' || r.status === 'rejected') {
        next = 'closed';
      }
      if (next) {
        const res = advanceReturn(r.id, next);
        if (res.ok) {
          n++;
          msgs.push(r.id + ' → ' + (RETURN_LABELS[next] || next));
        }
      }
    });
    if (!n) msgs.push('无开放退货/索赔可推进');
    msgs.slice(0, 8).forEach(m => pushAgentLog(agent, m));
    bumpAgent(agent, n);
    return { ok: true, count: n, msg: '退货理赔 · 推进 ' + n + ' 笔' };
  }

  function runInventoryRestock(agent) {
    const qty = (agent.config && agent.config.qty) || 50;
    let n = 0;
    const msgs = [];
    forShop(state.inventory).filter(i => i.local <= i.safe).forEach(i => {
      const r = restock(i.sku, qty);
      if (r.ok) {
        n++;
        msgs.push('补货「' + i.name + '」+' + qty + ' → 本地 ' + i.local);
      }
    });
    if (!n) msgs.push('无低于安全库存的 SKU');
    msgs.slice(0, 8).forEach(m => pushAgentLog(agent, m));
    bumpAgent(agent, n);
    return { ok: true, count: n, msg: '库存补货 · ' + n + ' SKU' };
  }

  function runWeeklyReportAgent(agent) {
    const report = weeklyReport();
    state.weeklySnapshot = report;
    const totalSales = report.shops.reduce((s, x) => s + x.sales, 0);
    const totalProfit = report.shops.reduce((s, x) => s + x.profit, 0);
    const msg = '周报 · ' + report.shops.length + ' 店 · 销售 ' + totalSales.toLocaleString('ru-RU') + '₽ · 净利 ' + totalProfit.toLocaleString('ru-RU') + '₽';
    pushAgentLog(agent, msg);
    report.shops.forEach(sh => {
      pushAgentLog(agent, sh.name + ' · 单量 ' + sh.orders + ' · 超时率 ' + sh.timeoutRate + '%');
    });
    bumpAgent(agent, 1);
    return { ok: true, count: 1, msg: msg, report: report };
  }


  function runPurchase1688(agent) {
    let n = 0;
    const msgs = [];
    forShop(state.orders).filter(o => o.status === 'purchase').forEach(o => {
      const po = '1688-PO-' + String(Date.now()).slice(-6) + '-' + Math.floor(Math.random() * 90 + 10);
      o.poNumber = po;
      o.purchaseStatus = 'ordered';
      pushTL(o, '1688 采购跟单 · 下单 ' + po);
      const r = markPurchased(o.id);
      if (r.ok) {
        n++;
        msgs.push(o.id + ' · 采购完成 ' + po + ' → 待发货');
      }
    });
    if (!n) msgs.push('无待采购订单可跟单');
    msgs.slice(0, 8).forEach(m => pushAgentLog(agent, m));
    bumpAgent(agent, n);
    return { ok: true, count: n, msg: '1688采购跟单 · 处理 ' + n + ' 笔' };
  }

  function runLogisticsAnomaly(agent) {
    let n = 0;
    const msgs = [];
    const shipped = forShop(state.orders).filter(o => o.status === 'shipped' && o.track);
    shipped.forEach(o => {
      const stale = o.anomaly || o.trackStatus === 'stale' || o.trackStatus === 'customs_hold'
        || (o.lastTrackAt && /[4-9]天前|[1-9]\d天前/.test(o.lastTrackAt));
      if (!stale) return;
      o.anomaly = true;
      o.trackStatus = o.trackStatus === 'customs_hold' ? 'customs_hold' : 'stale';
      o.anomalyHandled = true;
      pushTL(o, '物流异常 Agent · 轨迹停滞预警（' + (o.trackStatus === 'customs_hold' ? '清关异常' : '轨迹停滞') + '）');
      // open claim if none for this order
      const exists = (state.returns || []).find(r => r.orderId === o.id && r.status !== 'closed');
      if (!exists) {
        state.returns.unshift({
          id: 'RT-LOG-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
          shopId: o.shopId || shopId(),
          orderId: o.id,
          type: 'claim',
          status: 'open',
          reason: o.trackStatus === 'customs_hold' ? 'Таможня / задержка трекинга' : 'Трекинг не обновляется',
          sku: o.sku,
          product: o.name,
          emoji: o.emoji || '📦',
          amount: o.amount,
          created: nowLabel(),
          timeline: [{ t: nowLabel(), text: '物流异常 Agent 自动建索赔工单', done: true }],
        });
        msgs.push('⚠ ' + o.id + ' · 轨迹异常 → 已建索赔');
      } else {
        msgs.push('⚠ ' + o.id + ' · 轨迹异常已标记');
      }
      n++;
    });
    if (!n) msgs.push('无物流轨迹异常单');
    msgs.slice(0, 8).forEach(m => pushAgentLog(agent, m));
    bumpAgent(agent, n);
    return { ok: true, count: n, msg: '物流轨迹异常 · 处理 ' + n + ' 笔' };
  }

  function runFxCommission(agent) {
    const warn = (agent.config && agent.config.marginWarn) || 18;
    let n = 0;
    const msgs = [];
    const set = state.settings || {};
    // slight FX jitter to simulate market refresh within bounds
    const fxOld = set.fx || 11.85;
    const fxNew = Math.round((fxOld + (Math.random() * 0.2 - 0.05)) * 100) / 100;
    set.fx = fxNew;
    msgs.push('汇率刷新 ' + fxOld + ' → ' + fxNew + ' ₽/¥');
    forShop(state.products).forEach(pr => {
      const p = calcProfit({ price: pr.price, costCNY: pr.cost, weight: pr.weight });
      const prev = pr.margin;
      pr.margin = Math.round(p.margin * 10) / 10;
      pr.fxSnapshot = fxNew;
      if (pr.margin < warn) {
        pr.flagged = true;
        pr.suggestedPrice = suggestedPriceForMargin(pr.price, pr.cost, pr.weight, warn);
        n++;
        msgs.push('净利偏低「' + pr.name + '」' + pr.margin + '% → 建议 ' + pr.suggestedPrice + '₽');
      } else if (prev != null && Math.abs(prev - pr.margin) >= 0.5) {
        n++;
        msgs.push('重算「' + pr.name + '」毛利 ' + prev + '% → ' + pr.margin + '%');
      }
    });
    forShop(state.listings).forEach(l => {
      if (l.status === 'published') return;
      const p = calcProfit({ price: l.price, costCNY: l.cost, weight: l.weight });
      l.calcMargin = Math.round(p.margin * 10) / 10;
      if (p.margin < warn) {
        l.flagged = true;
        l.suggestedPrice = suggestedPriceForMargin(l.price, l.cost, l.weight, warn);
        n++;
        msgs.push('草稿偏低「' + l.name + '」→ 建议 ' + l.suggestedPrice + '₽');
      }
    });
    if (n === 0) msgs.push('汇率佣金已重算 · 无利润异常');
    // count at least the fx refresh as activity if nothing else
    const count = Math.max(n, 1);
    msgs.slice(0, 8).forEach(m => pushAgentLog(agent, m));
    bumpAgent(agent, count);
    return { ok: true, count: count, msg: '汇率佣金重算 · ' + count + ' 项' };
  }

  function runReviewEscalate(agent) {
    let n = 0;
    const msgs = [];
    forShop(state.reviews).filter(r => r.rating === 1 && !r.escalated).forEach(r => {
      r.escalated = true;
      r.escalateLevel = 'ops';
      // ensure reply path kicked for CS later; create return if missing
      const exists = (state.returns || []).find(x =>
        x.sku === r.sku && x.shopId === (r.shopId || shopId()) &&
        (x.status === 'open' || x.status === 'investigating') &&
        /брак|Брак|не работает|сломал|протека/i.test((x.reason || '') + (r.text || ''))
      );
      if (!exists) {
        state.returns.unshift({
          id: 'RT-ESC-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
          shopId: r.shopId || shopId(),
          orderId: r.orderId || ('ESC-' + r.id),
          type: 'return',
          status: 'open',
          reason: '差评升级：' + (r.text || '1★').slice(0, 80),
          sku: r.sku,
          product: r.product,
          emoji: r.emoji || '⭐',
          amount: 0,
          created: nowLabel(),
          fromReviewId: r.id,
          timeline: [{ t: nowLabel(), text: '差评预警升级 Agent · 1★ → 退货工单', done: true }],
        });
        msgs.push('⬆ 1★「' + (r.product || r.sku) + '」→ 已建退货工单');
      } else {
        msgs.push('⬆ 1★「' + (r.product || r.sku) + '」已升级标记');
      }
      n++;
    });
    if (!n) msgs.push('无待升级的 1 星差评');
    msgs.slice(0, 8).forEach(m => pushAgentLog(agent, m));
    bumpAgent(agent, n);
    return { ok: true, count: n, msg: '差评预警升级 · ' + n + ' 条' };
  }

  const AGENT_RUNNERS = {
    selection_radar: runSelectionRadar,
    listing_publish: runListingPublish,
    order_fulfill: runOrderFulfill,
    timeout_rescue: runTimeoutRescue,
    purchase_1688: runPurchase1688,
    logistics_anomaly: runLogisticsAnomaly,
    profit_guard: runProfitGuard,
    fx_commission: runFxCommission,
    ru_cs: runRuCs,
    review_escalate: runReviewEscalate,
    return_claim: runReturnClaim,
    inventory_restock: runInventoryRestock,
    weekly_report: runWeeklyReportAgent,
  };

  function toggleAgent(agentId, on) {
    const a = agentById(agentId);
    if (!a) return { ok: false, msg: 'Agent 不存在' };
    a.on = !!on;
    emit('toggleAgent');
    return { ok: true, msg: a.name + ' 已' + (on ? '启用' : '停用') };
  }

  function runAgent(agentId, opts) {
    opts = opts || {};
    const a = agentById(agentId);
    if (!a) return { ok: false, msg: 'Agent 不存在' };
    if (!opts.force && !a.on && !opts.manual) {
      return { ok: false, msg: a.name + ' 未启用' };
    }
    const runner = AGENT_RUNNERS[agentId];
    if (!runner) return { ok: false, msg: '未实现的 Agent' };
    // manual run-now always allowed even if off
    const result = runner(a);
    emit('runAgent');
    return result;
  }

  function runAllAgents() {
    ensureAgents();
    const results = [];
    let total = 0;
    // cascade order matters for ops chain
    const order = [
      'selection_radar', 'listing_publish', 'profit_guard', 'fx_commission',
      'purchase_1688', 'timeout_rescue', 'order_fulfill', 'logistics_anomaly',
      'inventory_restock', 'ru_cs', 'review_escalate', 'return_claim', 'weekly_report',
    ];
    order.forEach(id => {
      const a = agentById(id);
      if (!a) return;
      // one-click runs all (force), full cascade
      const r = runAgent(id, { force: true, manual: true });
      results.push({ id, name: a.name, count: r.count || 0, msg: r.msg });
      total += r.count || 0;
    });
    emit('runAllAgents');
    return { ok: true, count: total, results, msg: '一键跑全部 Agent · 共处理 ' + total + ' 项' };
  }

  function runEnabledAgentsTick() {
    ensureAgents();
    let total = 0;
    state.agents.filter(a => a.on).forEach(a => {
      const r = runAgent(a.id, { force: true });
      total += r.count || 0;
    });
    return { ok: true, count: total, msg: '定时 Agent 回合 · 处理 ' + total };
  }

  function agentsSummary() {
    ensureAgents();
    return {
      agents: state.agents,
      todayTotal: state.agentTodayTotal || state.agents.reduce((s, a) => s + (a.todayCount || 0), 0),
      onCount: state.agents.filter(a => a.on).length,
      snapshot: state.weeklySnapshot,
    };
  }


  // init
  loadOrSeed();

  return {
    get, subscribe, switchDemo, resetCurrent, loadOrSeed,
    forShop, shopId, currentShop, switchShop,
    ROLES, ROLE_VIEWS, setRole, canView, canDo, roleLabel,
    calcProfit, updateSettings, commissionRateForPrice,
    kpi, todos, badges, statusTag, statusLabel, RETURN_LABELS,
    wizardProgress, wizardBindShop, wizardChooseRfbs, wizardSetLogistics,
    wizardImportProducts, wizardComplete, wizardReopen,
    claimProduct, advanceListing, publishListing, publishReadyBatch,
    syncOrders, runAutoAudit, runAllRules, toggleRule,
    auditOrder, assignLogistics, markPurchased,
    applyWaybill, applyWaybillBatch, shipOrder,
    syncInventory, restock, connectChannel,
    applyRulesToOrder,
    replyReview, answerQa, advanceReturn, weeklyReport,
    toggleAgent, runAgent, runAllAgents, runEnabledAgentsTick, agentsSummary,
  };
})();
