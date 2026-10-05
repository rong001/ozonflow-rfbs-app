function load() { chrome.runtime.sendMessage({ type: 'ping' }, r => { if (!r) return; document.getElementById('o').textContent = r.counts.orders; document.getElementById('f').textContent = r.counts.finance; document.getElementById('p').textContent = r.counts.products; document.getElementById('t').textContent = r.last ? new Date(r.last).toLocaleString('zh-CN') : '—'; }); }
document.getElementById('clear').onclick = () => chrome.runtime.sendMessage({ type: 'clear' }, load);
load();
