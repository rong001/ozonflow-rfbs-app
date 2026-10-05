/**
 * OzonFlow · Ozon Seller API 适配层
 * 业务动作 → Ozon Seller API 端点映射。默认 offline：动作由本地 Store 执行，不发网络请求。
 * 接入真实店铺时：后端代理持有 Client-Id / Api-Key（浏览器不直接持有密钥），mode 切到 'proxy'。
 * 端点以 https://docs.ozon.ru/api/seller/ 为准；note 标「需核验」的在接入时逐个确认版本号。
 */
window.OzonFlowAdapter = (function () {
  const LS = 'ozonflow_adapter_v1';
  const config = Object.assign({
    mode: 'offline',            // offline | proxy
    proxyBase: '',              // 例：https://your-backend.example.com/ozon
    clientId: '',               // 由后端保存，前端只显示是否已配置
    apiKeyConfigured: false,
  }, (function () { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } })());

  function configure(patch) {
    Object.assign(config, patch || {});
    if (patch && ('mode' in patch || 'proxyBase' in patch) && !('apiKeyConfigured' in patch)) config.apiKeyConfigured = false;
    try { localStorage.setItem(LS, JSON.stringify(config)); } catch (e) { /* ignore */ }
    return config;
  }

  /* 探活：后端代理 GET {proxyBase}/__health 返回 { ok, credentials } */
  async function ping() {
    if (!config.proxyBase) return { ok: false, msg: '未填写代理地址' };
    try {
      const res = await fetch(config.proxyBase.replace(/\/$/, '') + '/__health');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, status: res.status, msg: 'HTTP ' + res.status };
      if (!j.credentials) return { ok: false, msg: '代理在线，但服务器上没配置 OZON_CLIENT_ID / OZON_API_KEY' };
      return { ok: true, msg: '代理在线，凭证已配置' };
    } catch (e) { return { ok: false, msg: '无法访问代理（' + e.message + '）' }; }
  }

  const ENDPOINTS = [
    { group: '订单履约', action: 'syncOrders', method: 'POST', path: '/v3/posting/fbs/unfulfilled/list', desc: '拉取未完成 rFBS/FBS 订单', note: '' },
    { group: '订单履约', action: 'listPostings', method: 'POST', path: '/v3/posting/fbs/list', desc: '订单列表（按时间/状态）', note: '' },
    { group: '订单履约', action: 'shipOrder', method: 'POST', path: '/v4/posting/fbs/ship', desc: '订单打包/备货完成', note: 'v3 已逐步迁移到 v4' },
    { group: '订单履约', action: 'applyWaybill', method: 'POST', path: '/v2/posting/fbs/package-label', desc: '获取面单 PDF', note: '' },
    { group: '订单履约', action: 'setTracking', method: 'POST', path: '/v2/fbs/posting/tracking-number/set', desc: 'rFBS 回传运单号', note: '需核验' },
    { group: '订单履约', action: 'cancelOrder', method: 'POST', path: '/v2/posting/fbs/cancel', desc: '卖家取消订单', note: '' },
    { group: '商品与价格', action: 'publishListing', method: 'POST', path: '/v3/product/import', desc: '创建/更新商品卡', note: '' },
    { group: '商品与价格', action: 'categoryAttributes', method: 'POST', path: '/v1/description-category/attribute', desc: '类目必填属性', note: '' },
    { group: '商品与价格', action: 'setPrice', method: 'POST', path: '/v1/product/import/prices', desc: '改价（审批通过后执行）', note: '' },
    { group: '商品与价格', action: 'syncInventory', method: 'POST', path: '/v2/products/stocks', desc: '库存回写', note: '' },
    { group: '商品与价格', action: 'actions', method: 'GET', path: '/v1/actions', desc: '促销活动列表', note: '' },
    { group: '客服售后', action: 'replyReview', method: 'POST', path: '/v1/review/comment/create', desc: '回复评价', note: '需 Premium Plus 订阅' },
    { group: '客服售后', action: 'answerQa', method: 'POST', path: '/v1/question/answer/create', desc: '回答商品问答', note: '需 Premium Plus 订阅' },
    { group: '客服售后', action: 'chatList', method: 'POST', path: '/v3/chat/list', desc: '买家聊天列表', note: '需核验订阅门槛' },
    { group: '客服售后', action: 'returns', method: 'POST', path: '/v1/returns/list', desc: '退货列表', note: '' },
    { group: '财务', action: 'finance', method: 'POST', path: '/v1/finance/accrual/*', desc: '结算明细（新接口）', note: '旧 /v3/finance/transaction/* 已于 2026-09-08 停用' },
    { group: '财务', action: 'cashFlow', method: 'POST', path: '/v1/finance/cash-flow-statement/list', desc: '回款流水', note: '需核验' },
  ];

  function status() {
    return {
      mode: config.mode,
      connected: config.mode === 'proxy' && !!config.proxyBase && config.apiKeyConfigured,
      endpoints: ENDPOINTS,
    };
  }

  function endpointFor(action) {
    return ENDPOINTS.find(e => e.action === action) || null;
  }

  /* 统一入口：offline 返回本地执行标记；proxy 走后端代理 */
  async function call(action, body) {
    const ep = endpointFor(action);
    if (!ep) return { ok: false, msg: '未映射的动作：' + action };
    if (config.mode !== 'proxy' || !config.proxyBase) {
      return { ok: true, offline: true, endpoint: ep.path };
    }
    const res = await fetch(config.proxyBase.replace(/\/$/, '') + ep.path, {
      method: ep.method,
      headers: { 'Content-Type': 'application/json' },
      body: ep.method === 'GET' ? undefined : JSON.stringify(body || {}),
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => null), endpoint: ep.path };
  }

  return { config, configure, ping, ENDPOINTS, status, endpointFor, call };
})();
