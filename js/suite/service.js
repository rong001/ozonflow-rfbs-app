/**
 * 客服收件箱（R36 R37）· 平台集成（R44 R48 R58 R59 R60 R61 R62）
 */
(function () {
  const F = window.OFS, Store = F.Store;
  const { esc, fmt, rub, pct, tag, btn, card, table, kpis, bar, note } = F;

  /* ===================== 客服收件箱 ===================== */
  const INTENTS = [
    { k: 'where', re: /где|когда|трек|доставк|посылк/i, zh: '物流查询', reply: 'Здравствуйте! Ваш заказ уже в пути, трек-номер: {track}. Международная доставка занимает 12–18 дней. Спасибо за терпение!' },
    { k: 'defect', re: /брак|сломал|не работает|дефект/i, zh: '质量问题', reply: 'Здравствуйте! Очень жаль, что так получилось. Пришлите, пожалуйста, фото или видео — мы предложим замену или возврат средств.' },
    { k: 'size', re: /размер|подойдет|совместим/i, zh: '尺寸/兼容', reply: 'Здравствуйте! Подробные размеры и совместимость указаны в карточке товара. Если сомневаетесь, напишите модель — подскажем.' },
    { k: 'cancel', re: /отмен|вернуть деньги|возврат/i, zh: '取消/退款', reply: 'Здравствуйте! Оформить возврат можно в личном кабинете Ozon в разделе «Мои заказы». Мы обработаем заявку в течение 24 часов.' },
  ];
  F.seed('inbox', (s, r) => {
    const msgs = ['Здравствуйте, где мой заказ? Уже 10 дней жду.', 'Наушник не работает, это брак?', 'Подойдет ли кабель для Samsung S23?', 'Хочу отменить заказ, как вернуть деньги?', 'Когда будет доставка в Казань?', 'Размер носков подойдет на 43?', 'Лампа сломалась через 3 дня.'];
    const chats = [];
    s.shops.forEach(sh => { const n = 2 + Math.floor(r() * 3); for (let i = 0; i < n; i++) { const o = F.pick(r, s.orders.filter(x => x.shopId === sh.id).concat(s.orders)); chats.push({ id: 'CH-' + (500 + chats.length), shopId: sh.id, buyer: o.buyer || 'Покупатель', orderId: o.id, text: F.pick(r, msgs), wait: Math.round(F.between(r, 0.3, 30)), replied: false, reply: '' }); } });
    return { chats };
  });
  function intentOf(t) { return INTENTS.find(i => i.re.test(t)) || { k: 'other', zh: '其他', reply: 'Здравствуйте! Спасибо за обращение, мы ответим в ближайшее время.' }; }
  const CLUSTERS = [
    { k: '质量/残次', re: /брак|сломал|не работает|перестал|дефект/i, to: '市场选品：更换货源，或把来料质检加进采购流程', view: 'market' },
    { k: '物流慢', re: /долго|доставк|ждал|задерж/i, to: '时效物流：高频城市改走更快的渠道，或转 FBO', view: 'sla' },
    { k: '描述不符', re: /не соответств|на фото|описани|другой/i, to: '内容合规：修正标题、图片和参数', view: 'content' },
    { k: '尺寸/兼容', re: /размер|маломер|совмест|не подош/i, to: '内容合规：补上尺码表和兼容型号', view: 'content' },
  ];

  F.register('inbox', {
    title: '客服收件箱',
    render() {
      const s = F.S(), ib = F.ext().inbox, st = F.uiState('inbox', { scope: 'all' });
      const chats = (st.scope === 'all' ? ib.chats : F.shop(ib.chats)).slice().sort((a, b) => (a.replied - b.replied) || (b.wait - a.wait));
      const open = chats.filter(c => !c.replied);
      const negs = (st.scope === 'all' ? s.reviews : F.shop(s.reviews)).filter(r => r.rating <= 3).map(r => r.text).concat((st.scope === 'all' ? s.returns : F.shop(s.returns)).map(r => r.reason || ''));
      const cl = CLUSTERS.map(c => ({ c, n: negs.filter(t => c.re.test(t)).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
      const shopName = id => esc((s.shops.find(x => x.id === id) || {}).name || id);
      return kpis([
        { label: '待回复会话', value: fmt(open.length), sub: `其中 ${open.filter(c => c.wait > 24).length} 个已超过 24 小时`, tone: open.length ? 'orange' : 'green' },
        { label: '覆盖店铺', value: fmt(st.scope === 'all' ? s.shops.length : 1), sub: '多店会话聚合', tone: 'blue' },
        { label: '差评/退货样本', value: fmt(negs.length), sub: '用来做根因聚类', tone: 'purple' },
        { label: '第一根因', value: cl[0] ? esc(cl[0].c.k) : '—', sub: cl[0] ? cl[0].n + ' 条' : '样本不足', tone: cl[0] ? 'red' : 'green' },
      ]) +
      card('多店买家聊天聚合（R36）', F.tabs('inbox', 'scope', [['all', '全部店铺'], ['shop', '当前店铺']], st.scope) +
        table(['会话', '店铺', '买家', '订单', '消息', '意图', '等待', 'AI 建议回复', '操作'], chats.map(c => { const it = intentOf(c.text); const o = s.orders.find(x => x.id === c.orderId); const sug = it.reply.replace('{track}', (o && o.track) || '（发货后提供）'); return [`<span class="mono">${esc(c.id)}</span>`, shopName(c.shopId), esc(c.buyer), `<span class="mono">${esc(c.orderId)}</span>`, esc(c.text), tag(it.zh, it.k === 'defect' ? 'red' : 'blue'), c.replied ? '—' : (c.wait > 24 ? tag(c.wait + 'h', 'red') : c.wait + 'h'), `<span class="hint">${esc(c.replied ? c.reply : sug)}</span>`, c.replied ? tag('已回复', 'green') : btn('发送', 'ibReply', { id: c.id }, 'btn-primary')]; })) +
        note('接入 Ozon 聊天接口（<span class="mono">/v3/chat/list</span>、<span class="mono">/v1/chat/send/message</span>，需 Premium Plus 订阅）后，会自动拉取真实会话。遇到质量问题的会话，会同时在退货异常里建一个工单。'), open.length ? btn('全部按建议回复', 'ibReplyAll', {}, 'btn-secondary') : '', { flush: true }) +
      card('差评根因聚类 → 回流选品/内容（R37）', table(['根因', '样本数', '占比', '回流动作', '操作'], cl.map(x => [tag(x.c.k, 'red'), x.n, pct(x.n / Math.max(1, negs.length) * 100, 0), esc(x.c.to), btn('去处理', '_nav', { v: x.c.view })]), '暂无差评/退货样本') + note('用俄语关键词把差评和退货原因归类，每周把占比最高的根因推给对应模块和负责人。'), '', { flush: true });
    },
  });
  F.on('_nav', d => { if (window.navigate) window.navigate(d.v); });
  function reply(c) { const it = intentOf(c.text); const o = F.S().orders.find(x => x.id === c.orderId); c.reply = it.reply.replace('{track}', (o && o.track) || '—'); c.replied = true; F.act('俄语客服 Agent', '回复买家会话', c.id, it.zh); }
  F.on('ibReply', d => { const c = F.ext().inbox.chats.find(x => x.id === d.id); reply(c); return { ok: true, msg: '已回复 ' + c.buyer }; });
  F.on('ibReplyAll', () => { let n = 0; F.ext().inbox.chats.forEach(c => { if (!c.replied) { reply(c); n++; } }); return { ok: true, msg: '已回复 ' + n + ' 个会话' }; });

  /* ===================== 平台集成 ===================== */
  const KB = [
    { k: '错误指数分档', v: '≤5% 正常 / 5.1–10% 一档 / >10% 二档', src: 'Ozon 卖家公告', date: '2026-09-22', used: '店铺健康' },
    { k: '卖家原因取消率', v: '≤10%（14 天）', src: 'Ozon 服务质量规则', date: '2026-09', used: '店铺健康' },
    { k: '逾期发货率', v: '≤10%（7 天）', src: 'Ozon 服务质量规则', date: '2026-09', used: '店铺健康 / 超时抢救' },
    { k: '财务接口迁移', v: '/v3/finance/transaction/* → /v1/finance/accrual/*', src: 'Ozon Seller API 更新日志', date: '2026-09-08', used: '财务对账 / 适配层' },
    { k: '评价/问答/聊天 API 门槛', v: '需 Premium Plus 订阅', src: 'Ozon Seller API 文档', date: '2026', used: '客服收件箱 / 适配层' },
    { k: '同一执照开店上限', v: '6 家', src: 'Ozon 卖家规则', date: '2026', used: '店铺健康' },
    { k: '海外仓出库申请时限', v: '60 天', src: 'Ozon FBO 规则', date: '2026', used: '供应链库存' },
    { k: '审批阈值', v: '', src: 'OzonFlow 内部风控', date: '可配置', used: '审批中心' },
  ];
  const MCP_RISK = { syncOrders: 'read', listPostings: 'read', shipOrder: 'write', applyWaybill: 'write', setTracking: 'write', cancelOrder: 'approval', publishListing: 'approval', categoryAttributes: 'read', setPrice: 'approval', syncInventory: 'write', actions: 'read', replyReview: 'write', answerQa: 'write', chatList: 'read', returns: 'read', finance: 'read', cashFlow: 'read' };

  function brief() {
    const s = F.S(), k = Store.kpi ? Store.kpi() : {};
    const h = F.healthOf ? F.healthOf(Store.currentShop().id) : null;
    const fin = F.financeSummary ? F.financeSummary() : { diffs: 0, leak: 0 };
    const cs = F.contentSummary ? F.contentSummary() : { low: 0, cert: 0, banned: 0 };
    const ap = Store.pendingApprovals().length;
    const lines = [
      `【OzonFlow 经营日报 · ${Store.currentShop().name} · ${new Date().toLocaleDateString('zh-CN')}】`,
      `订单：待处理 ${F.orders().filter(o => o.status !== 'shipped' && o.status !== 'cancelled').length} 单，临期（≤6h）${F.orders().filter(o => o.status !== 'shipped' && o.etaH != null && o.etaH <= 6).length} 单。`,
      h ? `健康：错误指数 ${h.m.errIndex.toFixed(1)}%（${h.tier.label}），风险分 ${h.risk}。` : '',
      `财务：对账差异 ${fin.diffs} 笔，利润漏损约 ${Math.round(fin.leak)}₽。`,
      `广告：亏损广告 ${F.adsSummary ? F.adsSummary() : 0} 个。内容：低分商品 ${cs.low} 个，证书预警 ${cs.cert} 个，风险词 ${cs.banned} 个。`,
      `待老板审批 ${ap} 项。今日 Agent 已处理 ${s.agentTodayTotal || 0} 项。`,
    ].filter(Boolean);
    return lines.join('\n');
  }
  F.brief = brief;

  F.register('platform', {
    title: '平台集成',
    render() {
      const s = F.S(), A = window.OzonFlowAdapter, st = A ? A.status() : { mode: 'offline', endpoints: [] };
      const R = Store.APPROVAL_RULES; KB[KB.length - 1].v = `改价 >${R.priceChangePct}% · 退款 ≥${R.refundRub}₽ · 采购 ≥¥${R.poCny} · 取消订单 · 暂停广告 · 低于底价报名 · 申诉 · 侵权投诉`;
      const deprecated = st.endpoints.filter(e => /停用|迁移/.test(e.note || ''));
      const gated = st.endpoints.filter(e => /订阅/.test(e.note || ''));
      const ui = F.uiState('platform', { brief: '' });
      return kpis([
        { label: 'API 连接', value: st.connected ? '已连接' : '离线模式', sub: st.connected ? '通过后端代理' : '需配置代理和 Client-Id / Api-Key', tone: st.connected ? 'green' : 'orange' },
        { label: '已映射端点', value: fmt(st.endpoints.length), sub: `废弃迁移 ${deprecated.length} · 订阅门槛 ${gated.length}`, tone: 'blue' },
        { label: '规则知识条目', value: fmt(KB.length), sub: '每条都标了来源和日期', tone: 'purple' },
        { label: '可供 Agent 调用的工具', value: fmt(st.endpoints.length), sub: '写操作需审批', tone: 'blue' },
      ]) +
      card('Ozon Seller API 适配层（R60）', `<div class="ofs-form">
          <label class="ofs-field"><span>模式</span><select class="ofs-mini-input" data-ofs-change="apiMode"><option value="offline"${st.mode === 'offline' ? ' selected' : ''}>离线（本地数据层）</option><option value="proxy"${st.mode === 'proxy' ? ' selected' : ''}>代理（真实店铺）</option></select></label>
          <label class="ofs-field"><span>后端代理地址</span><input class="ofs-mini-input" style="width:300px" placeholder="https://your-server/ozon" value="${esc(A ? A.config.proxyBase : '')}" data-ofs-change="apiProxy"></label>
          ${btn('测试连接', 'apiTest', {}, 'btn-primary')}
        </div>` + note('密钥不进浏览器。仓库里的 <span class="mono">server/ozon-proxy.js</span> 是一个零依赖的 Node 代理：在服务器上用环境变量 <span class="mono">OZON_CLIENT_ID</span>、<span class="mono">OZON_API_KEY</span> 启动，再把代理地址填到这里，就能切到真实店铺。') + (ui.test ? `<p class="hint">${esc(ui.test)}</p>` : '')) +
      `<div class="ofs-grid-2">` +
      card('API 废弃 / 迁移监控（R61）', table(['动作', '端点', '说明'], deprecated.concat(st.endpoints.filter(e => /需核验/.test(e.note || ''))).map(e => [`<span class="mono">${esc(e.action)}</span>`, `<span class="mono">${esc(e.path)}</span>`, /需核验/.test(e.note) ? tag('需核验版本', 'orange') : tag(e.note, 'red')])) + note('接入后每天比对 Ozon 官方更新日志，发现端点被停用就告警，并切换到替代端点。'), '', { flush: true }) +
      card('订阅门槛识别（R62）', table(['动作', '端点', '门槛'], gated.map(e => [`<span class="mono">${esc(e.action)}</span>`, `<span class="mono">${esc(e.path)}</span>`, tag(e.note, 'purple')])) + note('如果返回 403 且提示订阅不足，会标为“需升级 Premium Plus”，并自动改成人工处理，不会反复重试。'), '', { flush: true }) + `</div>` +
      card('平台规则知识库（R58）', table(['规则', '当前值', '来源', '日期', '用在'], KB.map(r => [esc(r.k), `<b>${esc(r.v)}</b>`, esc(r.src), esc(r.date), esc(r.used)])) + note('阈值按“来源 + 日期”结构化存放，Ozon 规则一变，这里改一处，所有页面和 Agent 一起更新。接入大模型后，可以直接问规则原文。'), '', { flush: true }) +
      card('Agent 通过 MCP 调用 Ozon API（R59）', table(['工具名', 'HTTP', '端点', '权限'], st.endpoints.map(e => [`<span class="mono">ozon_${esc(e.action)}</span>`, e.method, `<span class="mono">${esc(e.path)}</span>`, (MCP_RISK[e.action] || 'write') === 'read' ? tag('只读 · 自动', 'green') : (MCP_RISK[e.action] === 'approval' ? tag('写 · 必须审批', 'red') : tag('写 · 记审计', 'orange'))])) + note('每个端点都按 MCP 工具描述导出（名称、参数、权限），大模型 Agent 只能经过这一层调用：只读的自动执行，写入的记审计，改价和上架必须先审批。'), btn('导出 MCP 工具清单', 'mcpExport', {}, 'btn-secondary'), { flush: true }) +
      `<div class="ofs-grid-2">` +
      card('每日经营简报（R48）', `<textarea class="ofs-brief" readonly aria-label="今日简报">${esc(ui.brief || brief())}</textarea>` + note('简报每天 08:30 生成。推送到企业微信、钉钉、Telegram 或邮件需要先授权对应渠道，目前可以复制后手动发送。'), btn('复制简报', 'briefCopy', {}, 'btn-primary')) +
      card('多店分区 + 角色权限（R44）', table(['角色', '可见页面'], Object.values(Store.ROLES).map(r => [esc(r.label), `<span class="hint">${Store.ROLE_VIEWS[r.id].length} 个页面</span>`])) + note('新增“财务”角色：可以看财务对账、利润定价、推广和店铺健康，但不能发货或改商品。各店数据按当前店铺分区，切换店铺后所有页面会同步切换。'), btn('切换到财务角色', 'roleFin', {}, 'btn-ghost'), { flush: true }) + `</div>`;
    },
  });
  F.on('apiMode', (d, el) => { const A = window.OzonFlowAdapter; A.configure({ mode: el.value }); F.act(Store.roleLabel(), 'API 模式', '适配层', el.value); return { ok: true, msg: '已切换为' + (el.value === 'proxy' ? '代理模式' : '离线模式') }; });
  F.on('apiProxy', (d, el) => { window.OzonFlowAdapter.configure({ proxyBase: el.value.trim() }); return { ok: true, msg: '代理地址已保存' }; });
  F.on('apiTest', () => {
    const A = window.OzonFlowAdapter, u = F.uiState('platform');
    if (A.config.mode !== 'proxy' || !A.config.proxyBase) { u.test = '当前是离线模式：所有动作在本地数据层执行，不会发网络请求。'; F.render('platform'); return; }
    u.test = '正在连接 ' + A.config.proxyBase + ' …'; F.render('platform');
    A.ping().then(r => { u.test = r.ok ? '连接成功：' + (r.msg || '代理已就绪') : '连接失败：' + (r.msg || r.status); A.configure({ apiKeyConfigured: !!r.ok }); F.render('platform'); });
  });
  F.on('mcpExport', () => {
    const A = window.OzonFlowAdapter; const tools = A.ENDPOINTS.map(e => ({ name: 'ozon_' + e.action, description: e.desc + '（' + e.method + ' ' + e.path + '）', permission: MCP_RISK[e.action] || 'write', inputSchema: { type: 'object', additionalProperties: true } }));
    const blob = new Blob([JSON.stringify({ server: 'ozonflow-ozon-seller', tools }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ozonflow-mcp-tools.json'; a.click();
    return { ok: true, msg: '已导出 ' + tools.length + ' 个工具定义' };
  });
  F.on('briefCopy', () => { const t = brief(); F.uiState('platform').brief = t; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => F.toast('success', '简报已复制'), () => F.toast('info', '浏览器不允许复制，请手动选择文本')); });
  F.on('roleFin', () => { Store.setRole('finance'); });
})();
