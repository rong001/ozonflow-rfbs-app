/**
 * 价格竞争（R02 R04 R05 R06 R09 R20 R22 R23）· 推广活动（R24 R25 R26）
 */
(function () {
  const F = window.OFS, Store = F.Store;
  const { esc, fmt, rub, cny, pct, tag, btn, card, table, kpis, bar, note } = F;

  F.floorMargin = function () { const a = (F.S().agents || []).find(x => x.id === 'profit_guard'); return (a && a.config && a.config.marginMin) || 20; };
  F.floorPrice = function (p, margin) {
    margin = margin == null ? F.floorMargin() : margin;
    let lo = 50, hi = 100000;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (F.profitOf(p, mid).margin >= margin) hi = mid; else lo = mid; }
    return Math.ceil(hi / 10) * 10;
  };

  /* ---------- 竞品 / 价格指数 / 外部比价 / 采购价 ---------- */
  F.seed('compete', (s, r) => {
    const out = {};
    s.products.forEach(p => {
      const followers = r() < 0.45 ? Array.from({ length: 1 + Math.floor(r() * 3) }, (_, i) => ({ seller: F.pick(r, ['ShenZhen Tech', 'MegaGoods', 'Bestmart RU', 'Yiwu Direct', 'TopSeller-88']) + ' ' + (i + 1), price: Math.round(p.price * F.between(r, 0.86, 1.02) / 10) * 10, since: Math.ceil(r() * 9) + ' 天' })) : [];
      out[p.sku] = {
        followers,
        market: { ozonMin: Math.round(p.price * F.between(r, 0.88, 1.08) / 10) * 10, wb: Math.round(p.price * F.between(r, 0.85, 1.12) / 10) * 10, ym: Math.round(p.price * F.between(r, 0.9, 1.15) / 10) * 10, ali: Math.round(p.price * F.between(r, 0.7, 1.0) / 10) * 10 },
        newCost: r() < 0.35 ? +(p.cost * F.between(r, 1.05, 1.22)).toFixed(1) : null,
      };
    });
    return out;
  });
  function cOf(p) { const c = F.ext().compete || {}; return c[p.sku] || { followers: [], market: {}, newCost: null }; }
  function priceIndex(p) {
    const m = cOf(p).market; const ref = Math.min(m.ozonMin || p.price, m.wb || p.price, m.ym || p.price);
    const d = (p.price - ref) / ref * 100;
    return { d, ref, color: d <= 3 ? 'green' : d <= 10 ? 'orange' : 'red', label: d <= 3 ? '有优势' : d <= 10 ? '一般' : '无优势' };
  }

  F.register('compete', {
    title: '价格竞争',
    render() {
      const s = F.S(), ps = F.products(), floorM = F.floorMargin();
      const st = F.uiState('compete', { vat: 0 });
      const rows = ps.map(p => {
        const pi = priceIndex(p), floor = F.floorPrice(p), fo = cOf(p).followers;
        const minFo = fo.length ? Math.min(...fo.map(f => f.price)) : null;
        const target = Math.max(floor, Math.round(Math.min(pi.ref, minFo || Infinity) * 0.99 / 10) * 10);
        const can = target < p.price && target >= floor;
        return { p, pi, floor, fo, minFo, target, can };
      });
      const red = rows.filter(x => x.pi.color === 'red').length, foN = rows.filter(x => x.fo.length).length, under = rows.filter(x => x.p.price < x.floor).length;
      const vat = +st.vat;
      const vatRows = ps.map(p => { const base = F.profitOf(p); const net = p.price / (1 + vat / 100); const pv = F.profitOf(p, net); return { p, base, pv }; });
      const vatBreak = vatRows.filter(x => x.pv.margin < floorM).length;
      const set = s.settings;
      const costChanges = ps.filter(p => cOf(p).newCost);
      // R02 按类目固定佣金重排
      const rank = ps.map(p => ({ p, pr: F.profitOf(p) })).sort((a, b) => b.pr.profit - a.pr.profit);
      return kpis([
        { label: '价格指数偏红', value: fmt(red), sub: '比全网最低价高 10% 以上', tone: red ? 'red' : 'green' },
        { label: '被跟卖商品', value: fmt(foN), sub: '我的商品卡上出现其他卖家', tone: foN ? 'orange' : 'green' },
        { label: '低于利润底价', value: fmt(under), sub: `底价 = 净利率 ${floorM}%`, tone: under ? 'red' : 'green' },
        { label: '采购价上涨', value: fmt(costChanges.length), sub: '需重算利润', tone: costChanges.length ? 'orange' : 'green' },
      ]) +
      card('价格指数 + 跟卖监控 + 底价保护（R04 R05 R22）', table(['商品', '现价', '全网参考价', '价格指数', '跟卖', '跟卖最低价', '利润底价', '建议价', '操作'], rows.map(x => [
        `${x.p.emoji || ''} ${esc(x.p.name)}`, rub(x.p.price), rub(x.pi.ref), tag(x.pi.label + ' ' + (x.pi.d > 0 ? '+' : '') + x.pi.d.toFixed(0) + '%', x.pi.color),
        x.fo.length ? tag(x.fo.length + ' 家', 'orange') : tag('无', 'green'), x.minFo ? rub(x.minFo) : '—', `<b class="mono">${rub(x.floor)}</b>`,
        x.can ? rub(x.target) : (x.p.price < x.floor ? `<span style="color:var(--color-danger,#DC2626)">需提到 ${rub(x.floor)}</span>` : '保持'),
        x.can ? btn('按建议调价', 'cmpReprice', { sku: x.p.sku, price: x.target }, 'btn-primary') : x.p.price < x.floor ? btn('提到底价', 'cmpReprice', { sku: x.p.sku, price: x.floor }, 'btn-accent') : '',
      ])) + note(`任何调价都不会低于利润底价；改价幅度超过 ${Store.APPROVAL_RULES.priceChangePct}% 的会进审批中心。被跟卖时，建议先投诉品牌侵权或做差异化（套装、赠品），而不是直接打价格战。`),
      btn('全部按建议调价', 'cmpRepriceAll', {}, 'btn-secondary'), { flush: true }) +
      `<div class="ofs-grid-2">` +
      card('外部平台同款比价（R06）', table(['商品', 'Ozon 最低', 'Wildberries', 'Yandex Market', 'AliExpress'], ps.map(p => { const m = cOf(p).market; return [esc(p.name), rub(m.ozonMin), rub(m.wb), rub(m.ym), rub(m.ali)]; })) + note('接入比价数据服务后每天更新。Ozon 的价格指数也会参考其他平台的价格。'), '', { flush: true }) +
      card('采购价变动 → 利润重算（R09）', table(['商品', '原采购价', '新采购价', '原净利率', '新净利率', '操作'], costChanges.map(p => { const nc = cOf(p).newCost; const a = F.profitOf(p), b = Store.calcProfit({ price: p.price, costCNY: nc, weight: p.weight || 300 }); return [esc(p.name), cny(p.cost), `<b>${cny(nc)}</b>`, pct(a.margin), `<span style="color:${b.margin < floorM ? 'var(--color-danger,#DC2626)' : 'inherit'}">${pct(b.margin)}</span>`, btn('更新成本并重算', 'cmpCost', { sku: p.sku })]; }), '1688 采购价没有变化'), '', { flush: true }) + `</div>` +
      `<div class="ofs-grid-2">` +
      card('可配置成本栈（R20）', `<div class="ofs-form">
        ${[['fx', '汇率（₽/¥）', set.fx, 0.01], ['paymentFee', '收单费率', set.paymentFee, 0.001], ['shipCnyPerKg', '头程+末端（¥/kg）', set.shipCnyPerKg, 0.5], ['returnProvision', '退货计提率', set.returnProvision || 0, 0.005], ['packCny', '包装耗材（¥/单）', set.packCny || 0, 0.5], ['adShare', '广告费摊销率', set.adShare || 0, 0.01]].map(([k, l, v, step]) => `<label class="ofs-field"><span>${l}</span><input type="number" step="${step}" value="${v}" data-ofs-change="costSet" data-k="${k}" class="ofs-mini-input"></label>`).join('')}
        <label class="ofs-field"><span>利润底价净利率（%）</span><input type="number" step="1" value="${floorM}" data-ofs-change="floorSet" class="ofs-mini-input"></label>
      </div>` + note('改一处，全系统同步：利润定价、选品、活动模拟、对账和 Agent 都用这一套成本口径。')) +
      card(`跨境 VAT 压力测试（R23）`, F.tabs('compete', 'vat', [['0', '现行'], ['5', 'VAT 5%'], ['10', 'VAT 10%'], ['20', 'VAT 20%']], String(vat)) +
        table(['商品', '现净利率', `VAT ${vat}% 后`, '状态'], vatRows.map(x => [esc(x.p.name), pct(x.base.margin), pct(x.pv.margin), x.pv.margin < floorM ? tag('跌破底价', 'red') : tag('可承受', 'green')])) +
        note(`假设售价不变、税额从售价中扣除，在 VAT ${vat}% 下有 <b>${vatBreak}</b> 个 SKU 跌破底价。俄罗斯对跨境电商征 VAT 的方案仍在讨论中，这里只做压力测试，以正式法规为准。`), '', { flush: true }) + `</div>` +
      card('按类目佣金重排 SKU（R02）', table(['排名', '商品', '售价', '佣金率', '佣金', '单件净利', '净利率'], rank.map((x, i) => [i + 1, esc(x.p.name), rub(x.p.price), pct(x.pr.commissionRate * 100, 0), rub(x.pr.commission), `<b>${rub(x.pr.profit)}</b>`, pct(x.pr.margin)])) +
        note('佣金按价格档和类目费率计算（在利润定价页配置）。Ozon 调整类目佣金后，这张排名会自动重排，用来决定先推哪些商品。'), '', { flush: true });
    },
  });

  function findP(sku) { return F.S().products.find(p => p.sku === sku); }
  F.on('cmpReprice', d => { const p = findP(d.sku); if (!p) return; const r = Store.routePriceChange(p, 'product', +d.price, '价格竞争 · ' + Store.roleLabel(), '价格指数/跟卖/底价保护'); return { ok: true, msg: r.queued ? '改价幅度较大，已提交审批' : ('已改价 → ' + d.price + '₽') }; });
  F.on('cmpRepriceAll', () => {
    let a = 0, q = 0;
    F.products().forEach(p => { const pi = priceIndex(p), floor = F.floorPrice(p), fo = cOf(p).followers; const minFo = fo.length ? Math.min(...fo.map(f => f.price)) : Infinity; let t = Math.max(floor, Math.round(Math.min(pi.ref, minFo) * 0.99 / 10) * 10); if (p.price < floor) t = floor; if (t !== p.price && (t < p.price || p.price < floor)) { const r = Store.routePriceChange(p, 'product', t, '价格竞争 · 批量', '价格指数/底价'); if (r.queued) q++; else if (r.applied) a++; } });
    return { ok: true, msg: `直接调价 ${a} 个 · 提交审批 ${q} 个` };
  });
  F.on('cmpCost', d => { const p = findP(d.sku); const c = cOf(p); if (!p || !c.newCost) return; const old = p.cost; p.cost = c.newCost; c.newCost = null; p.margin = Math.round(F.profitOf(p).margin * 10) / 10; F.act('利润守门 Agent', '采购价更新', p.name, '¥' + old + ' → ¥' + p.cost); return { ok: true, msg: p.name + ' 成本已更新，净利率 ' + p.margin + '%' }; });
  F.on('costSet', (d, el) => { const v = parseFloat(el.value); if (isNaN(v)) return; Store.updateSettings({ [d.k]: v }); F.act(Store.roleLabel(), '成本栈调整', d.k, String(v)); return undefined; });
  F.on('floorSet', (d, el) => { const v = parseFloat(el.value); const a = F.S().agents.find(x => x.id === 'profit_guard'); if (a && !isNaN(v)) { a.config = a.config || {}; a.config.marginMin = v; F.act(Store.roleLabel(), '利润底价调整', '净利率', v + '%'); } return { ok: true, msg: '利润底价净利率已设为 ' + v + '%' }; });

  /* ---------- 推广活动：活动利润模拟 / 广告 ДРР ROI / 预算分配 ---------- */
  F.seed('promo', (s, r) => {
    const actions = [
      { id: 'A1', name: 'Распродажа недели · 周促', discount: 10, deadline: '3 天后截止' },
      { id: 'A2', name: 'Ночная распродажа · 夜间特卖', discount: 15, deadline: '5 天后截止' },
      { id: 'A3', name: 'Чёрная пятница · 黑五', discount: 25, deadline: '11 月报名' },
    ];
    const ads = s.products.map((p, i) => {
      const type = F.pick(r, ['按点击付费（CPC）', '按订单付费（CPO）', '搜索推广（Трафареты）']);
      const clicks = Math.round(F.between(r, 120, 1800));
      const orders = Math.max(1, Math.round(clicks * F.between(r, 0.01, 0.06)));
      const spend = Math.round(clicks * F.between(r, 6, 22));
      return { id: 'AD' + (i + 1), sku: p.sku, shopId: p.shopId, type, clicks, orders, spend, budget: Math.round(spend * F.between(r, 1.1, 1.6) / 100) * 100, on: true };
    });
    return { actions, joined: {}, ads, drrMax: 15 };
  });

  F.register('promo', {
    title: '推广活动',
    render() {
      const pr = F.ext().promo, ps = F.products(), floorM = F.floorMargin();
      const ads = F.shop(pr.ads).map(a => { const p = ps.find(x => x.sku === a.sku); if (!p) return null; const rev = a.orders * p.price; const unit = F.profitOf(p).profit; const net = unit * a.orders - (a.on ? a.spend : 0); return Object.assign({}, a, { p, rev, drr: rev ? a.spend / rev * 100 : 0, roi: a.spend ? (unit * a.orders) / a.spend : 0, net, unit }); }).filter(Boolean);
      const loss = ads.filter(a => a.on && a.net < 0);
      const totalSpend = ads.filter(a => a.on).reduce((x, a) => x + a.spend, 0), totalRev = ads.filter(a => a.on).reduce((x, a) => x + a.rev, 0);
      const totalBudget = ads.reduce((x, a) => x + a.budget, 0);
      const weight = ads.map(a => Math.max(0, a.unit) * (a.orders / Math.max(1, a.clicks)));
      const wsum = weight.reduce((x, y) => x + y, 0) || 1;
      return kpis([
        { label: '广告总花费', value: rub(totalSpend), sub: `带来销售 ${rub(totalRev)}`, tone: 'blue' },
        { label: '整体 ДРР', value: pct(totalRev ? totalSpend / totalRev * 100 : 0), sub: `目标 ≤ ${pr.drrMax}%`, tone: totalRev && totalSpend / totalRev * 100 > pr.drrMax ? 'red' : 'green' },
        { label: '亏损广告', value: fmt(loss.length), sub: '算上广告费后净利为负', tone: loss.length ? 'red' : 'green' },
        { label: '可报名活动', value: fmt(pr.actions.length), sub: '报名前先算利润', tone: 'purple' },
      ]) +
      card('广告 ДРР / ROI 监控与亏损暂停（R25）', table(['商品', '广告类型', '点击', '订单', '花费', '销售额', 'ДРР', 'ROI', '扣广告后净利', '状态', '操作'], ads.map(a => [
        esc(a.p.name), esc(a.type), fmt(a.clicks), fmt(a.orders), rub(a.spend), rub(a.rev), `<b class="mono" style="color:${a.drr > pr.drrMax ? 'var(--color-danger,#DC2626)' : 'inherit'}">${pct(a.drr)}</b>`, a.roi.toFixed(2),
        `<b class="mono" style="color:${a.net < 0 ? 'var(--color-danger,#DC2626)' : 'var(--color-success,#16A34A)'}">${rub(a.net)}</b>`,
        a.on ? (a.net < 0 ? tag('亏损中', 'red') : tag('投放中', 'green')) : tag('已暂停', 'gray'),
        a.on ? (a.net < 0 ? btn('暂停（审批）', 'adPause', { id: a.id }, 'btn-danger') : btn('暂停', 'adPause', { id: a.id })) : btn('恢复', 'adResume', { id: a.id }),
      ])) + note('ДРР = 广告花费 ÷ 广告带来的销售额。扣广告后净利 = 单件净利 × 订单数 − 花费。暂停广告属于高风险动作，会先进审批中心。'), btn('亏损广告全部送审暂停', 'adPauseLoss', {}, 'btn-secondary'), { flush: true }) +
      card('按利润分配广告预算（R26）', table(['商品', '单件净利', '转化率', '当前预算', '建议预算', '变化'], ads.map((a, i) => { const sug = Math.round(totalBudget * weight[i] / wsum / 100) * 100; return [esc(a.p.name), rub(a.unit), pct(a.orders / Math.max(1, a.clicks) * 100), rub(a.budget), `<b>${rub(sug)}</b>`, sug > a.budget ? tag('+' + rub(sug - a.budget), 'green') : sug < a.budget ? tag('−' + rub(a.budget - sug), 'orange') : '—']; })) + note(`总预算 ${rub(totalBudget)} 不变，按“单件净利 × 转化率”重新分配。净利为负的商品不再分预算。`), btn('应用建议预算', 'adRebudget', {}, 'btn-primary'), { flush: true }) +
      card('活动报名前利润模拟（R24）', table(['活动', '折扣', '截止', ...ps.map(p => esc(p.name.slice(0, 8)))], pr.actions.map(ac => [esc(ac.name), '−' + ac.discount + '%', esc(ac.deadline), ...ps.map(p => {
        const m = F.profitOf(p, Math.round(p.price * (1 - ac.discount / 100))).margin; const k = ac.id + ':' + p.sku; const j = pr.joined[k];
        return `<div class="ofs-cell">${pct(m)} ${m >= floorM ? tag('可报', 'green') : m >= 0 ? tag('低于底价', 'orange') : tag('亏损', 'red')}<br>${j ? tag(j === 'pending' ? '审批中' : '已报名', j === 'pending' ? 'orange' : 'blue') : btn('报名', 'promoJoin', { a: ac.id, sku: p.sku }, m >= floorM ? 'btn-ghost' : 'btn-ghost')}</div>`;
      })])) + note(`单元格里是参加活动后的净利率。高于底价 ${floorM}% 的直接报名；低于底价的报名会进审批中心。`), '', { flush: true });
    },
  });

  function adById(id) { return F.ext().promo.ads.find(a => a.id === id); }
  F.on('adPause', d => { const a = adById(d.id); const p = findP(a.sku); return Object.assign(Store.proposeApproval({ type: '暂停广告', title: '暂停「' + (p ? p.name : a.sku) + '」' + a.type, target: p ? p.name : a.sku, before: '投放中 · 花费 ' + a.spend + '₽', after: '暂停', reason: '扣除广告费后净利为负 / ДРР 超标', agent: '广告 ROI Agent', risk: 'mid', action: 'adPause', key: 'adPause:' + a.id, payload: { id: a.id } }), { msg: '暂停请求已进审批中心' }); });
  F.on('adPauseLoss', () => { let n = 0; F.shop(F.ext().promo.ads).forEach(a => { const p = findP(a.sku); if (!p || !a.on) return; if (F.profitOf(p).profit * a.orders - a.spend < 0) { Store.proposeApproval({ type: '暂停广告', title: '暂停「' + p.name + '」' + a.type, target: p.name, before: '投放中', after: '暂停', reason: '扣广告后亏损', agent: '广告 ROI Agent', risk: 'mid', action: 'adPause', key: 'adPause:' + a.id, payload: { id: a.id } }); n++; } }); return { ok: true, msg: n + ' 个亏损广告已送审' }; });
  Store.registerApprovalAction('adPause', pl => { const a = adById(pl.id); if (!a) return { ok: false, msg: '广告不存在' }; a.on = false; return { ok: true, msg: '广告已暂停' }; });
  F.on('adResume', d => { const a = adById(d.id); a.on = true; F.act(Store.roleLabel(), '恢复广告', a.sku, '投放中'); return { ok: true, msg: '广告已恢复' }; });
  F.on('adRebudget', () => {
    const pr = F.ext().promo, ads = F.shop(pr.ads), total = ads.reduce((x, a) => x + a.budget, 0);
    const w = ads.map(a => { const p = findP(a.sku); return p ? Math.max(0, F.profitOf(p).profit) * a.orders / Math.max(1, a.clicks) : 0; }); const ws = w.reduce((x, y) => x + y, 0) || 1;
    ads.forEach((a, i) => { a.budget = Math.round(total * w[i] / ws / 100) * 100; });
    F.act('广告 ROI Agent', '按利润重分配预算', ads.length + ' 个广告', '总预算 ' + total + '₽'); return { ok: true, msg: '已按利润重分配广告预算' };
  });
  F.on('promoJoin', d => {
    const pr = F.ext().promo, ac = pr.actions.find(x => x.id === d.a), p = findP(d.sku); const k = d.a + ':' + d.sku;
    const m = F.profitOf(p, Math.round(p.price * (1 - ac.discount / 100))).margin;
    if (m >= F.floorMargin()) { pr.joined[k] = 'joined'; F.act(Store.roleLabel(), '报名活动', p.name, ac.name); return { ok: true, msg: p.name + ' 已报名 ' + ac.name }; }
    pr.joined[k] = 'pending';
    return Object.assign(Store.proposeApproval({ type: '活动报名', title: p.name + ' 报名 ' + ac.name, target: p.name, before: '净利率 ' + F.profitOf(p).margin.toFixed(1) + '%', after: '活动后 ' + m.toFixed(1) + '%', reason: '低于利润底价，需老板确认（冲量/清库存）', agent: Store.roleLabel(), risk: m < 0 ? 'high' : 'mid', action: 'promoJoin', key: 'promo:' + k, payload: { k } }), { msg: '低于底价，已提交审批' });
  });
  Store.registerApprovalAction('promoJoin', pl => { F.ext().promo.joined[pl.k] = 'joined'; return { ok: true, msg: '已报名活动' }; });

  F.adsSummary = function () { const pr = F.ext().promo; return F.shop(pr.ads).filter(a => { const p = findP(a.sku); return p && a.on && F.profitOf(p).profit * a.orders - a.spend < 0; }).length; };
  F.priceIndex = priceIndex;
})();
