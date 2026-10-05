/* OzonFlow 连接器 · 后台：保存捕获数据、跨域采集公开数据、推送、定时任务 */
importScripts('normalize.js');
const N = self.OzonFlowNormalize;
const get = k => new Promise(r => chrome.storage.local.get(k, v => r(v[k])));
const set = (k, v) => new Promise(r => chrome.storage.local.set({ [k]: v }, r));
const counts = s => ({ orders: Object.keys((s && s.orders) || {}).length, finance: Object.keys((s && s.finance) || {}).length, products: Object.keys((s && s.products) || {}).length });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA_HEADERS = { 'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'ru-RU,ru;q=0.9' };

async function onCapture(msg) {
  const add = N.extract(msg.json);
  if (!add.orders.length && !add.finance.length && !add.products.length && !add.gated) return { counts: counts(await get('captured')) };
  const st = N.merge(await get('captured'), add);
  st.captures = (st.captures || 0) + 1; st.last = new Date().toISOString();
  st.log = [{ t: st.last, url: String(msg.url).replace(/^https?:\/\/[^/]+/, '').slice(0, 120), o: add.orders.length, f: add.finance.length, p: add.products.length }].concat(st.log || []).slice(0, 30);
  await set('captured', st);
  return { counts: counts(st) };
}

async function fetchJson(url, opt) {
  const res = await fetch(url, Object.assign({ credentials: 'include', headers: UA_HEADERS }, opt || {}));
  const text = await res.text();
  if (!res.ok) throw new Error('HTTP ' + res.status + (/antibot|подозрительн|captcha/i.test(text) ? '（触发风控，请先在浏览器打开一次该网站）' : ''));
  try { return JSON.parse(text); } catch (e) { throw new Error('返回的不是 JSON（可能需要先打开一次该网站完成验证）'); }
}

async function marketPrices(queries) {
  const out = [];
  for (const q of (queries || []).slice(0, 30)) {
    const row = { key: q.key, q: q.q, ozon: null, wb: null, items: [], errors: [] };
    try {
      const j = await fetchJson('https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2?url=' + encodeURIComponent('/search/?text=' + q.q + '&sorting=price'));
      const items = N.parseOzonComposer(j).slice(0, 12); row.ozon = N.summarize(items); row.items.push(...items.slice(0, 5));
    } catch (e) { row.errors.push('Ozon：' + e.message); }
    try {
      const j = await fetchJson('https://search.wb.ru/exactmatch/ru/common/v9/search?appType=1&curr=rub&dest=-1257786&resultset=catalog&sort=popular&spp=30&query=' + encodeURIComponent(q.q), { credentials: 'omit' });
      const items = N.parseWbSearch(j).slice(0, 12); row.wb = N.summarize(items); row.items.push(...items.slice(0, 5));
    } catch (e) { row.errors.push('WB：' + e.message); }
    out.push(row);
    await sleep(600 + Math.random() * 600);
  }
  return out;
}

async function track(nums) {
  const list = (nums || []).filter(Boolean).slice(0, 40);
  const out = {};
  for (let i = 0; i < list.length; i += 10) {
    const j = await fetchJson('https://global.cainiao.com/global/detail.json?lang=zh-CN&mailNos=' + encodeURIComponent(list.slice(i, i + 10).join(',')), { credentials: 'omit' });
    Object.assign(out, N.parseCainiao(j));
  }
  return out;
}

function hookBody(h, text) {
  if (h.kind === 'wecom') return { url: h.url, body: { msgtype: 'text', text: { content: text } } };
  if (h.kind === 'dingtalk') return { url: h.url, body: { msgtype: 'text', text: { content: (h.keyword ? h.keyword + ' ' : '') + text } } };
  if (h.kind === 'feishu') return { url: h.url, body: { msg_type: 'text', content: { text } } };
  if (h.kind === 'telegram') return { url: 'https://api.telegram.org/bot' + h.token + '/sendMessage', body: { chat_id: h.chatId, text } };
  return { url: h.url, body: { text } };
}
async function push(hooks, text) {
  const res = [];
  for (const h of hooks || []) {
    try { const { url, body } = hookBody(h, text); const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const t = await r.text(); res.push({ name: h.name || h.kind, ok: r.ok && !/"errcode":\s*[1-9]|"ok":\s*false|"code":\s*[1-9]/.test(t), detail: t.slice(0, 160) }); }
    catch (e) { res.push({ name: h.name || h.kind, ok: false, detail: e.message }); }
  }
  return res;
}
function notify(title, message) { chrome.notifications.create('', { type: 'basic', iconUrl: 'icon128.png', title, message: String(message).slice(0, 400) }); }

async function schedule() {
  const cfg = (await get('push')) || {};
  chrome.alarms.clear('brief');
  if (cfg.time) {
    const [h, m] = cfg.time.split(':').map(Number); const now = new Date(); const t = new Date(); t.setHours(h, m, 0, 0); if (t <= now) t.setDate(t.getDate() + 1);
    chrome.alarms.create('brief', { when: t.getTime(), periodInMinutes: 1440 });
  }
  chrome.alarms.create('docs', { periodInMinutes: 7 * 1440, delayInMinutes: 5 });
}
chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);

