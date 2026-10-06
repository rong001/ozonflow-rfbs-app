/**
 * 市场选品（R01 R03 R08）· 供应链库存（R28 R51 R52）· 时效物流（R30 R31 R32 R34 R39）
 */
(function () {
  const F = window.OFS, Store = F.Store;
  const { esc, fmt, rub, cny, pct, tag, btn, card, table, kpis, bar, note } = F;
  const DAY = 86400000;

  /* ===================== 市场选品 ===================== */
  const W = { sales: 25, margin: 30, weight: 10, comp: 15, trend: 20 };
  F.seed('market', (s, r) => {
    const cat = {}; s.catalog.forEach(c => { cat[c.id] = { comp: Math.round(F.between(r, 5, 95)), trend: Math.round(F.between(r, -20, 60)) }; });
    const suppliers = {}; s.products.concat(s.listings || []).forEach(p => {
      suppliers[p.sku] = Array.from({ length: 3 }, (_, i) => ({ id: p.sku + '-S' + (i + 1), name: F.pick(r, ['深圳华强北优品', '义乌小商品源头厂', '东莞精工电子', '广州白云工贸', '宁波海曙制造']) + (i + 1), price: +(p.cost * F.between(r, 0.82, 1.1)).toFixed(1), rating: +(F.between(r, 4.2, 4.95)).toFixed(1), moq: F.pick(r, [1, 2, 5, 10]), stock: r() > 0.2, match: Math.round(F.between(r, 80, 99)) }));
    });
    return { cat, suppliers };
  });
  function selScore(c) {
    const s = F.S(), m = F.ext().market.cat[c.id] || { comp: 50, trend: 0 };
    const pr = Store.calcProfit({ price: c.price, costCNY: c.cost, weight: c.weight || 300 });
    const red = F.bannedHits ? F.bannedHits({ sku: '_', name: c.name, ru: c.ru }).length > 0 : false;
    const parts = { sales: Math.min(1, c.sales / 3000) * W.sales, margin: Math.max(0, Math.min(1, pr.margin / 40)) * W.margin, weight: (c.weight <= 500 ? 1 : c.weight <= 1500 ? 0.6 : 0.2) * W.weight, comp: (1 - m.comp / 100) * W.comp, trend: Math.max(0, Math.min(1, (m.trend + 20) / 80)) * W.trend };
    return { total: red ? 0 : Math.round(Object.values(parts).reduce((a, b) => a + b, 0)), parts, pr, m, red };
  }
  const NODES = [['11-11', '11.11 全球购物节', '电子配件、家居收纳'], ['11-27', 'Чёрная пятница 黑五', '全品类，电子、服饰为主'], ['12-31', 'Новый год 新年', '礼品、装饰、灯具、保暖'], ['02-23', '2月23日 祖国保卫者日', '男士礼品、数码'], ['03-08', '3月8日 妇女节', '美妆、饰品、家居'], ['09-01', '9月1日 开学季', '文具、书包、电子']];

  F.register('market', {
    title: '市场选品',
    render() {
      const s = F.S(), claimed = new Set(s.claimedIds || []);
      const list = s.catalog.map(c => ({ c, sc: selScore(c) })).sort((a, b) => b.sc.total - a.sc.total);
      const now = new Date(); const lead = 3 + 18 + 5; // 采购 3 + 物流 12-18 + 上架缓冲 5
      const nodes = NODES.map(([md, name, cats]) => { const [mm, dd] = md.split('-').map(Number); let d = new Date(now.getFullYear(), mm - 1, dd); if (d < now) d = new Date(now.getFullYear() + 1, mm - 1, dd); const days = Math.round((d - now) / DAY); return { name, cats, d, days, prep: days - lead }; }).sort((a, b) => a.days - b.days);
      const pending = F.orders().filter(o => o.status === 'purchase');
      const sup = F.ext().market.suppliers;
      return kpis([
        { label: '候选商品', value: fmt(list.length), sub: `已认领 ${claimed.size}`, tone: 'blue' },
        { label: '高分（≥70）', value: fmt(list.filter(x => x.sc.total >= 70).length), sub: '建议优先上架', tone: 'green' },
        { label: '红线拦截', value: fmt(list.filter(x => x.sc.red).length), sub: '禁限售或高风险，直接 0 分', tone: 'red' },
        { label: '最近大促', value: nodes[0].days + ' 天', sub: esc(nodes[0].name) + (nodes[0].prep < 0 ? ' · 已过备货期' : ' · 还剩 ' + nodes[0].prep + ' 天备货'), tone: nodes[0].prep < 7 ? 'orange' : 'purple' },
      ]) +
      card('多维选品评分（R01）', table(['商品', '总分', '销量', '净利率', '重量', '竞争度', '趋势', '红线', '操作'], list.map(x => [
        `${x.c.emoji || ''} ${esc(x.c.name)}`, `<b class="mono">${x.sc.total}</b>${bar(x.sc.total)}`, fmt(x.c.sales), pct(x.sc.pr.margin), x.c.weight + 'g', x.sc.m.comp + '%', (x.sc.m.trend > 0 ? '+' : '') + x.sc.m.trend + '%',
        x.sc.red ? tag('拦截', 'red') : tag('通过', 'green'), claimed.has(x.c.id) ? tag('已认领', 'blue') : (x.sc.red ? '' : btn('认领进刊登', 'mktClaim', { id: x.c.id }, x.sc.total >= 70 ? 'btn-primary' : 'btn-secondary')),
      ])) + note(`权重公开：销量 ${W.sales} · 净利率 ${W.margin} · 重量 ${W.weight} · 竞争度 ${W.comp} · 趋势 ${W.trend}。先过红线（禁限售词、证书、品牌风险），不过就直接 0 分。净利率按当前成本栈实时计算。`), '', { flush: true }) +
      `<div class="ofs-grid-2">` +
      card('节点/季节需求预测（R03）', table(['节点', '日期', '距今', '备货截止', '推荐品类'], nodes.map(n => [esc(n.name), (n.d.getMonth() + 1) + '/' + n.d.getDate(), n.days + ' 天', n.prep < 0 ? tag('已过（只能走现货）', 'red') : n.prep <= 14 ? tag(n.prep + ' 天内', 'orange') : tag(n.prep + ' 天', 'green'), esc(n.cats)])) + note(`备货截止 = 节点日期 − ${lead} 天（采购 3 天 + 跨境物流 12–18 天 + 上架缓冲 5 天）。`), '', { flush: true }) +
      card('以图搜货 / 断货换供（R08）', table(['订单', '商品', '备选货源', '价格', '评分', '图片相似度', '操作'], pending.flatMap(o => (sup[o.sku] || []).filter(x => x.stock).slice(0, 2).map(x => [`<span class="mono">${esc(o.id)}</span>`, esc(o.name), esc(x.name), cny(x.price), x.rating, x.match + '%', btn('切换货源', 'mktSwitch', { sku: o.sku, sid: x.id })])), '没有待采购订单') + note('用主图在 1688 以图搜同款，按价格、评分、相似度排序。正式接入需要 1688 开放平台授权。'), '', { flush: true }) + `</div>`;
    },
  });
  F.on('mktClaim', d => Store.claimProduct(d.id));
  F.on('mktSwitch', d => {
    const s = F.S(), x = (F.ext().market.suppliers[d.sku] || []).find(y => y.id === d.sid); if (!x) return;
    [s.products, s.listings || []].forEach(arr => arr.filter(p => p.sku === d.sku).forEach(p => { p.cost = x.price; p.supplier = x.name; }));
    s.orders.filter(o => o.sku === d.sku).forEach(o => { o.cost = x.price; });
    F.act('1688采购跟单 Agent', '切换货源', d.sku, x.name + ' ¥' + x.price); return { ok: true, msg: '已切换到 ' + x.name };
  });

  /* ===================== 供应链库存 ===================== */
  F.seed('supply', (s, r) => {
    const fbo = {}; s.products.forEach(p => { if (r() < 0.4) fbo[p.sku] = { stock: Math.round(F.between(r, 10, 240)), age: Math.round(F.between(r, 10, 160)) }; });
    return { fbo, holidays: ['10-01', '10-02', '10-03', '10-04', '10-05', '10-06', '10-07'], restDow: [0] };
  });

  F.register('supply', {
    title: '供应链库存',
    render() {
      const s = F.S(), sp = F.ext().supply;
      // R28 多店共享库存
      const bySku = {};
      s.inventory.forEach(i => { (bySku[i.sku] = bySku[i.sku] || { sku: i.sku, name: i.name, local: 0, rows: [] }); bySku[i.sku].local = Math.max(bySku[i.sku].local, i.local); bySku[i.sku].rows.push(i); });
      const shared = Object.values(bySku).map(g => ({ g, listed: g.rows.reduce((a, i) => a + i.ozon, 0) })).map(x => Object.assign(x, { over: x.listed > x.g.local }));
      const oversell = shared.filter(x => x.over).length;
      // R51 履约模式
      const modes = F.products().map(p => {
        const pr = F.profitOf(p); const daily = Math.max(0.5, p.todaySales || 1);
        const fboShip = Math.max(30, (p.weight || 300) / 1000 * 6.5 * s.settings.fx + 25); // 海运/陆运大货 ¥6.5/kg + 平台 FBO 物流费
        const storage = 2.5 * 30 / Math.max(1, daily); // 每件 30 天仓储摊销 ₽
        const saving = pr.ship - fboShip - storage;
        const capital = daily * 45 * p.cost; // 45 天备货资金 ¥
        const rec = daily >= 8 && saving > 40 ? 'FBO' : daily >= 4 && saving > 20 ? 'FBP（合作仓）' : 'rFBS';
        return { p, daily, pr, fboShip, storage, saving, capital, rec };
      });
      const fboRows = Object.entries(sp.fbo).map(([sku, f]) => { const p = F.products().find(x => x.sku === sku); if (!p) return null; const daily = Math.max(0.5, p.todaySales || 1); const turn = f.stock / daily; return { p, f, daily, turn }; }).filter(Boolean);
      return kpis([
        { label: '超卖风险 SKU', value: fmt(oversell), sub: '各店挂的库存加起来超过实际库存', tone: oversell ? 'red' : 'green' },
        { label: '建议转 FBO/FBP', value: fmt(modes.filter(m => m.rec !== 'rFBS').length), sub: '高动销商品放进海外仓更划算', tone: 'purple' },
        { label: '海外仓滞销', value: fmt(fboRows.filter(x => x.f.age > 90 || x.turn > 90).length), sub: '库龄或周转超过 90 天', tone: 'orange' },
        { label: '海外仓 SKU', value: fmt(fboRows.length), sub: '出库申请时限 60 天', tone: 'blue' },
      ]) +
      card('多店共享库存防超卖（R28）', table(['SKU', '商品', '实际库存', '各店挂出', '合计挂出', '状态', '操作'], shared.map(x => [`<span class="mono">${esc(x.g.sku)}</span>`, esc(x.g.name), fmt(x.g.local), x.g.rows.map(i => esc((s.shops.find(sh => sh.id === i.shopId) || {}).name || i.shopId) + ' ' + i.ozon).join('<br>'), fmt(x.listed), x.over ? tag('超卖风险', 'red') : tag('安全', 'green'), x.over ? btn('按销量重分配', 'supSplit', { sku: x.g.sku }, 'btn-primary') : ''])) + note('同一批货在多家店同时上架时，按各店近 7 天销量比例分配可售库存，并预留 10% 安全量，避免超卖导致取消率上升。'), btn('全部重分配', 'supSplitAll', {}, 'btn-secondary'), { flush: true }) +
      card('SKU 级履约模式决策（R51）', table(['商品', '日销', 'rFBS 单件物流', 'FBO 单件物流+仓储', '单件节省', '备货资金(45天)', '建议'], modes.map(m => [esc(m.p.name), m.daily, rub(m.pr.ship), rub(m.fboShip + m.storage), `<b class="mono" style="color:${m.saving > 0 ? 'var(--color-success,#16A34A)' : 'inherit'}">${rub(m.saving)}</b>`, cny(m.capital), m.rec === 'rFBS' ? tag('保持 rFBS', 'gray') : tag(m.rec, 'purple')])) + note('FBO 大货按每公斤 ¥6.5 加平台物流费估算，仓储按每件每天 2.5₽。转 FBO 时效更快、取消更少，但会压资金，适合日销 ≥ 8 件的稳定爆款。'), '', { flush: true }) +
      card('海外仓补货计划与滞销清理（R52）', table(['商品', '海外仓库存', '库龄', '日销', '周转天数', '建议', '操作'], fboRows.map(x => { const slow = x.f.age > 90 || x.turn > 90; const low = x.turn < 20; return [esc(x.p.name), fmt(x.f.stock), x.f.age + ' 天', x.daily, Math.round(x.turn) + ' 天', slow ? tag('清仓：报名折扣活动或申请出库', 'orange') : low ? tag('补货 ' + Math.round(x.daily * 45 - x.f.stock) + ' 件', 'blue') : tag('正常', 'green'), slow ? btn('生成清仓方案', 'supClear', { sku: x.p.sku }) : low ? btn('生成补货单', 'supRestock', { sku: x.p.sku }) : '']; }), '还没有海外仓库存') + note('Ozon 海外仓库存要在规定时限内申请出库，否则会产生费用或被处置。库龄超过 90 天时，先做折扣清仓。'), '', { flush: true });
    },
  });
  function split(sku) {
    const s = F.S(), rows = s.inventory.filter(i => i.sku === sku); if (!rows.length) return 0;
    const local = Math.max(...rows.map(i => i.local)); const sale = rows.map(i => { const p = s.products.find(x => x.sku === sku && x.shopId === i.shopId); return Math.max(1, p ? p.todaySales || 1 : 1); }); const tot = sale.reduce((a, b) => a + b, 0);
    rows.forEach((i, k) => { i.ozon = Math.floor(local * 0.9 * sale[k] / tot); i.sync = 'ok'; }); return 1;
  }
  F.on('supSplit', d => { split(d.sku); F.act('库存补货 Agent', '多店库存重分配', d.sku, '按销量比例'); return { ok: true, msg: d.sku + ' 已按销量重分配' }; });
  F.on('supSplitAll', () => { const s = F.S(); const skus = [...new Set(s.inventory.map(i => i.sku))]; skus.forEach(split); F.act('库存补货 Agent', '多店库存重分配', skus.length + ' SKU', '完成'); return { ok: true, msg: '已重分配 ' + skus.length + ' 个 SKU' }; });
  F.on('supClear', d => { const f = F.ext().supply.fbo[d.sku]; F.act('库存补货 Agent', '海外仓清仓方案', d.sku, '折扣 20% + 出库申请'); f.age = 30; return { ok: true, msg: '清仓方案已生成：报名 20% 折扣活动，剩余部分申请出库' }; });
  F.on('supRestock', d => { const f = F.ext().supply.fbo[d.sku]; const p = F.S().products.find(x => x.sku === d.sku); const n = Math.round(Math.max(0.5, p.todaySales || 1) * 45 - f.stock); const amt = Math.round(n * p.cost); if (amt >= Store.APPROVAL_RULES.poCny) return Object.assign(Store.proposeApproval({ type: '海外仓补货', title: p.name + ' 补货 ' + n + ' 件', target: p.name, before: '库存 ' + f.stock, after: '+' + n + ' 件（¥' + amt + '）', reason: '周转低于 20 天', agent: '库存补货 Agent', risk: 'mid', action: 'fboRestock', key: 'fbo:' + d.sku, payload: { sku: d.sku, n } }), { msg: '补货金额 ¥' + amt + '，已进审批中心' }); f.stock += n; return { ok: true, msg: '已生成补货单 ' + n + ' 件' }; });
  Store.registerApprovalAction('fboRestock', pl => { const f = F.ext().supply.fbo[pl.sku]; if (f) f.stock += pl.n; return { ok: true, msg: '海外仓补货单已下达' }; });

  /* ===================== 时效物流 ===================== */
  F.seed('sla', (s, r) => {
    const sync = {}, customs = {};
    s.orders.forEach(o => { sync[o.id] = r() > 0.3; customs[o.id] = { hs: r() > 0.15 ? F.pick(r, ['8518300000', '8504405500', '8544429007', '9405410009', '6115109000']) : '', declared: Math.round(o.amount / s.settings.fx * F.between(r, 0.4, 1.2)), en: r() > 0.1 }; });
    return { sync, customs, iml: {} };
  });
  function isOff(d) { const sp = F.ext().supply; const md = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); return sp.holidays.includes(md) || sp.restDow.includes(d.getDay()); }

  F.register('sla', {
    title: '时效物流',
    render() {
      const s = F.S(), sl = F.ext().sla, sp = F.ext().supply, now = new Date();
      const open = F.orders().filter(o => o.status !== 'shipped' && o.status !== 'cancelled');
      const holi = open.map(o => { const dl = new Date(now.getTime() + (o.etaH || 24) * 3600000); let off = 0; for (let t = new Date(now); t <= dl; t = new Date(t.getTime() + DAY)) if (isOff(t)) off++; return { o, dl, off }; }).filter(x => x.off > 0);
      const shipped = F.orders().filter(o => o.status === 'shipped');
      const unsynced = shipped.filter(o => !sl.sync[o.id]);
      const chans = (s.channels || []).filter(c => c.connected);
      const rate = (o, c) => Math.round((o.weight || 300) / 1000 * c.pricePerKg + 12);
      const cmp = open.map(o => { const opts = chans.map(c => ({ c, cost: rate(o, c), days: parseInt(String(c.eta).split('-')[1] || c.eta, 10) || 20 })).sort((a, b) => a.cost - b.cost); return { o, opts, best: opts[0] }; }).filter(x => x.best);
      const cust = F.orders().map(o => { const c = sl.customs[o.id] || { hs: '', declared: 0, en: true }; const val = o.amount / s.settings.fx; const issues = []; if (!c.hs) issues.push('缺 HS 编码'); if (!c.en) issues.push('缺英文品名'); if (c.declared < val * 0.6) issues.push('申报价明显低于订单价'); if (c.declared > val * 1.1) issues.push('申报价高于订单价'); return { o, c, val, issues }; }).filter(x => x.issues.length);
      const rets = F.shop(s.returns || []).filter(r => r.type === 'return');
      return kpis([
        { label: '休息日影响截单', value: fmt(holi.length), sub: '截单期内有仓库休息日', tone: holi.length ? 'orange' : 'green' },
        { label: '运单号未回传', value: fmt(unsynced.length), sub: '已发货，但 Ozon 后台还没有轨迹', tone: unsynced.length ? 'red' : 'green' },
        { label: '可省物流费', value: rub(cmp.reduce((a, x) => { const cur = x.opts.find(y => y.c.id === x.o.logisticsId); return a + (cur ? cur.cost - x.best.cost : 0); }, 0) * s.settings.fx), sub: '改走最便宜且满足时效的渠道', tone: 'green' },
        { label: '报关资料异常', value: fmt(cust.length), sub: 'HS 编码、品名或申报价不一致', tone: cust.length ? 'orange' : 'green' },
      ]) +
      card('仓库休息日对截单期影响（R30）', `<div class="ofs-form"><label class="ofs-field"><span>休息日（MM-DD，逗号分隔）</span><input class="ofs-mini-input" style="width:320px" value="${esc(sp.holidays.join(','))}" data-ofs-change="slaHoli"></label><label class="ofs-field"><span>每周休息</span><input class="ofs-mini-input" value="${sp.restDow.map(d => '日一二三四五六'[d]).join('')}" data-ofs-change="slaDow" aria-label="每周休息（填 日一二…）"></label></div>` +
        table(['订单', '商品', '剩余时效', '截单时间', '期间休息日', '建议'], holi.map(x => [`<span class="mono">${esc(x.o.id)}</span>`, esc(x.o.name), x.o.etaH + 'h', (x.dl.getMonth() + 1) + '/' + x.dl.getDate() + ' ' + String(x.dl.getHours()).padStart(2, '0') + ':00', x.off + ' 天', x.off >= 1 && x.o.etaH <= 48 ? tag('休息日前发出 / 安排值班', 'red') : tag('提前备货', 'orange')]), '截单期内没有休息日') +
        note('在 Ozon 后台给仓库设置非工作日后，新订单的截单期会顺延。没设置的话，休息日照样计入时效。建议节假日前 3 天在 Ozon 卖家后台把仓库日程同步好。'), '', { flush: true }) +
      card('rFBS 状态与运单号回传（R31）', table(['订单', '商品', '物流', '运单号', 'Ozon 状态', '操作'], shipped.map(o => [`<span class="mono">${esc(o.id)}</span>`, esc(o.name), esc(o.logistics || '—'), `<span class="mono">${esc(o.track || '—')}</span>`, sl.sync[o.id] ? tag('已回传 · 运输中', 'green') : tag('未回传', 'red'), sl.sync[o.id] ? '' : btn('回传运单号', 'slaSync', { id: o.id }, 'btn-primary')]), '还没有已发货订单') + note('通过 <span class="mono">/v2/fbs/posting/tracking-number/set</span> 回传运单号，并把订单状态推进到“运输中”。没回传的会计入渠道错误率。'), unsynced.length ? btn('全部回传', 'slaSyncAll', {}, 'btn-secondary') : '', { flush: true }) +
      card('渠道规则匹配与运价比较（R32）', table(['订单', '重量', '当前渠道', ...chans.map(c => esc(c.short || c.name)), '建议', '操作'], cmp.map(x => [`<span class="mono">${esc(x.o.id)}</span>`, (x.o.weight || 300) + 'g', esc((chans.find(c => c.id === x.o.logisticsId) || {}).short || '未分配'), ...chans.map(c => { const y = x.opts.find(z => z.c.id === c.id); return `${cny(y.cost)}<br><span class="hint">${esc(c.eta)}</span>`; }), tag(x.best.c.short || x.best.c.name, 'green'), x.o.logisticsId === x.best.c.id ? tag('已最优', 'gray') : btn('改用', 'slaChan', { id: x.o.id, c: x.best.c.id })]), '没有待发订单') + note('运费按“每公斤单价 × 重量 + 挂号费 ¥12”估算，时效取渠道承诺的上限。剩余时效不够的订单，会优先选最快的渠道。'), '', { flush: true }) +
      `<div class="ofs-grid-2">` +
      card('报关资料一致性校验（R34）', table(['订单', 'HS 编码', '申报价', '订单价', '问题', '操作'], cust.map(x => [`<span class="mono">${esc(x.o.id)}</span>`, x.c.hs || '—', '$' + fmt(x.c.declared / 7.1), '$' + fmt(x.val / 7.1), esc(x.issues.join('；')), btn('一键修正', 'slaCustoms', { id: x.o.id })]), '报关资料全部一致') + note('申报价按订单价（人民币换算美元，约 7.1）的 80% 校准，并补全 HS 编码和英文品名。申报价不一致容易被俄方海关扣货。'), '', { flush: true }) +
      card('IML 退货仓处置决策（R39）', table(['退货单', '商品', '金额', '退回国内成本', '本地二次销售', '建议', '操作'], rets.map(r => { const p = s.products.find(x => x.sku === r.sku) || { cost: 30, weight: 300 }; const back = Math.round(((p.weight || 300) / 1000 * 45 + 25) * s.settings.fx); const resale = Math.round(r.amount * 0.7); const dec = sl.iml[r.id]; const rec = /брак|не работает|сломан/i.test(r.reason || '') ? '销毁（残次）' : resale - 150 > back ? '本地折价再售' : '退回国内'; return [`<span class="mono">${esc(r.id)}</span>`, esc(r.product), rub(r.amount), rub(back), rub(resale), dec ? tag(dec, 'blue') : tag(rec, rec.startsWith('销毁') ? 'red' : 'green'), dec ? '' : btn('按建议处置', 'imlDecide', { id: r.id, d: rec })]; }), '没有退货') + note('退货会先进 Ozon 合作的退货仓（IML 等）。超过免费保管期会按天收费，所以要尽快在“退回国内、本地再售、销毁”中选一个。'), '', { flush: true }) + `</div>`;
    },
  });
  F.on('slaHoli', (d, el) => { F.ext().supply.holidays = el.value.split(/[,，\s]+/).filter(x => /^\d{2}-\d{2}$/.test(x)); return { ok: true, msg: '休息日已更新' }; });
  F.on('slaDow', (d, el) => { F.ext().supply.restDow = [...el.value].map(ch => '日一二三四五六'.indexOf(ch)).filter(i => i >= 0); return { ok: true, msg: '每周休息日已更新' }; });
  F.on('slaSync', d => {
    const Fulfill = window.OzonFlowFulfill;
    const ep = window.OzonFlowAdapter && OzonFlowAdapter.endpointFor('setTracking');
    if (!Fulfill) {
      F.ext().sla.sync[d.id] = true;
      F.act('审单履约 Agent', '回传运单号', d.id, ep ? ep.path : '已回传');
      return { ok: true, msg: d.id + ' 运单号已回传' };
    }
    F.toast('info', '正在回传运单号…');
    Fulfill.setTracking(d.id).then(r => {
      if (r.ok) {
        F.ext().sla.sync[d.id] = true;
        F.act('审单履约 Agent', '回传运单号', d.id, (r.mode || '') + (ep ? ' · ' + ep.path : ''));
      }
      F.toast(r.ok ? 'success' : 'info', r.msg || (r.ok ? '已回传' : '未回传'));
      F.render('sla');
    }).catch(e => F.toast('info', e.message));
  });
  F.on('slaSyncAll', async () => {
    const Fulfill = window.OzonFlowFulfill;
    const list = F.orders().filter(o => o.status === 'shipped' && !F.ext().sla.sync[o.id]);
    if (!Fulfill) {
      let n = 0; list.forEach(o => { F.ext().sla.sync[o.id] = true; n++; });
      F.act('审单履约 Agent', '批量回传运单号', n + ' 单', '完成');
      return { ok: true, msg: '已回传 ' + n + ' 单' };
    }
    F.toast('info', '批量回传 × ' + list.length + '…');
    let n = 0;
    for (const o of list) {
      const r = await Fulfill.setTracking(o.id);
      if (r.ok) { F.ext().sla.sync[o.id] = true; n++; }
    }
    F.act('审单履约 Agent', '批量回传运单号', n + '/' + list.length, '按履约写路径');
    F.toast(n ? 'success' : 'info', '已回传 ' + n + '/' + list.length + '（未成功的不会假装已回传）');
    F.render('sla');
  });
  F.on('slaChan', d => Store.assignLogistics(d.id, d.c));
  F.on('slaCustoms', d => { const s = F.S(), o = s.orders.find(x => x.id === d.id), c = F.ext().sla.customs[d.id]; c.hs = c.hs || '8518300000'; c.en = true; c.declared = Math.round(o.amount / s.settings.fx * 0.8); F.act('报关校验 Agent', '修正报关资料', d.id, 'HS ' + c.hs + ' · 申报 ¥' + c.declared); return { ok: true, msg: d.id + ' 报关资料已修正' }; });
  F.on('imlDecide', d => { F.ext().sla.iml[d.id] = d.d; F.act('退货理赔 Agent', 'IML 退货处置', d.id, d.d); return { ok: true, msg: d.id + ' → ' + d.d }; });

  F.slaSummary = function () { const sl = F.ext().sla; return { unsynced: F.orders().filter(o => o.status === 'shipped' && !sl.sync[o.id]).length }; };
})();
