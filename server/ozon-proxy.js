#!/usr/bin/env node
/**
 * OzonFlow · Ozon Seller API 后端代理（零依赖）
 * 浏览器不持有密钥；本代理从环境变量读取凭证，转发到 https://api-seller.ozon.ru 并加 CORS。
 *
 *   OZON_CLIENT_ID=xxx OZON_API_KEY=yyy ALLOW_ORIGIN=https://rong001.github.io PORT=8787 node server/ozon-proxy.js
 *
 * 前端「平台集成」页：模式选「代理」，代理地址填 https://你的域名（需 HTTPS）。
 * GET /__health → { ok, credentials }
 */
const http = require('http');
const https = require('https');

const PORT = Number(process.env.PORT || 8787);
const CLIENT_ID = process.env.OZON_CLIENT_ID || '';
const API_KEY = process.env.OZON_API_KEY || '';
const ORIGIN = process.env.ALLOW_ORIGIN || '*';
const UPSTREAM = 'api-seller.ozon.ru';
const WRITE_ALLOW = (process.env.WRITE_ALLOW || '1') === '1'; // 设 0 则只放行查询类请求

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const READ_ONLY = /\/(list|info|attribute|actions|unfulfilled|accrual|cash-flow|stocks\/info)/;

http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.url === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, credentials: !!(CLIENT_ID && API_KEY) }));
  }
  if (!CLIENT_ID || !API_KEY) { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end('{"error":"credentials not configured"}'); }
  if (!/^\/v\d+\//.test(req.url)) { res.writeHead(404); return res.end(); }
  if (!WRITE_ALLOW && !READ_ONLY.test(req.url)) { res.writeHead(403, { 'Content-Type': 'application/json' }); return res.end('{"error":"write disabled"}'); }

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const up = https.request({
      host: UPSTREAM, path: req.url, method: req.method,
      headers: { 'Client-Id': CLIENT_ID, 'Api-Key': API_KEY, 'Content-Type': 'application/json', 'Content-Length': body.length },
    }, r => { res.writeHead(r.statusCode, { 'Content-Type': r.headers['content-type'] || 'application/json' }); r.pipe(res); });
    up.on('error', e => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
    up.end(body);
    console.log(new Date().toISOString(), req.method, req.url);
  });
}).listen(PORT, () => console.log('OzonFlow Ozon proxy on :' + PORT + (CLIENT_ID ? '' : '  (no credentials yet)')));
