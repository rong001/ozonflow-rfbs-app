/**
 * OzonFlow 本地语义理解：规则引擎听不懂时，用
 *  1) 字符二元组相似度（即时、零下载）
 *  2) 浏览器内向量模型 bge-small-zh（transformers.js，首次约 24MB，之后走浏览器缓存）
 * 把口语化说法映射到标准指令，再交给指令台的规则引擎生成可预览的执行计划。不需要任何大模型 Key，数据不出浏览器。
 */
(function () {
  const T = [
    ['把毛利低于20%的商品提价8%', ['利润太低的商品涨点价', '不赚钱的商品价格调高', '亏本的商品提价', '低毛利商品调价', '毛利不够的涨价', '不赚钱的降价', '利润低的调整价格']],
    ['处理所有超时订单', ['快超时的单子赶紧处理', '要逾期的订单怎么办', '抢救快过期的订单', '发货快来不及了', '马上要罚款的订单']],
    ['回复所有差评', ['买家给了差评帮我回', '给低分评价回个话', '处理负面评论', '一星评价怎么办']],
    ['补货低于安全库存的SKU', ['库存快没了', '哪些货要断了补一下', '备货不够了', '要断货了']],
    ['跑一遍所有Agent', ['全部自动化跑起来', '让机器人都干活', '一键全自动处理', '自动跑一遍流程']],
    ['查询今天待发货订单', ['今天要发哪些货', '还有多少单没发', '待发的单子给我看看', '今天要打包的']],
    ['检查物流轨迹异常', ['包裹卡住了吗', '物流有没有异常', '快递不动了', '哪些件停滞了']],
    ['生成本周周报', ['这周做得怎么样', '给老板的汇报', '本周经营情况', '周总结']],
    ['打开审批中心', ['有什么要我批的', '待审批事项', '需要我确认的操作']],
    ['暂停所有亏损广告', ['广告在亏钱', '关掉不赚钱的推广', '推广烧钱太多', '停掉亏的广告']],
    ['检查证书到期和风险词', ['EAC快过期了', '合规有没有问题', '违禁词检查', '认证证书到期']],
    ['对一下本店回款差异', ['回款对不上', 'Ozon少打款了', '结算核对', '钱和预期不一样', '对账']],
    ['店铺健康和错误指数', ['店铺会不会被封', '店铺评分怎么样', '账号有风险吗', '店铺指标']],
    ['回传所有运单号', ['把快递单号传上去', '运单号同步到Ozon', '上传追踪号']],
    ['回复买家消息', ['买家私信', '聊天消息回一下', '有人问问题', '客户咨询']],
    ['生成今日简报', ['今天情况怎么样', '早报', '给我个总结', '今日经营概况']],
    ['按规则自动审单', ['把新订单过一遍', '审核新订单', '新来的订单检查一下']],
    ['1688采购跟单', ['去进货', '下采购单', '拿货', '向供应商订货']],
    ['同步店铺数据', ['拉取Ozon后台订单', '从插件同步', '导入真实订单', '把卖家后台数据拿过来', '连接店铺']],
    ['采集同款价格', ['看看竞品卖多少钱', '对手价格多少', '比价', '同款最低价', 'WB上卖多少']],
    ['查物流轨迹', ['包裹到哪了', '快递查询', '运单跟踪', '查一下物流']],
    ['推送简报到群', ['发到企业微信', '通知群里', '推送到钉钉', '发飞书']],
    ['打开素材工坊', ['做主图', '图片做成白底', '做商品视频', '富内容', '处理商品图片']],
  ];
  const STOP = /帮我|给我|请|一下|把|的|了|吧|呢|啊|吗|们|所有|全部|那些|这些|一些|我|你|能不能|可以|麻烦|怎么样|咋样|如何|情况/g;
  const clean = s => String(s || '').toLowerCase().replace(STOP, '').replace(/[\s,，。.!！?？、]/g, '');
  const grams = s => { const g = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); g.set(k, (g.get(k) || 0) + 1); } if (s.length === 1) g.set(s, 1); return g; };
  function dice(a, b) { const A = grams(a), B = grams(b); let inter = 0, na = 0, nb = 0; A.forEach(v => na += v); B.forEach(v => nb += v); A.forEach((v, k) => { if (B.has(k)) inter += Math.min(v, B.get(k)); }); return Math.max(na, nb) ? inter / Math.max(na, nb) : 0; }

  /** 把用户原话里的数字、方向词填回标准指令 */
  function fill(canon, text) {
    if (!/提价8%/.test(canon)) return canon;
    const below = (text.match(/(?:低于|小于|不到|不足|<|跌破)\s*(\d+(?:\.\d+)?)/) || [])[1] || 20;
    const nums = (text.match(/\d+(?:\.\d+)?/g) || []).filter(n => n !== String(below));
    const pct = nums[0] || 8; const down = /降|便宜|下调|打折|减价/.test(text);
    return `把毛利低于${below}%的商品${down ? '降价' : '提价'}${pct}%`;
  }

  function quick(text) {
    const c = clean(text); if (!c) return null; let best = null;
    T.forEach(([canon, ex]) => [canon].concat(ex).forEach(p => { const s = dice(c, clean(p)); if (!best || s > best.score) best = { canon, score: s, via: p }; }));
    return best && best.score >= 0.4 ? { text: fill(best.canon, text), canon: best.canon, score: best.score, method: '字符相似度' } : (best && { text: fill(best.canon, text), canon: best.canon, score: best.score, method: '字符相似度', weak: true });
  }

  let model = null, loading = null, vecs = null; const status = { state: 'idle', msg: '' };
  function load() {
    if (model) return Promise.resolve(model);
    if (loading) return loading;
    status.state = 'loading'; status.msg = '正在加载本地语义模型（首次约 24MB，之后秒开）';
    loading = import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2').then(tf => {
      tf.env.allowLocalModels = false;
      return tf.pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', { dtype: 'q8' });
    }).then(p => { model = p; status.state = 'ready'; status.msg = '本地语义模型已就绪'; return p; })
      .catch(e => { loading = null; status.state = 'error'; status.msg = '语义模型加载失败：' + e.message; throw e; });
    return loading;
  }
  const embed = (p, arr) => p(arr, { pooling: 'cls', normalize: true }).then(t => t.tolist());
  const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  function deep(text) {
    return load().then(p => {
      const flat = []; T.forEach(([canon, ex]) => [canon].concat(ex).forEach(x => flat.push({ canon, x })));
      const vp = vecs ? Promise.resolve(vecs) : embed(p, flat.map(f => f.x)).then(v => (vecs = v));
      return vp.then(V => embed(p, [text]).then(([q]) => {
        let best = null; V.forEach((v, i) => { const s = cos(q, v); if (!best || s > best.score) best = { canon: flat[i].canon, score: s }; });
        return best && best.score >= 0.85 ? { text: fill(best.canon, text), canon: best.canon, score: best.score, method: '本地语义模型' } : null;
      }));
    });
  }
  window.OzonFlowNLU = { quick, deep, load, status, templates: T, fill, dice };
})();
