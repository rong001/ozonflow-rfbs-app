/* 卖家后台写辅助：在已登录的 seller.ozon.ru 上按指令尝试发货 / 填运单 / 取面单；失败则预填剪贴板 + 步骤面板 */
(function () {
  if (window.__ozfSellerWrite) return;
  window.__ozfSellerWrite = true;

  const OP_LABEL = { ship: '确认发货', setTracking: '回传运单号', applyWaybill: '申请/打印面单' };

  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function visible(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }
  function norm(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }
  function textOf(el) { return norm(el && (el.innerText || el.textContent || el.getAttribute('aria-label') || el.value || '')); }

  function findByText(re, sels) {
    const nodes = [];
    (sels || ['button', 'a', '[role="button"]', 'input[type="submit"]', 'input[type="button"]', '.btn', '[class*="button"]']).forEach(sel => {
      qsa(sel).forEach(el => { if (visible(el)) nodes.push(el); });
    });
    return nodes.find(el => re.test(textOf(el))) || null;
  }

  function findInput(hints) {
    const inputs = qsa('input, textarea').filter(visible);
    for (const h of hints) {
      const re = typeof h === 'string' ? new RegExp(h, 'i') : h;
      const hit = inputs.find(el => {
        const bag = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.getAttribute('data-test'), el.type].join(' ');
        const label = el.labels && el.labels[0] ? textOf(el.labels[0]) : '';
        return re.test(bag + ' ' + label);
      });
      if (hit) return hit;
    }
    return null;
  }

  function setValue(el, val) {
    if (!el) return false;
    el.focus();
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, val);
    else el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function clickEl(el) {
    if (!el) return false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.click();
    return true;
  }

  function postingUrl(postingNumber) {
    const pn = encodeURIComponent(String(postingNumber || '').trim());
    if (!pn) return 'https://seller.ozon.ru/app/postings/fbs';
    return 'https://seller.ozon.ru/app/postings/fbs?postingNumber=' + pn;
  }

  function ensurePanel() {
    let p = document.getElementById('ozf-write-assist');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'ozf-write-assist';
    p.setAttribute('role', 'dialog');
    p.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646;max-width:360px;background:#0B1B3A;color:#fff;font:13px/1.45 system-ui,sans-serif;padding:14px 16px;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.35)';
    document.documentElement.appendChild(p);
    return p;
  }

  function showAssist(payload, steps, detail) {
    const p = ensurePanel();
    const op = payload.op || '';
    const title = OP_LABEL[op] || op;
    p.innerHTML = '<div style="font-weight:600;margin-bottom:8px">OzonFlow · ' + title + '（需在后台完成）</div>'
      + '<div style="opacity:.9;font-size:12px;margin-bottom:8px">' + (detail || '未能自动定位控件，请按下列步骤在卖家后台手动完成。完成后回到 OzonFlow 刷新订单状态。') + '</div>'
      + '<ol style="margin:0 0 10px 18px;padding:0;font-size:12px">' + (steps || []).map(s => '<li style="margin:4px 0">' + s + '</li>').join('') + '</ol>'
      + '<button type="button" id="ozf-assist-close" style="background:#3B82F6;color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px">知道了</button>';
    const btn = p.querySelector('#ozf-assist-close');
    if (btn) btn.onclick = () => p.remove();
    setTimeout(() => { if (p.isConnected) p.remove(); }, 120000);
  }

  async function copyText(text) {
    const t = String(text || '');
    if (!t) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(t);
        return true;
      }
    } catch (_) { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) { return false; }
  }

  function tryShip(payload) {
    const btn = findByText(/отгрузить|передать в доставку|подтвердить отгруз|собрать заказ|ship|发货|确认发货|打包/i)
      || findByText(/готово к отгрузке|mark as shipped/i);
    if (btn) {
      clickEl(btn);
      return { ok: true, mode: 'done', detail: '已点击「' + textOf(btn).slice(0, 40) + '」' };
    }
    return null;
  }

  function trySetTracking(payload) {
    const track = String(payload.trackingNumber || payload.track || '').trim();
    if (!track) return { ok: false, mode: 'failed', error: '缺少运单号 trackingNumber' };
    const input = findInput([/track|tracking|трек|номер отслед|штрих|barcode|运单|物流单/i, /trackingNumber/i]);
    if (input) {
      setValue(input, track);
      const save = findByText(/сохранить|save|применить|подтверд|добавить|сохранить номер|回传|保存|确认/i);
      if (save) clickEl(save);
      return { ok: true, mode: 'done', detail: '已填入运单号' + (save ? '并点击保存' : '（请再点保存）') };
    }
    return null;
  }

  function tryApplyWaybill(payload) {
    const btn = findByText(/этикетк|ярлык|label|накладн|распечатать|скачать|面单|打印面单|下载面单/i);
    if (btn) {
      clickEl(btn);
      return { ok: true, mode: 'done', detail: '已点击「' + textOf(btn).slice(0, 40) + '」' };
    }
    return null;
  }

  async function run(payload) {
    payload = payload || {};
    const op = payload.op;
    const postingNumber = payload.postingNumber || payload.id || '';
    const track = payload.trackingNumber || payload.track || '';
    const carrier = payload.carrier || payload.logistics || '';

    let result = null;
    try {
      if (op === 'ship') result = tryShip(payload);
      else if (op === 'setTracking') result = trySetTracking(payload);
      else if (op === 'applyWaybill') result = tryApplyWaybill(payload);
      else return { ok: false, mode: 'failed', error: '未知写指令: ' + op };
    } catch (e) {
      result = { ok: false, mode: 'failed', error: e.message };
    }

    if (result && result.ok) {
      return Object.assign({ postingNumber, op, url: location.href }, result);
    }

    // 降级：剪贴板 + 步骤提示（不假装已完成）
    const clipParts = [];
    if (postingNumber) clipParts.push(postingNumber);
    if (track) clipParts.push(track);
    if (carrier) clipParts.push(carrier);
    const clip = clipParts.join('\t') || postingNumber || track;
    const copied = await copyText(clip);

    const steps = [];
    if (postingNumber) steps.push('订单号 ' + postingNumber + ' 已打开或请在 FBS 列表搜索');
    if (op === 'setTracking' || op === 'ship') {
      if (track) steps.push('运单号 ' + track + (copied ? ' 已复制到剪贴板，粘贴到「Трек-номер」' : ' 请手动填入'));
      if (carrier) steps.push('物流商/渠道：' + carrier);
    }
    if (op === 'ship') steps.push('在订单详情点击「Отгрузить」或等价发货按钮并确认');
    if (op === 'setTracking') steps.push('保存运单号后，确认状态变为「Доставляется / В пути」');
    if (op === 'applyWaybill') steps.push('点击打印/下载 этикетка（面单），保存 PDF');
    steps.push('完成后回到 OzonFlow，用「从插件同步」刷新订单，勿在系统内直接标为已发货除非平台已确认');

    showAssist(payload, steps, (result && result.error) ? result.error : '页面结构未匹配到可点击控件');

    return {
      ok: false,
      mode: 'assisted',
      op,
      postingNumber,
      trackingNumber: track || null,
      carrier: carrier || null,
      copied,
      clipboard: clip,
      steps,
      url: location.href || postingUrl(postingNumber),
      detail: '已打开卖家后台辅助面板' + (copied ? '，关键字段已写入剪贴板' : ''),
      error: (result && result.error) || 'selector_miss',
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (!msg || msg.type !== 'sellerWrite') return false;
    Promise.resolve(run(msg.payload || {})).then(r => reply(r)).catch(e => reply({ ok: false, mode: 'failed', error: e.message }));
    return true;
  });
})();
