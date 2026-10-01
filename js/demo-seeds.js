/**
 * OzonFlow · 三套演示数据集（老板演示脚本）
 * yiwu      — 小白冷启动（Wizard + 少 SKU 闭环）
 * guangzhou — 旺季履约突击（爆款多、规则引擎、客服差评）
 * pressure  — 多店公司化（多店分区 + 角色 + 超时压力）
 */
window.OzonFlowSeeds = (function () {
  const FX = 11.85;
  const COMMISSION = 0.12;
  const PAYMENT_FEE = 0.0265;
  const SHIP_CNY_PER_KG = 18.5;
  const RETURN_PROVISION = 0.03;

  const COMMISSION_TIERS = [
    { min: 0, max: 500, rate: 0.15, label: '低价档 ≤500₽' },
    { min: 500, max: 2000, rate: 0.12, label: '常规档 500–2000₽' },
    { min: 2000, max: 999999, rate: 0.10, label: '高价档 >2000₽' },
  ];

  const CHANNELS = [
    { id: 'yuntu', name: '云途专线·俄线', short: '云途', pricePerKg: 18.5, eta: '12-18天', connected: true, logo: '云', logoBg: '#dbeafe', logoColor: '#1d4ed8', today: 0 },
    { id: 'yanwen', name: '燕文物流·经济', short: '燕文', pricePerKg: 14.2, eta: '15-22天', connected: true, logo: '燕', logoBg: '#fef3c7', logoColor: '#d97706', today: 0 },
    { id: 'ogl', name: 'Ozon OGL 官方', short: 'OGL', pricePerKg: null, eta: '10-15天', connected: true, logo: 'OG', logoBg: '#ede9fe', logoColor: '#7c3aed', today: 0, isOgl: true },
    { id: '4px', name: '递四方·标准', short: '4PX', pricePerKg: 16.8, eta: '12-20天', connected: false, logo: '4PX', logoBg: '#fce7f3', logoColor: '#db2777', today: 0 },
    { id: 'cne', name: 'CNE 国际快递', short: 'CNE', pricePerKg: 22.0, eta: '8-12天', connected: false, logo: 'CNE', logoBg: '#ecfdf5', logoColor: '#059669', today: 0 },
    { id: 'warehouse', name: '义乌集货仓·自提', short: '本地仓', pricePerKg: 0, eta: '本地', connected: true, logo: '仓', logoBg: '#fee2e2', logoColor: '#dc2626', today: 0, isWarehouse: true },
  ];

  const BASE_RULES = [
    {
      id: 'r_audit', on: true, icon: '✅', iconClass: 'blue',
      name: '自动审单 · 常规订单',
      desc: '金额 < 5000₽ 且无缺货 → 自动通过审核',
      type: 'audit',
      when: { amountLt: 5000, noBuyerNote: true },
      then: { action: 'audit_pass' },
      hits: 0, today: 0,
      conditionsHtml: `当 <code>订单金额</code> &lt; <code>5000 ₽</code><br/>且 <code>买家留言</code> = <code>空</code><br/>→ 动作：<code>自动审核通过</code>`,
    },
    {
      id: 'r_ship_light', on: true, icon: '🚚', iconClass: 'green',
      name: '物流匹配 · 轻小件走云途',
      desc: '重量 ≤ 500g 自动分配云途俄线',
      type: 'logistics',
      when: { weightLte: 500 },
      then: { action: 'assign_logistics', channelId: 'yuntu' },
      hits: 0, today: 0,
      conditionsHtml: `当 <code>包裹重量</code> ≤ <code>500 g</code><br/>且 <code>目的国</code> = <code>俄罗斯</code><br/>→ 动作：<code>分配物流 = 云途专线·俄线</code>`,
    },
    {
      id: 'r_ship_heavy', on: true, icon: '📦', iconClass: 'orange',
      name: '物流匹配 · 大件走燕文',
      desc: '重量 > 500g → 燕文经济',
      type: 'logistics',
      when: { weightGt: 500 },
      then: { action: 'assign_logistics', channelId: 'yanwen' },
      hits: 0, today: 0,
      conditionsHtml: `当 <code>包裹重量</code> &gt; <code>500 g</code><br/>→ 动作：<code>分配物流 = 燕文物流·经济</code>`,
    },
    {
      id: 'r_purchase', on: true, icon: '🛒', iconClass: 'purple',
      name: '采购标记 · 审后无本地库存',
      desc: '审单通过且本地仓库存不足 → 标记待采购',
      type: 'purchase',
      when: { afterAudit: true, localStockLte: 5 },
      then: { action: 'mark_purchase' },
      hits: 0, today: 0,
      conditionsHtml: `当 <code>已审单</code> = <code>是</code><br/>且 <code>本地可用库存</code> ≤ <code>5</code><br/>→ 动作：<code>标记待采购</code>`,
    },
    {
      id: 'r_stock', on: true, icon: '🔄', iconClass: 'purple',
      name: '库存同步 · 低库存预警',
      desc: '本地仓 ≤ 安全库存时同步下调并通知',
      type: 'inventory',
      when: { localLteSafe: true },
      then: { action: 'sync_stock_alert' },
      hits: 0, today: 0,
      conditionsHtml: `当 <code>本地可用库存</code> ≤ <code>安全库存</code><br/>→ 动作：<code>同步 Ozon 库存</code> + <code>推送补货提醒</code>`,
    },
    {
      id: 'r_waybill', on: true, icon: '🧾', iconClass: 'green',
      name: '自动取号 · 已审且有物流',
      desc: '审单通过且已匹配渠道后可申请运单号',
      type: 'waybill',
      when: { hasLogistics: true, audited: true },
      then: { action: 'ready_waybill' },
      hits: 0, today: 0,
      conditionsHtml: `当 <code>订单状态</code> ∈ <code>待发货/待采购</code><br/>且 <code>物流渠道</code> ≠ <code>空</code><br/>→ 动作：<code>允许申请运单号</code>`,
    },
  ];

  const REPLY_TEMPLATES = [
    { id: 't1', name: '差评致歉·质量', ru: 'Здравствуйте! Приносим извинения за доставленные неудобства. Мы уже передали ваш отзыв нашему отделу качества и готовы предложить замену или частичный возврат. Напишите нам в чат — поможем!', zh: '致歉·质量问题，愿换货/部分退款' },
    { id: 't2', name: '物流延误说明', ru: 'Здравствуйте! Ваш заказ в пути. Международная доставка иногда занимает чуть больше времени из-за таможни. Трекинг обновляется каждые 2–3 дня. Спасибо за терпение!', zh: '物流延误·海关时效说明' },
    { id: 't3', name: '好评感谢', ru: 'Спасибо за ваш отзыв! Рады, что товар вам понравился. Будем рады видеть вас снова 💙', zh: '好评感谢' },
    { id: 't4', name: '尺码/参数答疑', ru: 'Здравствуйте! Параметры указаны в карточке товара. Если нужна помощь с выбором — напишите нам размеры/модель устройства, подскажем!', zh: '参数答疑' },
    { id: 't5', name: '退货指引', ru: 'Здравствуйте! Вы можете оформить возврат в личном кабинете Ozon в течение 14 дней. После получения товара на складе средства вернутся автоматически.', zh: '退货流程指引' },
  ];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function makeCatalog() {
    return [
      { id: 'c1', emoji: '🎧', name: '无线降噪耳机 TWS Pro', ru: 'Беспроводные наушники TWS Pro', price: 1890, sales: 2840, cost: 48.5, weight: 180, match: 98, margin: 32, rank: 1, cat: '电子配件', skuHint: 'OF-TWS-001' },
      { id: 'c2', emoji: '🔌', name: '65W 氮化镓快充头', ru: 'Зарядное устройство 65W GaN', price: 980, sales: 1920, cost: 22.0, weight: 95, match: 96, margin: 28, rank: 2, cat: '电子配件', skuHint: 'OF-GAN-65' },
      { id: 'c3', emoji: '💡', name: 'RGB 护眼台灯', ru: 'LED лампа настольная RGB', price: 1450, sales: 1560, cost: 35.5, weight: 420, match: 94, margin: 35, rank: 3, cat: '家居收纳', skuHint: 'OF-LED-RGB' },
      { id: 'c4', emoji: '🔋', name: 'MagSafe 磁吸充电宝 20000mAh', ru: 'Power Bank 20000mAh MagSafe', price: 2290, sales: 1180, cost: 68.0, weight: 380, match: 97, margin: 30, rank: 4, cat: '电子配件', skuHint: 'OF-PB-20K' },
      { id: 'c5', emoji: '🧺', name: '冰箱收纳盒 4 件套', ru: 'Органайзер для холодильника', price: 690, sales: 980, cost: 12.8, weight: 520, match: 91, margin: 18, rank: 5, cat: '家居收纳', skuHint: 'OF-ORG-FR' },
      { id: 'c6', emoji: '🔗', name: 'Type-C 编织数据线 2m', ru: 'Кабель USB-C 2м нейлон', price: 290, sales: 4200, cost: 3.2, weight: 45, match: 99, margin: 42, rank: 6, cat: '电子配件', skuHint: 'OF-CAB-USB' },
      { id: 'c7', emoji: '🖱️', name: '静音无线鼠标', ru: 'Беспроводная мышь бесшумная', price: 590, sales: 860, cost: 15.5, weight: 110, match: 93, margin: 26, rank: 7, cat: '电子配件', skuHint: 'OF-MSE-SIL' },
      { id: 'c8', emoji: '⌨️', name: '机械键盘 87 键', ru: 'Механическая клавиатура 87', price: 2490, sales: 420, cost: 88.0, weight: 780, match: 90, margin: 22, rank: 8, cat: '电子配件', skuHint: 'OF-KB-87' },
      { id: 'c9', emoji: '🧴', name: '保温杯 500ml', ru: 'Термос 500 мл', price: 790, sales: 640, cost: 18.0, weight: 350, match: 88, margin: 24, rank: 9, cat: '厨房小电', skuHint: 'OF-THM-500' },
      { id: 'c10', emoji: '🪞', name: 'LED 化妆镜', ru: 'Зеркало с подсветкой LED', price: 1190, sales: 510, cost: 28.0, weight: 480, match: 86, margin: 27, rank: 10, cat: '美容个护', skuHint: 'OF-MIR-LED' },
    ];
  }

  function defaultSettings() {
    return {
      fx: FX,
      commission: COMMISSION,
      commissionTiers: clone(COMMISSION_TIERS),
      paymentFee: PAYMENT_FEE,
      shipCnyPerKg: SHIP_CNY_PER_KG,
      returnProvision: RETURN_PROVISION,
      defaultLogistics: 'yuntu',
    };
  }

  function defaultWizard(completed) {
    return {
      completed: !!completed,
      step: completed ? 4 : 0,
      shopBound: !!completed,
      clientId: completed ? 'demo-client-****' : '',
      apiKey: completed ? '••••••••' : '',
      rfbsChosen: !!completed,
      defaultLogistics: 'yuntu',
      productsImported: !!completed,
    };
  }

  function tagShop(arr, shopId) {
    return arr.map(x => Object.assign({}, x, { shopId: x.shopId || shopId }));
  }


  function defaultAgents(preset) {
    /* preset: 'off' | 'peak' (旺季) | 'corp' (多店) */
    const base = [
      {
        id: 'selection_radar', icon: '📡', name: '选品雷达 Agent',
        desc: '扫描爆款热榜，按毛利阈值自动认领进刊登草稿',
        on: false, lastRun: null, todayCount: 0, log: [],
        config: { marginMin: 25 },
      },
      {
        id: 'listing_publish', icon: '📤', name: '刊登过审 Agent',
        desc: '推进类目映射完整度，就绪后自动发布上架',
        on: false, lastRun: null, todayCount: 0, log: [],
        config: {},
      },
      {
        id: 'order_fulfill', icon: '📦', name: '审单履约 Agent',
        desc: '自动审单 → 按规则匹配物流 → 申请面单',
        on: false, lastRun: null, todayCount: 0, log: [],
        config: {},
      },
      {
        id: 'timeout_rescue', icon: '🚨', name: '超时抢救 Agent',
        desc: '优先处理 eta≤6h：审单→面单→发货，缺货标采购',
        on: false, lastRun: null, todayCount: 0, log: [],
        config: { etaMaxH: 6 },
      },
      {
        id: 'profit_guard', icon: '🛡️', name: '利润守门 Agent',
        desc: '拦截/标记低于最低毛利的刊登与跟卖价，给出建议价',
        on: false, lastRun: null, todayCount: 0, log: [],
        config: { marginMin: 20 },
      },
      {
        id: 'ru_cs', icon: '💬', name: '俄语客服 Agent',
        desc: '对未回复差评一键发送俄语致歉模板',
        on: false, lastRun: null, todayCount: 0, log: [],
        config: {},
      },
      {
        id: 'return_claim', icon: '↩️', name: '退货理赔 Agent',
        desc: '推进开放退货单：调查 → 同意/拒绝 → 退款关闭',
        on: false, lastRun: null, todayCount: 0, log: [],
        config: {},
      },
      {
        id: 'inventory_restock', icon: '📊', name: '库存补货 Agent',
        desc: '低于安全库存的 SKU 自动补货入库',
        on: false, lastRun: null, todayCount: 0, log: [],
        config: { qty: 50 },
      },
      {
        id: 'weekly_report', icon: '📈', name: '周报汇报 Agent',
        desc: '生成经营周报快照并推送 Toast 摘要',
        on: false, lastRun: null, todayCount: 0, log: [],
        config: {},
      },
    ];
    const agents = clone(base);
    if (preset === 'peak') {
      // 旺季履约突击：履约/客服/超时/利润重点开启
      const onIds = ['order_fulfill', 'timeout_rescue', 'ru_cs', 'return_claim', 'profit_guard', 'inventory_restock'];
      agents.forEach(a => { a.on = onIds.includes(a.id); });
    } else if (preset === 'corp') {
      // 多店公司化：超时抢救 + 补货 + 周报 + 刊登 + 选品
      const onIds = ['timeout_rescue', 'inventory_restock', 'weekly_report', 'listing_publish', 'selection_radar', 'order_fulfill'];
      agents.forEach(a => { a.on = onIds.includes(a.id); });
    }
    return agents;
  }

  /* ===== Dataset 1: 小白冷启动 ===== */
  function seedYiwu() {
    const shopId = 's_yiwu';
    const catalog = makeCatalog().slice(0, 6);
    const shops = [
      { id: shopId, name: '义乌优选旗舰店', status: 'online', clientId: '', apiKey: '', mode: 'rFBS' },
    ];
    const listings = tagShop([
      { id: 'L1', emoji: '🖱️', name: '静音无线鼠标', ru: 'Беспроводная мышь бесшумная', cat: 'Электроника › Мыши', map: 40, status: 'draft', price: 590, cost: 15.5, weight: 110, sku: 'OF-MSE-SIL', stockInit: 50 },
      { id: 'L2', emoji: '⌨️', name: '机械键盘 87 键', ru: 'Механическая клавиатура 87', cat: '— 待映射 —', map: 20, status: 'draft', price: 2490, cost: 88.0, weight: 780, sku: 'OF-KB-87', stockInit: 30 },
      { id: 'L3', emoji: '🧴', name: '保温杯 500ml', ru: 'Термос 500 мл', cat: '— 待映射 —', map: 10, status: 'draft', price: 790, cost: 18.0, weight: 350, sku: 'OF-THM-500', stockInit: 80 },
    ], shopId);
    const products = tagShop([
      { id: 'P1', emoji: '🎧', name: '无线降噪耳机 TWS Pro', ru: 'Беспроводные наушники TWS Pro', sku: 'OF-TWS-001', ozonSku: '168924751', price: 1890, cost: 48.5, weight: 180, status: 'active', todaySales: 8, margin: 32 },
      { id: 'P2', emoji: '🔗', name: 'Type-C 编织数据线 2m', ru: 'Кабель USB-C 2м нейлон', sku: 'OF-CAB-USB', ozonSku: '168924800', price: 290, cost: 3.2, weight: 45, status: 'active', todaySales: 15, margin: 42 },
    ], shopId);
    const inventory = tagShop([
      { sku: 'OF-TWS-001', name: '无线降噪耳机 TWS Pro', emoji: '🎧', local: 45, ozon: 40, safe: 20, sync: 'ok' },
      { sku: 'OF-CAB-USB', name: 'Type-C 编织数据线 2m', emoji: '🔗', local: 220, ozon: 200, safe: 50, sync: 'ok' },
    ], shopId);
    const orders = tagShop([
      { id: 'OZ-YI-1001', emoji: '🎧', name: 'TWS Pro 耳机', buyer: 'Иван П.', city: 'Москва', amount: 1890, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 36, risk: false, weight: 180, sku: 'OF-TWS-001', cost: 48.5, track: null, note: '', timeline: [{ t: '今天 08:00', text: '订单同步自 Ozon', done: true }] },
      { id: 'OZ-YI-1002', emoji: '🔗', name: 'Type-C 数据线', buyer: 'Анна С.', city: 'СПб', amount: 290, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 40, risk: false, weight: 45, sku: 'OF-CAB-USB', cost: 3.2, track: null, note: '', timeline: [{ t: '今天 08:12', text: '订单同步自 Ozon', done: true }] },
      { id: 'OZ-YI-1003', emoji: '🎧', name: 'TWS Pro 耳机', buyer: 'Дмитрий К.', city: 'Казань', amount: 1890, logistics: '云途专线·俄线', logisticsId: 'yuntu', auto: ['已审单', '已匹配物流'], status: 'ship', statusLabel: '待发货', etaH: 22, risk: false, weight: 180, sku: 'OF-TWS-001', cost: 48.5, track: null, note: '', timeline: [
        { t: '昨天 16:00', text: '订单同步自 Ozon', done: true },
        { t: '昨天 16:01', text: '自动审单通过', done: true },
        { t: '昨天 16:01', text: '物流匹配 → 云途专线·俄线', done: true },
      ]},
    ], shopId);
    const reviews = tagShop([
      { id: 'RV1', sku: 'OF-TWS-001', product: 'TWS Pro 耳机', emoji: '🎧', rating: 5, text: 'Отличный звук, быстрая доставка!', buyer: 'Иван П.', replied: true, reply: 'Спасибо за ваш отзыв! 💙', created: '昨天 18:00' },
      { id: 'RV2', sku: 'OF-CAB-USB', product: 'Type-C 数据线', emoji: '🔗', rating: 3, text: 'Кабель нормальный, но упаковка помята.', buyer: 'Анна С.', replied: false, reply: '', created: '今天 09:20' },
    ], shopId);
    const qa = tagShop([
      { id: 'QA1', sku: 'OF-TWS-001', product: 'TWS Pro 耳机', question: 'Есть ли шумоподавление ANC?', answer: 'Да, активное шумоподавление ANC поддерживается.', answered: true, created: '昨天 12:00' },
      { id: 'QA2', sku: 'OF-CAB-USB', product: 'Type-C 数据线', question: 'Поддерживает ли зарядку 65W?', answer: '', answered: false, created: '今天 10:00' },
    ], shopId);
    const returns = tagShop([
      { id: 'RT1', orderId: 'OZ-YI-1003', type: 'return', status: 'open', reason: 'Не подошёл цвет', sku: 'OF-TWS-001', product: 'TWS Pro 耳机', emoji: '🎧', amount: 1890, created: '今天 11:00', timeline: [{ t: '今天 11:00', text: '买家申请退货', done: true }] },
    ], shopId);
    const trend = [12, 18, 15, 22, 19, 25, 28];
    const rules = clone(BASE_RULES);
    rules.forEach(r => { r.hits = Math.floor(Math.random() * 20); r.today = Math.floor(Math.random() * 5); });
    const channels = clone(CHANNELS);
    channels[0].today = 3; channels[1].today = 1;

    return {
      meta: {
        id: 'yiwu',
        name: '小白冷启动',
        desc: '新手开店 Wizard → 选品认领 → 刊登发布完整闭环',
        shopName: '义乌优选旗舰店',
      },
      settings: defaultSettings(),
      wizard: defaultWizard(false),
      role: 'boss',
      currentShopId: shopId,
      shops, catalog, listings, products, inventory, orders, rules, channels, trend,
      reviews, qa, returns, replyTemplates: clone(REPLY_TEMPLATES),
      claimedIds: [],
      nextOrderSeq: 1100,
      syncAgoMin: 2,
      fundAlert: false,
      agents: defaultAgents('off'),
      weeklySnapshot: null,
      agentTodayTotal: 0,
    };
  }

  /* ===== Dataset 2: 旺季履约突击 ===== */
  function seedGuangzhou() {
    const shopGz = 's_gz';
    const shopSz = 's_sz';
    const catalog = makeCatalog();
    const shops = [
      { id: shopGz, name: '广州数码专营', status: 'online', clientId: 'gz-****-8821', apiKey: '••••', mode: 'rFBS' },
      { id: shopSz, name: '深圳配件馆', status: 'online', clientId: 'sz-****-3310', apiKey: '••••', mode: 'rFBS' },
    ];
    const listings = [
      ...tagShop([
        { id: 'L1', emoji: '💡', name: 'RGB 护眼台灯', ru: 'Настольная лампа LED RGB', cat: 'Дом › Освещение', map: 100, status: 'ready', price: 1450, cost: 35.5, weight: 420, sku: 'OF-LED-RGB', stockInit: 60 },
        { id: 'L2', emoji: '🔋', name: 'MagSafe 充电宝', ru: 'Power Bank MagSafe 20000', cat: 'Электроника › Powerbank', map: 100, status: 'ready', price: 2290, cost: 68.0, weight: 380, sku: 'OF-PB-20K', stockInit: 40 },
        { id: 'L3', emoji: '🧺', name: '冰箱收纳盒套装', ru: 'Органайзеры для холодильника', cat: 'Дом › Хранение', map: 78, status: 'mapping', price: 690, cost: 12.8, weight: 520, sku: 'OF-ORG-FR', stockInit: 100 },
        { id: 'L4', emoji: '🪞', name: 'LED 化妆镜', ru: 'Зеркало с подсветкой LED', cat: 'Красота › Зеркала', map: 88, status: 'failed', price: 1190, cost: 28.0, weight: 480, sku: 'OF-MIR-LED', stockInit: 35, failReason: '缺少 обязательный атрибут Бренд' },
        { id: 'L5', emoji: '🧴', name: '保温杯 500ml', ru: 'Термос 500 мл', cat: '— 待映射 —', map: 15, status: 'draft', price: 790, cost: 18.0, weight: 350, sku: 'OF-THM-500', stockInit: 80 },
      ], shopGz),
      ...tagShop([
        { id: 'L6', emoji: '🔗', name: 'Type-C 编织数据线 2m', ru: 'Кабель USB-C 2м', cat: 'Электроника › Кабели', map: 100, status: 'ready', price: 290, cost: 3.2, weight: 45, sku: 'OF-CAB-USB-SZ', stockInit: 200 },
        { id: 'L7', emoji: '🖱️', name: '静音无线鼠标·深圳仓', ru: 'Мышь бесшумная SZ', cat: 'Электроника › Мыши', map: 60, status: 'mapping', price: 590, cost: 15.5, weight: 110, sku: 'OF-MSE-SZ', stockInit: 80 },
      ], shopSz),
    ];
    const products = [
      ...tagShop([
        { id: 'P1', emoji: '🎧', name: '无线降噪耳机 TWS Pro', ru: 'Беспроводные наушники TWS Pro', sku: 'OF-TWS-001', ozonSku: '168924751', price: 1890, cost: 48.5, weight: 180, status: 'active', todaySales: 42, margin: 32 },
        { id: 'P2', emoji: '🔌', name: '65W 氮化镓快充头', ru: 'Зарядное устройство 65W GaN', sku: 'OF-GAN-65', ozonSku: '172038812', price: 980, cost: 22.0, weight: 95, status: 'active', todaySales: 31, margin: 28 },
        { id: 'P3', emoji: '🔗', name: 'Type-C 编织数据线 2m', ru: 'Кабель USB-C 2м', sku: 'OF-CAB-USB', ozonSku: '168924800', price: 290, cost: 3.2, weight: 45, status: 'active', todaySales: 56, margin: 42 },
        { id: 'P4', emoji: '🖱️', name: '静音无线鼠标', ru: 'Беспроводная мышь', sku: 'OF-MSE-SIL', ozonSku: '172100001', price: 590, cost: 15.5, weight: 110, status: 'active', todaySales: 18, margin: 26 },
      ], shopGz),
      ...tagShop([
        { id: 'P5', emoji: '🔗', name: 'Type-C 数据线·深圳', ru: 'Кабель USB-C SZ', sku: 'OF-CAB-USB-SZ', ozonSku: '172200100', price: 290, cost: 3.2, weight: 45, status: 'active', todaySales: 24, margin: 42 },
        { id: 'P6', emoji: '🧴', name: '保温杯 500ml·深圳', ru: 'Термос SZ', sku: 'OF-THM-SZ', ozonSku: '172200200', price: 790, cost: 18.0, weight: 350, status: 'active', todaySales: 9, margin: 24 },
      ], shopSz),
    ];
    const inventory = [
      ...tagShop([
        { sku: 'OF-TWS-001', name: '无线降噪耳机 TWS Pro', emoji: '🎧', local: 86, ozon: 80, safe: 30, sync: 'ok' },
        { sku: 'OF-GAN-65', name: '65W 氮化镓快充头', emoji: '🔌', local: 12, ozon: 10, safe: 25, sync: 'warn' },
        { sku: 'OF-CAB-USB', name: 'Type-C 编织数据线 2m', emoji: '🔗', local: 310, ozon: 300, safe: 80, sync: 'ok' },
        { sku: 'OF-MSE-SIL', name: '静音无线鼠标', emoji: '🖱️', local: 8, ozon: 6, safe: 20, sync: 'warn' },
      ], shopGz),
      ...tagShop([
        { sku: 'OF-CAB-USB-SZ', name: 'Type-C 数据线·深圳', emoji: '🔗', local: 150, ozon: 140, safe: 40, sync: 'ok' },
        { sku: 'OF-THM-SZ', name: '保温杯 500ml·深圳', emoji: '🧴', local: 4, ozon: 3, safe: 15, sync: 'warn' },
      ], shopSz),
    ];
    const orders = [
      ...tagShop([
        { id: 'OZ-GZ-2001', emoji: '🎧', name: 'TWS Pro 耳机', buyer: 'Иван П.', city: 'Москва', amount: 1890, logistics: '云途专线·俄线', logisticsId: 'yuntu', auto: ['已审单', '已匹配物流'], status: 'ship', statusLabel: '待发货', etaH: 5, risk: true, weight: 180, sku: 'OF-TWS-001', cost: 48.5, track: null, note: '', timeline: [{ t: '今天 09:12', text: '订单同步自 Ozon', done: true }, { t: '今天 09:13', text: '自动审单通过', done: true }, { t: '今天 09:13', text: '物流匹配 → 云途', done: true }] },
        { id: 'OZ-GZ-2002', emoji: '🔌', name: '65W GaN 快充', buyer: 'Анна С.', city: 'СПб', amount: 980, logistics: '—', logisticsId: null, auto: ['已审单'], status: 'purchase', statusLabel: '待采购', etaH: 22, risk: false, weight: 95, sku: 'OF-GAN-65', cost: 22.0, track: null, note: '', timeline: [{ t: '今天 09:01', text: '订单同步自 Ozon', done: true }, { t: '今天 09:02', text: '自动审单通过', done: true }, { t: '今天 09:02', text: '库存不足 → 标记待采购', done: true }] },
        { id: 'OZ-GZ-2003', emoji: '🔗', name: 'Type-C 数据线', buyer: 'Сергей Н.', city: 'Краснодар', amount: 290, logistics: 'Ozon OGL 官方', logisticsId: 'ogl', auto: ['已审单', '已匹配物流'], status: 'ship', statusLabel: '待发货', etaH: 14, risk: false, weight: 45, sku: 'OF-CAB-USB', cost: 3.2, track: null, note: '', timeline: [{ t: '今天 08:40', text: '订单同步自 Ozon', done: true }, { t: '今天 08:41', text: '自动审单通过', done: true }] },
        { id: 'OZ-GZ-2004', emoji: '🔋', name: 'MagSafe 充电宝', buyer: 'Елена В.', city: 'Екб', amount: 2290, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 36, risk: false, weight: 380, sku: 'OF-PB-20K', cost: 68.0, track: null, note: '', timeline: [{ t: '今天 10:00', text: '订单同步自 Ozon', done: true }] },
        { id: 'OZ-GZ-2005', emoji: '🎧', name: 'TWS Pro 耳机 ×2', buyer: 'Мария Л.', city: 'Москва', amount: 3780, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 40, risk: false, weight: 360, sku: 'OF-TWS-001', cost: 97.0, track: null, note: '', timeline: [{ t: '今天 10:15', text: '订单同步自 Ozon', done: true }] },
        { id: 'OZ-GZ-2006', emoji: '🖱️', name: '静音无线鼠标', buyer: 'Ольга М.', city: 'Новосиб.', amount: 590, logistics: '云途专线·俄线', logisticsId: 'yuntu', auto: ['已审单', '已匹配物流', '已取号'], status: 'ship', statusLabel: '待发货', etaH: 20, risk: false, weight: 110, sku: 'OF-MSE-SIL', cost: 15.5, track: 'YT2409261001CN', note: '', timeline: [{ t: '今天 07:00', text: '订单同步自 Ozon', done: true }, { t: '今天 07:01', text: '自动审单通过', done: true }, { t: '今天 07:05', text: '运单号 YT2409261001CN', done: true }] },
        { id: 'OZ-GZ-2007', emoji: '🔗', name: 'Type-C 数据线', buyer: 'Игорь Б.', city: 'Тула', amount: 290, logistics: 'Ozon OGL 官方', logisticsId: 'ogl', auto: ['已审单', '已匹配物流', '已取号'], status: 'shipped', statusLabel: '已发货', etaH: null, risk: false, weight: 45, sku: 'OF-CAB-USB', cost: 3.2, track: 'OGL882910445', note: '', timeline: [{ t: '昨天 14:00', text: '订单同步自 Ozon', done: true }, { t: '昨天 15:00', text: '已提交平台发货', done: true }] },
        { id: 'OZ-GZ-2008', emoji: '🔌', name: '65W GaN 快充', buyer: 'Алексей Р.', city: 'Ростов', amount: 980, logistics: '燕文物流·经济', logisticsId: 'yanwen', auto: ['已审单', '已匹配物流'], status: 'purchase', statusLabel: '待采购', etaH: 4, risk: true, weight: 95, sku: 'OF-GAN-65', cost: 22.0, track: null, note: '', timeline: [{ t: '今天 06:00', text: '订单同步自 Ozon', done: true }] },
        { id: 'OZ-GZ-2009', emoji: '🎧', name: 'TWS Pro 耳机', buyer: 'Павел Г.', city: 'Москва', amount: 1890, logistics: '云途专线·俄线', logisticsId: 'yuntu', auto: ['已审单', '已匹配物流', '已取号'], status: 'shipped', statusLabel: '已发货', etaH: null, risk: false, weight: 180, sku: 'OF-TWS-001', cost: 48.5, track: 'YT2409258801CN', note: '', timeline: [{ t: '昨天 11:00', text: '已发货', done: true }] },
        { id: 'OZ-GZ-2010', emoji: '🖱️', name: '静音无线鼠标', buyer: 'Юлия Ф.', city: 'Воронеж', amount: 590, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 30, risk: false, weight: 110, sku: 'OF-MSE-SIL', cost: 15.5, track: null, note: '', timeline: [{ t: '今天 11:00', text: '订单同步自 Ozon', done: true }] },
      ], shopGz),
      ...tagShop([
        { id: 'OZ-SZ-2101', emoji: '🔗', name: 'Type-C 数据线·深圳', buyer: 'Никита В.', city: 'Москва', amount: 290, logistics: '云途专线·俄线', logisticsId: 'yuntu', auto: ['已审单', '已匹配物流'], status: 'ship', statusLabel: '待发货', etaH: 16, risk: false, weight: 45, sku: 'OF-CAB-USB-SZ', cost: 3.2, track: null, note: '', timeline: [{ t: '今天 08:00', text: '订单同步自 Ozon', done: true }] },
        { id: 'OZ-SZ-2102', emoji: '🧴', name: '保温杯·深圳', buyer: 'Дарья К.', city: 'СПб', amount: 790, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 28, risk: false, weight: 350, sku: 'OF-THM-SZ', cost: 18.0, track: null, note: '', timeline: [{ t: '今天 09:30', text: '订单同步自 Ozon', done: true }] },
        { id: 'OZ-SZ-2103', emoji: '🧴', name: '保温杯·深圳', buyer: 'Роман Л.', city: 'Казань', amount: 790, logistics: '—', logisticsId: null, auto: ['已审单'], status: 'purchase', statusLabel: '待采购', etaH: 10, risk: false, weight: 350, sku: 'OF-THM-SZ', cost: 18.0, track: null, note: '', timeline: [{ t: '今天 07:00', text: '库存不足 → 待采购', done: true }] },
      ], shopSz),
    ];
    const reviews = [
      ...tagShop([
        { id: 'RV1', sku: 'OF-TWS-001', product: 'TWS Pro 耳机', emoji: '🎧', rating: 2, text: 'Один наушник перестал работать через неделю. Очень разочарован!', buyer: 'Иван П.', replied: false, reply: '', created: '今天 08:30' },
        { id: 'RV2', sku: 'OF-GAN-65', product: '65W GaN 快充', emoji: '🔌', rating: 1, text: 'Нагревается сильно, боюсь пользоваться.', buyer: 'Анна С.', replied: false, reply: '', created: '今天 09:10' },
        { id: 'RV3', sku: 'OF-CAB-USB', product: 'Type-C 数据线', emoji: '🔗', rating: 5, text: 'Отличный кабель, быстрая зарядка!', buyer: 'Сергей Н.', replied: true, reply: 'Спасибо за ваш отзыв! 💙', created: '昨天 16:00' },
        { id: 'RV4', sku: 'OF-MSE-SIL', product: '静音无线鼠标', emoji: '🖱️', rating: 4, text: 'Тихая мышь, удобная. Доставка долгая.', buyer: 'Ольга М.', replied: false, reply: '', created: '今天 10:45' },
        { id: 'RV5', sku: 'OF-TWS-001', product: 'TWS Pro 耳机', emoji: '🎧', rating: 5, text: 'Звук супер, шумодав работает!', buyer: 'Мария Л.', replied: true, reply: 'Спасибо! Рады, что товар понравился.', created: '昨天 12:00' },
      ], shopGz),
      ...tagShop([
        { id: 'RV6', sku: 'OF-THM-SZ', product: '保温杯·深圳', emoji: '🧴', rating: 2, text: 'Держит тепло только 4 часа, обещали 12.', buyer: 'Дарья К.', replied: false, reply: '', created: '今天 11:00' },
      ], shopSz),
    ];
    const qa = [
      ...tagShop([
        { id: 'QA1', sku: 'OF-TWS-001', product: 'TWS Pro 耳机', question: 'Совместимы с iPhone 15?', answer: 'Да, работают с iPhone 15 через Bluetooth 5.3.', answered: true, created: '昨天 10:00' },
        { id: 'QA2', sku: 'OF-GAN-65', product: '65W GaN 快充', question: 'Есть ли кабель в комплекте?', answer: '', answered: false, created: '今天 08:00' },
        { id: 'QA3', sku: 'OF-PB-20K', product: 'MagSafe 充电宝', question: 'Можно ли брать в самолёт?', answer: '', answered: false, created: '今天 09:40' },
      ], shopGz),
      ...tagShop([
        { id: 'QA4', sku: 'OF-CAB-USB-SZ', product: 'Type-C 数据线·深圳', question: 'Длина точно 2 метра?', answer: 'Да, длина 2.0 м ±2 см.', answered: true, created: '昨天 14:00' },
      ], shopSz),
    ];
    const returns = [
      ...tagShop([
        { id: 'RT1', orderId: 'OZ-GZ-2009', type: 'return', status: 'open', reason: 'Брак: один наушник не работает', sku: 'OF-TWS-001', product: 'TWS Pro 耳机', emoji: '🎧', amount: 1890, created: '今天 07:30', timeline: [{ t: '今天 07:30', text: '买家申请退货', done: true }] },
        { id: 'RT2', orderId: 'OZ-GZ-2007', type: 'claim', status: 'investigating', reason: 'Посылка не получена (спор)', sku: 'OF-CAB-USB', product: 'Type-C 数据线', emoji: '🔗', amount: 290, created: '昨天 15:00', timeline: [{ t: '昨天 15:00', text: '买家发起索赔', done: true }, { t: '昨天 16:00', text: '平台介入调查', done: true }] },
        { id: 'RT3', orderId: 'OZ-GZ-2004', type: 'cancel', status: 'open', reason: 'Передумал', sku: 'OF-PB-20K', product: 'MagSafe 充电宝', emoji: '🔋', amount: 2290, created: '今天 10:20', timeline: [{ t: '今天 10:20', text: '买家申请取消', done: true }] },
      ], shopGz),
      ...tagShop([
        { id: 'RT4', orderId: 'OZ-SZ-2101', type: 'return', status: 'approved', reason: 'Не тот цвет', sku: 'OF-CAB-USB-SZ', product: 'Type-C 数据线·深圳', emoji: '🔗', amount: 290, created: '昨天 11:00', timeline: [{ t: '昨天 11:00', text: '申请退货', done: true }, { t: '昨天 14:00', text: '卖家同意退货', done: true }] },
      ], shopSz),
    ];
    const trend = [98, 124, 110, 156, 142, 168, 186];
    const rules = clone(BASE_RULES);
    rules[0].hits = 128; rules[0].today = 42;
    rules[1].hits = 96; rules[1].today = 41;
    rules[2].hits = 54; rules[2].today = 18;
    rules[3].hits = 23; rules[3].today = 7;
    rules[4].hits = 23; rules[4].today = 7;
    rules[5].hits = 87; rules[5].today = 35;
    const channels = clone(CHANNELS);
    channels[0].today = 42; channels[1].today = 18; channels[2].today = 12;

    return {
      meta: {
        id: 'guangzhou',
        name: '旺季履约突击',
        desc: '爆款多、出单快、差评待回，适合规则引擎 + 客服评价演示',
        shopName: '广州数码专营',
      },
      settings: defaultSettings(),
      wizard: defaultWizard(true),
      role: 'boss',
      currentShopId: shopGz,
      shops, catalog, listings, products, inventory, orders, rules, channels, trend,
      reviews, qa, returns, replyTemplates: clone(REPLY_TEMPLATES),
      claimedIds: [],
      nextOrderSeq: 2200,
      syncAgoMin: 1,
      fundAlert: true,
      agents: defaultAgents('peak'),
      weeklySnapshot: null,
      agentTodayTotal: 0,
    };
  }

  /* ===== Dataset 3: 多店公司化 ===== */
  function seedPressure() {
    const sYiwu = 's_yiwu';
    const sGz = 's_gz';
    const sSz = 's_sz';
    const catalog = makeCatalog();
    const shops = [
      { id: sYiwu, name: '义乌优选旗舰店', status: 'online', clientId: 'yi-****-1001', apiKey: '••••', mode: 'rFBS' },
      { id: sGz, name: '广州数码专营', status: 'online', clientId: 'gz-****-8821', apiKey: '••••', mode: 'rFBS' },
      { id: sSz, name: '深圳家居馆', status: 'syncing', clientId: 'sz-****-5500', apiKey: '••••', mode: 'rFBS' },
    ];
    const listings = [
      ...tagShop([
        { id: 'L1', emoji: '💡', name: 'RGB 护眼台灯', ru: 'Настольная лампа LED RGB', cat: 'Дом › Освещение', map: 100, status: 'ready', price: 1450, cost: 35.5, weight: 420, sku: 'OF-LED-RGB', stockInit: 20 },
      ], sYiwu),
      ...tagShop([
        { id: 'L2', emoji: '🧺', name: '冰箱收纳盒', ru: 'Органайзер для холодильника', cat: 'Дом › Хранение', map: 92, status: 'ready', price: 690, cost: 12.8, weight: 520, sku: 'OF-ORG-FR', stockInit: 40 },
        { id: 'L3', emoji: '🪞', name: 'LED 化妆镜', ru: 'Зеркало LED', cat: 'Красота › Зеркала', map: 55, status: 'mapping', price: 1190, cost: 28.0, weight: 480, sku: 'OF-MIR-LED', stockInit: 15 },
      ], sGz),
    ];
    const products = [
      ...tagShop([
        { id: 'P1', emoji: '🎧', name: '无线降噪耳机 TWS Pro', ru: 'Наушники TWS Pro', sku: 'OF-TWS-001', ozonSku: '168924751', price: 1890, cost: 48.5, weight: 180, status: 'active', todaySales: 28, margin: 32 },
        { id: 'P2', emoji: '🔌', name: '65W 氮化镓快充头', ru: 'ЗУ 65W GaN', sku: 'OF-GAN-65', ozonSku: '172038812', price: 980, cost: 22.0, weight: 95, status: 'active', todaySales: 22, margin: 28 },
      ], sYiwu),
      ...tagShop([
        { id: 'P3', emoji: '💡', name: 'RGB 护眼台灯', ru: 'Лампа RGB', sku: 'OF-LED-RGB', ozonSku: '159447203', price: 1450, cost: 35.5, weight: 420, status: 'active', todaySales: 15, margin: 35 },
        { id: 'P4', emoji: '🔋', name: 'MagSafe 充电宝', ru: 'Power Bank MagSafe', sku: 'OF-PB-20K', ozonSku: '165511908', price: 2290, cost: 68.0, weight: 380, status: 'active', todaySales: 11, margin: 30 },
      ], sGz),
      ...tagShop([
        { id: 'P5', emoji: '🧺', name: '冰箱收纳盒', ru: 'Органайзер', sku: 'OF-ORG-FR', ozonSku: '181002334', price: 690, cost: 12.8, weight: 520, status: 'active', todaySales: 19, margin: 18 },
      ], sSz),
    ];
    const inventory = [
      ...tagShop([
        { sku: 'OF-TWS-001', name: '无线降噪耳机 TWS Pro', emoji: '🎧', local: 5, ozon: 3, safe: 20, sync: 'warn' },
        { sku: 'OF-GAN-65', name: '65W 氮化镓快充头', emoji: '🔌', local: 3, ozon: 2, safe: 25, sync: 'warn' },
      ], sYiwu),
      ...tagShop([
        { sku: 'OF-LED-RGB', name: 'RGB 护眼台灯', emoji: '💡', local: 2, ozon: 1, safe: 15, sync: 'warn' },
        { sku: 'OF-PB-20K', name: 'MagSafe 充电宝', emoji: '🔋', local: 0, ozon: 0, safe: 10, sync: 'err' },
      ], sGz),
      ...tagShop([
        { sku: 'OF-ORG-FR', name: '冰箱收纳盒', emoji: '🧺', local: 8, ozon: 6, safe: 30, sync: 'warn' },
      ], sSz),
    ];
    const orders = [
      ...tagShop([
        { id: 'OZ-PR-3001', emoji: '🎧', name: 'TWS Pro 耳机', buyer: 'Иван П.', city: 'Москва', amount: 1890, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 6, risk: true, weight: 180, sku: 'OF-TWS-001', cost: 48.5, track: null, note: '', timeline: [{ t: '今天 07:00', text: '订单同步自 Ozon', done: true }] },
        { id: 'OZ-PR-3002', emoji: '🔌', name: '65W GaN 快充', buyer: 'Алексей Р.', city: 'Ростов', amount: 980, logistics: '燕文物流·经济', logisticsId: 'yanwen', auto: ['已审单', '已匹配物流'], status: 'purchase', statusLabel: '待采购', etaH: 4, risk: true, weight: 95, sku: 'OF-GAN-65', cost: 22.0, track: null, note: '', timeline: [{ t: '今天 05:30', text: '订单同步', done: true }] },
        { id: 'OZ-PR-3004', emoji: '🎧', name: 'TWS Pro 耳机', buyer: 'Елена В.', city: 'Екб', amount: 1890, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 10, risk: false, weight: 180, sku: 'OF-TWS-001', cost: 48.5, track: null, note: '', timeline: [{ t: '今天 07:30', text: '订单同步自 Ozon', done: true }] },
        { id: 'OZ-PR-3010', emoji: '🎧', name: 'TWS Pro 耳机', buyer: 'Сергей Н.', city: 'Краснодар', amount: 1890, logistics: '云途专线·俄线', logisticsId: 'yuntu', auto: ['已审单', '已匹配物流', '已取号'], status: 'ship', statusLabel: '待发货', etaH: 14, risk: false, weight: 180, sku: 'OF-TWS-001', cost: 48.5, track: 'YT2409263010CN', note: '', timeline: [{ t: '今天 03:00', text: '已取号', done: true }] },
        { id: 'OZ-PR-3011', emoji: '🔌', name: '65W GaN 快充', buyer: 'Мария Л.', city: 'Москва', amount: 980, logistics: '云途专线·俄线', logisticsId: 'yuntu', auto: ['已审单', '已匹配物流', '已取号'], status: 'shipped', statusLabel: '已发货', etaH: null, risk: false, weight: 95, sku: 'OF-GAN-65', cost: 22.0, track: 'YT2409253011CN', note: '', timeline: [{ t: '昨天 18:00', text: '已发货', done: true }] },
      ], sYiwu),
      ...tagShop([
        { id: 'OZ-PR-3003', emoji: '🔋', name: 'MagSafe 充电宝', buyer: 'Павел Г.', city: 'Москва', amount: 2290, logistics: '—', logisticsId: null, auto: ['已审单'], status: 'purchase', statusLabel: '待采购', etaH: 3, risk: true, weight: 380, sku: 'OF-PB-20K', cost: 68.0, track: null, note: '', timeline: [{ t: '今天 05:00', text: '库存=0 → 待采购', done: true }] },
        { id: 'OZ-PR-3006', emoji: '💡', name: 'RGB 台灯', buyer: 'Дмитрий К.', city: 'Казань', amount: 1450, logistics: '燕文物流·经济', logisticsId: 'yanwen', auto: ['已审单', '已匹配物流', '已取号'], status: 'ship', statusLabel: '待发货', etaH: 5, risk: true, weight: 420, sku: 'OF-LED-RGB', cost: 35.5, track: 'YW2409263001CN', note: '', timeline: [{ t: '今天 06:00', text: '订单同步', done: true }] },
        { id: 'OZ-PR-3007', emoji: '🔌', name: '65W GaN 快充', buyer: 'Анна С.', city: 'СПб', amount: 980, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 8, risk: false, weight: 95, sku: 'OF-GAN-65', cost: 22.0, track: null, note: '', timeline: [{ t: '今天 07:20', text: '订单同步自 Ozon', done: true }] },
        { id: 'OZ-PR-3012', emoji: '🔋', name: 'MagSafe 充电宝', buyer: 'Игорь Б.', city: 'Тула', amount: 2290, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 28, risk: false, weight: 380, sku: 'OF-PB-20K', cost: 68.0, track: null, note: '请尽快发货', timeline: [{ t: '今天 08:00', text: '订单同步自 Ozon', done: true }] },
        { id: 'OZ-PR-3014', emoji: '💡', name: 'RGB 台灯', buyer: 'Виктор А.', city: 'Уфа', amount: 1450, logistics: '—', logisticsId: null, auto: ['已审单'], status: 'purchase', statusLabel: '待采购', etaH: 5, risk: true, weight: 420, sku: 'OF-LED-RGB', cost: 35.5, track: null, note: '', timeline: [{ t: '今天 06:30', text: '库存不足', done: true }] },
      ], sGz),
      ...tagShop([
        { id: 'OZ-PR-3005', emoji: '🧺', name: '冰箱收纳盒', buyer: 'Ольга М.', city: 'Новосиб.', amount: 690, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 7, risk: true, weight: 520, sku: 'OF-ORG-FR', cost: 12.8, track: null, note: '', timeline: [{ t: '今天 07:10', text: '订单同步自 Ozon', done: true }] },
        { id: 'OZ-PR-3008', emoji: '🧺', name: '冰箱收纳盒', buyer: 'Наталья Т.', city: 'Самара', amount: 690, logistics: '云途专线·俄线', logisticsId: 'yuntu', auto: ['已审单', '已匹配物流'], status: 'ship', statusLabel: '待发货', etaH: 16, risk: false, weight: 520, sku: 'OF-ORG-FR', cost: 12.8, track: null, note: '', timeline: [{ t: '今天 04:00', text: '已审单', done: true }] },
        { id: 'OZ-PR-3009', emoji: '🧺', name: '冰箱收纳盒', buyer: 'Юлия Ф.', city: 'Воронеж', amount: 690, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 12, risk: false, weight: 520, sku: 'OF-ORG-FR', cost: 12.8, track: null, note: '', timeline: [{ t: '今天 07:40', text: '订单同步自 Ozon', done: true }] },
        { id: 'OZ-PR-3013', emoji: '🧺', name: '冰箱收纳盒', buyer: 'Олег С.', city: 'Пермь', amount: 690, logistics: '燕文物流·经济', logisticsId: 'yanwen', auto: ['已审单', '已匹配物流', '已取号'], status: 'shipped', statusLabel: '已发货', etaH: null, risk: false, weight: 520, sku: 'OF-ORG-FR', cost: 12.8, track: 'YW2409243013CN', note: '', timeline: [{ t: '昨天 12:00', text: '已发货', done: true }] },
      ], sSz),
    ];
    const reviews = [
      ...tagShop([
        { id: 'RV1', sku: 'OF-TWS-001', product: 'TWS Pro 耳机', emoji: '🎧', rating: 1, text: 'Долгая доставка, товар ок но сервис плохой.', buyer: 'Иван П.', replied: false, reply: '', created: '今天 06:00' },
        { id: 'RV2', sku: 'OF-GAN-65', product: '65W GaN 快充', emoji: '🔌', rating: 2, text: 'Не соответствует описанию мощности.', buyer: 'Алексей Р.', replied: false, reply: '', created: '今天 07:00' },
      ], sYiwu),
      ...tagShop([
        { id: 'RV3', sku: 'OF-PB-20K', product: 'MagSafe 充电宝', emoji: '🔋', rating: 1, text: 'Не пришло, открыл спор.', buyer: 'Павел Г.', replied: false, reply: '', created: '今天 05:30' },
        { id: 'RV4', sku: 'OF-LED-RGB', product: 'RGB 台灯', emoji: '💡', rating: 3, text: 'Свет хороший, но царапина на корпусе.', buyer: 'Дмитрий К.', replied: false, reply: '', created: '今天 08:00' },
      ], sGz),
      ...tagShop([
        { id: 'RV5', sku: 'OF-ORG-FR', product: '冰箱收纳盒', emoji: '🧺', rating: 2, text: 'Хрупкий пластик, один лопнул.', buyer: 'Ольга М.', replied: false, reply: '', created: '今天 09:00' },
      ], sSz),
    ];
    const qa = [
      ...tagShop([
        { id: 'QA1', sku: 'OF-TWS-001', product: 'TWS Pro 耳机', question: 'Когда отправите заказ?', answer: '', answered: false, created: '今天 08:00' },
      ], sYiwu),
      ...tagShop([
        { id: 'QA2', sku: 'OF-PB-20K', product: 'MagSafe 充电宝', question: 'Есть ли в наличии?', answer: '', answered: false, created: '今天 06:30' },
      ], sGz),
    ];
    const returns = [
      ...tagShop([
        { id: 'RT1', orderId: 'OZ-PR-3011', type: 'return', status: 'open', reason: 'Не работает зарядка', sku: 'OF-GAN-65', product: '65W GaN 快充', emoji: '🔌', amount: 980, created: '今天 08:00', timeline: [{ t: '今天 08:00', text: '买家申请退货', done: true }] },
      ], sYiwu),
      ...tagShop([
        { id: 'RT2', orderId: 'OZ-PR-3006', type: 'claim', status: 'open', reason: 'Повреждена упаковка', sku: 'OF-LED-RGB', product: 'RGB 台灯', emoji: '💡', amount: 1450, created: '今天 07:00', timeline: [{ t: '今天 07:00', text: '买家发起索赔', done: true }] },
        { id: 'RT3', orderId: 'OZ-PR-3012', type: 'cancel', status: 'open', reason: 'Срок доставки слишком долгий', sku: 'OF-PB-20K', product: 'MagSafe 充电宝', emoji: '🔋', amount: 2290, created: '今天 09:00', timeline: [{ t: '今天 09:00', text: '买家申请取消', done: true }] },
      ], sGz),
      ...tagShop([
        { id: 'RT4', orderId: 'OZ-PR-3013', type: 'return', status: 'investigating', reason: 'Трещина на пластике', sku: 'OF-ORG-FR', product: '冰箱收纳盒', emoji: '🧺', amount: 690, created: '今天 10:00', timeline: [{ t: '今天 10:00', text: '申请退货', done: true }, { t: '今天 10:30', text: '平台调查中', done: true }] },
      ], sSz),
    ];
    const trend = [140, 155, 168, 172, 180, 195, 210];
    const rules = clone(BASE_RULES);
    rules.forEach((r, i) => { r.hits = 40 + i * 15; r.today = 8 + i * 3; });
    const channels = clone(CHANNELS);
    channels[0].today = 28; channels[1].today = 22; channels[2].today = 8;

    return {
      meta: {
        id: 'pressure',
        name: '多店公司化',
        desc: '三店真实分区 + 角色权限 + 超时履约压力，适合周报与老板视角',
        shopName: '义乌优选旗舰店',
      },
      settings: defaultSettings(),
      wizard: defaultWizard(true),
      role: 'boss',
      currentShopId: sYiwu,
      shops, catalog, listings, products, inventory, orders, rules, channels, trend,
      reviews, qa, returns, replyTemplates: clone(REPLY_TEMPLATES),
      claimedIds: [],
      nextOrderSeq: 3200,
      syncAgoMin: 0,
      fundAlert: true,
      agents: defaultAgents('corp'),
      weeklySnapshot: null,
      agentTodayTotal: 0,
    };
  }

  const DATASETS = {
    yiwu: { build: seedYiwu, label: '小白冷启动', desc: 'Wizard · 少 SKU · 完整闭环' },
    guangzhou: { build: seedGuangzhou, label: '旺季履约突击', desc: '爆款 · 规则 · 客服差评' },
    pressure: { build: seedPressure, label: '多店公司化', desc: '多店分区 · 角色 · 周报' },
  };

  return {
    DATASETS,
    REPLY_TEMPLATES,
    COMMISSION_TIERS,
    defaultAgents,
    list() {
      return Object.keys(DATASETS).map(id => ({ id, ...DATASETS[id], label: DATASETS[id].label, desc: DATASETS[id].desc }));
    },
    build(id) {
      const d = DATASETS[id];
      if (!d) throw new Error('Unknown dataset: ' + id);
      return d.build();
    },
  };
})();
