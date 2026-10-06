#!/usr/bin/env node
/**
 * OzonFlow · 生产后端（零 npm 依赖）
 * 静态托管 + 配置/状态持久化 + 连接器接入 + Ozon Seller API 代理与写操作封装
 *
 *   PORT=8787 node server/app.js
 *   或：npm start
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const VERSION = '1.1.0';
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : (fs.existsSync('/data') && process.env.DOCKER === '1'
      ? '/data'
      : path.join(ROOT, 'data'));
const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = 'api-seller.ozon.ru';
const STARTED_AT = Date.now();

const PATHS = {
  config: path.join(DATA_DIR, 'config.json'),
  state: path.join(DATA_DIR, 'state.json'),
  ingest: path.join(DATA_DIR, 'ingest.json'),
  access: path.join(DATA_DIR, 'access.log'),
  token: path.join(DATA_DIR, 'deploy.token'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.pdf': 'application/pdf',
};

const READ_ONLY = /\/(list|info|attribute|actions|unfulfilled|accrual|cash-flow|stocks\/info)/;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function atomicWrite(file, data) {
  ensureDir(path.dirname(file));
  const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function maskSecret(s) {
  if (!s || typeof s !== 'string') return '';
  if (s.length <= 4) return '••••';
  return s.slice(0, 2) + '••••' + s.slice(-2);
}

function loadEnvConfig() {
  return {
    ozonClientId: process.env.OZON_CLIENT_ID || '',
    ozonApiKey: process.env.OZON_API_KEY || '',
    allowOrigin: process.env.ALLOW_ORIGIN || '',
    writeAllow: (process.env.WRITE_ALLOW || '1') === '1',
    webhook: process.env.WEBHOOK_URL || '',
  };
}

function loadConfig() {
  const disk = readJson(PATHS.config, {});
  const env = loadEnvConfig();
  return {
    ozonClientId: disk.ozonClientId || env.ozonClientId || '',
    ozonApiKey: disk.ozonApiKey || env.ozonApiKey || '',
    allowOrigin: disk.allowOrigin != null && disk.allowOrigin !== '' ? disk.allowOrigin : env.allowOrigin,
    writeAllow: disk.writeAllow != null ? !!disk.writeAllow : env.writeAllow,
    webhook: disk.webhook != null ? disk.webhook : env.webhook,
  };
}

function saveConfig(patch) {
  const cur = readJson(PATHS.config, {});
  const next = Object.assign({}, cur);
  if (patch.ozonClientId != null) next.ozonClientId = String(patch.ozonClientId);
  if (patch.ozonApiKey != null) next.ozonApiKey = String(patch.ozonApiKey);
  if (patch.allowOrigin != null) next.allowOrigin = String(patch.allowOrigin);
  if (patch.writeAllow != null) next.writeAllow = !!patch.writeAllow;
  if (patch.webhook != null) next.webhook = String(patch.webhook);
  atomicWrite(PATHS.config, JSON.stringify(next, null, 2));
  return loadConfig();
}

function resolveDeployToken() {
  if (process.env.DEPLOY_TOKEN && String(process.env.DEPLOY_TOKEN).trim()) {
    return String(process.env.DEPLOY_TOKEN).trim();
  }
  if (fs.existsSync(PATHS.token)) {
    const t = fs.readFileSync(PATHS.token, 'utf8').trim();
    if (t) return t;
  }
  const t = crypto.randomBytes(24).toString('hex');
  ensureDir(DATA_DIR);
  fs.writeFileSync(PATHS.token, t + '\n', { mode: 0o600 });
  return t;
}

let DEPLOY_TOKEN = '';
let runtimeConfig = null;

function cfg() {
  return runtimeConfig || (runtimeConfig = loadConfig());
}

function refreshConfig() {
  runtimeConfig = loadConfig();
  return runtimeConfig;
}

function hasCredentials() {
  const c = cfg();
  return !!(c.ozonClientId && c.ozonApiKey);
}

function modeOf() {
  if (hasCredentials()) return 'proxy';
  return 'connector';
}

function logAccess(line) {
  try {
    ensureDir(DATA_DIR);
    fs.appendFileSync(PATHS.access, line + '\n');
  } catch (_) { /* ignore */ }
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function applyCors(req, res) {
  const origin = cfg().allowOrigin || '';
  if (!origin) return;
  const reqOrigin = req.headers.origin || '';
  if (origin === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (reqOrigin && (origin === reqOrigin || origin.split(',').map(s => s.trim()).includes(reqOrigin))) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin);
    res.setHeader('Vary', 'Origin');
  } else if (!reqOrigin) {
    // non-browser
  } else {
    // cross-origin not allowlisted — still set for preflight clarity when allowOrigin is single host
    const first = origin.split(',')[0].trim();
    if (first) {
      res.setHeader('Access-Control-Allow-Origin', first);
      res.setHeader('Vary', 'Origin');
    }
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function readBody(req, limit) {
  const max = limit || 8 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > max) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function bearerOk(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return false;
  const got = m[1].trim();
  if (!DEPLOY_TOKEN || !got) return false;
  try {
    const a = Buffer.from(DEPLOY_TOKEN);
    const b = Buffer.from(got);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

function requireAuth(req, res) {
  if (bearerOk(req)) return true;
  sendJson(res, 401, { ok: false, error: 'unauthorized', hint: '请在 Authorization: Bearer <DEPLOY_TOKEN> 中携带部署令牌' });
  return false;
}

function publicConfig() {
  const c = cfg();
  return {
    ok: true,
    ozonClientId: maskSecret(c.ozonClientId),
    ozonApiKey: maskSecret(c.ozonApiKey),
    credentials: hasCredentials(),
    allowOrigin: c.allowOrigin || '',
    writeAllow: !!c.writeAllow,
    webhook: c.webhook ? maskSecret(c.webhook) : '',
    mode: modeOf(),
  };
}

function healthPayload() {
  return {
    ok: true,
    version: VERSION,
    credentials: hasCredentials(),
    mode: modeOf(),
    uptime: Math.round((Date.now() - STARTED_AT) / 1000),
  };
}

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  let rel = decoded.replace(/^\/+/, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  const full = path.normalize(path.join(root, rel));
  if (!full.startsWith(root + path.sep) && full !== root) return null;
  // block serving secrets
  const blocked = ['data' + path.sep + 'config.json', 'data' + path.sep + 'deploy.token', '.env'];
  const relNorm = path.relative(root, full);
  if (blocked.some(b => relNorm === b || relNorm.startsWith('data' + path.sep + '.'))) {
    if (relNorm === 'data' + path.sep + 'config.json' || relNorm === 'data' + path.sep + 'deploy.token') return null;
  }
  if (relNorm === '.env' || relNorm.startsWith('.git' + path.sep)) return null;
  return full;
}

function serveStatic(req, res, urlPath) {
  const file = safeJoin(ROOT, urlPath);
  if (!file) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // SPA fallback for unknown paths under root that look like pages
      if (!path.extname(urlPath) || urlPath.endsWith('/')) {
        const index = path.join(ROOT, 'index.html');
        return fs.readFile(index, (e2, buf) => {
          if (e2) { res.writeHead(404); return res.end('Not Found'); }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(buf);
        });
      }
      res.writeHead(404);
      return res.end('Not Found');
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    fs.createReadStream(file).pipe(res);
  });
}

function ozonRequest(method, apiPath, bodyBuf) {
  return new Promise((resolve, reject) => {
    const c = cfg();
    if (!c.ozonClientId || !c.ozonApiKey) {
      return reject(Object.assign(new Error('no credentials'), { code: 'NO_CREDENTIALS' }));
    }
    const buf = bodyBuf || Buffer.alloc(0);
    const req = https.request({
      host: UPSTREAM,
      path: apiPath,
      method: method || 'POST',
      headers: {
        'Client-Id': c.ozonClientId,
        'Api-Key': c.ozonApiKey,
        'Content-Type': 'application/json',
        'Content-Length': buf.length,
      },
    }, r => {
      const chunks = [];
      r.on('data', d => chunks.push(d));
      r.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch (_) { json = { raw }; }
        resolve({ status: r.statusCode, data: json, raw });
      });
    });
    req.on('error', reject);
    req.end(buf);
  });
}

