/* OzonFlow 网页 ↔ 插件 的消息桥（只在 OzonFlow 页面注入） */
(function () {
  const VERSION = chrome.runtime.getManifest().version;
  document.documentElement.dataset.ozfExt = VERSION;
  const hello = () => window.postMessage({ __ozfExt: 1, type: 'hello', version: VERSION }, location.origin);

  function tryIngest(payload) {
    try {
      if (window.OzonFlowDeploy && typeof window.OzonFlowDeploy.ingest === 'function') {
        const base = window.OzonFlowDeploy.getBase && window.OzonFlowDeploy.getBase();
        if (base) window.OzonFlowDeploy.ingest(payload).catch(function () { /* 服务器未启或无令牌时不打断 */ });
      }
    } catch (_) { /* ignore */ }
  }

  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.__ozfApp !== 1) return;
    const { id, type, payload } = e.data;
    if (type === 'hello') return hello();
    chrome.runtime.sendMessage({ type, payload, from: 'app' }, r => {
      const err = chrome.runtime.lastError;
      window.postMessage({ __ozfExt: 1, id, ok: !err && !(r && r.error), data: r, error: err ? err.message : (r && r.error) }, location.origin);
      // pull → ingest 捕获数据
      if (!err && type === 'pull' && r && r.captured) {
        tryIngest({ source: 'extension', captured: r.captured });
      }
      // 写操作结果 → ingest 写日志（不假装成功）
      if (!err && (type === 'write' || type === 'ship' || type === 'setTracking' || type === 'applyWaybill') && r) {
        tryIngest({
          source: 'extension-write',
          writeLog: {
            t: new Date().toISOString(),
            type: type === 'write' ? (payload && payload.op) : type,
            postingNumber: (payload && (payload.postingNumber || payload.id)) || (r && r.postingNumber) || null,
            mode: r.mode || (r.ok ? 'done' : 'failed'),
            ok: !!r.ok,
            detail: r.detail || r.error || '',
            url: r.url || null,
          },
        });
      }
    });
  });
  hello();
  document.addEventListener('DOMContentLoaded', hello);
})();
