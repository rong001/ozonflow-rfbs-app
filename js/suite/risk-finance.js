/**
 * 店铺健康（R49 R50 R54 R46 R19）+ 财务对账（R40 R41 R42 R43）
 */
(function () {
  const F = window.OFS, Store = F.Store;
  const { esc, fmt, rub, cny, pct, tag, btn, card, table, kpis, bar, note, src } = F;

  /* ===== 平台阈值（来源+日期结构化，供规则知识库复用） ===== */
  const HEALTH_RULES = {
    cancelRate: { limit: 10, window: '14 天', label: '卖家原因取消率' },
    lateRate: { limit: 10, window: '7 天', label: '逾期发货率' },
    channelErr: { limit: 1, window: '30 天', label: '渠道/运单错误率' },
    errIndexTiers: [{ from: 0, to: 5, label: '正常', tone: 'green', fine: 0 }, { from: 5.1, to: 10, label: '一档罚款', tone: 'orange', fine: 1 }, { from: 10.01, to: 100, label: '二档罚款', tone: 'red', fine: 2 }],
    errIndexReset: '2026-09-22',
    licenseShopLimit: 6,
  };
  F.HEALTH_RULES = HEALTH_RULES;

  F.seed('health', (s, r) => {
    const out = {};
    s.shops.forEach((sh, i) => {
      const base = s.meta.id === 'guangzhou' ? 1.4 : s.meta.id === 'pressure' ? 1.15 : 0.7;
      const postings = Math.round(F.between(r, 180, 420) * (i === 0 ? 1.3 : 0.8));
      const cancels = Math.round(postings * F.between(r, 0.02, 0.055) * base);
      const late = Math.round(postings * F.between(r, 0.03, 0.08) * base);
      const chErr = Math.round(postings * F.between(r, 0.002, 0.012) * base);
      const errs = cancels + late + chErr + Math.round(F.between(r, 0, 6));
      const trend = Array.from({ length: 8 }, (_, w) => Math.max(0.5, +(errs / postings * 100 * F.between(r, 0.6, 1.15) * (0.75 + w * 0.04)).toFixed(1)));
      out[sh.id] = { postings, cancels, late, chErr, errs, trend, rating: +(F.between(r, 4.3, 4.85)).toFixed(2), appealed: [] };
    });
    // 商品卡合并违规（R19）
    out._merge = s.products.filter(() => r() < 0.3).map(p => ({ sku: p.sku, name: p.name, shopId: p.shopId,
      issue: F.pick(r, ['不同颜色合并到同一卡但主图未区分', '套装与单品合并到同一模型', '品牌属性与已存在卡片冲突', '尺码表缺失导致变体被拆分']) }));
    return out;
  });

  function healthOf(shopId) {
    const s = F.S(), h = F.ext().health || {};
    const d = h[shopId] || { postings: 1, cancels: 0, late: 0, chErr: 0, errs: 0, trend: [], rating: 4.8, appealed: [] };
    const liveRisk = s.orders.filter(o => o.shopId === shopId && o.status !== 'shipped' && o.status !== 'cancelled' && o.etaH != null && o.etaH <= 6).length;
    const cancelled = s.orders.filter(o => o.shopId === shopId && o.status === 'cancelled').length;
    const cancels = d.cancels + cancelled;
    const m = {
      cancelRate: cancels / d.postings * 100,
      lateRate: (d.late + liveRisk) / d.postings * 100,
      channelErr: d.chErr / d.postings * 100,
      errIndex: (d.errs + cancelled + liveRisk) / d.postings * 100,
    };
    const tier = HEALTH_RULES.errIndexTiers.find(t => m.errIndex >= t.from && m.errIndex <= t.to) || HEALTH_RULES.errIndexTiers[2];
    const rv = s.reviews.filter(x => x.shopId === shopId);
    const neg = rv.length ? rv.filter(x => x.rating <= 3).length / rv.length * 100 : 0;
    const ret = s.returns.filter(x => x.shopId === shopId).length / Math.max(1, s.orders.filter(o => o.shopId === shopId).length) * 100;
    const risk = Math.min(100, Math.round(
      Math.min(30, m.cancelRate / HEALTH_RULES.cancelRate.limit * 30) +
      Math.min(25, m.lateRate / HEALTH_RULES.lateRate.limit * 25) +
      Math.min(20, m.errIndex / 10 * 20) + Math.min(15, neg / 40 * 15) + Math.min(10, ret / 30 * 10)));
    return { d, m, tier, neg, ret, risk, liveRisk, cancelled };
  }
  F.healthOf = healthOf;

  function finePerError() { const s = F.S(); return (s.settings.finePerError != null) ? s.settings.finePerError : 300; }

  F.register('health', {
    title: '店铺健康',
    render() {
      const s = F.S(), shop = Store.currentShop();
      const H = healthOf(shop.id);
      const { m, tier, d } = H;
      const fpe = finePerError();
      const errCount = Math.round(m.errIndex / 100 * d.postings);
      const estFine = tier.fine === 0 ? 0 : errCount * fpe * tier.fine;
      const toSafe = Math.max(0, Math.ceil(errCount - d.postings * 0.05));
      const metric = (k, v) => {
        const rule = HEALTH_RULES[k], over = v > rule.limit, warn = v > rule.limit * 0.7;
        return [esc(rule.label), rule.window, `<b class="mono">${pct(v)}</b>`, `≤ ${rule.limit}%`, bar(v / rule.limit * 100, over ? 'var(--color-danger,#DC2626)' : warn ? 'var(--color-accent,#D97706)' : ''),
          over ? tag('超标 · 有限流风险', 'red') : warn ? tag('接近阈值', 'orange') : tag('正常', 'green')];
      };
      const trendMax = Math.max(10.5, ...d.trend);
      const spark = `<div class="ofs-spark">${d.trend.map((v, i) => `<div class="ofs-spark-col" title="第${i + 1}周 ${v}%"><div style="height:${v / trendMax * 100}%" class="${v > 10 ? 'r' : v > 5 ? 'o' : ''}"></div><span>W${i + 1}</span></div>`).join('')}</div>`;
      const rescue = s.orders.filter(o => o.shopId === shop.id && o.status !== 'shipped' && o.status !== 'cancelled' && o.etaH != null && o.etaH <= 6);

      // R46 同主体多账号
      const dupMap = {};
      s.products.forEach(p => { const k = (p.name || '').slice(0, 8); (dupMap[k] = dupMap[k] || new Set()).add(p.shopId); });
      const dups = Object.entries(dupMap).filter(([, v]) => v.size > 1).map(([k, v]) => [esc(k) + '…', [...v].map(id => esc((s.shops.find(x => x.id === id) || {}).name || id)).join(' / '), tag('同品跨店', 'orange')]);
      const merges = (F.ext().health._merge || []).filter(x => x.shopId === shop.id);

      return kpis([
        { label: '错误指数', value: pct(m.errIndex), sub: tag(tier.label, tier.tone) + ` <span class="hint">${HEALTH_RULES.errIndexReset} 起重新计算</span>`, tone: tier.tone === 'green' ? 'green' : tier.tone === 'orange' ? 'orange' : 'red' },
        { label: '本期罚金估算', value: rub(estFine), sub: estFine ? `降到 5% 以下需少出错 ${toSafe} 单` : '当前不触发罚款', tone: estFine ? 'red' : 'green' },
        { label: '封店风险分', value: H.risk + ' / 100', sub: H.risk >= 60 ? '高风险，尽快抢救' : H.risk >= 35 ? '中风险' : '低风险', tone: H.risk >= 60 ? 'red' : H.risk >= 35 ? 'orange' : 'green' },
        { label: '店铺评分', value: d.rating.toFixed(2), sub: `差评占比 ${pct(H.neg, 0)} · 退货率 ${pct(H.ret, 0)}`, tone: 'blue' },
      ]) +
      card('服务质量指标（R49）', table(['指标', '统计窗口', '当前', '平台阈值', '占用', '状态'], [metric('cancelRate', m.cancelRate), metric('lateRate', m.lateRate), metric('channelErr', m.channelErr)]) +
        note(`近 ${HEALTH_RULES.cancelRate.window} 共 ${fmt(d.postings)} 单。逾期率已计入当前剩余时效 ≤ 6 小时还没发货的 ${H.liveRisk} 单，这些单现在处理还来得及。阈值来自 Ozon 卖家服务质量规则，可在平台集成页的规则知识库中更新。`), btn('一键抢救临期订单', 'healthRescue', {}, 'btn-primary'), { flush: true }) +
      `<div class="ofs-grid-2">` +
      card('错误指数趋势（近 8 周）', spark + note(`分档：≤5% 正常 · 5.1–10% 一档 · >10% 二档（${HEALTH_RULES.errIndexReset} 起重新计算）。罚金按每单 <b>${rub(fpe)}</b> × 档位系数估算，单价可调：<input class="ofs-mini-input" type="number" min="0" step="50" value="${fpe}" data-ofs-change="setFine" aria-label="每单罚金估算"> ₽。实际金额以 Ozon 后台通知为准。`)) +
      card('风险分构成（R54）', table(['维度', '权重', '当前'], [
        ['取消率', '30', pct(m.cancelRate)], ['逾期发货', '25', pct(m.lateRate)], ['错误指数', '20', pct(m.errIndex)], ['差评占比', '15', pct(H.neg, 0)], ['退货率', '10', pct(H.ret, 0)],
      ]) + note('风险分 ≥ 60 时，申诉、下架、批量改价这类动作会强制进审批。'), '', { flush: true }) + `</div>` +
      card(`临期订单抢救清单 · ${rescue.length} 单`, table(['订单', '商品', '状态', '剩余时效', '建议'], rescue.map(o => [`<span class="mono">${esc(o.id)}</span>`, esc(o.name), tag(Store.statusLabel(o.status), 'blue'), `<b class="mono">${o.etaH}h</b>`,
        o.status === 'purchase' ? '缺货：转 1688 加急或申请取消（进审批）' : o.status === 'audit' ? '立即审单并打面单' : '立即打面单发货'])), btn('申诉误判错误', 'healthAppeal', {}, 'btn-ghost'), { flush: true }) +
      `<div class="ofs-grid-2">` +
      card('同主体多账号结构（R46）', `<p class="hint" style="padding:12px 16px 0">同一执照最多开 ${HEALTH_RULES.licenseShopLimit} 家店，当前 ${s.shops.length} 家。多店上同款商品，可能被判为重复铺货。</p>` + table(['商品', '出现店铺', '提示'], dups, '没有发现跨店重复上架'), '', { flush: true }) +
      card('商品卡合并违规（R19）', table(['SKU', '商品', '问题', '动作'], merges.map(x => [`<span class="mono">${esc(x.sku)}</span>`, esc(x.name), esc(x.issue), btn('生成整改任务', 'mergeFix', { sku: x.sku })])), '<span class="hint">按 Ozon 商品卡合并规则检查</span>', { flush: true }) + `</div>`;
    },
  });

  F.on('setFine', (d, el) => { F.S().settings.finePerError = Math.max(0, +el.value || 0); return { ok: true, msg: '罚金单价已更新为 ' + (+el.value || 0) + '₽' }; });
  F.on('healthRescue', () => { const r = Store.runAgent('timeout_rescue', { manual: true, force: true }); return r && r.msg ? r : { ok: true, msg: '已执行超时抢救' }; });
  F.on('healthAppeal', () => {
    const shop = Store.currentShop();
    return Object.assign(Store.proposeApproval({ type: '申诉', title: shop.name + ' · 申诉误判错误', target: shop.name, before: '错误指数含物流方原因', after: '提交申诉材料（轨迹截图+揽收记录）', reason: '物流商延误导致逾期，不应计入卖家错误', agent: Store.roleLabel(), risk: 'mid', action: 'appeal', key: 'appeal:' + shop.id, payload: { shopId: shop.id } }), { msg: '申诉已提交审批中心' });
  });
  F.on('mergeFix', d => {
    const h = F.ext().health; h._merge = (h._merge || []).filter(x => x.sku !== d.sku);
    F.act(Store.roleLabel(), '商品卡整改', d.sku, '已生成整改任务'); return { ok: true, msg: d.sku + ' 已生成整改任务并移出清单' };
  });
  Store.registerApprovalAction('appeal', pl => {
    const h = F.ext().health[pl.shopId]; if (h) { h.errs = Math.max(0, h.errs - Math.ceil(h.late * 0.3)); h.late = Math.round(h.late * 0.7); }
    return { ok: true, msg: '申诉已提交，预计剔除约 30% 物流原因逾期' };
  });

  /* ===================== 财务对账 ===================== */
  F.seed('finance', (s, r) => {
    const lines = [];
    const prods = s.products.length ? s.products : s.catalog;
    s.shops.forEach(sh => {
      const ps = s.products.filter(p => p.shopId === sh.id);
      const pool = ps.length ? ps : prods;
      const n = 14 + Math.floor(r() * 10);
      for (let i = 0; i < n; i++) {
        const p = F.pick(r, pool);
        const price = p.price;
        const exp = Store.calcProfit({ price, costCNY: p.cost, weight: p.weight || 300 });
        const kind = r();
        let commission = exp.commission, ship = exp.ship, acq = exp.fee, penalty = 0, ret = 0, status = 'settled', diffNote = '';
        if (kind < 0.12) { commission = price * (exp.commissionRate + 0.03); diffNote = '佣金高于类目费率（疑似类目映射错误）'; }
        else if (kind < 0.2) { ship = exp.ship * 1.35; diffNote = '物流费按体积重计费'; }
        else if (kind < 0.27) { penalty = 250 + Math.round(r() * 300); diffNote = '逾期发货罚款'; }
        else if (kind < 0.33) { ret = price; diffNote = '买家退货冲回'; }
        else if (kind < 0.45) { status = 'pending'; }
        const fxOrder = +(s.settings.fx * F.between(r, 0.97, 1.03)).toFixed(2);
        const fxSettle = +(s.settings.fx * F.between(r, 0.95, 1.05)).toFixed(2);
        const day = 1 + Math.floor(r() * 28);
        lines.push({ id: 'ST-' + sh.id.slice(2, 4).toUpperCase() + '-' + (3100 + lines.length), shopId: sh.id, sku: p.sku, name: p.name, date: '09-' + String(day).padStart(2, '0'),
          price, expProfit: exp.profit, commission, ship, acq, penalty, ret, costRUB: exp.costRUB, retProv: exp.retProv, status, diffNote, fxOrder, fxSettle, checked: false });
      }
    });
    return { lines, compliance: { entity: true, account: true, contract: true, fxRecord: false, vat: false, invoice: false } };
  });

  function actualProfit(l) { return l.price - l.ret - l.costRUB - l.commission - l.ship - l.acq - l.penalty; }

  F.register('finance', {
    title: '财务对账',
    render() {
      const s = F.S(), fin = F.ext().finance;
      const st = F.uiState('finance', { tab: 'diff' });
      const lines = F.shop(fin.lines);
      const settled = lines.filter(l => l.status === 'settled');
      const diffs = settled.filter(l => Math.abs(actualProfit(l) - l.expProfit) > 30);
      const leak = diffs.reduce((a, l) => a + (l.expProfit - actualProfit(l)), 0);
      const pend = lines.filter(l => l.status === 'pending');
      const shown = st.tab === 'diff' ? diffs : st.tab === 'pending' ? pend : lines;
      // R41 回款日历：已结算按双周回款；在途订单按预计结算
      const inTransit = F.orders().filter(o => o.status === 'shipped').reduce((a, o) => a + o.amount * 0.78, 0);
      const pendAmt = pend.reduce((a, l) => a + l.price - l.commission - l.ship - l.acq, 0);
      const today = new Date();
      const nextDates = [15, 30].map(d => { const x = new Date(today.getFullYear(), today.getMonth(), d); if (x < today) x.setMonth(x.getMonth() + 1); return x; }).sort((a, b) => a - b);
      const fmtD = x => (x.getMonth() + 1) + '月' + x.getDate() + '日';
      // R42 汇兑
      const fxRows = settled.slice(0, 8).map(l => { const net = l.price - l.commission - l.ship - l.acq - l.penalty - l.ret; const g = net / l.fxSettle - net / l.fxOrder; return [`<span class="mono">${esc(l.id)}</span>`, rub(net), l.fxOrder, l.fxSettle, `<b class="mono" style="color:${g >= 0 ? 'var(--color-success,#16A34A)' : 'var(--color-danger,#DC2626)'}">${g >= 0 ? '+' : ''}${cny(g)}</b>`]; });
      const fxTotal = settled.reduce((a, l) => { const net = l.price - l.commission - l.ship - l.acq - l.penalty - l.ret; return a + net / l.fxSettle - net / l.fxOrder; }, 0);
      const comp = fin.compliance;
      const CI = [['entity', '收款主体与店铺主体一致'], ['account', '持牌收款服务商账户已绑定'], ['contract', '跨境服务合同 / 平台协议已归档'], ['fxRecord', '每笔结汇有对应订单流水'], ['vat', '俄方 VAT 代扣代缴口径已确认'], ['invoice', '出口报关单 / 发票与结汇金额可对应']];
      return kpis([
        { label: '本期结算单', value: fmt(settled.length), sub: `待结算 ${pend.length} 笔`, tone: 'blue' },
        { label: '对账差异单', value: fmt(diffs.length), sub: '实际净利偏离预期超 30₽', tone: diffs.length ? 'orange' : 'green' },
        { label: '利润漏损', value: rub(leak), sub: '可申诉 / 需修正口径', tone: leak > 0 ? 'red' : 'green' },
        { label: '汇兑损益', value: (fxTotal >= 0 ? '+' : '') + cny(fxTotal), sub: '下单日 vs 结算日汇率', tone: fxTotal >= 0 ? 'green' : 'red' },
      ]) +
      card('结算明细 vs 订单利润逐单对账（R40）',
        F.tabs('finance', 'tab', [['diff', `差异 ${diffs.length}`], ['pending', `待结算 ${pend.length}`], ['all', `全部 ${lines.length}`]], st.tab) +
        table(['结算单', '日期', '商品', '售价', '佣金', '物流', '收单', '罚款/退货', '预期净利', '实际净利', '差异', '原因', '操作'], shown.map(l => {
          const a = actualProfit(l), df = a - l.expProfit;
          return [`<span class="mono">${esc(l.id)}</span>`, l.date, esc(l.name), rub(l.price), rub(l.commission), rub(l.ship), rub(l.acq), rub(l.penalty + l.ret),
            rub(l.expProfit), l.status === 'pending' ? tag('待结算', 'gray') : rub(a), l.status === 'pending' ? '—' : `<b class="mono" style="color:${df < -30 ? 'var(--color-danger,#DC2626)' : 'inherit'}">${df > 0 ? '+' : ''}${fmt(df)}</b>`,
            esc(l.diffNote || (l.status === 'pending' ? '等待 Ozon 结算' : '一致')),
            l.checked ? tag('已核', 'green') : (l.status === 'pending' ? '' : (df < -30 && /佣金|罚款|物流/.test(l.diffNote) ? btn('发起申诉', 'finDispute', { id: l.id }, 'btn-accent') + ' ' : '') + btn('标记已核', 'finCheck', { id: l.id }))];
        })) + note('结算数据来自 Ozon 新财务接口 <span class="mono">/v1/finance/accrual/*</span>（旧接口 <span class="mono">/v3/finance/transaction/*</span> 已于 2026-09-08 停用），接入店铺 API 后自动拉取。'), btn('批量标记一致项', 'finCheckAll', {}, 'btn-ghost'), { flush: true }) +
      `<div class="ofs-grid-2">` +
      card('回款日历与资金预测（R41）', table(['日期', '来源', '金额（₽）', '折合（¥）'], [
        [fmtD(nextDates[0]), '已结算待打款 + 待结算单', rub(pendAmt), cny(pendAmt / s.settings.fx)],
        [fmtD(nextDates[1]), '在途订单（签收后结算，按 78% 到手估算）', rub(inTransit), cny(inTransit / s.settings.fx)],
      ]) + note('按每月两次回款估算（15 日 / 月末，可配置）。到账资金少于下周采购预算时，总览会出现资金预警。'), '', { flush: true }) +
      card('汇兑损益明细（R42）', table(['结算单', '净额', '下单日汇率', '结算日汇率', '损益'], fxRows), '<span class="hint">卢布兑人民币</span>', { flush: true }) + `</div>` +
      card('收款主体与资金合规（R43）', `<div class="ofs-checklist">${CI.map(([k, label]) => `<label class="ofs-check"><input type="checkbox" ${comp[k] ? 'checked' : ''} data-ofs-change="compToggle" data-k="${k}"> <span>${esc(label)}</span> ${comp[k] ? tag('已完成', 'green') : tag('待办', 'orange')}</label>`).join('')}</div>` +
        note('这份清单只帮你逐项自查，不构成税务或法律意见。涉及 VAT、结汇的口径，请以持牌服务商和专业顾问的意见为准。'), `<span class="hint">${CI.filter(([k]) => comp[k]).length}/${CI.length} 完成</span>`);
    },
  });

  F.on('finCheck', d => { const l = F.ext().finance.lines.find(x => x.id === d.id); if (l) l.checked = true; F.act(Store.roleLabel(), '对账标记已核', d.id, '已核'); return { ok: true, msg: d.id + ' 已标记' }; });
  F.on('finCheckAll', () => { let n = 0; F.shop(F.ext().finance.lines).forEach(l => { if (l.status === 'settled' && Math.abs(actualProfit(l) - l.expProfit) <= 30 && !l.checked) { l.checked = true; n++; } }); F.act(Store.roleLabel(), '批量对账', n + ' 笔', '一致项已核'); return { ok: true, msg: '已批量标记 ' + n + ' 笔一致项' }; });
  F.on('finDispute', d => {
    const l = F.ext().finance.lines.find(x => x.id === d.id); if (!l) return;
    const loss = Math.round(l.expProfit - actualProfit(l));
    return Object.assign(Store.proposeApproval({ type: '结算申诉', title: l.id + ' · ' + l.diffNote, target: l.id, before: '实际净利 ' + Math.round(actualProfit(l)) + '₽', after: '追回约 ' + loss + '₽', reason: l.diffNote, agent: '对账 Agent', risk: loss > 300 ? 'high' : 'mid', action: 'dispute', key: 'dispute:' + l.id, payload: { id: l.id } }), { msg: '申诉已进审批中心' });
  });
  Store.registerApprovalAction('dispute', pl => { const l = F.ext().finance.lines.find(x => x.id === pl.id); if (!l) return { ok: false, msg: '结算单不存在' }; l.checked = true; l.diffNote += '（已申诉）'; return { ok: true, msg: pl.id + ' 申诉已提交 Ozon 支持' }; });
  F.on('compToggle', (d, el) => { F.ext().finance.compliance[d.k] = el.checked; F.act(Store.roleLabel(), '资金合规清单', d.k, el.checked ? '完成' : '取消'); return { ok: true }; });

  F.financeSummary = function () { const fin = F.ext().finance; const lines = F.shop(fin.lines).filter(l => l.status === 'settled'); const diffs = lines.filter(l => Math.abs(actualProfit(l) - l.expProfit) > 30); return { diffs: diffs.length, leak: diffs.reduce((a, l) => a + l.expProfit - actualProfit(l), 0) }; };
})();