function proxyUpstream(req, res, urlPath) {
  const c = cfg();
  if (!c.ozonClientId || !c.ozonApiKey) {
    return sendJson(res, 503, { ok: false, error: 'credentials not configured', need: 'api-key', hint: '请在服务器配置 OZON_CLIENT_ID / OZON_API_KEY，或 POST /api/config 写入；无密钥时请用连接器路径' });
  }
  if (!c.writeAllow && !READ_ONLY.test(urlPath)) {
    return sendJson(res, 403, { ok: false, error: 'write disabled', hint: 'WRITE_ALLOW=0，仅允许查询类请求' });
  }
  readBody(req).then(body => {
    const up = https.request({
      host: UPSTREAM,
      path: urlPath,
      method: req.method,
      headers: {
        'Client-Id': c.ozonClientId,
        'Api-Key': c.ozonApiKey,
        'Content-Type': 'application/json',
        'Content-Length': body.length,
      },
    }, r => {
      res.writeHead(r.statusCode, { 'Content-Type': r.headers['content-type'] || 'application/json' });
      r.pipe(res);
    });
    up.on('error', e => sendJson(res, 502, { ok: false, error: e.message }));
    up.end(body);
  }).catch(e => sendJson(res, 400, { ok: false, error: e.message }));
}

async function handleOzonWrite(kind, body) {
  if (!hasCredentials()) {
    return { status: 503, payload: { ok: false, need: 'api-key', hint: '未配置 Ozon 密钥。可：① 安装连接器在卖家后台操作发货；② 在服务器填入 Api-Key 后重试' } };
  }
  if (!cfg().writeAllow) {
    return { status: 403, payload: { ok: false, error: 'write disabled' } };
  }
  let apiPath = '';
  if (kind === 'ship') apiPath = '/v4/posting/fbs/ship';
  else if (kind === 'tracking') apiPath = '/v2/fbs/posting/tracking-number/set';
  else if (kind === 'waybill') apiPath = '/v2/posting/fbs/package-label';
  else return { status: 404, payload: { ok: false, error: 'unknown action' } };

  const buf = Buffer.from(JSON.stringify(body || {}));
  try {
    const r = await ozonRequest('POST', apiPath, buf);
    return { status: r.status, payload: Object.assign({ ok: r.status >= 200 && r.status < 300 }, r.data) };
  } catch (e) {
    if (e.code === 'NO_CREDENTIALS') {
      return { status: 503, payload: { ok: false, need: 'api-key', hint: e.message } };
    }
    return { status: 502, payload: { ok: false, error: e.message } };
  }
}

