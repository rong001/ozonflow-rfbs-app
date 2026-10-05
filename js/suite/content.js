/**
 * 内容合规：内容评分（R10 R11）· 图片规范（R12）· 视频/富文本（R13）· Q&A 回写（R14）· 类目属性（R15）
 *          EAC 证书（R16）· Честный знак（R17）· 禁限售词（R18）· 资产库防盗图（R53）
 */
(function () {
  const F = window.OFS, Store = F.Store;
  const { esc, fmt, pct, tag, btn, card, table, kpis, bar, note } = F;

  const FEATURES = [[/耳机|наушник/i, 'Bluetooth 5.3, активное шумоподавление, 30 ч'], [/快充|充电|заряд/i, '65 Вт, GaN, USB-C PD'], [/数据线|кабель/i, 'USB-C, 1 м, 60 Вт, оплётка'], [/灯|ламп/i, 'LED, 3 режима яркости, питание USB'], [/袜|носк/i, 'компрессионные, 3 пары, размер 39–42'], [/充电宝|аккумулятор/i, '10000 мАч, магнитный, 20 Вт'], [/手机壳|чехол/i, 'силикон, противоударный'], [/收纳|хранен/i, 'складной, 3 отделения']];
  const BANNED = [
    { w: /лучший|самый лучший|№\s?1/i, why: '绝对化用语（最好/第一）', tone: 'orange' },
    { w: /оригинал|original|копия|реплика/i, why: '原装/仿品宣称，需品牌授权', tone: 'red' },
    { w: /\b(apple|iphone|samsung|xiaomi|airpods)\b/i, why: '他人品牌词：只能写“для iPhone”这类兼容说明', tone: 'orange' },
    { w: /лечит|излечива|медицинск/i, why: '医疗功效宣称', tone: 'red' },
    { w: /电子烟|vape|вейп|刀具|нож/i, why: '禁限售品类', tone: 'red' },
  ];
  const MARKING = [[/袜|衣|裤|鞋|帽|носк|одежд|обув/i, '轻工业（服装/袜类/鞋类）'], [/香水|парфюм/i, '香水'], [/相机|камер/i, '相机/闪光灯'], [/轮胎|шин/i, '轮胎'], [/自行车|велосипед/i, '自行车']];
  const CERT = [[/耳机|充电|数据线|灯|充电宝|наушник|заряд|кабель|ламп/i, 'ТР ТС 004/2011 + 020/2011（低压/电磁兼容）', '合格声明 EAC'], [/袜|衣|носк/i, 'ТР ТС 017/2011（轻工业产品）', '合格声明 EAC'], [/玩具|игруш/i, 'ТР ТС 008/2011（儿童玩具）', '合格证书 EAC']];

  F.seed('content', (s, r) => {
    const out = {};
    const all = s.products.concat(s.listings || []);
    all.forEach(p => {
      const certRule = CERT.find(c => c[0].test(p.name + ' ' + (p.ru || '')));
      const risky = r() < 0.3 ? F.pick(r, ['Лучший выбор 2026!', 'Совместимы с iPhone и Samsung, оригинал', 'Помогает и лечит усталость ног', 'Хит продаж №1']) : '';
      out[p.sku] = {
        attrsTotal: 18 + Math.floor(r() * 10), attrsFilled: 0, images: 1 + Math.floor(r() * 9), whiteBg: r() > 0.25, cnText: r() < 0.3, res: F.pick(r, [700, 900, 1200, 1600]),
        video: r() < 0.3, rich: r() < 0.25, faq: [], desc: 'Описание товара. ' + risky,
        cert: certRule ? { reg: certRule[1], type: certRule[2], no: 'ЕАЭС N RU Д-CN.' + Math.floor(100000 + r() * 899999), days: r() < 0.15 ? null : Math.round(F.between(r, -20, 420)) } : null,
        marked: false, assets: Array.from({ length: Math.min(4, 1 + Math.floor(r() * 4)) }, (_, i) => ({ id: p.sku + '-IMG' + (i + 1), hash: Math.floor(r() * 0xffffff).toString(16).padStart(6, '0'), stolen: r() < 0.12 ? F.pick(r, ['MegaGoods', 'Bestmart RU', 'TopSeller-88']) : '' })),
        titleDraft: '',
      };
      out[p.sku].attrsFilled = Math.round(out[p.sku].attrsTotal * F.between(r, 0.45, 0.98));
    });
    return out;
  });

  function cOf(p) { const c = F.ext().content; if (!c[p.sku]) c[p.sku] = { attrsTotal: 20, attrsFilled: 10, images: 1, whiteBg: true, cnText: false, res: 900, video: false, rich: false, faq: [], desc: '', cert: null, marked: false, assets: [], titleDraft: '' }; return c[p.sku]; }
  function feature(p) { const f = FEATURES.find(x => x[0].test(p.name + ' ' + (p.ru || ''))); return f ? f[1] : 'в подарочной упаковке'; }
  function titleScore(p) {
    const t = cOf(p).titleDraft || p.ru || '';
    const checks = [
      ['长度 40–200 字符', t.length >= 40 && t.length <= 200],
      ['以商品类型开头', /^[А-ЯЁ][а-яё]+/.test(t)],
      ['含型号或参数', /\d/.test(t)],
      ['含核心卖点', /,/.test(t)],
      ['无全大写/堆砌', !/[А-ЯЁA-Z]{6,}/.test(t)],
    ];
    return { t, checks, score: Math.round(checks.filter(c => c[1]).length / checks.length * 100) };
  }
  function bannedHits(p) { const c = cOf(p); const txt = [p.name, p.ru, c.titleDraft, c.desc].join(' '); return BANNED.map(b => { const m = txt.match(b.w); return m ? Object.assign({ hit: m[0] }, b) : null; }).filter(Boolean); }
  function markingOf(p) { const m = MARKING.find(x => x[0].test(p.name + ' ' + (p.ru || ''))); return m ? m[1] : null; }
  function score(p) {
    const c = cOf(p), ts = titleScore(p);
    const imgOk = Math.min(1, c.images / 5) * (c.whiteBg ? 1 : 0.6) * (c.cnText ? 0.6 : 1) * (c.res >= 900 ? 1 : 0.8);
    const comp = bannedHits(p).length ? 0 : (c.cert && (c.cert.days == null || c.cert.days < 0) ? 0.3 : 1);
    const parts = { title: ts.score / 100 * 25, attrs: c.attrsFilled / c.attrsTotal * 25, images: imgOk * 20, rich: c.rich ? 10 : 0, video: c.video ? 10 : 0, comp: comp * 10 };
    return { total: Math.round(Object.values(parts).reduce((a, b) => a + b, 0)), parts, ts };
  }
  F.contentScore = score;
  F.bannedHits = bannedHits;

  function items() { return F.shop(F.S().products).concat(F.shop(F.S().listings || []).filter(l => l.status !== 'published')); }

  F.register('content', {
    title: '内容合规',
    render() {
      const s = F.S(), list = items();
      const sc = list.map(p => ({ p, c: cOf(p), s: score(p), b: bannedHits(p), mk: markingOf(p) }));
      const avg = sc.length ? Math.round(sc.reduce((a, x) => a + x.s.total, 0) / sc.length) : 0;
      const certs = sc.filter(x => x.c.cert);
      const certWarn = certs.filter(x => x.c.cert.days == null || x.c.cert.days <= 60);
      const bannedN = sc.filter(x => x.b.length).length;
      const stolen = [];
      sc.forEach(x => x.c.assets.forEach(a => { if (a.stolen) stolen.push({ x, a }); }));
      const qa = F.shop(s.qa || []).filter(q => q.answered);
      const lowFirst = sc.slice().sort((a, b) => a.s.total - b.s.total);
      return kpis([
        { label: '平均内容评分', value: avg + ' / 100', sub: '评分越高，搜索曝光越好', tone: avg >= 80 ? 'green' : avg >= 60 ? 'orange' : 'red' },
        { label: '证书到期 / 缺失', value: fmt(certWarn.length), sub: `共 ${certs.length} 个 SKU 需要 EAC`, tone: certWarn.length ? 'red' : 'green' },
        { label: '禁限售风险', value: fmt(bannedN), sub: '标题或描述命中风险词', tone: bannedN ? 'red' : 'green' },
        { label: '疑似盗图', value: fmt(stolen.length), sub: '主图被其他卖家使用', tone: stolen.length ? 'orange' : 'green' },
      ]) +
      card('内容评分与补齐清单（R10 R11 R15）', table(['商品', '评分', '标题', '属性完整度', '图片', '富文本', '视频', '合规', '操作'], lowFirst.map(x => [
        `${x.p.emoji || ''} ${esc(x.p.name)}${x.p.status && x.p.status !== 'active' ? ' ' + tag('草稿', 'gray') : ''}`,
        `<b class="mono">${x.s.total}</b>${bar(x.s.total, x.s.total < 60 ? 'var(--color-danger,#DC2626)' : x.s.total < 80 ? 'var(--color-accent,#D97706)' : '')}`,
        `${x.s.ts.score}% <span class="hint">${x.s.ts.checks.filter(c => !c[1]).map(c => c[0]).join('、') || '达标'}</span>`,
        `${x.c.attrsFilled}/${x.c.attrsTotal}`, `${x.c.images} 张${x.c.whiteBg ? '' : ' · 非白底'}${x.c.cnText ? ' · 有中文' : ''}`,
        x.c.rich ? tag('有', 'green') : tag('缺', 'orange'), x.c.video ? tag('有', 'green') : tag('缺', 'gray'), x.b.length ? tag('风险词', 'red') : tag('通过', 'green'),
        btn('AI 补齐', 'cntFix', { sku: x.p.sku }, 'btn-primary'),
      ])) + note('评分维度：俄语标题 25、类目属性 25、图片 20、富文本 10、视频 10、合规 10。“AI 补齐”会生成俄语标题、属性和富文本草稿，人工确认后再同步到 Ozon；属性按 Ozon 类目属性接口 <span class="mono">description-category</span> 映射。'),
      btn('全部 AI 补齐', 'cntFixAll', {}, 'btn-secondary'), { flush: true }) +
      card('俄语标题公式与改写（R10）', table(['商品', '当前标题', '建议标题（类型 + 品牌/型号 + 核心参数）', '操作'], sc.slice(0, 10).map(x => { const sug = suggestTitle(x.p); return [esc(x.p.name), `<span class="hint">${esc(x.s.ts.t)}</span>`, esc(sug), x.c.titleDraft === sug ? tag('已采用', 'green') : btn('采用', 'cntTitle', { sku: x.p.sku })]; })), '', { flush: true }) +
      `<div class="ofs-grid-2">` +
      card('EAC 证书 / 豁免函到期预警（R16）', table(['商品', '技术法规', '类型', '编号', '剩余', '操作'], certs.sort((a, b) => (a.c.cert.days == null ? -999 : a.c.cert.days) - (b.c.cert.days == null ? -999 : b.c.cert.days)).map(x => { const d = x.c.cert.days; return [esc(x.p.name), `<span class="hint">${esc(x.c.cert.reg)}</span>`, esc(x.c.cert.type), d == null ? '—' : `<span class="mono">${esc(x.c.cert.no)}</span>`, d == null ? tag('缺失 · 禁止上架', 'red') : d < 0 ? tag('已过期 ' + (-d) + ' 天', 'red') : d <= 60 ? tag(d + ' 天后到期', 'orange') : tag(d + ' 天', 'green'), d == null || d <= 60 ? btn(d == null ? '登记证书' : '登记续期', 'certRenew', { sku: x.p.sku }, 'btn-accent') : '']; })) + note('提前 60 天提醒。证书缺失或过期的商品，刊登 Agent 会拦截发布。'), '', { flush: true }) +
      card('Честный знак 标签识别（R17）', table(['商品', '品类', '要求', '操作'], sc.filter(x => x.mk).map(x => [esc(x.p.name), esc(x.mk), x.c.marked ? tag('已生成贴标任务', 'green') : tag('需 DataMatrix 标签', 'orange'), x.c.marked ? '' : btn('生成贴标任务', 'markTask', { sku: x.p.sku })]), '当前商品都不在强制标识品类') + note('强制标识的品类按俄罗斯 Честный знак 名录逐步扩大，跨境直发是否适用，以 Ozon 当期要求为准。'), '', { flush: true }) + `</div>` +
      `<div class="ofs-grid-2">` +
      card('禁限售词与品类拦截（R18）', table(['商品', '命中', '原因', '操作'], sc.filter(x => x.b.length).map(x => [esc(x.p.name), x.b.map(b => tag(b.hit, b.tone)).join(' '), esc(x.b.map(b => b.why).join('；')), btn('清洗文案', 'cntClean', { sku: x.p.sku })]), '没有命中风险词'), '', { flush: true }) +
      card('图片规范与 AI 生图合规（R12）', table(['商品', '张数', '白底主图', '中文字样', '分辨率', '操作'], sc.filter(x => x.c.images < 5 || !x.c.whiteBg || x.c.cnText || x.c.res < 900).map(x => [esc(x.p.name), x.c.images, x.c.whiteBg ? '✓' : tag('否', 'orange'), x.c.cnText ? tag('有', 'red') : '✓', x.c.res + 'px', btn('生成合规图', 'imgFix', { sku: x.p.sku })]), '图片全部合规') + note('标准：至少 5 张图，主图白底、无中文和水印，边长不低于 900px。AI 生成的图片必须和实物一致，否则会被判为误导消费者。'), '', { flush: true }) + `</div>` +
      `<div class="ofs-grid-2">` +
      card('高频问答回写商品卡（R14）', table(['商品', '问题', '回答', '操作'], qa.map(q => { const p = list.find(x => x.sku === q.sku); const done = p && cOf(p).faq.includes(q.id); return [esc(q.product), esc(q.question), `<span class="hint">${esc(q.answer)}</span>`, !p ? '' : done ? tag('已回写', 'green') : btn('回写到描述', 'qaWrite', { sku: q.sku, id: q.id })]; }), '暂无已回答的问答'), '', { flush: true }) +
      card('品牌资产库与防盗图（R53）', table(['图片', '指纹', '疑似盗用', '操作'], stolen.map(({ x, a }) => [`<span class="mono">${esc(a.id)}</span>`, `<span class="mono">${a.hash}</span>`, tag(a.stolen, 'orange'), btn('发起投诉（审批）', 'ipComplain', { sku: x.p.sku, img: a.id }, 'btn-danger')]), '没有发现盗图') + note(`资产库共收录 ${sc.reduce((a, x) => a + x.c.assets.length, 0)} 张图片指纹，每天和同类目新上架的商品比对一次。`), '', { flush: true }) + `</div>` +
      card('视频与富文本生成（R13）', `<p class="hint" style="margin:0 0 8px">缺富文本 ${sc.filter(x => !x.c.rich).length} 个 · 缺视频 ${sc.filter(x => !x.c.video).length} 个。富文本按 Ozon Rich-content JSON 结构生成（图文模块 + 参数表 + 问答）；视频生成 15 秒的主图轮播脚本，交给剪辑或 AI 视频工具制作。</p>` + btn('批量生成富文本草稿', 'richAll', {}, 'btn-primary') + ' ' + btn('批量生成视频脚本', 'videoAll', {}, 'btn-secondary'));
    },
  });

  function suggestTitle(p) { const base = (p.ru || p.name).replace(/\s+/g, ' ').trim(); return base.indexOf(',') > -1 ? base : base + ', ' + feature(p); }
  function findAny(sku) { const s = F.S(); return s.products.find(p => p.sku === sku) || (s.listings || []).find(p => p.sku === sku); }
  function fix(p) {
    const c = cOf(p); c.titleDraft = suggestTitle(p); c.attrsFilled = c.attrsTotal; c.rich = true;
    BANNED.forEach(b => { c.desc = c.desc.replace(new RegExp(b.w.source, 'gi'), '').trim(); });
    if (typeof p.map === 'number') p.map = 100;
  }
  F.on('cntFix', d => { const p = findAny(d.sku); fix(p); F.act('内容优化 Agent', 'AI 补齐内容', p.name, '标题/属性/富文本草稿'); return { ok: true, msg: p.name + ' 已生成补齐草稿' }; });
  F.on('cntFixAll', () => { const l = items(); l.forEach(fix); F.act('内容优化 Agent', '批量 AI 补齐', l.length + ' 个商品', '草稿待同步'); return { ok: true, msg: '已为 ' + l.length + ' 个商品生成补齐草稿' }; });
  F.on('cntTitle', d => { const p = findAny(d.sku); cOf(p).titleDraft = suggestTitle(p); F.act(Store.roleLabel(), '采用俄语标题', p.name, cOf(p).titleDraft); return { ok: true, msg: '标题已更新' }; });
  F.on('cntClean', d => { const p = findAny(d.sku); const c = cOf(p); BANNED.forEach(b => { c.desc = c.desc.replace(new RegExp(b.w.source, 'gi'), '').trim(); if (c.titleDraft) c.titleDraft = c.titleDraft.replace(new RegExp(b.w.source, 'gi'), '').trim(); }); F.act('合规 Agent', '清洗风险词', p.name, '已清洗'); return { ok: true, msg: p.name + ' 风险词已清洗' }; });
  F.on('certRenew', d => { const p = findAny(d.sku); const c = cOf(p); c.cert.days = 1095; c.cert.no = c.cert.no.replace(/\d+$/, String(Math.floor(100000 + Math.random() * 899999))); F.act(Store.roleLabel(), '登记 EAC 证书', p.name, '有效期 3 年'); return { ok: true, msg: p.name + ' 证书已登记' }; });
  F.on('markTask', d => { const p = findAny(d.sku); cOf(p).marked = true; F.act('合规 Agent', 'Честный знак 贴标任务', p.name, '已生成'); return { ok: true, msg: '已生成贴标任务' }; });
  F.on('imgFix', d => { const p = findAny(d.sku); const c = cOf(p); c.images = Math.max(5, c.images); c.whiteBg = true; c.cnText = false; c.res = Math.max(1200, c.res); F.act('内容优化 Agent', '生成合规图片', p.name, '白底/去中文/1200px'); return { ok: true, msg: p.name + ' 合规图片已生成，待确认' }; });
  F.on('qaWrite', d => { const p = findAny(d.sku); cOf(p).faq.push(d.id); F.act('俄语客服 Agent', '问答回写商品卡', p.name, d.id); return { ok: true, msg: '已回写到商品描述' }; });
  F.on('richAll', () => { const l = items(); l.forEach(p => { cOf(p).rich = true; }); F.act('内容优化 Agent', '批量富文本', l.length + ' 个', '草稿'); return { ok: true, msg: '已生成 ' + l.length + ' 份富文本草稿' }; });
  F.on('videoAll', () => { const l = items(); l.forEach(p => { cOf(p).video = true; }); F.act('内容优化 Agent', '批量视频脚本', l.length + ' 个', '脚本'); return { ok: true, msg: '已生成 ' + l.length + ' 份视频脚本' }; });
  F.on('ipComplain', d => { const p = findAny(d.sku); return Object.assign(Store.proposeApproval({ type: '侵权投诉', title: '投诉盗图 ' + d.img, target: p.name, before: '图片被他人使用', after: '向 Ozon 提交知识产权投诉', reason: '图片指纹一致', agent: '资产保护 Agent', risk: 'mid', action: 'ipComplaint', key: 'ip:' + d.img, payload: { sku: d.sku, img: d.img } }), { msg: '投诉已进审批中心' }); });
  Store.registerApprovalAction('ipComplaint', pl => { const p = findAny(pl.sku); const a = cOf(p).assets.find(x => x.id === pl.img); if (a) a.stolen = ''; return { ok: true, msg: '投诉已提交' }; });
  F.contentSummary = function () { const l = items(); return { low: l.filter(p => score(p).total < 60).length, cert: l.filter(p => { const c = cOf(p).cert; return c && (c.days == null || c.days <= 60); }).length, banned: l.filter(p => bannedHits(p).length).length }; };
})();
