/* 运行在 seller.ozon.ru 页面上下文：旁路读取后台自己发出的接口响应（不改请求、不发额外请求） */
(function () {
  if (window.__ozfCapture) return; window.__ozfCapture = true;
  const WANT = /(posting|order|отправ|finance|transaction|accrual|report|product|item|stock|cash|return)/i;
  const MAX = 3 * 1024 * 1024;
  const post = (url, text) => {
    if (!text || text.length > MAX || !WANT.test(url)) return;
    const c = text.trim()[0]; if (c !== '{' && c !== '[') return;
    try { window.postMessage({ __ozfCap: 1, url: String(url), body: text }, location.origin); } catch (e) { /* ignore */ }
  };
  const of = window.fetch;
  window.fetch = function (input, init) {
    return of.apply(this, arguments).then(res => {
      try { const url = typeof input === 'string' ? input : (input && input.url) || ''; const ct = res.headers.get('content-type') || ''; if (/json/.test(ct)) res.clone().text().then(t => post(url, t)).catch(() => {}); } catch (e) { /* ignore */ }
      return res;
    });
  };
  const oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__ozfUrl = u; return oo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', () => { try { if ((this.responseType === '' || this.responseType === 'text') && /json/.test(this.getResponseHeader('content-type') || '')) post(this.__ozfUrl || '', this.responseText); } catch (e) { /* ignore */ } });
    return os.apply(this, arguments);
  };
})();