async function hash(text) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(b)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join(''); }
async function checkDocs() {
  const res = await fetch('https://docs.ozon.ru/api/seller/', { credentials: 'include' });
  const html = await res.text();
  const paths = [...new Set((html.match(/\/v\d+\/[a-z0-9\-/]+/gi) || []))].sort();
  const h = await hash(paths.join('\n'));
  const prev = (await get('docs')) || {};
  const added = prev.paths ? paths.filter(p => !prev.paths.includes(p)) : [];
  const removed = prev.paths ? prev.paths.filter(p => !paths.includes(p)) : [];
  const rec = { hash: h, paths, checked: new Date().toISOString(), changed: !!(prev.hash && prev.hash !== h), added, removed };
  await set('docs', rec);
  if (rec.changed) notify('Ozon API 文档有更新', '新增 ' + added.length + ' 个、移除 ' + removed.length + ' 个端点，请在 OzonFlow 平台集成页查看');
  return rec;
}

chrome.alarms.onAlarm.addListener(async a => {
  if (a.name === 'brief') { const cfg = (await get('push')) || {}; if (cfg.brief) { notify('OzonFlow 经营简报', cfg.brief); await push(cfg.hooks, cfg.brief); } }
  if (a.name === 'docs') { try { await checkDocs(); } catch (e) { /* ignore */ } }
});

const HANDLERS = {
  capture: m => onCapture(m),
  counts: async () => ({ counts: counts(await get('captured')) }),
  ping: async () => { const st = await get('captured'); return { version: chrome.runtime.getManifest().version, counts: counts(st), last: st && st.last, gated: !!(st && st.gated), docs: await get('docs') || null, observed: Object.keys((await get('observed')) || {}).length }; },
  pull: async () => ({ captured: (await get('captured')) || null, observed: (await get('observed')) || {} }),
  clear: async () => { await set('captured', null); return { ok: true }; },
  observe: async m => { const o = (await get('observed')) || {}; o[m.item.url] = Object.assign(m.item, { t: new Date().toISOString() }); const keys = Object.keys(o); if (keys.length > 300) delete o[keys[0]]; await set('observed', o); return { ok: true }; },
  prices: async m => ({ rows: await marketPrices(m.payload.queries) }),
  track: async m => ({ tracks: await track(m.payload.nums) }),
  push: async m => ({ results: await push(m.payload.hooks, m.payload.text) }),
  notify: async m => { notify(m.payload.title || 'OzonFlow', m.payload.message || ''); return { ok: true }; },
  pushConfig: async m => { await set('push', m.payload); await schedule(); return { ok: true }; },
  docs: async () => ({ docs: await checkDocs() }),
};
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const fn = HANDLERS[msg && msg.type];
  if (!fn) return false;
  Promise.resolve(fn(msg, sender)).then(r => reply(r || {}), e => reply({ error: e.message }));
  return true;
});
