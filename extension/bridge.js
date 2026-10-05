/* OzonFlow 网页 ↔ 插件 的消息桥（只在 OzonFlow 页面注入） */
(function () {
  const VERSION = chrome.runtime.getManifest().version;
  document.documentElement.dataset.ozfExt = VERSION;
  const hello = () => window.postMessage({ __ozfExt: 1, type: 'hello', version: VERSION }, location.origin);
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.__ozfApp !== 1) return;
    const { id, type, payload } = e.data;
    if (type === 'hello') return hello();
    chrome.runtime.sendMessage({ type, payload, from: 'app' }, r => {
      const err = chrome.runtime.lastError;
      window.postMessage({ __ozfExt: 1, id, ok: !err && !(r && r.error), data: r, error: err ? err.message : (r && r.error) }, location.origin);
    });
  });
  hello();
  document.addEventListener('DOMContentLoaded', hello);
})();
