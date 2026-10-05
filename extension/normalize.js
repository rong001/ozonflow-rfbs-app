/**
 * OzonFlow 连接器 · 数据归一化（插件 Service Worker 与网页共用；也可在 Node 中测试）
 * 不依赖具体接口路径：深度遍历卖家后台返回的 JSON，按字段特征识别订单 / 结算 / 商品。
 */
(function (root) {
  const pickKey = (o, keys) => { for (const k of keys) { if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; } return undefined; };
  const num = v => { if (v == null) return 0; if (typeof v === 'number') return v; if (typeof v === 'object') return num(pickKey(v, ['amount', 'value', 'price', 'units'])); const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };

  function walk(node, visit, depth, seen) {
    if (!node || typeof node !== 'object' || depth > 14) return;
    if (seen.has(node)) return; seen.add(node);
    if (Array.isArray(node)) { node.forEach(n => walk(n, visit, depth + 1, seen)); return; }
    visit(node);
    Object.keys(node).forEach(k => { const v = node[k]; if (v && typeof v === 'object') walk(v, visit, depth + 1, seen); });
  }

  const POSTING = ['posting_number', 'postingNumber', 'posting_id', 'postingId'];
  const OP = ['operation_id', 'operationId', 'transaction_id', 'transactionId', 'accrual_id', 'accrualId'];
  const OFFER = ['offer_id', 'offerId', 'article', 'vendorCode'];

  function toOrder(o) {
    const id = String(pickKey(o, POSTING));
    if (!/^\d[\d-]{5,}$/.test(id)) return null;
    const prods = pickKey(o, ['products', 'items', 'goods']) || [];
    const items = (Array.isArray(prods) ? prods : []).map(p => ({ sku: String(pickKey(p, ['sku', 'skuId', 'sku_id']) || ''), offerId: String(pickKey(p, OFFER) || ''), name: String(pickKey(p, ['name', 'title', 'productName']) || ''), qty: num(pickKey(p, ['quantity', 'qty', 'count'])) || 1, price: num(pickKey(p, ['price', 'priceValue', 'sellerPrice'])) }));
    const amount = items.reduce((a, p) => a + p.price * p.qty, 0) || num(pickKey(o, ['amount', 'total', 'totalPrice', 'sum']));
    const addr = pickKey(o, ['analytics_data', 'analyticsData', 'delivery', 'address', 'customer']) || {};
    const city = pickKey(addr, ['city', 'region', 'cityName']) || pickKey((addr.address || {}), ['city']) || '';
    return {
      id, orderNumber: String(pickKey(o, ['order_number', 'orderNumber']) || ''),
      status: String(pickKey(o, ['status', 'state', 'postingStatus']) || ''),
      substatus: String(pickKey(o, ['substatus', 'subStatus']) || ''),
      inProcessAt: pickKey(o, ['in_process_at', 'inProcessAt', 'created_at', 'createdAt']) || '',
      shipBy: pickKey(o, ['shipment_date', 'shipmentDate', 'shipment_date_without_delay', 'deadline']) || '',
      track: String(pickKey(o, ['tracking_number', 'trackingNumber', 'track']) || ''),
      city: String(city || ''), items, amount: Math.round(amount * 100) / 100,
    };
  }
  function toFinance(o) {
    const id = pickKey(o, OP); if (id == null) return null;
    const amount = num(pickKey(o, ['amount', 'accruals_for_sale', 'total', 'sum']));
    const posting = pickKey(o, POSTING) || pickKey(o.posting || {}, POSTING) || '';
    return { id: String(id), posting: String(posting), type: String(pickKey(o, ['operation_type_name', 'operationTypeName', 'operation_type', 'operationType', 'type', 'name']) || ''), date: String(pickKey(o, ['operation_date', 'operationDate', 'date', 'createdAt']) || ''), amount,
      commission: num(pickKey(o, ['sale_commission', 'saleCommission', 'commission'])), delivery: num(pickKey(o, ['delivery_charge', 'deliveryCharge'])), services: Array.isArray(o.services) ? o.services.reduce((a, s) => a + num(s.price), 0) : 0 };
  }
  function toProduct(o) {
    const offer = pickKey(o, OFFER); if (offer == null) return null;
    const name = pickKey(o, ['name', 'title']); if (!name) return null;
    return { offerId: String(offer), sku: String(pickKey(o, ['sku', 'fbs_sku', 'fbsSku', 'product_id', 'productId', 'id']) || ''), name: String(name),
      price: num(pickKey(o, ['marketing_price', 'marketingPrice', 'price'])), oldPrice: num(pickKey(o, ['old_price', 'oldPrice'])),
      stock: num(pickKey(o, ['stock', 'present', 'stocks'])), image: String(pickKey(o, ['primary_image', 'primaryImage', 'image', 'imageUrl']) || '') };
  }
  function detectGate(json) {
    const s = JSON.stringify(json || {}).slice(0, 4000);
    return /premium/i.test(s) && /(subscri|подписк|denied|access)/i.test(s);
  }

  function extract(json) {
    const out = { orders: [], finance: [], products: [], gated: detectGate(json) };
    walk(json, o => {
      if (pickKey(o, POSTING) !== undefined && (o.products || o.items || o.status || o.state)) { const r = toOrder(o); if (r) out.orders.push(r); return; }
      if (pickKey(o, OP) !== undefined) { const r = toFinance(o); if (r) out.finance.push(r); return; }
      if (pickKey(o, OFFER) !== undefined && (o.name || o.title)) { const r = toProduct(o); if (r) out.products.push(r); }
    }, 0, new Set());
    return out;
  }

  function merge(store, add) {
    store = store || { orders: {}, finance: {}, products: {}, gated: false, captures: 0, last: null };
    ['orders', 'finance', 'products'].forEach(k => (add[k] || []).forEach(x => { const key = x.id || x.offerId; store[k][key] = Object.assign(store[k][key] || {}, x); }));
    if (add.gated) store.gated = true;
    return store;
  }

  /* ---------- Ozon 后台导出报表（CSV / Excel 行） ---------- */
  const H = {
    posting: [/номер отправления/i, /posting.?number/i, /отправлени/i],
    order: [/номер заказа/i, /order.?number/i],
    status: [/^статус$/i, /статус/i, /status/i],
    date: [/принят в обработку/i, /дата заказа/i, /дата создания/i, /in.?process/i],
    shipBy: [/дата отгрузки/i, /отгрузить до/i, /shipment/i],
    sku: [/^sku$/i, /ozon id/i],
    offer: [/артикул/i, /offer.?id/i],
    name: [/наименование товара/i, /название товара/i, /товар/i, /name/i],
    qty: [/количество/i, /quantity/i],
    price: [/ваша цена/i, /цена товара/i, /^цена/i, /price/i],
    amount: [/сумма отправления/i, /итого/i, /^сумма/i, /amount/i, /total/i],
    track: [/трек/i, /tracking/i],
    city: [/город/i, /регион доставки/i, /city/i],
    opId: [/id операции/i, /operation.?id/i],
    opType: [/тип начисления/i, /тип операции/i, /операция/i, /operation.?type/i],
    opDate: [/дата начисления/i, /дата операции/i, /operation.?date/i],
    commission: [/комисси/i, /commission/i],
  };
  function findCol(headers, pats) { for (const p of pats) { const i = headers.findIndex(h => p.test(h)); if (i >= 0) return i; } return -1; }
  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim()));
  }
  function fromRows(rows) {
    const hi = rows.findIndex(r => r.filter(x => String(x).trim()).length >= 3 && r.some(x => /(отправлени|заказ|операци|posting|order|артикул|sku)/i.test(String(x))));
    if (hi < 0) return { kind: 'unknown', orders: [], finance: [], products: [] };
    const headers = rows[hi].map(h => String(h).trim());
    const col = k => findCol(headers, H[k]);
    const c = {}; Object.keys(H).forEach(k => c[k] = col(k));
    const body = rows.slice(hi + 1);
    const get = (r, k) => c[k] >= 0 ? String(r[c[k]] == null ? '' : r[c[k]]).trim() : '';
    const isFinance = c.opType >= 0 && (c.opId >= 0 || c.opDate >= 0) && !(c.status >= 0 && c.shipBy >= 0);
    if (isFinance) {
      const finance = body.map((r, i) => ({ id: get(r, 'opId') || ('ROW-' + (i + 1)), posting: get(r, 'posting'), type: get(r, 'opType'), date: get(r, 'opDate'), amount: num(get(r, 'amount')), commission: num(get(r, 'commission')), delivery: 0, services: 0 })).filter(x => x.type || x.amount);
      return { kind: 'finance', headers, orders: [], finance, products: [] };
    }
    const map = {};
    body.forEach(r => {
      const id = get(r, 'posting'); if (!id) return;
      const o = map[id] || (map[id] = { id, orderNumber: get(r, 'order'), status: get(r, 'status'), substatus: '', inProcessAt: get(r, 'date'), shipBy: get(r, 'shipBy'), track: get(r, 'track'), city: get(r, 'city'), items: [], amount: 0 });
      const it = { sku: get(r, 'sku'), offerId: get(r, 'offer'), name: get(r, 'name'), qty: num(get(r, 'qty')) || 1, price: num(get(r, 'price')) };
      o.items.push(it); o.amount += it.price * it.qty || 0;
      if (!o.items.length || !it.price) o.amount = num(get(r, 'amount')) || o.amount;
    });
    return { kind: 'orders', headers, orders: Object.values(map), finance: [], products: [] };
  }

  /* ---------- 公开商品页 / 搜索结果解析 ---------- */
  function priceFromText(t) { const m = String(t).replace(/\u2009|\u00a0/g, ' ').match(/(\d[\d ]{1,9})\s?₽/); return m ? parseInt(m[1].replace(/ /g, ''), 10) : 0; }
  function parseOzonComposer(json) {
    const items = [];
    const ws = (json && json.widgetStates) || {};
    Object.keys(ws).filter(k => /searchResults|tileGrid|skuGrid/i.test(k)).forEach(k => {
      let st; try { st = typeof ws[k] === 'string' ? JSON.parse(ws[k]) : ws[k]; } catch (e) { return; }
      (st.items || []).forEach(it => {
        const texts = []; walk(it, o => { ['text', 'title', 'content'].forEach(f => { if (typeof o[f] === 'string') texts.push(o[f]); }); }, 0, new Set());
        const prices = texts.map(priceFromText).filter(Boolean);
        const title = texts.filter(t => t.length > 12 && !/₽/.test(t)).sort((a, b) => b.length - a.length)[0] || '';
        const link = (it.action && it.action.link) || '';
        const sku = (String(link).match(/-(\d{5,})\/?/) || [])[1] || String(it.skuId || it.sku || '');
        if (prices.length) items.push({ src: 'ozon', title, price: Math.min.apply(null, prices), sku, url: link ? 'https://www.ozon.ru' + String(link).split('?')[0] : '' });
      });
    });
    return items;
  }
  function parseWbSearch(json) {
    const ps = (json && (json.data && json.data.products || json.products)) || [];
    return ps.map(p => { const sz = (p.sizes || [])[0] || {}; const pr = sz.price ? (sz.price.product || sz.price.total) / 100 : (p.salePriceU || p.priceU || 0) / 100; return { src: 'wb', title: [p.brand, p.name].filter(Boolean).join(' '), price: Math.round(pr), sku: String(p.id || ''), url: p.id ? 'https://www.wildberries.ru/catalog/' + p.id + '/detail.aspx' : '' }; }).filter(x => x.price > 0);
  }
  function parseLdJson(texts) {
    for (const t of texts) { try { const j = JSON.parse(t); const arr = Array.isArray(j) ? j : [j]; for (const x of arr) { if (x && /Product/i.test(x['@type'] || '')) { const of = Array.isArray(x.offers) ? x.offers[0] : (x.offers || {}); return { title: x.name || '', price: num(of.price || of.lowPrice), image: Array.isArray(x.image) ? x.image[0] : (x.image || ''), sku: String(x.sku || '') }; } } } catch (e) { /* skip */ } }
    return null;
  }
  function median(a) { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; }
  function summarize(items) { const ps = items.map(i => i.price).filter(Boolean); return ps.length ? { min: Math.min.apply(null, ps), median: median(ps), n: ps.length } : null; }

  /* ---------- 菜鸟公开轨迹 ---------- */
  function parseCainiao(json) {
    const out = {};
    ((json && json.module) || []).forEach(m => { const d = m.detailList || []; const last = d[0] || null; out[m.mailNo] = { status: m.status || (last ? last.actionCode || '' : 'NOT_FOUND'), statusDesc: m.statusDesc || (last ? last.desc || last.standerdDesc || '' : '暂无轨迹'), last: last ? { time: last.timeStr || last.time || '', desc: last.desc || last.standerdDesc || '' } : null, events: d.slice(0, 8).map(e => ({ time: e.timeStr || e.time || '', desc: e.desc || e.standerdDesc || '' })) }; });
    return out;
  }

  const api = { extract, merge, parseCSV, fromRows, parseOzonComposer, parseWbSearch, parseLdJson, summarize, parseCainiao, priceFromText, num };
  root.OzonFlowNormalize = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
