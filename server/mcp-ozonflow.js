#!/usr/bin/env node
/**
 * OzonFlow MCP 服务（零依赖 · stdio · JSON-RPC 2.0，换行分隔）
 * 让 Claude Desktop / Cursor / 任何 MCP 客户端直接查询 OzonFlow 经营数据。
 *
 *   node server/mcp-ozonflow.js --state ./ozonflow-state.json [--pending ./ozonflow-pending.json]
 *
 * 数据来源：OzonFlow「数据连接 → 导出经营数据 JSON」。写操作只生成待审批建议（pending 文件），
 * 回到 OzonFlow 审批中心处理，不会直接改 Ozon。设置了 OZON_CLIENT_ID / OZON_API_KEY 时额外提供只读的 Ozon API 查询。
 */
'use strict';
const fs = require('fs'), path = require('path'), https = require('https');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const STATE = path.resolve(arg('--state', process.env.OZONFLOW_STATE || 'ozonflow-state.json'));
const PENDING = path.resolve(arg('--pending', process.env.OZONFLOW_PENDING || path.join(path.dirname(STATE), 'ozonflow-pending.json')));
const VERSION = '1.0.0';

let cache = null, mtime = 0;
function state() {
  const st = fs.statSync(STATE);
  if (!cache || st.mtimeMs !== mtime) { cache = JSON.parse(fs.readFileSync(STATE, 'utf8')); mtime = st.mtimeMs; }
  return cache;
}
const shopName = (s, id) => ((s.shops || []).find(x => x.id === id) || {}).name || id;
const pick = (o, ks) => ks.reduce((a, k) => (o[k] !== undefined && (a[k] = o[k]), a), {});

