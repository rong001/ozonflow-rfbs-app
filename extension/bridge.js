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
      // 若页面暴露了自建部署客户端，把 pull 结果顺带推到 /api/connector/ingest
      if (!err && type === 'pull' && r && r.captured && window.OzonFlowDeploy && typeof window.OzonFlowDeploy.ingest === 'function') {
        try {
          const base = window.OzonFlowDeploy.getBase && window.OzonFlowDeploy.getBase();
          if (base) {
            window.OzonFlowDeploy.ingest({ source: 'extension', captured: r.captured }).catch(function () { /* 静默：服务器未启或无令牌时不打断同步 */ });
          }
        } catch (_) { /* ignore */ }
      }
    });
  });
  hello();
  document.addEventListener('DOMContentLoaded', hello);
})();