async function handleApi(req, res, pathname) {
  // health (public)
  if ((pathname === '/api/health' || pathname === '/__health') && req.method === 'GET') {
    return sendJson(res, 200, healthPayload());
  }

  // config
  if (pathname === '/api/config' && req.method === 'GET') {
    return sendJson(res, 200, publicConfig());
  }
  if (pathname === '/api/config' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    const raw = await readBody(req, 64 * 1024);
    let patch = {};
    try { patch = JSON.parse(raw.toString('utf8') || '{}'); } catch (_) {
      return sendJson(res, 400, { ok: false, error: 'invalid json' });
    }
    const allowed = {};
    if ('ozonClientId' in patch) allowed.ozonClientId = patch.ozonClientId;
    if ('ozonApiKey' in patch) allowed.ozonApiKey = patch.ozonApiKey;
    if ('allowOrigin' in patch) allowed.allowOrigin = patch.allowOrigin;
    if ('writeAllow' in patch) allowed.writeAllow = patch.writeAllow;
    if ('webhook' in patch) allowed.webhook = patch.webhook;
    // empty string means clear; omit means keep — but we only set provided keys
    saveConfig(allowed);
    refreshConfig();
    return sendJson(res, 200, publicConfig());
  }

  // state
  if (pathname === '/api/state' && req.method === 'GET') {
    const st = readJson(PATHS.state, null);
    if (!st) return sendJson(res, 200, { ok: true, empty: true, state: null });
    return sendJson(res, 200, { ok: true, empty: false, state: st, updatedAt: (() => {
      try { return fs.statSync(PATHS.state).mtime.toISOString(); } catch (_) { return null; }
    })() });
  }
  if (pathname === '/api/state' && req.method === 'PUT') {
    if (!requireAuth(req, res)) return;
    const raw = await readBody(req, 32 * 1024 * 1024);
    let parsed;
    try { parsed = JSON.parse(raw.toString('utf8')); } catch (_) {
      return sendJson(res, 400, { ok: false, error: 'invalid json' });
    }
    const state = parsed && parsed.state != null ? parsed.state : parsed;
    if (!state || typeof state !== 'object') {
      return sendJson(res, 400, { ok: false, error: 'state object required' });
    }
    atomicWrite(PATHS.state, JSON.stringify(state));
    return sendJson(res, 200, { ok: true, bytes: Buffer.byteLength(JSON.stringify(state)) });
  }

  // connector ingest
  if (pathname === '/api/connector/ingest' && req.method === 'POST') {
    // token optional but recommended; accept if present and valid, or if no auth header and ALLOW_INSECURE_INGEST
    const authHeader = req.headers.authorization;
    if (authHeader && !bearerOk(req)) {
      return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    }
    if (!authHeader && process.env.REQUIRE_INGEST_TOKEN === '1') {
      return sendJson(res, 401, { ok: false, error: 'unauthorized', hint: 'REQUIRE_INGEST_TOKEN=1' });
    }
    const raw = await readBody(req, 16 * 1024 * 1024);
    let payload = {};
    try { payload = JSON.parse(raw.toString('utf8') || '{}'); } catch (_) {
      return sendJson(res, 400, { ok: false, error: 'invalid json' });
    }
    const prev = readJson(PATHS.ingest, { orders: {}, finance: {}, products: {}, log: [] });
    const now = new Date().toISOString();
    const add = payload.captured || payload;
    let nO = 0, nF = 0, nP = 0;
    (Array.isArray(add.orders) ? add.orders : Object.values(add.orders || {})).forEach(o => {
      if (o && o.id) { prev.orders[o.id] = Object.assign({}, prev.orders[o.id] || {}, o); nO++; }
    });
    (Array.isArray(add.finance) ? add.finance : Object.values(add.finance || {})).forEach(f => {
      const id = (f && (f.id || f.posting)) || null;
      if (id) { prev.finance[id] = Object.assign({}, prev.finance[id] || {}, f); nF++; }
    });
    (Array.isArray(add.products) ? add.products : Object.values(add.products || {})).forEach(p => {
      const id = (p && (p.offerId || p.sku || p.id)) || null;
      if (id) { prev.products[id] = Object.assign({}, prev.products[id] || {}, p); nP++; }
    });
    prev.log = [{ t: now, o: nO, f: nF, p: nP, src: payload.source || 'connector' }].concat(prev.log || []).slice(0, 50);
    prev.updatedAt = now;
    atomicWrite(PATHS.ingest, JSON.stringify(prev));
    // also merge into state.json orders if state exists and payload.mergeState
    if (payload.mergeState && fs.existsSync(PATHS.state)) {
      try {
        const st = readJson(PATHS.state, null);
        if (st && Array.isArray(st.orders)) {
          // leave merge to frontend; just stamp
          st._ingestMeta = { at: now, o: nO, f: nF, p: nP };
          atomicWrite(PATHS.state, JSON.stringify(st));
        }
      } catch (_) { /* ignore */ }
    }
    return sendJson(res, 200, {
      ok: true,
      counts: {
        orders: Object.keys(prev.orders).length,
        finance: Object.keys(prev.finance).length,
        products: Object.keys(prev.products).length,
      },
      added: { orders: nO, finance: nF, products: nP },
    });
  }

  if (pathname === '/api/connector/capture' && req.method === 'GET') {
    const prev = readJson(PATHS.ingest, { orders: {}, finance: {}, products: {}, log: [] });
    return sendJson(res, 200, { ok: true, captured: prev });
  }

  // ozon write wrappers
  if (pathname === '/api/ozon/ship' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    const raw = await readBody(req);
    let body = {};
    try { body = JSON.parse(raw.toString('utf8') || '{}'); } catch (_) {
      return sendJson(res, 400, { ok: false, error: 'invalid json' });
    }
    const r = await handleOzonWrite('ship', body);
    return sendJson(res, r.status, r.payload);
  }
  if (pathname === '/api/ozon/tracking' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    const raw = await readBody(req);
    let body = {};
    try { body = JSON.parse(raw.toString('utf8') || '{}'); } catch (_) {
      return sendJson(res, 400, { ok: false, error: 'invalid json' });
    }
    const r = await handleOzonWrite('tracking', body);
    return sendJson(res, r.status, r.payload);
  }
  if (pathname === '/api/ozon/waybill' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    const raw = await readBody(req);
    let body = {};
    try { body = JSON.parse(raw.toString('utf8') || '{}'); } catch (_) {
      return sendJson(res, 400, { ok: false, error: 'invalid json' });
    }
    const r = await handleOzonWrite('waybill', body);
    return sendJson(res, r.status, r.payload);
  }

  // ozon proxy pass-through /v*/
  if (/^\/v\d+\//.test(pathname)) {
    return proxyUpstream(req, res, pathname + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''));
  }

  sendJson(res, 404, { ok: false, error: 'not found' });
}

function handler(req, res) {
  applyCors(req, res);
  const u = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'));
  const pathname = u.pathname;

  logAccess([new Date().toISOString(), req.method, pathname, req.socket.remoteAddress || '-'].join(' '));

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const isApi = pathname.startsWith('/api/') || pathname.startsWith('/v') || pathname === '/__health';
  if (isApi) {
    return handleApi(req, res, pathname).catch(e => {
      console.error(e);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: e.message || 'internal' });
    });
  }

  serveStatic(req, res, pathname);
}

ensureDir(DATA_DIR);
DEPLOY_TOKEN = resolveDeployToken();
refreshConfig();

const server = http.createServer(handler);
server.listen(PORT, () => {
  console.log('OzonFlow server v' + VERSION + ' on :' + PORT);
  console.log('  data dir : ' + DATA_DIR);
  console.log('  mode     : ' + modeOf() + (hasCredentials() ? ' (credentials on)' : ' (connector / no api-key)'));
  console.log('  DEPLOY_TOKEN: ' + DEPLOY_TOKEN);
  console.log('  health   : http://127.0.0.1:' + PORT + '/api/health');
});
