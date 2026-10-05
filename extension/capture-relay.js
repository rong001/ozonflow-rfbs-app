/* 把页面捕获的数据转给插件后台，并在卖家后台右下角显示同步状态 */
(function () {
  let badge = null;
  function show(st) {
    if (!document.body) return;
    if (!badge) {
      badge = document.createElement('div');
      badge.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#0B1B3A;color:#fff;font:12px/1.4 system-ui,sans-serif;padding:8px 12px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none';
      document.body.appendChild(badge);
    }
    badge.textContent = 'OzonFlow 已捕获 · 订单 ' + st.orders + ' · 结算 ' + st.finance + ' · 商品 ' + st.products;
  }
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.__ozfCap !== 1) return;
    let json; try { json = JSON.parse(e.data.body); } catch (err) { return; }
    chrome.runtime.sendMessage({ type: 'capture', url: e.data.url, json }, r => { if (chrome.runtime.lastError) return; if (r && r.counts) show(r.counts); });
  });
  chrome.runtime.sendMessage({ type: 'counts' }, r => { if (!chrome.runtime.lastError && r && r.counts && (r.counts.orders || r.counts.finance)) setTimeout(() => show(r.counts), 1500); });
})();
