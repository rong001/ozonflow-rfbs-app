/**
 * 数据连接（免 Api-Key）：浏览器插件捕获卖家后台数据 · 报表导入 · 公开价格采集 · 菜鸟轨迹 · 推送 · 以图搜货 · MCP 数据导出
 * R06 R08 R31 R33 R40 R48 R59 R60 R61 R62
 */
(function () {
  const F = window.OFS, Store = F.Store, N = window.OzonFlowNormalize;
  const { esc, fmt, rub, tag, btn, card, table, kpis, note } = F;

  /* ---------- 插件消息桥 ---------- */
  const Ext = { ver: document.documentElement.dataset.ozfExt || null, seq: 0, pending: {}, info: null };
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.__ozfExt !== 1) return;
    if (e.data.type === 'hello') { Ext.ver = e.data.version; if (!Ext.info && !Ext.loading) Ext.refresh(); return; }
    const p = Ext.pending[e.data.id]; if (!p) return; delete Ext.pending[e.data.id];
    e.data.ok ? p.resolve(e.data.data) : p.reject(new Error(e.data.error || '插件返回错误'));
  });
  Ext.call = function (type, payload, timeout) {
    return new Promise((resolve, reject) => {
      if (!Ext.ver) return reject(new Error('未检测到 OzonFlow 连接器插件'));
      const id = ++Ext.seq; Ext.pending[id] = { resolve, reject };
      window.postMessage({ __ozfApp: 1, id, type, payload }, location.origin);
      setTimeout(() => { if (Ext.pending[id]) { delete Ext.pending[id]; reject(new Error('插件响应超时')); } }, timeout || 90000);
    });
  };
  Ext.refresh = function () {
    Ext.loading = true;
    return Ext.call('ping').then(r => { Ext.info = Object.assign(Ext.info || {}, r); return Ext.call('pull'); })
      .then(r => { Ext.observed = r.observed; Ext.info.log = r.captured && r.captured.log; Ext.loading = false; Store.emit('ext'); return Ext.info; })
      .catch(e => { Ext.loading = false; throw e; });
  };
  window.postMessage({ __ozfApp: 1, type: 'hello' }, location.origin);
  F.Ext = Ext;

  F.seed('connect', () => ({ imports: [], prices: {}, tracks: {}, push: { hooks: [], time: '08:30', notify: false, lastSent: '' }, imgUrl: '', syncLog: [] }));
  const C = () => F.ext().connect;
  const log = (what, n) => { C().syncLog.unshift({ t: Store.nowLabel(), what, n }); C().syncLog.length = Math.min(C().syncLog.length, 20); };

  /* ---------- 映射到 OzonFlow 数据 ---------- */
  const ST = [
    [/awaiting_registration|acceptance|awaiting_approve|awaiting_packaging|ожидает (сборки|регистрации|подтвержд)|^new$/i, 'audit', '待审核'],
    [/awaiting_deliver|ожидает отгрузки|готов к отгрузке/i, 'ship', '待发货'],
    [/deliver|driver_pickup|sent_by_seller|arbitration|достав|в пути|отгружен|передан/i, 'shipped', '已发货'],
    [/cancel|отмен/i, 'cancelled', '已取消'],
  ];
  function mapStatus(s) { for (const [re, st, label] of ST) if (re.test(s || '')) return { st, label }; return { st: 'audit', label: '待审核' }; }
  function findProduct(item) {
    const ps = F.S().products;
    return ps.find(p => item.offerId && (p.sku === item.offerId || p.offerId === item.offerId)) || ps.find(p => item.sku && p.ozonSku === item.sku) || ps.find(p => item.name && p.ru && item.name.toLowerCase().includes(String(p.ru).toLowerCase().slice(0, 12))) || null;
  }
  function etaFrom(shipBy) { const t = Date.parse(shipBy); return isNaN(t) ? null : Math.round((t - Date.now()) / 3600000); }
  function mergeOrders(list, src) {
    const s = F.S(), shopId = Store.currentShop().id; let added = 0, updated = 0;
    list.forEach(o => {
      const it = o.items[0] || {}; const p = findProduct(it); const m = mapStatus(o.status);
      const ex = s.orders.find(x => x.id === o.id);
      const base = { status: m.st, statusLabel: m.label, etaH: m.st === 'shipped' || m.st === 'cancelled' ? null : etaFrom(o.shipBy), track: o.track || (ex && ex.track) || null, city: o.city || (ex && ex.city) || '—', amount: Math.round(o.amount) || (ex && ex.amount) || 0, ozonStatus: o.status, source: src };
      if (ex) { Object.assign(ex, base); updated++; return; }
      s.orders.unshift(Object.assign({
        id: o.id, shopId, emoji: p ? p.emoji : '📦', name: p ? p.name : (it.name || it.offerId || '商品'), buyer: '—', logistics: '—', logisticsId: null, auto: [], risk: false,
        weight: p ? p.weight : 300, sku: p ? p.sku : (it.offerId || it.sku), cost: p ? p.cost : 0, note: o.orderNumber ? 'Ozon 订单 ' + o.orderNumber : '',
        timeline: [{ t: o.inProcessAt ? String(o.inProcessAt).slice(0, 16).replace('T', ' ') : Store.nowLabel(), text: '同步自 Ozon 卖家后台（' + src + '）', done: true }],
      }, base));
      added++;
    });
    s.orders.forEach(o => { if (o.etaH != null && o.etaH <= 6 && o.status !== 'shipped' && o.status !== 'cancelled') o.risk = true; });
    return { added, updated };
  }
  function classify(type) {
    const t = String(type).toLowerCase();
    if (/комисси|вознагражд|commission/.test(t)) return 'commission';
    if (/эквайр|acquir/.test(t)) return 'acq';
    if (/штраф|пени|неустой|penalt/.test(t)) return 'penalty';
    if (/возврат|return|refund/.test(t)) return 'ret';
    if (/достав|логист|магистрал|обработк|сборк|last.?mile|deliver|ship/.test(t)) return 'ship';
    return 'sale';
  }
  function mergeFinance(list, src) {
    const s = F.S(), fin = F.ext().finance, shopId = Store.currentShop().id, fx = s.settings.fx;
    const by = {};
    list.forEach(f => { const k = f.posting || f.id; (by[k] = by[k] || []).push(f); });
    let added = 0;
    Object.keys(by).forEach(k => {
      const id = 'OZ-' + k; if (fin.lines.some(l => l.id === id)) return;
      const ops = by[k]; const agg = { sale: 0, commission: 0, acq: 0, penalty: 0, ret: 0, ship: 0 };
      ops.forEach(f => {
        let c = classify(f.type); const a = +f.amount || 0, fc = Math.abs(f.commission || 0), fd = Math.abs(f.delivery || 0), fs_ = Math.abs(f.services || 0);
        if (a > 0 && c !== 'ret') c = 'sale';
        if (c === 'sale') agg.sale += a + fc + fd + fs_;   // API 的 amount 是净额，加回佣金和服务费得到售价
        else agg[c] += Math.abs(a);
        agg.commission += fc; agg.ship += fd + fs_;
      });
      const o = s.orders.find(x => x.id === k); const p = o ? s.products.find(x => x.sku === o.sku) : null;
      const price = agg.sale || (o && o.amount) || 0; if (!price && !agg.penalty) return;
      const exp = p ? Store.calcProfit({ price, costCNY: p.cost, weight: p.weight || 300 }) : Store.calcProfit({ price, costCNY: 0, weight: 300 });
      const line = { id, shopId, sku: p ? p.sku : (o ? o.sku : k), name: p ? p.name : (o ? o.name : '订单 ' + k), date: String((ops[0] || {}).date || '').slice(5, 10) || Store.nowLabel().slice(0, 5), price,
        expProfit: exp.profit, commission: agg.commission, ship: agg.ship, acq: agg.acq, penalty: agg.penalty, ret: agg.ret, costRUB: exp.costRUB, retProv: exp.retProv, status: 'settled', diffNote: '', fxOrder: fx, fxSettle: fx, checked: false, source: src };
      const act = line.price - line.ret - line.costRUB - line.commission - line.ship - line.acq - line.penalty;
      if (Math.abs(act - line.expProfit) > 30) line.diffNote = !p ? '未匹配到本地商品，成本按 0 计' : line.penalty ? '罚款 / 扣款' : line.ret ? '退货冲回' : line.commission > exp.commission * 1.1 ? '佣金高于类目费率' : line.ship > exp.ship * 1.2 ? '物流费高于测算' : '实结与测算不一致';
      fin.lines.unshift(line); added++;
    });
    return { added };
  }

  /* ---------- 视图 ---------- */
  F.register('connect', {
    title: '数据连接',
    render() {
      const s = F.S(), c = C(), info = Ext.info || {}, cnt = info.counts || { orders: 0, finance: 0, products: 0 };
      const ps = F.products(); const shipped = F.orders().filter(o => o.status === 'shipped' && o.track);
      const real = s.orders.filter(o => o.source).length;
      const zipUrl = 'ozonflow-connector.zip';
      return kpis([
        { label: '浏览器插件', value: Ext.ver ? '已连接 v' + esc(Ext.ver) : '未安装', sub: Ext.ver ? '在卖家后台浏览即自动捕获' : '安装后无需 Api-Key', tone: Ext.ver ? 'green' : 'orange' },
        { label: '插件已捕获', value: fmt(cnt.orders + cnt.finance + cnt.products), sub: `订单 ${cnt.orders} · 结算 ${cnt.finance} · 商品 ${cnt.products}`, tone: 'blue' },
        { label: '已并入真实订单', value: fmt(real), sub: '来自插件或报表导入', tone: real ? 'green' : 'purple' },
        { label: '比价已采集', value: fmt(Object.values(c.prices).filter(r => r.ozon || r.wb).length), sub: '来自 Ozon / WB 前台公开价', tone: 'blue' },
      ]) +
      card('① Ozon 卖家后台直连（免 Api-Key · R60）', `<div class="ofs-grid-2" style="gap:16px">
        <div>
          <ol class="ofs-steps">
            <li>下载 <a href="${zipUrl}" download>OzonFlow 连接器插件</a> 并解压。</li>
            <li>Chrome 或 Edge 打开 <span class="mono">chrome://extensions</span>，打开右上角“开发者模式”，点“加载已解压的扩展程序”，选择解压后的文件夹。</li>
            <li>正常登录 <a href="https://seller.ozon.ru/app/postings/fbs" target="_blank" rel="noopener">Ozon 卖家后台</a>，依次打开订单、财务（结算 / 交易）和商品列表页面，插件会在页面右下角显示已捕获的数量。</li>
            <li>回到这里点“从插件同步”。</li>
          </ol>
        </div>
        <div>
          ${table(['最近捕获', '订单', '结算', '商品'], ((Ext.info && Ext.info.log) || []).slice(0, 5).map(l => [esc(l.url), l.o, l.f, l.p]), Ext.ver ? '还没有捕获记录：去卖家后台打开订单页即可' : '安装插件后显示')}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${btn('从插件同步', 'cnPull', {}, 'btn-primary')}${btn('刷新插件状态', 'cnPing', {}, 'btn-secondary')}${Ext.ver ? btn('清空插件缓存', 'cnClear', {}, 'btn-ghost') : ''}</div>
          ${info.gated ? '<p class="hint" style="margin-top:8px">' + tag('检测到 Premium 订阅门槛', 'purple') + ' 部分接口需要升级 Premium Plus，相关功能已改为人工处理（R62）。</p>' : ''}
        </div></div>` + note('原理：插件只在你已登录的卖家后台页面里，旁路读取后台自己加载的数据（订单、结算、商品），不额外发请求、不保存密码、不需要 Api-Key，数据只在你自己的浏览器里。以后拿到 Api-Key，也可以改走“平台集成”页的服务器代理。')) +
      card('② 报表导入（不装插件也能用 · R40）', `<div class="ofs-form">
          <label class="ofs-field"><span>Ozon 后台导出的订单或财务报表（CSV / XLSX）</span><input type="file" class="ofs-mini-input" accept=".csv,.txt,.xlsx,.xls" data-ofs-change="cnFile" style="height:auto;padding:6px"></label>
        </div>` + table(['时间', '文件', '类型', '识别行数', '结果'], c.imports.slice(0, 6).map(i => [esc(i.t), esc(i.file), tag(i.kind === 'orders' ? '订单' : i.kind === 'finance' ? '结算' : '未识别', i.kind === 'unknown' ? 'red' : 'blue'), i.rows, esc(i.result)]), '还没有导入记录') +
        note('在卖家后台的“订单 → 导出”或“财务 → 报告”下载 CSV/Excel，直接拖进来即可，系统会按俄文表头（Номер отправления、Статус、Дата отгрузки、Тип начисления…）自动识别。订单会并入“订单履约”，结算会进入“财务对账”逐单核对。')) +
      card('③ 同款公开价格采集（R06 · R04）', table(['商品', '搜索词', 'Ozon 最低 / 中位', 'WB 最低 / 中位', '采集时间', '链接'], ps.map(p => { const r = c.prices[p.sku]; const q = p.ru || p.name; return [esc(p.name), `<span class="hint">${esc(q)}</span>`, r && r.ozon ? rub(r.ozon.min) + ' / ' + rub(r.ozon.median) : (r && r.errors && r.errors.some(e => /Ozon/.test(e)) ? tag('受限', 'orange') : '—'), r && r.wb ? rub(r.wb.min) + ' / ' + rub(r.wb.median) : (r && r.errors && r.errors.some(e => /WB/.test(e)) ? tag('受限', 'orange') : '—'), r ? esc(r.t) : '—', `<a href="https://www.ozon.ru/search/?text=${encodeURIComponent(q)}&sorting=price" target="_blank" rel="noopener">Ozon</a> · <a href="https://www.wildberries.ru/catalog/0/search.aspx?search=${encodeURIComponent(q)}" target="_blank" rel="noopener">WB</a>`]; })) +
        note('采集由插件在你自己的浏览器里完成，用的是你的网络和浏览器，所以不会被平台当作机器人拦截（服务器直接抓取会被 Ozon 和 WB 风控拒绝，这一点已经实测）。采集到的最低价会写进“价格竞争”的价格指数。平时在 Ozon/WB 打开的商品页，也会自动记下价格。'), btn('采集全部同款价格', 'cnPrices', {}, 'btn-primary'), { flush: true }) +
      `<div class="ofs-grid-2">` +
      card('④ 物流轨迹公开查询（R31 · R33）', table(['订单', '运单号', '最新轨迹', '状态'], shipped.slice(0, 12).map(o => { const t = c.tracks[o.track]; return [`<span class="mono">${esc(o.id)}</span>`, `<a class="mono" href="https://global.cainiao.com/newDetail.htm?mailNoList=${encodeURIComponent(o.track)}" target="_blank" rel="noopener">${esc(o.track)}</a>`, t && t.last ? `<span class="hint">${esc(t.last.time)} ${esc(t.last.desc)}</span>` : '<span class="hint">—</span>', t ? tag(t.statusDesc || t.status, /DELIVER|签收|妥投/i.test(t.status + t.statusDesc) ? 'green' : t.status === 'NOT_FOUND' ? 'gray' : 'blue') : '—']; }), '当前店铺没有带运单号的已发货订单') +
        note('使用菜鸟国际的公开查询接口，云途、燕文、菜鸟等跨境渠道的单号都能查，不需要任何 Key。没装插件时，点单号可以直接打开菜鸟查询页。'), btn('刷新全部轨迹', 'cnTrack', {}, 'btn-secondary'), { flush: true }) +
      card('⑤ 以图搜货 / 断货换供（R08）', `<div class="ofs-form"><label class="ofs-field" style="flex:1"><span>商品图片地址（Ozon 商品页右键“复制图片地址”）</span><input class="ofs-mini-input" style="width:100%" placeholder="https://ir.ozone.ru/…jpg" value="${esc(c.imgUrl)}" data-ofs-change="cnImg"></label></div>
        ${c.imgUrl ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="https://s.1688.com/youyuan/index.htm?tab=imageSearch&imageAddress=${encodeURIComponent(c.imgUrl)}">1688 以图搜货</a>
          <a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="https://yandex.ru/images/search?rpt=imageview&url=${encodeURIComponent(c.imgUrl)}">Яндекс 同款</a>
          <a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="https://lens.google.com/uploadbyurl?url=${encodeURIComponent(c.imgUrl)}">Google Lens</a>
          <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.aliexpress.com/w/wholesale.html?SearchText=${encodeURIComponent(c.imgUrl.split('/').pop() || '')}">速卖通</a></div>` : ''}
        ${table(['在 Ozon/WB 浏览过的商品', '价格', '找货源'], Object.values((Ext.observed || {})).slice(-6).reverse().map(o => [esc(String(o.title || '').slice(0, 40)), rub(o.price), o.image ? `<a target="_blank" rel="noopener" href="https://s.1688.com/youyuan/index.htm?tab=imageSearch&imageAddress=${encodeURIComponent(o.image)}">1688 同款</a>` : '—']), Ext.ver ? '在 Ozon/WB 打开商品页后会出现在这里' : '安装插件后，浏览过的商品会自动列在这里')}` +
        note('用图片地址直接跳转到 1688 拍立淘、Яндекс 图片和 Google Lens 搜同款，换供时可以对比价格和起订量。')) + `</div>` +
      `<div class="ofs-grid-2">` +
      card('⑥ 简报推送：浏览器通知 + 群机器人（R48）', `<div class="ofs-form">
          <label class="ofs-field"><span>类型</span><select class="ofs-mini-input" id="cnHookKind"><option value="wecom">企业微信群机器人</option><option value="dingtalk">钉钉群机器人</option><option value="feishu">飞书群机器人</option><option value="telegram">Telegram Bot</option><option value="generic">通用 Webhook</option></select></label>
          <label class="ofs-field" style="flex:1"><span>Webhook 地址（Telegram 填 bot令牌|chat_id）</span><input class="ofs-mini-input" style="width:100%" id="cnHookUrl" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…"></label>
          ${btn('添加', 'cnHookAdd', {}, 'btn-secondary')}
        </div>` + table(['渠道', '地址', '操作'], c.push.hooks.map((h, i) => [esc(h.name), `<span class="mono hint">${esc((h.url || h.chatId || '').slice(0, 46))}…</span>`, btn('移除', 'cnHookDel', { i }, 'btn-ghost')]), '还没有添加群机器人') +
        `<div class="ofs-form" style="margin-top:10px"><label class="ofs-field"><span>每日推送时间</span><input type="time" class="ofs-mini-input" value="${esc(c.push.time)}" data-ofs-change="cnTime"></label>
         <label class="ofs-check" style="align-self:flex-end"><input type="checkbox" ${c.push.notify ? 'checked' : ''} data-ofs-change="cnNotify"> <span>桌面通知</span></label>
         ${btn('立即推送今日简报', 'cnPushNow', {}, 'btn-primary')}</div>` +
        note('群机器人只需要在群设置里“添加机器人”拿到一个 Webhook 地址，不需要申请开放平台的 Key。装了插件后，即使 OzonFlow 页面关着，也会按时推送；没装插件时，页面开着就会按时推送。上次推送：' + esc(c.push.lastSent || '—'))) +
      card('⑦ 给 AI Agent 用：MCP 服务与数据导出（R59 · R61）', `<p class="hint">仓库里的 <span class="mono">server/mcp-ozonflow.js</span> 是一个零依赖的 MCP 服务。把这里导出的经营数据交给它，Claude、Cursor 等 AI 助手就能直接查询订单、利润、健康分和对账差异；写操作只会生成待审批的建议，不会直接执行。</p>
        <pre class="ofs-code">node server/mcp-ozonflow.js --state ./ozonflow-state.json</pre>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${btn('导出经营数据 JSON', 'cnExport', {}, 'btn-primary')}${btn('检查 Ozon API 文档变化', 'cnDocs', {}, 'btn-secondary')}</div>
        <label class="ofs-field" style="margin-top:10px"><span>导入 AI 助手提交的改价建议（ozonflow-pending.json，全部进审批中心）</span><input type="file" accept=".json" class="ofs-mini-input" style="height:auto;padding:6px" data-ofs-change="cnPending"></label>
        ${info.docs ? `<p class="hint" style="margin-top:8px">文档快照 ${esc(String(info.docs.checked).slice(0, 16).replace('T', ' '))} · 端点 ${info.docs.paths.length} 个 ${info.docs.changed ? tag('有变化：新增 ' + info.docs.added.length + ' / 移除 ' + info.docs.removed.length, 'red') : tag('无变化', 'green')}</p>` : ''}` +
        note('插件每周自动对比一次 Ozon Seller API 文档里的端点清单，发现新增或下线就桌面提醒（R61）。')) + `</div>` +
      card('⑧ 自建部署后端（可选）', `<p class="hint">若用 Docker / <span class="mono">npm start</span> 启动了本仓库后端，可在「平台集成 → 自建部署」填写 API 基址与部署令牌，把经营状态同步到服务器；连接器在本页同步时也会尝试向 <span class="mono">/api/connector/ingest</span> 推送捕获数据。详见 <span class="mono">DEPLOY.md</span>。</p>` + note('无 Api-Key：读链路走连接器；发货 / 回传运单 / 面单由连接器在已登录的卖家后台执行（启发式点击，失败则打开对应订单 + 预填剪贴板 + 步骤提示，不会假装已发货）。有 Key 后同一按钮改走 <span class="mono">/api/ozon/ship|tracking|waybill</span>。')) +
      card('同步记录', table(['时间', '动作', '结果'], c.syncLog.map(l => [esc(l.t), esc(l.what), esc(l.n)]), '还没有同步记录'), '', { flush: true });
    },
  });

  /* ---------- 动作 ---------- */
  const rerender = () => { Store.emit('connect'); };
  const needExt = () => ({ ok: false, msg: '请先安装 OzonFlow 连接器插件（页面第 ① 步）' });
  F.on('cnPing', () => { if (!Ext.ver) return needExt(); Ext.refresh().then(() => F.toast('success', '插件状态已刷新')).catch(e => F.toast('info', e.message)); });
  F.on('cnClear', () => { Ext.call('clear').then(() => Ext.call('ping')).then(r => { Ext.info = r; rerender(); F.toast('success', '已清空插件缓存'); }); });
  F.on('cnPull', () => {
    if (!Ext.ver) return needExt();
    Ext.call('pull').then(r => {
      const cap = r.captured; Ext.observed = r.observed;
      if (!cap) { F.toast('info', '插件还没有捕获数据：请先在 Ozon 卖家后台打开订单或财务页面'); return; }
      const o = mergeOrders(Object.values(cap.orders || {}), '插件'); const f = mergeFinance(Object.values(cap.finance || {}), '插件');
      const msg = `订单新增 ${o.added}、更新 ${o.updated}；结算新增 ${f.added} 笔`; Ext.refresh().catch(() => {});
      log('插件同步', msg); F.act('数据连接', '从插件同步', Store.currentShop().name, msg); F.toast('success', msg); rerender();
    }).catch(e => F.toast('info', e.message));
  });
  F.on('cnFile', (d, el) => {
    const file = el.files && el.files[0]; if (!file) return;
    const done = rows => {
      const res = N.fromRows(rows); let result = '未识别表头';
      if (res.kind === 'orders') { const m = mergeOrders(res.orders, '报表'); result = `订单新增 ${m.added}、更新 ${m.updated}`; }
      if (res.kind === 'finance') { const m = mergeFinance(res.finance, '报表'); result = `结算新增 ${m.added} 笔（按订单号合并）`; }
      C().imports.unshift({ t: Store.nowLabel(), file: file.name, kind: res.kind, rows: res.orders.length + res.finance.length, result });
      log('报表导入 ' + file.name, result); F.act('数据连接', '导入报表', file.name, result); F.toast(res.kind === 'unknown' ? 'info' : 'success', result); el.value = ''; rerender();
    };
    if (/\.xlsx?$/i.test(file.name)) {
      loadXLSX().then(X => file.arrayBuffer().then(buf => { const wb = X.read(buf, { type: 'array' }); const sh = wb.Sheets[wb.SheetNames[0]]; done(X.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '' })); })).catch(e => F.toast('info', 'Excel 解析失败：' + e.message + '，可在 Excel 里另存为 CSV 再导入'));
    } else {
      file.arrayBuffer().then(buf => { let text = new TextDecoder('utf-8').decode(buf); if (/\uFFFD/.test(text.slice(0, 2000))) text = new TextDecoder('windows-1251').decode(buf); done(N.parseCSV(text)); });
    }
  });
  let xlsxP = null;
  function loadXLSX() { if (window.XLSX) return Promise.resolve(window.XLSX); return xlsxP || (xlsxP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'; s.onload = () => res(window.XLSX); s.onerror = () => { xlsxP = null; rej(new Error('Excel 解析库加载失败')); }; document.head.appendChild(s); })); }

  function applyPrice(sku, r) {
    const cmp = F.ext().compete; if (!cmp[sku]) cmp[sku] = { followers: [], market: {}, newCost: null };
    const m = cmp[sku].market; if (r.ozon) m.ozonMin = r.ozon.min; if (r.wb) m.wb = r.wb.min; cmp[sku].marketSrc = { t: r.t, real: true };
  }
  F.on('cnPrices', () => {
    if (!Ext.ver) return needExt();
    const ps = F.products(); F.toast('info', '正在采集 ' + ps.length + ' 个商品的同款价格，约需 ' + Math.ceil(ps.length * 1.5) + ' 秒');
    Ext.call('prices', { queries: ps.map(p => ({ key: p.sku, q: p.ru || p.name })) }, 180000).then(r => {
      let ok = 0; (r.rows || []).forEach(row => { row.t = Store.nowLabel(); C().prices[row.key] = row; if (row.ozon || row.wb) { applyPrice(row.key, row); ok++; } });
      const errs = (r.rows || []).flatMap(x => x.errors || []); const msg = `采集成功 ${ok}/${ps.length}` + (errs.length ? `，${errs.length} 次受限（${esc(errs[0])}）` : '');
      log('同款价格采集', msg); F.act('数据连接', '采集公开价格', ps.length + ' 个商品', msg); F.toast(ok ? 'success' : 'info', msg); rerender();
    }).catch(e => F.toast('info', e.message));
  });
  F.on('cnTrack', () => {
    const os = F.orders().filter(o => o.status === 'shipped' && o.track); if (!os.length) return { ok: false, msg: '没有需要查询的运单' };
    const go = Ext.ver ? Ext.call('track', { nums: os.map(o => o.track) }).then(r => r.tracks) : fetch('https://global.cainiao.com/global/detail.json?lang=zh-CN&mailNos=' + encodeURIComponent(os.map(o => o.track).slice(0, 10).join(','))).then(r => r.json()).then(N.parseCainiao);
    go.then(tr => {
      let n = 0, found = 0; Object.keys(tr).forEach(k => { C().tracks[k] = tr[k]; n++; const o = os.find(x => x.track === k); const t = tr[k]; if (o && t.last) { found++; o.lastTrackAt = t.last.time; if (/DELIVER|签收|妥投/i.test(t.status + t.statusDesc)) o.trackStatus = 'delivered'; o.timeline = (o.timeline || []).concat([{ t: t.last.time, text: '轨迹：' + t.last.desc, done: true }]).slice(-12); } });
      const msg = `已查询 ${n} 个运单，${found} 个有轨迹`; log('物流轨迹', msg); F.toast('success', msg); rerender();
    }).catch(e => F.toast('info', Ext.ver ? e.message : '浏览器直接查询被跨域拦截，请安装插件，或点击单号打开菜鸟查询页'));
  });
  F.on('cnImg', (d, el) => { C().imgUrl = el.value.trim(); return { ok: true, msg: '已生成以图搜货链接' }; });

  function hookFromForm() {
    const kind = document.getElementById('cnHookKind').value, raw = document.getElementById('cnHookUrl').value.trim();
    const names = { wecom: '企业微信', dingtalk: '钉钉', feishu: '飞书', telegram: 'Telegram', generic: 'Webhook' };
    if (!raw) return null;
    if (kind === 'telegram') { const [token, chatId] = raw.split('|'); return { kind, name: names[kind], token: (token || '').trim(), chatId: (chatId || '').trim() }; }
    return { kind, name: names[kind], url: raw };
  }
  F.on('cnHookAdd', () => { const h = hookFromForm(); if (!h) return { ok: false, msg: '请填写 Webhook 地址' }; C().push.hooks.push(h); syncPushCfg(); return { ok: true, msg: '已添加 ' + h.name }; });
  F.on('cnHookDel', d => { C().push.hooks.splice(+d.i, 1); syncPushCfg(); return { ok: true, msg: '已移除' }; });
  F.on('cnTime', (d, el) => { C().push.time = el.value; syncPushCfg(); return { ok: true, msg: '每日 ' + el.value + ' 推送' }; });
  F.on('cnNotify', (d, el) => { C().push.notify = el.checked; if (el.checked && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); syncPushCfg(); return { ok: true, msg: el.checked ? '已开启桌面通知' : '已关闭桌面通知' }; });
  function syncPushCfg() { if (Ext.ver) Ext.call('pushConfig', { hooks: C().push.hooks, time: C().push.time, brief: F.brief ? F.brief() : '' }).catch(() => {}); }

  function directPush(h, text) {
    if (h.kind === 'telegram') return fetch('https://api.telegram.org/bot' + h.token + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: h.chatId, text }) }).then(r => r.json()).then(j => ({ name: h.name, ok: !!j.ok, detail: j.description || '' }));
    const body = h.kind === 'feishu' ? { msg_type: 'text', content: { text } } : h.kind === 'generic' ? { text } : { msgtype: 'text', text: { content: text } };
    return fetch(h.url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }).then(() => ({ name: h.name, ok: true, detail: '已发出（浏览器无法读取回执）' }));
  }
  function pushBrief(manual) {
    const text = F.brief ? F.brief() : '';
    const c = C(); c.push.lastSent = Store.nowLabel() + (manual ? '（手动）' : '（定时）');
    if (c.push.notify && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('OzonFlow 经营简报', { body: text.slice(0, 300) }); } catch (e) { /* ignore */ } }
    else if (c.push.notify && Ext.ver) Ext.call('notify', { title: 'OzonFlow 经营简报', message: text }).catch(() => {});
    if (!c.push.hooks.length) { Store.emit('push'); return Promise.resolve([]); }
    const p = Ext.ver ? Ext.call('push', { hooks: c.push.hooks, text }).then(r => r.results) : Promise.all(c.push.hooks.map(h => directPush(h, text).catch(e => ({ name: h.name, ok: false, detail: e.message }))));
    return p.then(res => { const msg = res.map(r => r.name + (r.ok ? ' 成功' : ' 失败：' + r.detail)).join('；'); log('简报推送', msg || '仅桌面通知'); Store.emit('push'); return res; });
  }
  F.on('cnPushNow', () => { pushBrief(true).then(res => F.toast('success', res.length ? '已推送到 ' + res.filter(r => r.ok).length + '/' + res.length + ' 个群' : '没有群机器人，已发桌面通知')); });
  setInterval(() => { try { const c = C(); const [h, m] = (c.push.time || '').split(':').map(Number); const now = new Date(); const today = now.toISOString().slice(0, 10); if (c.push.hooks.length && !Ext.ver && c.push.sentDay !== today && (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m))) { c.push.sentDay = today; pushBrief(false); } } catch (e) { /* ignore */ } }, 60000);

  F.on('cnExport', () => {
    const s = F.S();
    const data = { exportedAt: new Date().toISOString(), scenario: s.meta, shops: s.shops, settings: s.settings, products: s.products, inventory: s.inventory, orders: s.orders, returns: s.returns, reviews: s.reviews, approvals: s.approvals, auditLog: (s.auditLog || []).slice(0, 200),
      health: s.shops.map(sh => { const h = F.healthOf(sh.id); return { shopId: sh.id, shop: sh.name, errIndex: +h.m.errIndex.toFixed(2), tier: h.tier.label, risk: h.risk, cancelRate: +h.m.cancelRate.toFixed(2), lateRate: +h.m.lateRate.toFixed(2) }; }),
      finance: F.ext().finance.lines, compete: F.ext().compete, brief: F.brief ? F.brief() : '' };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = 'ozonflow-state.json'; a.click();
    return { ok: true, msg: '已导出经营数据，交给 MCP 服务即可' };
  });
  F.on('cnPending', (d, el) => {
    const file = el.files && el.files[0]; if (!file) return;
    file.text().then(t => {
      let list; try { list = JSON.parse(t); } catch (e) { F.toast('info', '文件不是有效的 JSON'); return; }
      let n = 0; (Array.isArray(list) ? list : []).filter(x => x.kind === 'price' && x.status === 'pending').forEach(x => {
        const p = F.S().products.find(q => q.sku === x.sku); if (!p || !x.to) return;
        const pct = Math.abs(x.to - p.price) / p.price * 100;
        const r = Store.proposeApproval({ type: '改价', action: 'setPrice', key: 'price:mcp:' + x.id, payload: { kind: 'product', id: p.sku, price: x.to }, shopId: p.shopId,
          title: '「' + p.name + '」' + (x.to > p.price ? '提价' : '降价') + ' ' + pct.toFixed(0) + '%（AI 助手建议）', target: p.name, before: p.price + '₽', after: x.to + '₽', reason: x.reason || 'MCP 提交', agent: 'AI 助手（MCP）', risk: pct > 25 ? 'high' : 'mid' });
        if (r && r.queued && !r.dup) n++;
      });
      el.value = ''; log('导入 AI 建议', n + ' 条进审批'); F.toast('success', n + ' 条 AI 改价建议已进入审批中心'); rerender();
    });
  });
  F.on('cnDocs', () => { if (!Ext.ver) return needExt(); Ext.call('docs', {}, 60000).then(r => { Ext.info = Object.assign(Ext.info || {}, { docs: r.docs }); F.toast('success', '文档端点 ' + r.docs.paths.length + ' 个' + (r.docs.changed ? '，有变化' : '')); rerender(); }).catch(e => F.toast('info', e.message)); });

  F.connect = { mergeOrders, mergeFinance, mapStatus, pushBrief };
  window.addEventListener('load', () => { const v = location.hash.replace('#', ''); if (v && F.title(v) && window.navigate) setTimeout(() => window.navigate(v), 50); });
})();
