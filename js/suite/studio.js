/**
 * 素材工坊：白底主图（3:4 · 900×1200）· 卖点短视频 · Ozon 富内容 JSON（R12 · R13）
 * 全部在浏览器本地完成，不上传图片、不需要任何 Key。
 */
(function () {
  const F = window.OFS, Store = F.Store;
  const { esc, card, table, kpis, note, btn, tag } = F;
  const W = 900, H = 1200;
  const st = { items: [], video: null, videoType: '', busy: false, sku: '', points: '', imgs: '' };
  F.seed('studio', () => ({ made: { images: 0, videos: 0, rich: 0 } }));

  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('图片无法读取')); i.src = src; }); }

  /** 四角泛洪去背景 → 裁边 → 居中补白到 900×1200 */
  function whiteBg(img, tol) {
    const sw = img.naturalWidth, sh = img.naturalHeight, scale = Math.min(1, 1600 / Math.max(sw, sh));
    const w = Math.round(sw * scale), h = Math.round(sh * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, h); const d = x.getImageData(0, 0, w, h), p = d.data;
    const seen = new Uint8Array(w * h), stack = [];
    const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
    const dist = (i, r, g, b) => Math.abs(p[i] - r) + Math.abs(p[i + 1] - g) + Math.abs(p[i + 2] - b);
    let cleared = 0;
    corners.forEach(([cx, cy]) => {
      const i0 = (cy * w + cx) * 4, r = p[i0], g = p[i0 + 1], b = p[i0 + 2];
      stack.push(cy * w + cx);
      while (stack.length) {
        const k = stack.pop(); if (seen[k]) continue; const i = k * 4;
        if (p[i + 3] > 10 && dist(i, r, g, b) > tol) continue;
        seen[k] = 1; p[i] = p[i + 1] = p[i + 2] = 255; p[i + 3] = 255; cleared++;
        const px = k % w, py = (k / w) | 0;
        if (px > 0) stack.push(k - 1); if (px < w - 1) stack.push(k + 1); if (py > 0) stack.push(k - w); if (py < h - 1) stack.push(k + w);
      }
    });
    for (let i = 0; i < p.length; i += 4) if (p[i + 3] < 255) { const a = p[i + 3] / 255; p[i] = p[i] * a + 255 * (1 - a); p[i + 1] = p[i + 1] * a + 255 * (1 - a); p[i + 2] = p[i + 2] * a + 255 * (1 - a); p[i + 3] = 255; }
    x.putImageData(d, 0, 0);
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { const i = (y * w + xx) * 4; if (p[i] < 245 || p[i + 1] < 245 || p[i + 2] < 245) { if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (y < minY) minY = y; if (y > maxY) maxY = y; } }
    if (maxX < 0) { minX = 0; minY = 0; maxX = w - 1; maxY = h - 1; }
    const bw = maxX - minX + 1, bh = maxY - minY + 1, pad = 0.08;
    const s = Math.min(W * (1 - 2 * pad) / bw, H * (1 - 2 * pad) / bh);
    const out = document.createElement('canvas'); out.width = W; out.height = H; const o = out.getContext('2d');
    o.fillStyle = '#fff'; o.fillRect(0, 0, W, H); o.imageSmoothingQuality = 'high';
    o.drawImage(c, minX, minY, bw, bh, (W - bw * s) / 2, (H - bh * s) / 2, bw * s, bh * s);
    const bgRatio = cleared / (w * h), fill = (bw * s * bh * s) / (W * H);
    return { canvas: out, url: out.toDataURL('image/jpeg', 0.92), checks: [
      ['原图分辨率', sw + '×' + sh, Math.min(sw, sh) >= 700 ? 'ok' : Math.min(sw, sh) >= 200 ? 'warn' : 'bad', Math.min(sw, sh) >= 700 ? '清晰' : '偏小，放大后可能模糊（Ozon 最低 200px）'],
      ['输出尺寸', W + '×' + H + '（3:4）', 'ok', '符合 Ozon 推荐主图比例'],
      ['背景处理', Math.round(bgRatio * 100) + '% 像素改为纯白', bgRatio > 0.05 ? 'ok' : 'warn', bgRatio > 0.05 ? '已转为白底' : '四角颜色和主体接近，建议换纯色背景重拍或调高容差'],
      ['主体占比', Math.round(fill * 100) + '%', fill >= 0.35 ? 'ok' : 'warn', fill >= 0.35 ? '主体醒目' : '主体偏小'],
    ] };
  }

  function wrap(ctx, text, maxW) { const words = String(text).split(/(\s+)/); const lines = []; let cur = ''; words.forEach(wd => { const t = cur + wd; if (ctx.measureText(t).width > maxW && cur.trim()) { lines.push(cur.trim()); cur = wd.trimStart(); } else cur = t; }); if (cur.trim()) lines.push(cur.trim()); return lines; }

  /** 用处理好的主图生成 3:4 卖点短视频 */
  function makeVideo(frames, title, points) {
    const types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const type = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!type) return Promise.reject(new Error('当前浏览器不支持录制视频，请用新版 Chrome 或 Edge'));
    const cw = 720, ch = 960, cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const x = cv.getContext('2d');
    const stream = cv.captureStream(30), rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 3500000 }), chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const per = 2200, slides = frames.length ? frames : [null]; const caps = [title].concat(points); const total = Math.max(8000, slides.length * per + 1200);
    return new Promise(resolve => {
      rec.onstop = () => resolve({ blob: new Blob(chunks, { type: type.split(';')[0] }), type: type.split(';')[0] });
      rec.start(250); const t0 = performance.now();
      (function draw() {
        const t = performance.now() - t0; const idx = Math.min(slides.length - 1, Math.floor(t / per) % slides.length); const local = (t % per) / per;
        x.fillStyle = '#fff'; x.fillRect(0, 0, cw, ch);
        const f = slides[idx]; if (f) { const z = 1 + local * 0.06; const dw = cw * z, dh = ch * z; x.drawImage(f, (cw - dw) / 2, (ch - dh) / 2 - 30, dw, dh); }
        const cap = caps[Math.floor(t / per) % caps.length] || title; x.font = '600 34px system-ui, sans-serif';
        const lines = wrap(x, cap, cw - 96).slice(0, 2); const bh = 40 + lines.length * 44;
        x.fillStyle = 'rgba(0,91,255,.9)'; x.fillRect(32, ch - bh - 40, cw - 64, bh); x.fillStyle = '#fff'; lines.forEach((l, i) => x.fillText(l, 56, ch - bh - 40 + 52 + i * 44));
        if (t < total) requestAnimationFrame(draw); else rec.stop();
      })();
    });
  }

  function richJson(p, imgs, pts) {
    const blocks = (imgs.length ? imgs : ['']).slice(0, 6).map((src, i) => ({
      imgLink: '', img: { src, srcMobile: src, alt: (p ? p.ru : '') + ' ' + (i + 1), position: 'width_full', positionMobile: 'width_full', widthMobile: 1200, heightMobile: 1200 },
      title: { content: [pts[i] ? pts[i].split(/[:：—-]/)[0].trim() : (p ? p.ru : '')], size: 'size4', align: 'left', color: 'color1' },
      text: { size: 'size2', align: 'left', color: 'color1', content: [pts[i] || ''] },
    }));
    return { content: [
      { widgetName: 'raTextBlock', title: { content: [p ? p.ru : ''], size: 'size5', align: 'center', color: 'color1' }, theme: 'default', padding: 'type2', gapSize: 'm', text: { size: 'size2', align: 'center', color: 'color1', content: [pts.slice(0, 3).join(' · ')] } },
      { widgetName: 'raShowcase', type: 'roll', blocks },
    ], version: 0.3 };
  }

  F.register('studio', {
    title: '素材工坊',
    render() {
      const ps = F.products(), m = F.ext().studio.made; if (!st.sku && ps[0]) st.sku = ps[0].sku; const p = ps.find(x => x.sku === st.sku);
      const pts = st.points.split('\n').map(s => s.trim()).filter(Boolean); const imgs = st.imgs.split(/\s+/).filter(u => /^https?:\/\//.test(u));
      const json = JSON.stringify(richJson(p, imgs, pts), null, 2);
      return kpis([
        { label: '本次处理主图', value: st.items.length, sub: '900×1200 · 白底 JPG', tone: 'blue' },
        { label: '累计生成主图', value: m.images, sub: '全部在浏览器本地处理', tone: 'green' },
        { label: '累计生成视频', value: m.videos, sub: '主图轮播 + 俄语卖点字幕', tone: 'purple' },
        { label: '富内容 JSON', value: m.rich, sub: 'Ozon Rich-контент v0.3', tone: 'orange' },
      ]) +
      card('商品与卖点', `<div class="ofs-form">
          <label class="ofs-field"><span>商品</span><select class="ofs-mini-input" data-ofs-change="stSku">${ps.map(x => `<option value="${esc(x.sku)}" ${x.sku === st.sku ? 'selected' : ''}>${esc(x.emoji + ' ' + x.name)}</option>`).join('')}</select></label>
          <label class="ofs-field"><span>俄语标题</span><input class="ofs-mini-input" style="min-width:260px" value="${esc(p ? p.ru : '')}" disabled></label>
        </div>
        <label class="ofs-field" style="margin-top:10px"><span>俄语卖点（每行一条，用于视频字幕和富内容）</span><textarea class="ofs-mini-input" rows="4" style="width:100%;height:auto;padding:8px" data-ofs-change="stPoints" placeholder="Шумоподавление ANC — до -35 дБ&#10;До 30 часов работы с кейсом&#10;Быстрая зарядка USB-C">${esc(st.points)}</textarea></label>`) +
      card('① 白底主图', `<div class="ofs-form">
          <label class="ofs-field"><span>上传商品图（可多选，1688 原图即可）</span><input type="file" accept="image/*" multiple class="ofs-mini-input" style="height:auto;padding:6px" data-ofs-change="stFiles"></label>
          <label class="ofs-field"><span>去背景容差</span><input type="number" class="ofs-mini-input" id="stTol" value="60" min="10" max="200" style="width:90px"></label>
        </div>
        ${st.items.length ? `<div class="ofs-studio-grid">${st.items.map((it, i) => `<figure class="ofs-studio-item"><img src="${it.url}" alt="主图 ${i + 1}"><figcaption>${it.checks.map(c => `<div>${tag(c[0], c[2] === 'ok' ? 'green' : c[2] === 'warn' ? 'orange' : 'red')} ${esc(c[1])} <span class="hint">${esc(c[3])}</span></div>`).join('')}
          <a class="btn btn-sm btn-secondary" download="${esc((st.sku || 'main') + '-' + (i + 1))}.jpg" href="${it.url}">下载 JPG</a></figcaption></figure>`).join('')}</div>` : '<p class="hint" style="margin-top:10px">上传后自动：四角取色去背景 → 改纯白 → 裁掉多余边 → 居中缩放到 900×1200，并给出清晰度、主体占比检查。</p>'}` +
        note('适合纯色或浅色背景拍摄的商品图；复杂背景建议先在 1688 选白底图，或调高容差。')) +
      `<div class="ofs-grid-2">` +
      card('② 卖点短视频', `<p class="hint">用上面处理好的主图做轮播，配俄语标题和卖点字幕，3:4 竖版，时长不少于 8 秒。</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">${btn(st.busy ? '生成中…' : '生成视频', 'stVideo', {}, 'btn-primary')}
        ${st.video ? `<a class="btn btn-sm btn-secondary" href="${st.video}" download="${esc(st.sku || 'video')}.${st.videoType.includes('mp4') ? 'mp4' : 'webm'}">下载 ${st.videoType.includes('mp4') ? 'MP4' : 'WebM'}</a>` : ''}</div>
        ${st.video ? `<video src="${st.video}" controls muted style="width:100%;max-width:320px;border-radius:8px;border:1px solid var(--border, #e5e7eb)"></video>` : ''}` +
        note(st.videoType && !st.videoType.includes('mp4') ? '当前浏览器只能录 WebM。Ozon 要求 MP4/MOV，可用新版 Chrome（支持直接录 MP4）重新生成，或用格式工厂转一下。' : '新版 Chrome / Edge 直接输出 MP4，可在商品卡“视频”里上传。')) +
      card('③ Ozon 富内容 JSON', `<label class="ofs-field"><span>图片外链（每行一个，可用 Ozon 已上传图片的地址）</span><textarea class="ofs-mini-input" rows="3" style="width:100%;height:auto;padding:8px" data-ofs-change="stImgs" placeholder="https://ir.ozone.ru/s3/multimedia-x/…jpg">${esc(st.imgs)}</textarea></label>
        <pre class="ofs-code" id="stJson">${esc(json)}</pre>
        <div style="display:flex;gap:8px">${btn('复制 JSON', 'stCopy', {}, 'btn-primary')}</div>` +
        note('粘贴到 Ozon 商品卡的“Rich-контент JSON”属性（富内容编辑器同格式），结构为文字块 raTextBlock + 图文轮播 raShowcase。')) + `</div>`;
    },
  });

  F.on('stSku', (d, el) => { st.sku = el.value; F.render('studio'); });
  F.on('stPoints', (d, el) => { st.points = el.value; F.render('studio'); });
  F.on('stImgs', (d, el) => { st.imgs = el.value; F.render('studio'); });
  F.on('stFiles', (d, el) => {
    const files = Array.from(el.files || []).slice(0, 8); if (!files.length) return;
    const tol = +(document.getElementById('stTol') || {}).value || 60;
    Promise.all(files.map(f => loadImg(URL.createObjectURL(f)).then(img => { const r = whiteBg(img, tol); r.frame = r.canvas; return r; }))).then(list => {
      st.items = list; F.ext().studio.made.images += list.length; F.act('素材工坊', '生成白底主图', st.sku, list.length + ' 张');
      F.toast('success', '已生成 ' + list.length + ' 张 900×1200 白底主图'); Store.emit('studio');
    }).catch(e => F.toast('info', e.message));
  });
  F.on('stVideo', () => {
    if (st.busy) return; const ps = F.products(), p = ps.find(x => x.sku === st.sku);
    if (!st.items.length) return { ok: false, msg: '请先在 ① 上传商品图' };
    st.busy = true; F.render('studio');
    const pts = st.points.split('\n').map(s => s.trim()).filter(Boolean);
    makeVideo(st.items.map(i => i.canvas), p ? p.ru : '', pts).then(r => {
      st.busy = false; if (st.video) URL.revokeObjectURL(st.video); st.video = URL.createObjectURL(r.blob); st.videoType = r.type;
      F.ext().studio.made.videos++; F.act('素材工坊', '生成卖点视频', st.sku, r.type + ' ' + Math.round(r.blob.size / 1024) + 'KB');
      F.toast('success', '视频已生成（' + (r.type.includes('mp4') ? 'MP4' : 'WebM') + '，' + Math.round(r.blob.size / 1024) + ' KB）'); Store.emit('studio');
    }).catch(e => { st.busy = false; F.toast('info', e.message); F.render('studio'); });
  });
  F.on('stCopy', () => {
    const t = (document.getElementById('stJson') || {}).textContent || ''; F.ext().studio.made.rich++;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => F.toast('success', '已复制富内容 JSON'), () => F.toast('info', '浏览器不允许自动复制，请手动选中复制'));
    Store.emit('studio');
  });
  F.studio = { whiteBg, richJson, state: st };
})();
