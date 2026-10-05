/**
 * OzonFlow · AI 运营层：AI 指令台 / 审批中心 / 能力矩阵（需求地图）/ 平台接入状态
 * 指令解析当前为本地规则引擎，接口与 LLM 解析器一致（parse → plan → 确认 → 执行），可替换为大模型。
 */
window.OzonFlowOps = (function () {
  const Store = window.OzonFlowStore;
  const toast = (t, m) => window.showToast && window.showToast(t, m);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const VIEW_TITLES = {
    dashboard: '经营总览', selection: '智能选品', listing: '刊登上架', orders: '订单履约', rules: '自动化规则',
    logistics: '物流与库存', profit: '利润定价', cs: '客服评价', returns: '退货异常', weekly: '经营周报',
    agents: '自动化 Agent', approvals: '审批中心', copilot: 'AI 指令台', capability: '能力矩阵',
    market: '市场选品', compete: '价格竞争', content: '内容合规', promo: '推广活动', health: '店铺健康',
    finance: '财务对账', supply: '供应链库存', sla: '时效物流', inbox: '客服收件箱', platform: '平台集成', connect: '数据连接', studio: '素材工坊',
  };

  /* ================= AI 指令台 ================= */
  let plan = null;
  let history = [];
  let lastInput = '';
  let nluNote = '';

  const EXAMPLES = [
    '把毛利低于20%的商品提价8%',
    '处理所有超时订单',
    '回复所有差评',
    '补货低于安全库存的SKU',
    '跑一遍所有Agent',
    '查询今天待发货订单',
    '检查物流轨迹异常',
    '生成本周周报',
    '切换到深圳配件馆',
    '打开审批中心',
    '暂停所有亏损广告',
    '检查证书到期和风险词',
    '对一下本店回款差异',
    '看看店铺健康和错误指数',
    '回传所有运单号',
    '回复买家消息',
    '生成今日简报',
    '同步店铺数据',
    '采集同款价格',
    '查物流轨迹',
    '推送简报到群',
    '库存快没了怎么办',
  ];

  const forShop = arr => Store.forShop(arr || []);
  const num = (txt, re, dflt) => { const m = txt.match(re); return m ? parseFloat(m[1]) : dflt; };

  function agentPlan(agentId, label, rows, risk) {
    return {
      label: label, risk: risk || 'low', rows: rows,
      exec: () => Store.runAgent(agentId, { manual: true, force: true }),
    };
  }

  function parse(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    const s = Store.get();

    // 0. 经营套件指令（店铺健康 / 广告 / 证书 / 对账 / 运单回传 / 简报 / 买家消息）
    const F = window.OFS;
    if (F) {
      const navTo = (v, msg) => () => { window.navigate(v); return { ok: true, msg: msg || ('已打开' + VIEW_TITLES[v]) }; };
      const openPage = Object.keys(VIEW_TITLES).find(v => Store.SUITE_VIEWS.includes(v) && t.includes(VIEW_TITLES[v]));
      if (openPage && /打开|去|进入|看看|跳到/.test(t)) {
        return { intent: 'nav', label: '打开「' + VIEW_TITLES[openPage] + '」', risk: 'none', readOnly: true, head: [], rows: [], exec: navTo(openPage) };
      }
      // 免 Key 数据连接（插件 / 报表 / 公开数据）
      if (/同步店铺|插件同步|同步.*(后台|插件)|拉取.*(后台|订单)|导入.*订单|连接店铺/.test(t)) {
        const ok = !!(F.Ext && F.Ext.ver);
        return { intent: 'connect', label: ok ? '从浏览器插件同步 Ozon 卖家后台的订单与结算' : '打开数据连接：安装插件或导入报表', risk: 'low', head: ['方式', '状态'], rows: [['浏览器插件', ok ? '已连接' : '未安装'], ['报表导入', '可用']], exec: () => { window.navigate('connect'); if (ok) F.invoke('cnPull'); return { ok: true, msg: ok ? '正在从插件同步' : '已打开数据连接' }; } };
      }
      if (/(采集|抓取|看看|查).*(同款|竞品|对手).*(价|钱)|比价|同款.*价格/.test(t)) {
        const ps = F.products();
        return { intent: 'prices', label: '采集 Ozon / WB 同款公开价格 · ' + ps.length + ' 个商品', risk: 'none', readOnly: true, head: ['商品', '搜索词'], rows: ps.map(p => [p.name, p.ru || p.name]), exec: () => { window.navigate('connect'); F.invoke('cnPrices'); return { ok: true, msg: '已开始采集' }; } };
      }
      if (/查.*(物流|快递).*(轨迹|到哪)|包裹到哪|运单跟踪|快递查询|^查物流/.test(t)) {
        const os = F.orders().filter(o => o.status === 'shipped' && o.track);
        return { intent: 'track', label: '菜鸟公开接口查询物流轨迹 · ' + os.length + ' 个运单', risk: 'none', readOnly: true, head: ['订单', '运单号'], rows: os.slice(0, 12).map(o => [o.id, o.track]), exec: () => { window.navigate('connect'); F.invoke('cnTrack'); return { ok: true, msg: '正在查询轨迹' }; } };
      }
      if (/推送|发到|发送到|通知/.test(t) && /群|企业微信|企微|钉钉|飞书|telegram|简报/i.test(t)) {
        const hs = (F.ext().connect || { push: { hooks: [] } }).push.hooks;
        return { intent: 'push', label: '推送今日简报到 ' + (hs.length ? hs.map(h => h.name).join('、') : '桌面通知（还没配置群机器人）'), risk: 'low', head: ['简报'], rows: F.brief().split('\n').map(l => [l]), exec: () => { F.connect.pushBrief(true); return { ok: true, msg: '简报已推送' }; } };
      }
      if (/白底|主图|商品视频|富内容|素材/.test(t)) {
        return { intent: 'nav', label: '打开「素材工坊」', risk: 'none', readOnly: true, head: [], rows: [], exec: navTo('studio') };
      }
      if (/(暂停|关掉|停掉).*(亏损|亏钱).*广告|广告.*(亏损|亏钱)/.test(t)) {
        const rows = F.shop(F.ext().promo.ads).filter(a => { const p = F.S().products.find(x => x.sku === a.sku); return p && a.on && F.profitOf(p).profit * a.orders - a.spend < 0; })
          .map(a => { const p = F.S().products.find(x => x.sku === a.sku); return [p.name, a.type, a.spend + '₽', Math.round(F.profitOf(p).profit * a.orders - a.spend) + '₽']; });
        return { intent: 'adPause', label: '亏损广告送审暂停 · ' + rows.length + ' 个', risk: 'mid', head: ['商品', '广告类型', '花费', '扣广告后净利'], rows, exec: () => F.invoke('adPauseLoss') };
      }
      if (/证书|EAC|合规|风险词|禁售/.test(t)) {
        const c = F.contentSummary();
        return { intent: 'content', label: '内容合规检查：证书预警 ' + c.cert + ' · 风险词 ' + c.banned + ' · 低分卡片 ' + c.low, risk: 'none', readOnly: true, head: ['项目', '数量'], rows: [['证书 60 天内到期或缺失', c.cert], ['命中风险词', c.banned], ['内容分 < 60', c.low]], exec: navTo('content') };
      }
      if (/对账|回款|结算|少结|差异/.test(t)) {
        const fs = F.financeSummary();
        return { intent: 'finance', label: '逐单对账：差异 ' + fs.diffs + ' 笔，漏损约 ' + Math.round(fs.leak) + '₽', risk: 'low', head: ['项目', '值'], rows: [['差异订单', fs.diffs], ['利润漏损', Math.round(fs.leak) + '₽']], exec: () => { const r = F.invoke('finCheckAll'); window.navigate('finance'); return r; } };
      }
      if (/店铺健康|错误指数|罚款|封店|风险分/.test(t)) {
        const h = F.healthOf(Store.currentShop().id);
        return { intent: 'health', label: '店铺健康：错误指数 ' + h.m.errIndex.toFixed(1) + '%（' + h.tier.label + '）· 风险分 ' + h.risk, risk: 'none', readOnly: true, head: ['指标', '值'], rows: [['卖家原因取消率', h.m.cancelRate.toFixed(1) + '%'], ['逾期发货率', h.m.lateRate.toFixed(1) + '%'], ['错误指数', h.m.errIndex.toFixed(1) + '%'], ['临期订单', h.liveRisk]], exec: navTo('health') };
      }
      if (/回传|运单号.*(同步|回写)|同步.*运单/.test(t)) {
        const n = F.slaSummary().unsynced;
        return { intent: 'sla', label: '回传运单号 · 待回传 ' + n + ' 单', risk: 'low', head: ['待回传'], rows: [[n]], exec: () => F.invoke('slaSyncAll') };
      }
      if (/简报|日报/.test(t)) {
        return { intent: 'brief', label: '生成今日经营简报', risk: 'none', readOnly: true, head: ['简报'], rows: F.brief().split('\n').map(l => [l]), exec: navTo('platform') };
      }
      if (/买家消息|聊天|收件箱|买家咨询/.test(t)) {
        const open = F.shop(F.ext().inbox.chats).filter(c => !c.replied);
        return { intent: 'inbox', label: '按建议回复买家会话 · ' + open.length + ' 个', risk: 'low', head: ['会话', '买家', '消息'], rows: open.map(c => [c.id, c.buyer, c.text]), exec: () => F.invoke('ibReplyAll') };
      }
    }

    // 1. 按毛利调价
    if (/(提价|涨价|调价|降价)/.test(t) && /毛利|利润|净利/.test(t)) {
      const below = num(t, /(?:低于|小于|<|不足|跌破)\s*(\d+(?:\.\d+)?)\s*%?/, 20);
      const pctRaw = num(t, /(?:提价|涨价|调价|降价)\s*(\d+(?:\.\d+)?)\s*%/, null);
      const down = /降价/.test(t);
      const items = forShop(s.products).filter(p => {
        const m = p.margin != null ? p.margin : Store.calcProfit({ price: p.price, costCNY: p.cost, weight: p.weight }).margin;
        return m < below;
      });
      const rows = items.map(p => {
        const np = pctRaw != null
          ? Math.round(p.price * (1 + (down ? -1 : 1) * pctRaw / 100) / 10) * 10
          : (p.suggestedPrice || Math.round(p.price * 1.1 / 10) * 10);
        const chg = (np - p.price) / p.price * 100;
        return { p: p, np: np, chg: chg, cells: [p.name, (p.margin != null ? p.margin : '—') + '%', p.price + '₽', np + '₽', (chg > 0 ? '+' : '') + chg.toFixed(0) + '%', Math.abs(chg) > Store.APPROVAL_RULES.priceChangePct ? '进审批' : '直接执行'] };
      });
      return {
        intent: 'reprice', label: '按毛利调价 · 毛利 < ' + below + '%' + (pctRaw != null ? ' · ' + (down ? '降' : '提') + pctRaw + '%' : ' · 按守门建议价'),
        risk: rows.some(r => Math.abs(r.chg) > Store.APPROVAL_RULES.priceChangePct) ? 'high' : 'mid',
        head: ['商品', '当前毛利', '现价', '新价', '变动', '执行方式'], rows: rows.map(r => r.cells),
        exec: () => {
          let applied = 0, queued = 0;
          rows.forEach(r => {
            const res = Store.routePriceChange(r.p, 'product', r.np, 'AI 指令台', '指令：' + t);
            if (res.queued) queued++; else if (res.applied) applied++;
          });
          Store.emit('copilot');
          return { ok: true, msg: '已直接改价 ' + applied + ' 个 · 提交审批 ' + queued + ' 个' };
        },
      };
    }

    // 2. 全部 Agent
    if (/(所有|全部|一键|跑一遍).*(agent|自动化)/i.test(t)) {
      const as = Store.agentsSummary();
      return {
        intent: 'runAll', label: '级联运行全部 Agent', risk: 'mid',
        head: ['Agent', '状态', '今日已处理'], rows: as.agents.map(a => [a.name, a.on ? '已启用' : '未启用', a.todayCount || 0]),
        exec: () => Store.runAllAgents(),
      };
    }

    // 3. 超时
    if (/超时|快超时|截单|时效/.test(t)) {
      const rows = forShop(s.orders).filter(o => o.status !== 'shipped' && o.status !== 'cancelled' && (o.risk || (o.etaH != null && o.etaH <= 6)))
        .map(o => [o.id, o.name, o.statusLabel || o.status, (o.etaH != null ? o.etaH + 'h' : '—')]);
      return Object.assign({ intent: 'timeout', head: ['订单', '商品', '状态', '剩余时效'] }, agentPlan('timeout_rescue', '超时抢救：优先审单 → 面单 → 发货，缺货转采购', rows, 'mid'));
    }

    // 4. 物流异常
    if (/物流.*异常|轨迹|清关|停滞/.test(t)) {
      const rows = forShop(s.orders).filter(o => o.status === 'shipped' && (o.anomaly || o.trackStatus === 'stale' || o.trackStatus === 'customs_hold'))
        .map(o => [o.id, o.name, o.track || '—', o.trackStatus === 'customs_hold' ? '清关异常' : '轨迹停滞']);
      return Object.assign({ intent: 'logistics', head: ['订单', '商品', '运单号', '异常'] }, agentPlan('logistics_anomaly', '扫描物流轨迹异常并自动建索赔', rows, 'low'));
    }

    // 5. 差评 / 问答
    if (/差评|评价|问答|回复/.test(t)) {
      const rows = forShop(s.reviews).filter(r => r.rating <= 3 && !r.replied).map(r => ['★' + r.rating, r.product || r.sku, (r.text || '').slice(0, 40)])
        .concat(forShop(s.qa).filter(q => !q.answered).slice(0, 3).map(q => ['问答', q.product || q.sku, (q.q || q.text || '').slice(0, 40)]));
      return Object.assign({ intent: 'reply', head: ['类型', '商品', '内容'] }, agentPlan('ru_cs', '俄语模板回复差评与问答', rows, 'low'));
    }

    // 6. 补货
    if (/补货|缺货|安全库存|库存不足/.test(t)) {
      const rows = forShop(s.inventory).filter(i => i.local <= i.safe).map(i => [i.name, i.sku, i.local, i.safe]);
      return Object.assign({ intent: 'restock', head: ['商品', 'SKU', '本地库存', '安全库存'] }, agentPlan('inventory_restock', '为低于安全库存的 SKU 补货', rows, 'low'));
    }

    // 7. 采购
    if (/采购|1688|下单/.test(t)) {
      const rows = forShop(s.orders).filter(o => o.status === 'purchase').map(o => [o.id, o.name, '¥' + Math.round((o.cost || 0) * Store.APPROVAL_RULES.poBatch)]);
      return Object.assign({ intent: 'purchase', head: ['订单', '商品', '预计采购额'] }, agentPlan('purchase_1688', '1688 采购跟单（大额进审批）', rows, 'mid'));
    }

    // 8. 审单
    if (/审单|审核订单/.test(t)) {
      const rows = forShop(s.orders).filter(o => o.status === 'audit').map(o => [o.id, o.name, o.amount + '₽']);
      return { intent: 'audit', label: '按规则自动审单', risk: 'low', head: ['订单', '商品', '金额'], rows: rows, exec: () => Store.runAutoAudit() };
    }

    // 9. 周报
    if (/周报|经营报告|汇报/.test(t)) {
      return {
        intent: 'weekly', label: '生成多店经营周报快照', risk: 'low', head: ['店铺'], rows: s.shops.map(sh => [sh.name]),
        exec: () => { const r = Store.runAgent('weekly_report', { manual: true, force: true }); setTimeout(() => window.navigate('weekly'), 300); return r; },
      };
    }

    // 10. 查询待发货 / 待审
    if (/(查|看|多少|列出|哪些).*(待发货|待审|待采购|订单)/.test(t)) {
      const st = /待审/.test(t) ? 'audit' : /待采购/.test(t) ? 'purchase' : 'ship';
      const label = { audit: '待审核', purchase: '待采购', ship: '待发货' }[st];
      const rows = forShop(s.orders).filter(o => o.status === st).map(o => [o.id, o.name, o.city || '—', o.amount + '₽', o.etaH != null ? o.etaH + 'h' : '—']);
      return {
        intent: 'query', label: '查询：' + label + '订单 ' + rows.length + ' 笔', risk: 'none', readOnly: true,
        head: ['订单', '商品', '城市', '金额', '剩余时效'], rows: rows,
        exec: () => { window.navigate('orders', { filter: st }); return { ok: true, msg: '已打开' + label + '订单' }; },
      };
    }

    // 11. 切换店铺
    if (/切换|切到|换到/.test(t) && /店|馆|铺/.test(t)) {
      const sh = s.shops.find(x => t.includes(x.name) || t.includes(x.name.slice(0, 2)));
      if (sh) {
        return {
          intent: 'shop', label: '切换店铺 → ' + sh.name, risk: 'none', head: ['店铺', '模式'], rows: [[sh.name, sh.mode || 'rFBS']],
          exec: () => Store.switchShop(sh.id),
        };
      }
    }

    // 12. 打开页面
    const go = Object.keys(VIEW_TITLES).find(v => t.includes(VIEW_TITLES[v].replace(/\s/g, '')) || t.includes(VIEW_TITLES[v]));
    if (go && /打开|去|进入|看看|跳到/.test(t)) {
      return { intent: 'nav', label: '打开「' + VIEW_TITLES[go] + '」', risk: 'none', readOnly: true, head: [], rows: [], exec: () => { window.navigate(go); return { ok: true, msg: '已打开' + VIEW_TITLES[go] }; } };
    }
    return { intent: 'unknown', label: '没听懂这条指令', risk: 'none', head: [], rows: [] };
  }

  const RISK = { none: ['tag-gray', '只读'], low: ['tag-green', '低风险'], mid: ['tag-orange', '中风险'], high: ['tag-red', '高风险'] };

  function renderCopilot() {
    const el = document.getElementById('copilotRoot');
    if (!el) return;
    const p = plan;
    let planHtml = '';
    if (p && p.intent === 'unknown') {
      planHtml = `<div class="card"><div class="card-body"><b>没听懂「${esc(lastInput)}」</b>${nluNote ? `<div class="hint cp-nlu" style="margin-top:6px">${esc(nluNote)}</div>` : ''}<div class="hint" style="margin-top:6px">可以试试下面这些说法：</div>
        <div class="cp-chips" style="margin-top:8px">${EXAMPLES.slice(0, 6).map(x => `<button class="cp-chip" data-cp-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div></div></div>`;
    } else if (p) {
      const rk = RISK[p.risk] || RISK.low;
      planHtml = `<div class="card">
        <div class="card-header"><div class="card-title">执行计划</div><div class="card-extra"><span class="tag ${rk[0]}">${rk[1]}</span></div></div>
        <div class="card-body">
          <div class="cp-plan-line"><span class="hint">识别意图</span><b>${esc(p.label)}</b></div>${nluNote ? `<div class="hint cp-nlu">${esc(nluNote)}</div>` : ''}
          <div class="cp-plan-line"><span class="hint">影响对象</span><b>${p.rows.length} 项</b>${p.risk === 'high' ? '<span class="hint">· 超阈值的动作会进入审批中心，由老板确认后执行</span>' : ''}</div>
          ${p.head && p.head.length ? `<div class="table-wrap" style="margin-top:10px;max-height:300px;overflow:auto"><table class="data-table"><thead><tr>${p.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${p.rows.length ? p.rows.slice(0, 40).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${p.head.length}" class="hint" style="text-align:center;padding:16px">当前店铺没有匹配对象</td></tr>`}</tbody></table></div>` : ''}
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="btn btn-primary btn-sm" id="cpExec">${p.readOnly ? '打开' : '确认执行'}</button>
            <button class="btn btn-ghost btn-sm" id="cpCancel">取消</button>
          </div>
        </div></div>`;
    }
    el.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="cp-head"><label for="cpInput" class="cp-label">想让系统做什么？</label><button type="button" class="info-tip" aria-label="说明" data-tip="先预览影响范围，确认后才执行。改价超 ${Store.APPROVAL_RULES.priceChangePct}%、退款 ≥ ${Store.APPROVAL_RULES.refundRub}₽、采购 ≥ ¥${Store.APPROVAL_RULES.poCny}、取消订单都会进审批中心。语义解析在浏览器本地运行，数据不出本机。"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.01"/></svg></button></div>
          <div class="cp-input-row">
            <input id="cpInput" class="cp-input" autocomplete="off" placeholder="例如：把毛利低于20%的商品提价8%" value="${esc(lastInput)}" />
            <button class="btn btn-primary" id="cpRun">解析指令</button>
          </div>
          <div class="cp-chips">${EXAMPLES.slice(0, 7).map(x => `<button class="cp-chip" data-cp-ex="${esc(x)}">${esc(x)}</button>`).join('')}<details class="cp-more"><summary class="cp-chip cp-chip-more">更多 ${EXAMPLES.length - 7} 条</summary><div class="cp-chips">${EXAMPLES.slice(7).map(x => `<button class="cp-chip" data-cp-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div></details></div>
        </div>
      </div>
      ${planHtml}
      <div class="card">
        <div class="card-header"><div class="card-title">指令记录</div><div class="card-extra"><span class="hint">${history.length} 条</span></div></div>
        <div class="card-body" style="padding-top:4px"><ul class="agent-feed">${history.length ? history.map(h => `<li><span class="hint">${esc(h.t)}</span> <b>${esc(h.input)}</b> — ${esc(h.result)}</li>`).join('') : '<li class="hint">还没有执行过指令</li>'}</ul></div>
      </div>`;
  }

  function runParse(text) {
    lastInput = text;
    plan = parse(text);
    nluNote = '';
    const NLU = window.OzonFlowNLU;
    if (plan && plan.intent === 'unknown' && NLU) {
      const q = NLU.quick(text);
      if (q && !q.weak) { const p2 = parse(q.text); if (p2 && p2.intent !== 'unknown') { plan = p2; nluNote = '语义理解（' + q.method + '）：「' + text + '」→「' + q.text + '」'; } }
      if (plan.intent === 'unknown') {
        nluNote = NLU.status.state === 'ready' ? '正在用本地语义模型理解…' : (NLU.status.msg || '正在加载本地语义模型（首次约 24MB，之后秒开）');
        NLU.deep(text).then(m => {
          if (lastInput !== text) return;
          const p3 = m && parse(m.text);
          if (p3 && p3.intent !== 'unknown') { plan = p3; nluNote = '语义理解（' + m.method + '，相似度 ' + m.score.toFixed(2) + '）：「' + text + '」→「' + m.text + '」'; }
          else nluNote = '本地语义模型也没找到对应的操作，可以换个说法或点下面的例子';
          renderCopilot();
        }).catch(e => { if (lastInput === text) { nluNote = '语义模型暂不可用（' + e.message + '），已用规则引擎'; renderCopilot(); } });
      }
    }
    renderCopilot();
    const inp = document.getElementById('cpInput');
    if (inp) inp.focus();
  }

  function execPlan() {
    if (!plan || !plan.exec) return;
    const r = plan.exec() || {};
    const d = new Date();
    history.unshift({ t: d.toTimeString().slice(0, 5), input: lastInput, result: r.msg || (r.ok ? '已执行' : '未执行') });
    if (history.length > 20) history.length = 20;
    if (!plan.readOnly) Store.audit(Store.roleLabel() + ' · AI 指令台', '指令：' + lastInput, plan.label, r.msg || '完成');
    toast(r.ok === false ? 'info' : 'success', r.msg || '已执行');
    plan = null;
    lastInput = '';
    Store.emit('copilotExec');
  }

  /* ================= 审批中心 ================= */
  let apTab = 'pending';
  function renderApprovals() {
    const el = document.getElementById('approvalsRoot');
    if (!el) return;
    const s = Store.get();
    const all = Store.forShop(s.approvals);
    const pending = all.filter(a => a.status === 'pending');
    const done = all.filter(a => a.status !== 'pending');
    const isBoss = s.role === 'boss';
    const R = Store.APPROVAL_RULES;
    const list = apTab === 'pending' ? pending : done;
    const statusTag = a => ({ pending: '<span class="tag tag-orange">待审批</span>', approved: '<span class="tag tag-green">已通过</span>', rejected: '<span class="tag tag-gray">已驳回</span>', failed: '<span class="tag tag-red">执行失败</span>' })[a.status] || '';
    const audit = Store.forShop(s.auditLog).slice(0, 60);
    el.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card orange"><div class="kpi-label">待审批</div><div class="kpi-value">${pending.length}</div><div class="kpi-sub neutral">高风险 ${pending.filter(a => a.risk === 'high').length}</div></div>
        <div class="kpi-card green"><div class="kpi-label">已通过</div><div class="kpi-value">${done.filter(a => a.status === 'approved').length}</div><div class="kpi-sub up">通过即执行</div></div>
        <div class="kpi-card blue"><div class="kpi-label">已驳回</div><div class="kpi-value">${done.filter(a => a.status === 'rejected').length}</div><div class="kpi-sub neutral">留痕可追溯</div></div>
        <div class="kpi-card purple"><div class="kpi-label">审计记录</div><div class="kpi-value">${audit.length}</div><div class="kpi-sub neutral">人工 + Agent</div></div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="filter-tabs">
            <button class="filter-tab ${apTab === 'pending' ? 'active' : ''}" data-ap-tab="pending">待审批 <span class="count">${pending.length}</span></button>
            <button class="filter-tab ${apTab === 'done' ? 'active' : ''}" data-ap-tab="done">已处理 <span class="count">${done.length}</span></button>
          </div>
          <div class="card-extra" style="display:flex;gap:8px;align-items:center">
            <span class="hint">阈值：改价 &gt; ${R.priceChangePct}% · 退款 ≥ ${R.refundRub}₽ · 采购 ≥ ¥${R.poCny} · 取消订单</span>
            ${apTab === 'pending' && pending.length ? `<button class="btn btn-sm btn-primary" id="apApproveAll" ${isBoss ? '' : 'disabled title="仅老板可审批"'}>批量通过</button>` : ''}
          </div>
        </div>
        <div class="card-body" style="padding:0"><div class="table-wrap"><table class="data-table">
          <thead><tr><th>风险</th><th>类型</th><th>事项</th><th>变更前 → 后</th><th>原因</th><th>发起方</th><th>时间</th><th>${apTab === 'pending' ? '操作' : '结果'}</th></tr></thead>
          <tbody>${list.length ? list.map(a => `<tr>
            <td>${a.risk === 'high' ? '<span class="tag tag-red">高</span>' : '<span class="tag tag-orange">中</span>'}</td>
            <td>${esc(a.type)}</td><td><b>${esc(a.title)}</b></td>
            <td class="mono">${esc(a.before)} → ${esc(a.after)}</td>
            <td class="hint">${esc(a.reason)}</td><td>${esc(a.agent)}</td><td class="hint">${esc(a.decidedAt || a.created)}</td>
            <td>${a.status === 'pending' ? `<div style="display:flex;gap:6px"><button class="btn btn-sm btn-success" data-ap-ok="${a.id}" ${isBoss ? '' : 'disabled title="仅老板可审批"'}>通过</button><button class="btn btn-sm btn-ghost" data-ap-no="${a.id}" ${isBoss ? '' : 'disabled title="仅老板可审批"'}>驳回</button></div>` : statusTag(a)}</td>
          </tr>`).join('') : `<tr><td colspan="8" class="hint" style="text-align:center;padding:24px">${apTab === 'pending' ? '没有待审批事项。Agent 或 AI 指令台发起的高风险动作会出现在这里' : '暂无已处理记录'}</td></tr>`}</tbody>
        </table></div></div>
        ${!isBoss ? '<div class="card-body hint">当前角色可查看审批，切到「老板」角色后可通过或驳回。</div>' : ''}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">操作审计日志</div><div class="card-extra"><span class="hint">最近 ${audit.length} 条 · 当前店铺</span></div></div>
        <div class="card-body" style="padding:0"><div class="table-wrap" style="max-height:360px;overflow:auto"><table class="data-table">
          <thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象</th><th>结果</th></tr></thead>
          <tbody>${audit.length ? audit.map(l => `<tr><td class="hint">${esc(l.t)}</td><td>${esc(l.actor)}</td><td>${esc(l.action)}</td><td>${esc(l.target)}</td><td class="hint">${esc(l.result)}</td></tr>`).join('') : '<tr><td colspan="5" class="hint" style="text-align:center;padding:20px">暂无记录</td></tr>'}</tbody>
        </table></div></div>
      </div>`;
  }

  /* ================= 能力矩阵（需求地图） ================= */
  let capF = { vertical: 'all', priority: 'all', status: 'all' };
  function renderCapability() {
    const el = document.getElementById('capabilityRoot');
    const R = window.OzonFlowRequirements;
    if (!el || !R) return;
    const vName = id => (R.VERTICALS.find(v => v.id === id) || {}).name || id;
    const list = R.LIST.filter(r => (capF.vertical === 'all' || r.vertical === capF.vertical) && (capF.priority === 'all' || r.priority === capF.priority) && (capF.status === 'all' || r.status === capF.status));
    const cnt = st => R.LIST.filter(r => r.status === st).length;
    const stTag = st => ({ live: '<span class="tag tag-green">已上线</span>', partial: '<span class="tag tag-blue">部分上线</span>', planned: '<span class="tag tag-gray">规划</span>' })[st] || st;
    const prTag = p => p === 'P0' ? '<span class="tag tag-red">P0</span>' : p === 'P1' ? '<span class="tag tag-orange">P1</span>' : '<span class="tag tag-gray">P2</span>';
    const byV = R.VERTICALS.map(v => {
      const rs = R.LIST.filter(r => r.vertical === v.id);
      const cov = rs.length ? Math.round((rs.filter(r => r.status === 'live').length + rs.filter(r => r.status === 'partial').length * 0.5) / rs.length * 100) : 0;
      return { v: v, n: rs.length, cov: cov };
    });
    const ad = window.OzonFlowAdapter ? window.OzonFlowAdapter.status() : null;
    el.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card blue"><div class="kpi-label">需求总数</div><div class="kpi-value">${R.LIST.length}</div><div class="kpi-sub neutral">${R.VERTICALS.length} 个业务方向</div></div>
        <div class="kpi-card green"><div class="kpi-label">已上线</div><div class="kpi-value">${cnt('live')}</div><div class="kpi-sub up">可直接使用</div></div>
        <div class="kpi-card orange"><div class="kpi-label">部分上线</div><div class="kpi-value">${cnt('partial')}</div><div class="kpi-sub neutral">现有模块部分覆盖</div></div>
        <div class="kpi-card purple"><div class="kpi-label">规划中</div><div class="kpi-value">${cnt('planned')}</div><div class="kpi-sub neutral">P0 ${R.LIST.filter(r => r.priority === 'P0' && r.status === 'planned').length} 项待建</div></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">业务方向覆盖度</div><div class="card-extra"><span class="hint">点击方向筛选</span></div></div>
        <div class="card-body"><div class="cap-grid">${byV.map(x => `<button class="cap-cell ${capF.vertical === x.v.id ? 'active' : ''}" data-cap-v="${x.v.id}">
          <div class="cap-name">${esc(x.v.name)}</div><div class="cap-meta"><span>${x.n} 条</span><span class="mono">${x.cov}%</span></div>
          <div class="progress"><div class="progress-bar" style="width:${x.cov}%"></div></div></button>`).join('')}</div></div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="filter-tabs">
            ${['all', 'P0', 'P1', 'P2'].map(p => `<button class="filter-tab ${capF.priority === p ? 'active' : ''}" data-cap-p="${p}">${p === 'all' ? '全部优先级' : p}</button>`).join('')}
          </div>
          <div class="filter-tabs">
            ${[['all', '全部状态'], ['live', '已上线'], ['partial', '部分上线'], ['planned', '规划']].map(x => `<button class="filter-tab ${capF.status === x[0] ? 'active' : ''}" data-cap-s="${x[0]}">${x[1]}</button>`).join('')}
          </div>
          <div class="card-extra"><span class="hint">${list.length} 条${capF.vertical !== 'all' ? ' · ' + esc(vName(capF.vertical)) + ' <button class="btn btn-ghost btn-sm" data-cap-v="all">清除</button>' : ''}</span></div>
        </div>
        <div class="card-body" style="padding:0"><div class="table-wrap"><table class="data-table">
          <thead><tr><th>编号</th><th>方向</th><th>需求</th><th>痛点</th><th>AI 解法</th><th>优先级</th><th>状态</th><th>入口</th></tr></thead>
          <tbody>${list.map(r => `<tr>
            <td class="mono">${r.id}</td><td class="hint">${esc(vName(r.vertical))}</td><td><b>${esc(r.title)}</b>${r.inferred ? ' <span class="tag tag-gray" title="未找到直接公开证据">推断</span>' : ''}</td>
            <td class="hint">${esc(r.pain)}</td><td>${esc(r.solution)}</td><td>${prTag(r.priority)}</td><td>${stTag(r.status)}</td>
            <td>${r.view && VIEW_TITLES[r.view] && r.status !== 'planned' ? `<button class="btn btn-sm btn-secondary" data-nav="${r.view}">${esc(VIEW_TITLES[r.view])}</button>` : (r.evidence && r.evidence[0] ? `<a class="hint" href="${esc(r.evidence[0])}" target="_blank" rel="noopener">出处</a>` : '—')}</td>
          </tr>`).join('')}</tbody>
        </table></div></div>
      </div>
      ${ad ? `<div class="card">
        <div class="card-header"><div class="card-title">平台接入 · Ozon Seller API</div><div class="card-extra">${ad.connected ? '<span class="tag tag-green">已连接</span>' : '<span class="tag tag-orange">本地运行 · 待接入密钥</span>'}</div></div>
        <div class="card-body hint">接入时由后端代理保存 Client-Id / Api-Key，浏览器不直接持有密钥。下表是业务动作与官方端点的映射，标「需核验」的在接入时确认版本。</div>
        <div class="card-body" style="padding:0"><div class="table-wrap"><table class="data-table">
          <thead><tr><th>分组</th><th>业务动作</th><th>方法</th><th>端点</th><th>说明</th><th>备注</th></tr></thead>
          <tbody>${ad.endpoints.map(e => `<tr><td class="hint">${esc(e.group)}</td><td class="mono">${esc(e.action)}</td><td class="mono">${e.method}</td><td class="mono">${esc(e.path)}</td><td>${esc(e.desc)}</td><td class="hint">${esc(e.note || '—')}</td></tr>`).join('')}</tbody>
        </table></div></div>
      </div>` : ''}`;
  }

  /* ================= 路由与事件 ================= */
  function render(view) {
    if (view === 'copilot') renderCopilot();
    if (view === 'approvals') renderApprovals();
    if (view === 'capability') renderCapability();
  }

  function on(sel, ev, fn) {
    document.addEventListener(ev, e => { const t = e.target.closest(sel); if (t) fn(e, t); });
  }
  on('[data-cp-ex]', 'click', (e, t) => runParse(t.dataset.cpEx));
  on('#cpRun', 'click', () => { const i = document.getElementById('cpInput'); runParse(i ? i.value : ''); });
  document.addEventListener('keydown', e => {
    if (e.target && e.target.id === 'cpInput' && e.key === 'Enter' && !e.isComposing) runParse(e.target.value);
  });
  on('#cpExec', 'click', execPlan);
  on('#cpCancel', 'click', () => { plan = null; renderCopilot(); });
  on('[data-ap-tab]', 'click', (e, t) => { apTab = t.dataset.apTab; renderApprovals(); });
  on('[data-ap-ok]', 'click', (e, t) => { const r = Store.approve(t.dataset.apOk); toast(r.ok ? 'success' : 'info', r.msg); });
  on('[data-ap-no]', 'click', (e, t) => { const r = Store.reject(t.dataset.apNo); toast(r.ok ? 'info' : 'info', r.msg); });
  on('#apApproveAll', 'click', () => { const r = Store.approveAll(); toast(r.ok ? 'success' : 'info', r.msg); });
  on('[data-cap-v]', 'click', (e, t) => { capF.vertical = capF.vertical === t.dataset.capV ? 'all' : t.dataset.capV; renderCapability(); });
  on('[data-cap-p]', 'click', (e, t) => { capF.priority = t.dataset.capP; renderCapability(); });
  on('[data-cap-s]', 'click', (e, t) => { capF.status = t.dataset.capS; renderCapability(); });

  return { render, parse, VIEW_TITLES };
})();
