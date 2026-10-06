/**
 * OzonFlow · 订单履约写路径
 * 有 Api-Key → /api/ozon/ship|tracking|waybill
 * 无 Key + 连接器 → 卖家后台写辅助（启发式点击 / 降级：打开后台+剪贴板+步骤）
 * 绝不在无平台确认时静默把订单标为已发货
 */
window.OzonFlowFulfill = (function () {
  const Store = () => window.OzonFlowStore;
  let lastHealth = null;
  let assistEl = null;

  function ext() {
    return (window.OFS && window.OFS.Ext) || null;
  }

  function orderById(id) {
    const s = Store().get();
    return (s.orders || []).find(o => o.id === id) || null;
  }

  function nowLabel() {
    try {
      if (Store().nowLabel) return Store().nowLabel();
    } catch (_) {}
    const d = new Date();
    return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' '
      + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function pushPending(o, text) {
    if (!o) return;
    o.fulfillStatus = 'pending_platform';
    o.fulfillNote = text;
    if (!o.timeline) o.timeline = [];
    o.timeline.push({ t: nowLabel(), text, done: false });
    try { Store().emit && Store().emit('fulfill'); } catch (_) {}
  }

  async function probeCredentials() {
    const D = window.OzonFlowDeploy;
    const A = window.OzonFlowAdapter;
    if (D && D.getBase && D.getBase()) {
      try {
        const r = await D.health();
        lastHealth = r;
        if (r && r.ok && r.data && r.data.credentials) return { credentials: true, online: true, source: 'deploy' };
        if (r && (r.ok || (r.data && r.data.ok))) return { credentials: false, online: true, source: 'deploy', health: r.data };
      } catch (_) { /* ignore */ }
    }
    if (A && A.config && A.config.mode === 'proxy' && A.config.proxyBase && A.config.apiKeyConfigured) {
      return { credentials: true, online: true, source: 'adapter' };
    }
    return { credentials: false, online: false, source: 'none' };
  }

  function hideAssist() {
    if (assistEl && assistEl.parentNode) assistEl.parentNode.removeChild(assistEl);
    assistEl = null;
  }

  function showAssist(result) {
    hideAssist();
    const box = document.createElement('div');
    box.id = 'ozf-fulfill-assist';
    box.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:10050;max-width:400px;background:var(--color-surface,#fff);color:var(--color-text,#0B1B3A);border:1px solid var(--color-border,#E5E7EB);border-radius:12px;box-shadow:0 12px 40px rgba(15,23,42,.18);padding:16px 18px;font:13px/1.45 system-ui,sans-serif';
    const steps = (result.steps || []).map(s => '<li style="margin:4px 0">' + String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</li>').join('');
    const url = result.url || 'https://seller.ozon.ru/app/postings/fbs';
    box.innerHTML = '<div style="font-weight:600;margin-bottom:6px">卖家后台辅助 · 尚未标记为已发货</div>'
      + '<div style="opacity:.85;font-size:12px;margin-bottom:8px">' + (result.detail || result.msg || '请在卖家后台完成操作后，用「从插件同步」刷新。') + '</div>'
      + (steps ? '<ol style="margin:0 0 10px 18px;padding:0;font-size:12px">' + steps + '</ol>' : '')
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<a class="btn btn-sm btn-primary" href="' + url + '" target="_blank" rel="noopener" style="text-decoration:none">打开卖家后台</a>'
      + '<button type="button" class="btn btn-sm btn-ghost" id="ozf-assist-dismiss">关闭</button></div>';
    document.body.appendChild(box);
    assistEl = box;
    const d = box.querySelector('#ozf-assist-dismiss');
    if (d) d.onclick = hideAssist;
    setTimeout(hideAssist, 90000);
  }

  async function viaApi(op, body) {
    const D = window.OzonFlowDeploy;
    if (!D || !D.getBase || !D.getBase()) throw new Error('未配置 API 基址');
    let r;
    if (op === 'ship') r = await D.ozonShip(body);
    else if (op === 'setTracking') r = await D.ozonTracking(body);
    else if (op === 'applyWaybill') r = await D.ozonWaybill(body);
    else throw new Error('未知操作');
    return r;
  }

  async function viaConnector(op, payload) {
    const E = ext();
    if (!E || !E.ver) throw new Error('未检测到 OzonFlow 连接器');
    const type = 'write';
    return E.call(type, Object.assign({ op }, payload), 120000);
  }

  function openSellerFallback(payload) {
    const pn = encodeURIComponent(String(payload.postingNumber || payload.id || '').trim());
    const url = pn
      ? 'https://seller.ozon.ru/app/postings/fbs?postingNumber=' + pn
      : 'https://seller.ozon.ru/app/postings/fbs';
    const clip = [payload.postingNumber || payload.id, payload.trackingNumber || payload.track, payload.carrier].filter(Boolean).join('\t');
    if (clip && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(clip).catch(function () { /* ignore */ });
    }
    try { window.open(url, '_blank', 'noopener'); } catch (_) { /* ignore */ }
    const steps = [
      '已尝试打开卖家后台对应订单',
      clip ? '订单号/运单号已写入剪贴板，可直接粘贴' : '请在 FBS 列表找到订单',
      '在后台完成操作后，回到 OzonFlow「数据连接 → 从插件同步」',
      '系统不会在平台确认前把订单标为已发货',
    ];
    return { ok: false, mode: 'assisted', url, steps, detail: '已降级为打开卖家后台 + 预填剪贴板', clipboard: clip };
  }

  function applyLocalSuccess(op, orderId, extra) {
    const S = Store();
    if (op === 'ship') {
      const r = S.shipOrder(orderId);
      const o = orderById(orderId);
      if (o) { o.fulfillStatus = 'confirmed'; o.fulfillNote = ''; }
      return r;
    }
    if (op === 'applyWaybill') {
      // 有平台确认的真实运单号时写入；否则走本地取号（仅离线记账场景）
      if (extra && extra.track) {
        const o = orderById(orderId);
        if (o) {
          o.track = extra.track;
          if (!o.auto) o.auto = [];
          if (!o.auto.includes('已取号')) o.auto.push('已取号');
          if (!o.timeline) o.timeline = [];
          o.timeline.push({ t: nowLabel(), text: '运单号 ' + extra.track + '（平台确认）', done: true });
          o.fulfillStatus = 'confirmed';
          S.emit && S.emit('waybill');
          return { ok: true, msg: '运单号 ' + extra.track, track: extra.track };
        }
      }
      return S.applyWaybill(orderId);
    }
    if (op === 'setTracking') {
      const o = orderById(orderId);
      if (!o) return { ok: false, msg: '订单不存在' };
      if (extra && extra.track) o.track = extra.track;
      if (window.OFS && OFS.ext) {
        try { OFS.ext().sla.sync[orderId] = true; } catch (_) { /* ignore */ }
      }
      if (!o.timeline) o.timeline = [];
      o.timeline.push({ t: nowLabel(), text: '运单号已回传平台', done: true });
      o.fulfillStatus = 'confirmed';
      S.emit && S.emit('tracking');
      return { ok: true, msg: orderId + ' 运单号已回传' };
    }
    return { ok: false, msg: '未知操作' };
  }

  /**
   * @param {'ship'|'setTracking'|'applyWaybill'} op
   * @param {string} orderId
   * @param {object} [opts]
   */
  async function execute(op, orderId, opts) {
    opts = opts || {};
    const o = orderById(orderId);
    if (!o) return { ok: false, mode: 'failed', msg: '订单不存在' };

    const postingNumber = opts.postingNumber || o.id;
    const trackingNumber = opts.trackingNumber || o.track || null;
    const carrier = opts.carrier || o.logistics || o.logisticsId || '';
    const payload = { op, postingNumber, id: postingNumber, trackingNumber, track: trackingNumber, carrier, logistics: carrier };

    const probe = await probeCredentials();

    // 1) 有凭证 → API
    if (probe.credentials) {
      try {
        const body = op === 'ship'
          ? { posting_number: postingNumber, packages: opts.packages || [{ products: [{ product_id: 0, quantity: 1 }] }] }
          : op === 'setTracking'
            ? { tracking_numbers: [{ posting_number: postingNumber, tracking_number: trackingNumber }] }
            : { posting_number: [postingNumber] };
        if (op === 'setTracking' && !trackingNumber) {
          return { ok: false, mode: 'failed', msg: '回传运单需要先有运单号' };
        }
        const r = await viaApi(op, Object.assign(body, opts.body || {}));
        if (r.ok) {
          const local = applyLocalSuccess(op, orderId, { track: trackingNumber });
          return { ok: true, mode: 'api', msg: (local && local.msg) || (op + ' 已通过 API 提交'), data: r.data };
        }
        const needKey = r.data && (r.data.need === 'api-key' || /credential/i.test(r.data.error || ''));
        if (!needKey) {
          pushPending(o, 'API ' + op + ' 失败：' + ((r.data && r.data.error) || r.status));
          return { ok: false, mode: 'api', msg: 'API 失败：' + ((r.data && (r.data.error || r.data.message)) || r.status), data: r.data };
        }
        // fall through to connector
      } catch (e) {
        pushPending(o, 'API 异常：' + e.message);
        // fall through
      }
    }

    // 2) 连接器写辅助
    const E = ext();
    if (E && E.ver) {
      try {
        if (op === 'setTracking' && !trackingNumber) {
          return { ok: false, mode: 'failed', msg: '回传运单需要先有运单号' };
        }
        if (op === 'ship' && !trackingNumber && !opts.allowShipWithoutTrack) {
          // 先尝试取号路径提示
          pushPending(o, '发货前需运单号：请先申请面单或填写运单号');
        }
        const r = await viaConnector(op, payload);
        if (r && r.ok && r.mode === 'done') {
          const local = applyLocalSuccess(op, orderId, { track: trackingNumber });
          return { ok: true, mode: 'connector', msg: (local && local.msg) || ('连接器已在卖家后台完成：' + (r.detail || op)), data: r };
        }
        // assisted / failed — 不标已发货
        const assisted = Object.assign({ ok: false, mode: 'assisted', msg: '' }, r || {});
        assisted.msg = '未自动完成：已打开卖家后台辅助（订单保持原状态，不会假装已发货）';
        pushPending(o, '等待卖家后台完成 ' + op + (r && r.detail ? ' · ' + r.detail : ''));
        showAssist(assisted);
        return assisted;
      } catch (e) {
        const fb = openSellerFallback(payload);
        pushPending(o, '连接器调用失败，已降级打开卖家后台：' + e.message);
        fb.msg = '连接器不可用（' + e.message + '），已打开卖家后台；订单未标为已发货';
        showAssist(fb);
        return fb;
      }
    }

    // 3) 探测到自建后端但无 Key、也无连接器 → 必须降级，禁止静默本地成功
    if (probe.online && !probe.credentials) {
      const fb = openSellerFallback(payload);
      pushPending(o, '无 Api-Key 且未装连接器：请在卖家后台手动完成');
      fb.msg = '服务器在线但无 Api-Key：请安装连接器或在卖家后台完成；订单未标为已发货';
      showAssist(fb);
      return fb;
    }

    // 4) 纯离线（无后端探活）：本地记账，文案标明未提交平台
    const local = applyLocalSuccess(op, orderId, { track: trackingNumber });
    if (local && local.ok) {
      pushPending(o, '仅本地记录 · 未提交 Ozon 平台（配置自建部署或安装连接器后可真实提交）');
      return { ok: true, mode: 'local', msg: local.msg + '（仅本地记录，未提交平台）', local: true };
    }
    return { ok: false, mode: 'failed', msg: (local && local.msg) || '操作失败' };
  }

  async function ship(orderId, opts) { return execute('ship', orderId, opts); }
  async function setTracking(orderId, opts) { return execute('setTracking', orderId, opts); }
  async function applyWaybill(orderId, opts) { return execute('applyWaybill', orderId, opts); }

  return {
    execute, ship, setTracking, applyWaybill,
    probeCredentials, showAssist, hideAssist,
    getLastHealth: () => lastHealth,
  };
})();