const TOOLS = [
  { name: 'ozonflow_summary', description: '经营概况：各店订单状态分布、待处理数、临期订单、待审批、对账差异。', inputSchema: { type: 'object', properties: {} },
    run() { const s = state(); const by = {}; (s.orders || []).forEach(o => { const k = shopName(s, o.shopId); by[k] = by[k] || {}; by[k][o.status] = (by[k][o.status] || 0) + 1; });
      const atRisk = (s.orders || []).filter(o => o.status !== 'shipped' && o.status !== 'cancelled' && o.etaH != null && o.etaH <= 6).length;
      const diffs = (s.finance || []).filter(l => l.diffNote).length;
      return { exportedAt: s.exportedAt, scenario: s.scenario && s.scenario.name, shops: (s.shops || []).map(x => x.name), ordersByShop: by, atRiskOrders: atRisk, pendingApprovals: (s.approvals || []).filter(a => a.status === 'pending').length, financeDiffs: diffs, products: (s.products || []).length }; } },
  { name: 'list_orders', description: '列出订单，可按状态（audit/purchase/ship/shipped/cancelled）、店铺名、仅临期筛选。', inputSchema: { type: 'object', properties: { status: { type: 'string' }, shop: { type: 'string' }, atRisk: { type: 'boolean' }, limit: { type: 'number' } } },
    run(a) { const s = state(); let os = s.orders || [];
      if (a.status) os = os.filter(o => o.status === a.status);
      if (a.shop) os = os.filter(o => shopName(s, o.shopId).includes(a.shop));
      if (a.atRisk) os = os.filter(o => o.etaH != null && o.etaH <= 6 && o.status !== 'shipped' && o.status !== 'cancelled');
      return os.slice(0, a.limit || 50).map(o => Object.assign(pick(o, ['id', 'name', 'status', 'statusLabel', 'amount', 'city', 'etaH', 'track', 'logistics', 'source']), { shop: shopName(s, o.shopId) })); } },
  { name: 'list_products', description: '列出商品及售价、成本、毛利率、库存。', inputSchema: { type: 'object', properties: { shop: { type: 'string' }, maxMargin: { type: 'number', description: '只看毛利率低于该值的商品' } } },
    run(a) { const s = state(); const inv = {}; (s.inventory || []).forEach(i => inv[i.sku] = i);
      return (s.products || []).filter(p => !a.shop || shopName(s, p.shopId).includes(a.shop)).filter(p => a.maxMargin == null || (p.margin != null && p.margin < a.maxMargin))
        .map(p => Object.assign(pick(p, ['sku', 'name', 'ru', 'price', 'cost', 'margin', 'weight']), { shop: shopName(s, p.shopId), stock: inv[p.sku] ? inv[p.sku].local : null, safeStock: inv[p.sku] ? inv[p.sku].safe : null })); } },
  { name: 'shop_health', description: '各店健康：错误指数、所在档位、风险分、取消率、逾期率。', inputSchema: { type: 'object', properties: {} }, run() { return state().health || []; } },
  { name: 'finance_diffs', description: '财务逐单对账中实结与测算不一致的订单（佣金、物流、罚款、退货）。', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
    run(a) { const s = state(); return (s.finance || []).filter(l => l.diffNote).slice(0, a.limit || 50).map(l => Object.assign(pick(l, ['id', 'sku', 'name', 'date', 'price', 'expProfit', 'commission', 'ship', 'penalty', 'ret', 'diffNote', 'source']), { shop: shopName(s, l.shopId) })); } },
  { name: 'compete_prices', description: '价格竞争：自家售价、Ozon/WB 同款最低价、跟卖者。', inputSchema: { type: 'object', properties: {} },
    run() { const s = state(); return (s.products || []).map(p => { const c = (s.compete || {})[p.sku] || {}; return { sku: p.sku, name: p.name, price: p.price, ozonMin: c.market && c.market.ozonMin, wbMin: c.market && c.market.wb, realCollected: !!(c.marketSrc && c.marketSrc.real), followers: (c.followers || []).length }; }); } },
  { name: 'daily_brief', description: '今日经营简报原文。', inputSchema: { type: 'object', properties: {} }, run() { return { brief: state().brief || '' }; } },
  { name: 'propose_price_change', description: '提交改价建议（不会直接改价）：写入待审批文件，需在 OzonFlow 审批中心确认。', inputSchema: { type: 'object', properties: { sku: { type: 'string' }, newPrice: { type: 'number' }, reason: { type: 'string' } }, required: ['sku', 'newPrice'] },
    run(a) { const s = state(); const p = (s.products || []).find(x => x.sku === a.sku); if (!p) throw new Error('找不到 SKU ' + a.sku);
      const list = fs.existsSync(PENDING) ? JSON.parse(fs.readFileSync(PENDING, 'utf8')) : [];
      const item = { id: 'MCP-' + Date.now(), kind: 'price', sku: p.sku, name: p.name, from: p.price, to: a.newPrice, changePct: +((a.newPrice - p.price) / p.price * 100).toFixed(1), reason: a.reason || '', createdAt: new Date().toISOString(), status: 'pending' };
      list.push(item); fs.writeFileSync(PENDING, JSON.stringify(list, null, 2)); return { queued: item, pendingFile: PENDING }; } },
];
if (process.env.OZON_CLIENT_ID && process.env.OZON_API_KEY) {
  TOOLS.push({ name: 'ozon_api_read', description: '只读调用 Ozon Seller API（路径须包含 list / info / get / report）。', inputSchema: { type: 'object', properties: { path: { type: 'string' }, body: { type: 'object' } }, required: ['path'] },
    run(a) { if (!/^\/v\d\/[\w/-]+$/.test(a.path) || !/list|info|get|report/.test(a.path)) throw new Error('只允许只读接口');
      return new Promise((res, rej) => { const data = JSON.stringify(a.body || {});
        const rq = https.request({ host: 'api-seller.ozon.ru', path: a.path, method: 'POST', headers: { 'Client-Id': process.env.OZON_CLIENT_ID, 'Api-Key': process.env.OZON_API_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res({ status: r.statusCode, body: b.slice(0, 2000) }); } }); });
        rq.on('error', rej); rq.end(data); }); } });
}

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
async function handle(m) {
  if (m.method === 'initialize') return { protocolVersion: (m.params && m.params.protocolVersion) || '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'ozonflow', version: VERSION }, instructions: 'OzonFlow rFBS 经营数据。写操作只进待审批文件。' };
  if (m.method === 'ping') return {};
  if (m.method === 'tools/list') return { tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) };
  if (m.method === 'tools/call') {
    const t = TOOLS.find(x => x.name === (m.params || {}).name); if (!t) throw Object.assign(new Error('未知工具 ' + (m.params || {}).name), { code: -32602 });
    try { const out = await t.run((m.params && m.params.arguments) || {}); return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] }; }
    catch (e) { return { content: [{ type: 'text', text: '错误：' + (e.code === 'ENOENT' ? '找不到经营数据文件 ' + STATE + '，请在 OzonFlow「数据连接」导出' : e.message) }], isError: true }; }
  }
  throw Object.assign(new Error('Method not found: ' + m.method), { code: -32601 });
}
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
    let m; try { m = JSON.parse(line); } catch (e) { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
    if (m.id === undefined) continue; // 通知
    handle(m).then(result => send({ jsonrpc: '2.0', id: m.id, result }), e => send({ jsonrpc: '2.0', id: m.id, error: { code: e.code || -32603, message: e.message } }));
  }
});
process.stdin.on('end', () => process.exit(0));
