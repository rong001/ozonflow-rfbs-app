/**
 * OzonFlow · 共享状态层（localStorage 持久化）
 * 所有模块读写同一 store；mutations 会触发订阅者重渲染。
 */
window.OzonFlowStore = (function () {
  const LS_KEY = 'ozonflow_rfbs_v1';
  const LS_DEMO = 'ozonflow_rfbs_demo_id';

  let state = null;
  const listeners = new Set();

  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(LS_DEMO, state.meta.id);
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

  function loadOrSeed(demoId) {
    const id = demoId || localStorage.getItem(LS_DEMO) || 'guangzhou';
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw && !demoId) {
        const parsed = JSON.parse(raw);
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
    state = window.OzonFlowSeeds.build(id);
    persist();
    emit('reset');
    return state;
  }

  function get() { return state; }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
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
    return state.inventory.find(i => i.sku === sku);
  }
  function channelById(id) {
    return state.channels.find(c => c.id === id);
  }

  /* ---------- profit calc (shared rates) ---------- */
  function calcProfit({ price, costCNY, weight }) {
    const s = state.settings;
    const costRUB = costCNY * s.fx;
    const commission = price * s.commission;
    const shipPerKg = s.shipCnyPerKg * s.fx;
    const ship = Math.max(80, (weight / 1000) * shipPerKg + 45);
    const fee = price * s.paymentFee;
    const profit = price - costRUB - commission - ship - fee;
    const margin = price > 0 ? (profit / price * 100) : 0;
    return {
      costRUB, commission, ship, fee, profit, margin,
      fx: s.fx, commissionRate: s.commission, shipCnyPerKg: s.shipCnyPerKg,
    };
  }

  /* ---------- KPI ---------- */
  function kpi() {
    const orders = state.orders;
    const todayOrders = orders.length; // demo: use list size + trend last
    const pendingShip = orders.filter(o => o.status === 'ship' || o.status === 'purchase').length;
    const risk = orders.filter(o => o.risk || (o.etaH != null && o.etaH <= 6 && o.status !== 'shipped')).length;
    const gross = orders.filter(o => o.status !== 'audit').reduce((sum, o) => {
      const p = calcProfit({ price: o.amount, costCNY: o.cost, weight: o.weight });
      return sum + Math.max(0, p.profit);
    }, 0);
    const lowStock = state.inventory.filter(i => i.local <= i.safe).length;
    const draftCount = state.listings.filter(l => l.status === 'draft' || l.status === 'ready' || l.status === 'mapping').length;
    return {
      todayOrders: state.trend[state.trend.length - 1] || todayOrders,
      pendingShip,
      risk,
      gross: Math.round(gross),
      lowStock,
      draftCount,
      marginAvg: 28.4,
    };
  }

  /* ---------- Mutations ---------- */

  /** 选品认领 → 刊登草稿 */
  function claimProduct(catalogId) {
    const c = state.catalog.find(x => x.id === catalogId);
    if (!c) return { ok: false, msg: '商品不存在' };
    if (state.claimedIds.includes(catalogId)) {
      return { ok: false, msg: '已认领过该商品' };
    }
    const exists = state.listings.find(l => l.sku === c.skuHint);
    if (exists) {
      state.claimedIds.push(catalogId);
      emit('claim');
      return { ok: true, msg: '「' + c.name + '」已在刊登列表中', listingId: exists.id };
    }
    const listing = {
      id: 'L' + Date.now().toString(36),
      emoji: c.emoji,
      name: c.name,
      ru: c.ru,
      cat: '— 待映射 —',
      map: 25,
      status: 'draft',
      price: c.price,
      cost: c.cost,
      weight: c.weight,
      sku: c.skuHint,
      stockInit: 50,
    };
    state.listings.unshift(listing);
    state.claimedIds.push(catalogId);
    emit('claim');
    return { ok: true, msg: '「' + c.name + '」已加入刊登草稿', listingId: listing.id };
  }

  /** 完善映射：草稿 → 映射中 → 待发布 */
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

  /** 发布 → active product + stock row */
  function publishListing(listingId) {
    const l = state.listings.find(x => x.id === listingId);
    if (!l) return { ok: false, msg: '草稿不存在' };
    if (l.status !== 'ready') return { ok: false, msg: '仅待发布状态可发布' };

    l.status = 'published';
    const ozonSku = String(160000000 + Math.floor(Math.random() * 9000000));
    const product = {
      id: 'P' + Date.now().toString(36),
      emoji: l.emoji,
      name: l.name,
      ru: l.ru,
      sku: l.sku,
      ozonSku,
      price: l.price,
      cost: l.cost,
      weight: l.weight,
      status: 'active',
      todaySales: 0,
      margin: Math.round(calcProfit({ price: l.price, costCNY: l.cost, weight: l.weight }).margin),
    };
    state.products.unshift(product);

    if (!findInv(l.sku)) {
      state.inventory.unshift({
        sku: l.sku,
        name: l.name,
        emoji: l.emoji,
        local: l.stockInit || 50,
        ozon: l.stockInit || 50,
        safe: 20,
        sync: 'ok',
      });
    }
    emit('publish');
    return { ok: true, msg: '「' + l.name + '」已发布上架 · Ozon SKU ' + ozonSku, product };
  }

  function publishReadyBatch() {
    const ready = state.listings.filter(l => l.status === 'ready');
    let n = 0;
    ready.forEach(l => {
      const r = publishListing(l.id);
      if (r.ok) n++;
    });
    return { ok: true, msg: '已批量发布 ' + n + ' 条商品', count: n };
  }

  /** 模拟出单 / 同步订单 */
  function syncOrders(count) {
    count = count || 1;
    const actives = state.products.filter(p => p.status === 'active');
    if (!actives.length) return { ok: false, msg: '暂无在售商品，请先刊登发布' };
    const cities = ['Москва', 'СПб', 'Казань', 'Екб', 'Новосиб.', 'Краснодар', 'Ростов', 'Самара'];
    const names = ['Иван П.', 'Анна С.', 'Дмитрий К.', 'Елена В.', 'Ольга М.', 'Сергей Н.', 'Мария Л.'];
    const created = [];
    for (let i = 0; i < count; i++) {
      const p = actives[Math.floor(Math.random() * actives.length)];
      const seq = state.nextOrderSeq++;
      const prefix = state.meta.id === 'yiwu' ? 'YI' : state.meta.id === 'pressure' ? 'PR' : 'GZ';
      const order = {
        id: 'OZ-' + prefix + '-' + seq,
        emoji: p.emoji,
        name: p.name.replace(/^无线降噪/, '').slice(0, 16),
        buyer: names[Math.floor(Math.random() * names.length)],
        city: cities[Math.floor(Math.random() * cities.length)],
        amount: p.price,
        logistics: '—',
        logisticsId: null,
        auto: [],
        status: 'audit',
        statusLabel: '待审核',
        etaH: 24 + Math.floor(Math.random() * 24),
        risk: false,
        weight: p.weight,
        sku: p.sku,
        cost: p.cost,
        track: null,
        note: '',
        timeline: [{ t: nowLabel(), text: '订单同步自 Ozon', done: true }],
      };
      state.orders.unshift(order);
      created.push(order);
      // bump today sales
      p.todaySales = (p.todaySales || 0) + 1;
      // decrement inventory mildly
      const inv = findInv(p.sku);
      if (inv && inv.ozon > 0) { inv.ozon--; if (inv.local > 0) inv.local--; }
    }
    state.syncAgoMin = 0;
    // bump trend last day
    state.trend[state.trend.length - 1] += count;
    emit('syncOrders');
    return { ok: true, msg: '已同步 ' + count + ' 笔新订单', orders: created };
  }

  /** 规则引擎：对单笔订单执行启用中的规则 */
  function applyRulesToOrder(order) {
    if (!order || order.status === 'shipped') return [];
    const applied = [];
    const rules = state.rules.filter(r => r.on);

    // 1) audit
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

    // 2) logistics (only if audited / not audit)
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

    // 3) purchase marker
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

    // risk flag
    if (order.etaH != null && order.etaH <= 6 && order.status !== 'shipped') {
      order.risk = true;
    }

    return applied;
  }

  /** 一键审单：对所有待审核跑规则 */
  function runAutoAudit() {
    let n = 0;
    state.orders.forEach(o => {
      if (o.status === 'audit') {
        const a = applyRulesToOrder(o);
        if (a.length) n++;
      }
    });
    emit('autoAudit');
    return { ok: true, msg: '自动审单完成 · 处理 ' + n + ' 笔订单', count: n };
  }

  /** 对全部未发货再跑物流/采购规则 */
  function runAllRules() {
    let n = 0;
    state.orders.forEach(o => {
      if (o.status !== 'shipped') {
        const before = o.auto.length;
        applyRulesToOrder(o);
        if (o.auto.length > before) n++;
      }
    });
    // inventory rule hits
    const stockRule = state.rules.find(r => r.type === 'inventory');
    if (stockRule && stockRule.on) {
      const low = state.inventory.filter(i => i.local <= i.safe);
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
    const r = state.rules.find(x => x.id === ruleId);
    if (!r) return { ok: false };
    r.on = !!on;
    emit('toggleRule');
    return { ok: true, msg: '规则「' + r.name + '」已' + (on ? '启用' : '停用') };
  }

  /** 手动审单 */
  function auditOrder(orderId) {
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

  /** 匹配物流 */
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

  /** 标记采购完成（演示） */
  function markPurchased(orderId) {
    const o = state.orders.find(x => x.id === orderId);
    if (!o) return { ok: false, msg: '订单不存在' };
    pushAuto(o, '已采购');
    pushTL(o, '1688 采购下单完成（模拟）');
    if (o.status === 'purchase') {
      o.status = 'ship';
      o.statusLabel = statusLabel('ship');
    }
    // restock a bit
    const inv = findInv(o.sku);
    if (inv) { inv.local += 5; inv.ozon += 5; if (inv.local > inv.safe) inv.sync = 'ok'; }
    emit('purchase');
    return { ok: true, msg: '已标记采购完成' };
  }

  /** 申请面单 */
  function applyWaybill(orderId) {
    const o = state.orders.find(x => x.id === orderId);
    if (!o) return { ok: false, msg: '订单不存在' };
    if (!o.logisticsId) {
      // auto assign first
      assignLogistics(orderId);
    }
    if (o.status === 'audit') {
      auditOrder(orderId);
    }
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
    const targets = state.orders.filter(o =>
      (o.status === 'ship' || o.status === 'purchase') && !o.track
    );
    let n = 0;
    targets.forEach(o => {
      const r = applyWaybill(o.id);
      if (r.ok) n++;
    });
    return { ok: true, msg: '已批量申请面单 × ' + n, count: n };
  }

  /** 发货 */
  function shipOrder(orderId) {
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

  /** 库存同步 */
  function syncInventory() {
    state.inventory.forEach(i => {
      i.ozon = i.local;
      i.sync = i.local <= i.safe ? 'warn' : 'ok';
    });
    const stockRule = state.rules.find(r => r.type === 'inventory');
    const low = state.inventory.filter(i => i.local <= i.safe);
    if (stockRule && stockRule.on && low.length) {
      stockRule.hits += low.length;
      stockRule.today += low.length;
    }
    state.syncAgoMin = 0;
    emit('syncInv');
    return { ok: true, msg: '库存同步完成 · 更新 ' + state.inventory.length + ' SKU · 低库存 ' + low.length, low: low.length };
  }

  /** 补货 */
  function restock(sku, qty) {
    qty = qty || 50;
    const inv = findInv(sku);
    if (!inv) return { ok: false, msg: 'SKU 不存在' };
    inv.local += qty;
    inv.ozon += qty;
    inv.sync = inv.local <= inv.safe ? 'warn' : 'ok';
    emit('restock');
    return { ok: true, msg: inv.name + ' 已补货 +' + qty + ' · 本地 ' + inv.local };
  }

  /** 连接物流渠道 */
  function connectChannel(channelId) {
    const ch = channelById(channelId);
    if (!ch) return { ok: false };
    ch.connected = true;
    emit('channel');
    return { ok: true, msg: ch.name + ' 已连接' };
  }

  /** 徽章计数 */
  function badges() {
    return {
      listing: state.listings.filter(l => ['draft', 'mapping', 'ready', 'failed'].includes(l.status)).length,
      orders: state.orders.filter(o => o.status !== 'shipped').length,
      risk: state.orders.filter(o => o.risk || (o.etaH != null && o.etaH <= 6 && o.status !== 'shipped')).length,
    };
  }

  // init
  loadOrSeed();

  return {
    get, subscribe, switchDemo, resetCurrent, loadOrSeed,
    calcProfit, kpi, badges, statusTag, statusLabel,
    claimProduct, advanceListing, publishListing, publishReadyBatch,
    syncOrders, runAutoAudit, runAllRules, toggleRule,
    auditOrder, assignLogistics, markPurchased,
    applyWaybill, applyWaybillBatch, shipOrder,
    syncInventory, restock, connectChannel,
    applyRulesToOrder,
  };
})();
