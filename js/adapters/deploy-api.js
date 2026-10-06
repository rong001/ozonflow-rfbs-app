/**
 * OzonFlow · 自建部署 API 客户端
 * 探测同源或 localStorage ozonflow_api_base；health / state 同步 / 令牌 / 密钥配置（密钥只 POST 到服务器，不明文存浏览器）
 */
window.OzonFlowDeploy = (function () {
  const LS_BASE = 'ozonflow_api_base';
  const LS_TOKEN = 'ozonflow_deploy_token';
  const STATE_KEY = 'ozonflow_rfbs_v2';
  const DEMO_KEY = 'ozonflow_rfbs_demo_id';

  function getBase() {
    try {
      const saved = (localStorage.getItem(LS_BASE) || '').trim().replace(/\/$/, '');
      if (saved) return saved;
    } catch (_) { /* ignore */ }
    // 同源探测：当前就是后端托管时
    if (typeof location !== 'undefined' && /^https?:$/i.test(location.protocol)) {
      return location.origin;
    }
    return '';
  }

  function setBase(url) {
    const v = String(url || '').trim().replace(/\/$/, '');
    try { localStorage.setItem(LS_BASE, v); } catch (_) { /* ignore */ }
    return v;
  }

  function getToken() {
    try { return localStorage.getItem(LS_TOKEN) || ''; } catch (_) { return ''; }
  }

  function setToken(t) {
    const v = String(t || '').trim();
    try { localStorage.setItem(LS_TOKEN, v); } catch (_) { /* ignore */ }
    return v;
  }

  function headers(json) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    const tok = getToken();
    if (tok) h.Authorization = 'Bearer ' + tok;
    return h;
  }

  async function req(path, opt) {
    const base = getBase();
    if (!base) throw new Error('未配置 API 基址');
    const url = base.replace(/\/$/, '') + path;
    const res = await fetch(url, Object.assign({ headers: headers(!!(opt && opt.body)) }, opt || {}));
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok !== false, status: res.status, data };
  }

  async function health() {
    try {
      const r = await req('/api/health', { method: 'GET', headers: {} });
      // health 不需要 token；覆盖 headers
      return r;
    } catch (e) {
      // 再试一次显式无 auth
      try {
        const base = getBase();
        const res = await fetch(base.replace(/\/$/, '') + '/api/health');
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok && !!data.ok, status: res.status, data };
      } catch (e2) {
        return { ok: false, status: 0, data: { error: e2.message } };
      }
    }
  }

  async function probe() {
    const base = getBase();
    if (!base) return { ok: false, msg: '未填写 API 基址（同源部署可填当前站点 origin）' };
    try {
      const res = await fetch(base.replace(/\/$/, '') + '/api/health');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return { ok: false, msg: 'HTTP ' + res.status, data };
      return {
        ok: true,
        msg: '在线 · 模式 ' + (data.mode || '—') + (data.credentials ? ' · 已配置密钥' : ' · 免密钥/连接器') + ' · v' + (data.version || '') + ' · 运行 ' + (data.uptime || 0) + 's',
        data,
      };
    } catch (e) {
      return { ok: false, msg: '无法访问（' + e.message + '）' };
    }
  }

  async function getConfig() {
    return req('/api/config', { method: 'GET' });
  }

  async function postConfig(patch) {
    return req('/api/config', { method: 'POST', body: JSON.stringify(patch || {}) });
  }

  async function pullState() {
    const r = await req('/api/state', { method: 'GET' });
    return r;
  }

  async function pushState(state) {
    const body = state != null ? state : (function () {
      try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (_) { return null; }
    })();
    if (!body) throw new Error('本地没有可推送的经营状态');
    return req('/api/state', { method: 'PUT', body: JSON.stringify({ state: body }) });
  }

  function applyState(state) {
    if (!state || typeof state !== 'object') throw new Error('无效状态');
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    if (state.meta && state.meta.id) localStorage.setItem(DEMO_KEY, state.meta.id);
    return true;
  }

  async function ingest(payload) {
    return req('/api/connector/ingest', { method: 'POST', body: JSON.stringify(payload || {}) });
  }

  async function ozonShip(body) { return req('/api/ozon/ship', { method: 'POST', body: JSON.stringify(body || {}) }); }
  async function ozonTracking(body) { return req('/api/ozon/tracking', { method: 'POST', body: JSON.stringify(body || {}) }); }
  async function ozonWaybill(body) { return req('/api/ozon/waybill', { method: 'POST', body: JSON.stringify(body || {}) }); }

  // 暴露给连接器 bridge：若页面同源部署则插件可推 ingest
  function expose() {
    return {
      base: getBase(),
      token: getToken(),
      ingest,
      health: probe,
    };
  }

  return {
    getBase, setBase, getToken, setToken,
    health, probe, getConfig, postConfig,
    pullState, pushState, applyState, ingest,
    ozonShip, ozonTracking, ozonWaybill, expose,
    LS_BASE, LS_TOKEN, STATE_KEY,
  };
})();
