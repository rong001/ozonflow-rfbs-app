/* Ozon / WB 前台商品页：读取页面公开的结构化数据（ld+json），记录同款价格 */
(function () {
  function grab() {
    const lds = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent);
    let info = null;
    try { info = self.OzonFlowNormalize ? self.OzonFlowNormalize.parseLdJson(lds) : null; } catch (e) { info = null; }
    if (!info) {
      for (const t of lds) { try { const j = JSON.parse(t); if (j && /Product/i.test(j['@type'] || '')) { const of = Array.isArray(j.offers) ? j.offers[0] : (j.offers || {}); info = { title: j.name, price: parseFloat(of.price || of.lowPrice) || 0, image: Array.isArray(j.image) ? j.image[0] : j.image, sku: String(j.sku || '') }; break; } } catch (e) { /* skip */ } }
    }
    if (!info || !info.price) return;
    const og = document.querySelector('meta[property="og:image"]');
    info.image = info.image || (og && og.content) || '';
    info.url = location.href.split('?')[0];
    info.src = /wildberries/.test(location.host) ? 'wb' : 'ozon';
    chrome.runtime.sendMessage({ type: 'observe', item: info });
  }
  setTimeout(grab, 2500);
})();
