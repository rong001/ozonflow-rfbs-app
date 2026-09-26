/**
 * OzonFlow · 三套演示数据集
 * yiwu   — 义乌小店冷启动（少 SKU、少订单、偏草稿）
 * guangzhou — 广州数码旺季（多爆款、订单多、库存紧张）
 * pressure — 多店超时履约压力（大量临近超时、待审堆积）
 */
window.OzonFlowSeeds = (function () {
  const FX = 11.85;
  const COMMISSION = 0.12;
  const PAYMENT_FEE = 0.0265;
  const SHIP_CNY_PER_KG = 18.5;

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

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ===== Dataset 1: 义乌小店冷启动 ===== */
  function seedYiwu() {
    const catalog = makeCatalog().slice(0, 6);
    const shops = [
      { id: 's_yiwu', name: '义乌优选旗舰店', status: 'online' },
    ];
    const listings = [
      { id: 'L1', emoji: '🖱️', name: '静音无线鼠标', ru: 'Беспроводная мышь бесшумная', cat: 'Электроника › Мыши', map: 40, status: 'draft', price: 590, cost: 15.5, weight: 110, sku: 'OF-MSE-SIL', stockInit: 50 },
      { id: 'L2', emoji: '⌨️', name: '机械键盘 87 键', ru: 'Механическая клавиатура 87', cat: '— 待映射 —', map: 20, status: 'draft', price: 2490, cost: 88.0, weight: 780, sku: 'OF-KB-87', stockInit: 30 },
      { id: 'L3', emoji: '🧴', name: '保温杯 500ml', ru: 'Термос 500 мл', cat: '— 待映射 —', map: 10, status: 'draft', price: 790, cost: 18.0, weight: 350, sku: 'OF-THM-500', stockInit: 80 },
    ];
    const products = [
      { id: 'P1', emoji: '🎧', name: '无线降噪耳机 TWS Pro', ru: 'Беспроводные наушники TWS Pro', sku: 'OF-TWS-001', ozonSku: '168924751', price: 1890, cost: 48.5, weight: 180, status: 'active', todaySales: 8, margin: 32 },
      { id: 'P2', emoji: '🔗', name: 'Type-C 编织数据线 2m', ru: 'Кабель USB-C 2м нейлон', sku: 'OF-CAB-USB', ozonSku: '168924800', price: 290, cost: 3.2, weight: 45, status: 'active', todaySales: 15, margin: 42 },
    ];
    const inventory = [
      { sku: 'OF-TWS-001', name: '无线降噪耳机 TWS Pro', emoji: '🎧', local: 45, ozon: 40, safe: 20, sync: 'ok' },
      { sku: 'OF-CAB-USB', name: 'Type-C 编织数据线 2m', emoji: '🔗', local: 220, ozon: 200, safe: 50, sync: 'ok' },
    ];
    const orders = [
      { id: 'OZ-YI-1001', emoji: '🎧', name: 'TWS Pro 耳机', buyer: 'Иван П.', city: 'Москва', amount: 1890, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 36, risk: false, weight: 180, sku: 'OF-TWS-001', cost: 48.5, track: null, note: '', timeline: [{ t: '今天 08:00', text: '订单同步自 Ozon', done: true }] },
      { id: 'OZ-YI-1002', emoji: '🔗', name: 'Type-C 数据线', buyer: 'Анна С.', city: 'СПб', amount: 290, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 40, risk: false, weight: 45, sku: 'OF-CAB-USB', cost: 3.2, track: null, note: '', timeline: [{ t: '今天 08:12', text: '订单同步自 Ozon', done: true }] },
      { id: 'OZ-YI-1003', emoji: '🎧', name: 'TWS Pro 耳机', buyer: 'Дмитрий К.', city: 'Казань', amount: 1890, logistics: '云途专线·俄线', logisticsId: 'yuntu', auto: ['已审单', '已匹配物流'], status: 'ship', statusLabel: '待发货', etaH: 22, risk: false, weight: 180, sku: 'OF-TWS-001', cost: 48.5, track: null, note: '', timeline: [
        { t: '昨天 16:00', text: '订单同步自 Ozon', done: true },
        { t: '昨天 16:01', text: '自动审单通过', done: true },
        { t: '昨天 16:01', text: '物流匹配 → 云途专线·俄线', done: true },
      ]},
    ];
    const trend = [12, 18, 15, 22, 19, 25, 28];
    const rules = clone(BASE_RULES);
    rules.forEach(r => { r.hits = Math.floor(Math.random() * 20); r.today = Math.floor(Math.random() * 5); });
    const channels = clone(CHANNELS);
    channels[0].today = 3; channels[1].today = 1;

    return {
      meta: {
        id: 'yiwu',
        name: '义乌小店冷启动',
        desc: '新品少、订单少，适合演示选品认领→刊登→发布完整闭环',
        shopName: '义乌优选旗舰店',
      },
      settings: { fx: FX, commission: COMMISSION, paymentFee: PAYMENT_FEE, shipCnyPerKg: SHIP_CNY_PER_KG },
      shops, catalog, listings, products, inventory, orders, rules, channels, trend,
      claimedIds: [],
      nextOrderSeq: 1100,
      syncAgoMin: 2,
    };
  }

  /* ===== Dataset 2: 广州数码旺季 ===== */
  function seedGuangzhou() {
    const catalog = makeCatalog();
    const shops = [
      { id: 's_gz', name: '广州数码专营', status: 'online' },
      { id: 's_sz', name: '深圳配件馆', status: 'online' },
    ];
    const listings = [
      { id: 'L1', emoji: '💡', name: 'RGB 护眼台灯', ru: 'Настольная лампа LED RGB', cat: 'Дом › Освещение', map: 100, status: 'ready', price: 1450, cost: 35.5, weight: 420, sku: 'OF-LED-RGB', stockInit: 60 },
      { id: 'L2', emoji: '🔋', name: 'MagSafe 充电宝', ru: 'Power Bank MagSafe 20000', cat: 'Электроника › Powerbank', map: 100, status: 'ready', price: 2290, cost: 68.0, weight: 380, sku: 'OF-PB-20K', stockInit: 40 },
      { id: 'L3', emoji: '🧺', name: '冰箱收纳盒套装', ru: 'Органайзеры для холодильника', cat: 'Дом › Хранение', map: 78, status: 'mapping', price: 690, cost: 12.8, weight: 520, sku: 'OF-ORG-FR', stockInit: 100 },
      { id: 'L4', emoji: '🪞', name: 'LED 化妆镜', ru: 'Зеркало с подсветкой LED', cat: 'Красота › Зеркала', map: 88, status: 'failed', price: 1190, cost: 28.0, weight: 480, sku: 'OF-MIR-LED', stockInit: 35, failReason: '缺少 обязательный атрибут Бренд' },
      { id: 'L5', emoji: '🧴', name: '保温杯 500ml', ru: 'Термос 500 мл', cat: '— 待映射 —', map: 15, status: 'draft', price: 790, cost: 18.0, weight: 350, sku: 'OF-THM-500', stockInit: 80 },
    ];
    const products = [
      { id: 'P1', emoji: '🎧', name: '无线降噪耳机 TWS Pro', ru: 'Беспроводные наушники TWS Pro', sku: 'OF-TWS-001', ozonSku: '168924751', price: 1890, cost: 48.5, weight: 180, status: 'active', todaySales: 42, margin: 32 },
      { id: 'P2', emoji: '🔌', name: '65W 氮化镓快充头', ru: 'Зарядное устройство 65W GaN', sku: 'OF-GAN-65', ozonSku: '172038812', price: 980, cost: 22.0, weight: 95, status: 'active', todaySales: 31, margin: 28 },
      { id: 'P3', emoji: '🔗', name: 'Type-C 编织数据线 2m', ru: 'Кабель USB-C 2м', sku: 'OF-CAB-USB', ozonSku: '168924800', price: 290, cost: 3.2, weight: 45, status: 'active', todaySales: 56, margin: 42 },
      { id: 'P4', emoji: '🖱️', name: '静音无线鼠标', ru: 'Беспроводная мышь', sku: 'OF-MSE-SIL', ozonSku: '172100001', price: 590, cost: 15.5, weight: 110, status: 'active', todaySales: 18, margin: 26 },
    ];
    const inventory = [
      { sku: 'OF-TWS-001', name: '无线降噪耳机 TWS Pro', emoji: '🎧', local: 86, ozon: 80, safe: 30, sync: 'ok' },
      { sku: 'OF-GAN-65', name: '65W 氮化镓快充头', emoji: '🔌', local: 12, ozon: 10, safe: 25, sync: 'warn' },
      { sku: 'OF-CAB-USB', name: 'Type-C 编织数据线 2m', emoji: '🔗', local: 310, ozon: 300, safe: 80, sync: 'ok' },
      { sku: 'OF-MSE-SIL', name: '静音无线鼠标', emoji: '🖱️', local: 8, ozon: 6, safe: 20, sync: 'warn' },
    ];
    const buyers = [
      ['Иван П.', 'Москва'], ['Анна С.', 'СПб'], ['Дмитрий К.', 'Казань'],
      ['Елена В.', 'Екб'], ['Ольга М.', 'Новосиб.'], ['Сергей Н.', 'Краснодар'],
      ['Мария Л.', 'Москва'], ['Алексей Р.', 'Ростов'], ['Наталья Т.', 'Самара'],
    ];
    const orders = [
      { id: 'OZ-GZ-2001', emoji: '🎧', name: 'TWS Pro 耳机', buyer: 'Иван П.', city: 'Москва', amount: 1890, logistics: '云途专线·俄线', logisticsId: 'yuntu', auto: ['已审单', '已匹配物流'], status: 'ship', statusLabel: '待发货', etaH: 18, risk: false, weight: 180, sku: 'OF-TWS-001', cost: 48.5, track: null, note: '', timeline: [{ t: '今天 09:12', text: '订单同步自 Ozon', done: true }, { t: '今天 09:13', text: '自动审单通过', done: true }, { t: '今天 09:13', text: '物流匹配 → 云途', done: true }] },
      { id: 'OZ-GZ-2002', emoji: '🔌', name: '65W GaN 快充', buyer: 'Анна С.', city: 'СПб', amount: 980, logistics: '—', logisticsId: null, auto: ['已审单'], status: 'purchase', statusLabel: '待采购', etaH: 22, risk: false, weight: 95, sku: 'OF-GAN-65', cost: 22.0, track: null, note: '', timeline: [{ t: '今天 09:01', text: '订单同步自 Ozon', done: true }, { t: '今天 09:02', text: '自动审单通过', done: true }, { t: '今天 09:02', text: '库存不足 → 标记待采购', done: true }] },
      { id: 'OZ-GZ-2003', emoji: '🔗', name: 'Type-C 数据线', buyer: 'Сергей Н.', city: 'Краснодар', amount: 290, logistics: 'Ozon OGL 官方', logisticsId: 'ogl', auto: ['已审单', '已匹配物流'], status: 'ship', statusLabel: '待发货', etaH: 14, risk: false, weight: 45, sku: 'OF-CAB-USB', cost: 3.2, track: null, note: '', timeline: [{ t: '今天 08:40', text: '订单同步自 Ozon', done: true }, { t: '今天 08:41', text: '自动审单通过', done: true }] },
      { id: 'OZ-GZ-2004', emoji: '🔋', name: 'MagSafe 充电宝', buyer: 'Елена В.', city: 'Екб', amount: 2290, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 36, risk: false, weight: 380, sku: 'OF-PB-20K', cost: 68.0, track: null, note: '', timeline: [{ t: '今天 10:00', text: '订单同步自 Ozon', done: true }] },
      { id: 'OZ-GZ-2005', emoji: '🎧', name: 'TWS Pro 耳机 ×2', buyer: 'Мария Л.', city: 'Москва', amount: 3780, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 40, risk: false, weight: 360, sku: 'OF-TWS-001', cost: 97.0, track: null, note: '', timeline: [{ t: '今天 10:15', text: '订单同步自 Ozon', done: true }] },
      { id: 'OZ-GZ-2006', emoji: '🖱️', name: '静音无线鼠标', buyer: 'Ольга М.', city: 'Новосиб.', amount: 590, logistics: '云途专线·俄线', logisticsId: 'yuntu', auto: ['已审单', '已匹配物流', '已取号'], status: 'ship', statusLabel: '待发货', etaH: 20, risk: false, weight: 110, sku: 'OF-MSE-SIL', cost: 15.5, track: 'YT2409261001CN', note: '', timeline: [{ t: '今天 07:00', text: '订单同步自 Ozon', done: true }, { t: '今天 07:01', text: '自动审单通过', done: true }, { t: '今天 07:05', text: '运单号 YT2409261001CN', done: true }] },
      { id: 'OZ-GZ-2007', emoji: '🔗', name: 'Type-C 数据线', buyer: 'Игорь Б.', city: 'Тула', amount: 290, logistics: 'Ozon OGL 官方', logisticsId: 'ogl', auto: ['已审单', '已匹配物流', '已取号'], status: 'shipped', statusLabel: '已发货', etaH: null, risk: false, weight: 45, sku: 'OF-CAB-USB', cost: 3.2, track: 'OGL882910445', note: '', timeline: [{ t: '昨天 14:00', text: '订单同步自 Ozon', done: true }, { t: '昨天 15:00', text: '已提交平台发货', done: true }] },
      { id: 'OZ-GZ-2008', emoji: '🔌', name: '65W GaN 快充', buyer: 'Алексей Р.', city: 'Ростов', amount: 980, logistics: '燕文物流·经济', logisticsId: 'yanwen', auto: ['已审单', '已匹配物流'], status: 'purchase', statusLabel: '待采购', etaH: 8, risk: false, weight: 95, sku: 'OF-GAN-65', cost: 22.0, track: null, note: '', timeline: [{ t: '今天 06:00', text: '订单同步自 Ozon', done: true }] },
      { id: 'OZ-GZ-2009', emoji: '🎧', name: 'TWS Pro 耳机', buyer: 'Павел Г.', city: 'Москва', amount: 1890, logistics: '云途专线·俄线', logisticsId: 'yuntu', auto: ['已审单', '已匹配物流', '已取号'], status: 'shipped', statusLabel: '已发货', etaH: null, risk: false, weight: 180, sku: 'OF-TWS-001', cost: 48.5, track: 'YT2409258801CN', note: '', timeline: [{ t: '昨天 11:00', text: '已发货', done: true }] },
      { id: 'OZ-GZ-2010', emoji: '🖱️', name: '静音无线鼠标', buyer: 'Юлия Ф.', city: 'Воронеж', amount: 590, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 30, risk: false, weight: 110, sku: 'OF-MSE-SIL', cost: 15.5, track: null, note: '', timeline: [{ t: '今天 11:00', text: '订单同步自 Ozon', done: true }] },
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
        name: '广州数码旺季',
        desc: '爆款多、出单快、低库存预警，适合演示规则引擎与履约批量操作',
        shopName: '广州数码专营',
      },
      settings: { fx: FX, commission: COMMISSION, paymentFee: PAYMENT_FEE, shipCnyPerKg: SHIP_CNY_PER_KG },
      shops, catalog, listings, products, inventory, orders, rules, channels, trend,
      claimedIds: [],
      nextOrderSeq: 2100,
      syncAgoMin: 1,
    };
  }

  /* ===== Dataset 3: 多店超时履约压力 ===== */
  function seedPressure() {
    const catalog = makeCatalog();
    const shops = [
      { id: 's_yiwu', name: '义乌优选旗舰店', status: 'online' },
      { id: 's_gz', name: '广州数码专营', status: 'online' },
      { id: 's_sz', name: '深圳家居馆', status: 'syncing' },
    ];
    const listings = [
      { id: 'L1', emoji: '💡', name: 'RGB 护眼台灯', ru: 'Настольная лампа LED RGB', cat: 'Дом › Освещение', map: 100, status: 'ready', price: 1450, cost: 35.5, weight: 420, sku: 'OF-LED-RGB', stockInit: 20 },
      { id: 'L2', emoji: '🧺', name: '冰箱收纳盒', ru: 'Органайзер для холодильника', cat: 'Дом › Хранение', map: 92, status: 'ready', price: 690, cost: 12.8, weight: 520, sku: 'OF-ORG-FR', stockInit: 40 },
      { id: 'L3', emoji: '🪞', name: 'LED 化妆镜', ru: 'Зеркало LED', cat: 'Красота › Зеркала', map: 55, status: 'mapping', price: 1190, cost: 28.0, weight: 480, sku: 'OF-MIR-LED', stockInit: 15 },
    ];
    const products = [
      { id: 'P1', emoji: '🎧', name: '无线降噪耳机 TWS Pro', ru: 'Наушники TWS Pro', sku: 'OF-TWS-001', ozonSku: '168924751', price: 1890, cost: 48.5, weight: 180, status: 'active', todaySales: 28, margin: 32 },
      { id: 'P2', emoji: '🔌', name: '65W 氮化镓快充头', ru: 'ЗУ 65W GaN', sku: 'OF-GAN-65', ozonSku: '172038812', price: 980, cost: 22.0, weight: 95, status: 'active', todaySales: 22, margin: 28 },
      { id: 'P3', emoji: '💡', name: 'RGB 护眼台灯', ru: 'Лампа RGB', sku: 'OF-LED-RGB', ozonSku: '159447203', price: 1450, cost: 35.5, weight: 420, status: 'active', todaySales: 15, margin: 35 },
      { id: 'P4', emoji: '🔋', name: 'MagSafe 充电宝', ru: 'Power Bank MagSafe', sku: 'OF-PB-20K', ozonSku: '165511908', price: 2290, cost: 68.0, weight: 380, status: 'active', todaySales: 11, margin: 30 },
      { id: 'P5', emoji: '🧺', name: '冰箱收纳盒', ru: 'Органайзер', sku: 'OF-ORG-FR', ozonSku: '181002334', price: 690, cost: 12.8, weight: 520, status: 'active', todaySales: 19, margin: 18 },
    ];
    const inventory = [
      { sku: 'OF-TWS-001', name: '无线降噪耳机 TWS Pro', emoji: '🎧', local: 5, ozon: 3, safe: 20, sync: 'warn' },
      { sku: 'OF-GAN-65', name: '65W 氮化镓快充头', emoji: '🔌', local: 3, ozon: 2, safe: 25, sync: 'warn' },
      { sku: 'OF-LED-RGB', name: 'RGB 护眼台灯', emoji: '💡', local: 2, ozon: 1, safe: 15, sync: 'warn' },
      { sku: 'OF-PB-20K', name: 'MagSafe 充电宝', emoji: '🔋', local: 0, ozon: 0, safe: 10, sync: 'err' },
      { sku: 'OF-ORG-FR', name: '冰箱收纳盒', emoji: '🧺', local: 8, ozon: 6, safe: 30, sync: 'warn' },
    ];
    const orders = [
      { id: 'OZ-PR-3001', emoji: '💡', name: 'RGB 台灯', buyer: 'Дмитрий К.', city: 'Казань', amount: 1450, logistics: '燕文物流·经济', logisticsId: 'yanwen', auto: ['已审单', '已匹配物流', '已取号'], status: 'ship', statusLabel: '待发货', etaH: 5, risk: true, weight: 420, sku: 'OF-LED-RGB', cost: 35.5, track: 'YW2409263001CN', note: '', timeline: [{ t: '今天 06:00', text: '订单同步', done: true }, { t: '今天 06:01', text: '已审单+物流', done: true }] },
      { id: 'OZ-PR-3002', emoji: '🔌', name: '65W GaN 快充', buyer: 'Алексей Р.', city: 'Ростов', amount: 980, logistics: '燕文物流·经济', logisticsId: 'yanwen', auto: ['已审单', '已匹配物流'], status: 'purchase', statusLabel: '待采购', etaH: 4, risk: true, weight: 95, sku: 'OF-GAN-65', cost: 22.0, track: null, note: '', timeline: [{ t: '今天 05:30', text: '订单同步', done: true }] },
      { id: 'OZ-PR-3003', emoji: '🔋', name: 'MagSafe 充电宝', buyer: 'Павел Г.', city: 'Москва', amount: 2290, logistics: '—', logisticsId: null, auto: ['已审单'], status: 'purchase', statusLabel: '待采购', etaH: 3, risk: true, weight: 380, sku: 'OF-PB-20K', cost: 68.0, track: null, note: '', timeline: [{ t: '今天 05:00', text: '订单同步', done: true }, { t: '今天 05:01', text: '库存=0 → 待采购', done: true }] },
      { id: 'OZ-PR-3004', emoji: '🎧', name: 'TWS Pro 耳机', buyer: 'Иван П.', city: 'Москва', amount: 1890, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 6, risk: true, weight: 180, sku: 'OF-TWS-001', cost: 48.5, track: null, note: '', timeline: [{ t: '今天 07:00', text: '订单同步自 Ozon', done: true }] },
      { id: 'OZ-PR-3005', emoji: '🧺', name: '冰箱收纳盒', buyer: 'Ольга М.', city: 'Новосиб.', amount: 690, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 7, risk: true, weight: 520, sku: 'OF-ORG-FR', cost: 12.8, track: null, note: '', timeline: [{ t: '今天 07:10', text: '订单同步自 Ozon', done: true }] },
      { id: 'OZ-PR-3006', emoji: '🔌', name: '65W GaN 快充', buyer: 'Анна С.', city: 'СПб', amount: 980, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 8, risk: false, weight: 95, sku: 'OF-GAN-65', cost: 22.0, track: null, note: '', timeline: [{ t: '今天 07:20', text: '订单同步自 Ozon', done: true }] },
      { id: 'OZ-PR-3007', emoji: '🎧', name: 'TWS Pro 耳机', buyer: 'Елена В.', city: 'Екб', amount: 1890, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 10, risk: false, weight: 180, sku: 'OF-TWS-001', cost: 48.5, track: null, note: '', timeline: [{ t: '今天 07:30', text: '订单同步自 Ozon', done: true }] },
      { id: 'OZ-PR-3008', emoji: '💡', name: 'RGB 台灯', buyer: 'Наталья Т.', city: 'Самара', amount: 1450, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 12, risk: false, weight: 420, sku: 'OF-LED-RGB', cost: 35.5, track: null, note: '', timeline: [{ t: '今天 07:40', text: '订单同步自 Ozon', done: true }] },
      { id: 'OZ-PR-3009', emoji: '🧺', name: '冰箱收纳盒', buyer: 'Юлия Ф.', city: 'Воронеж', amount: 690, logistics: '云途专线·俄线', logisticsId: 'yuntu', auto: ['已审单', '已匹配物流'], status: 'ship', statusLabel: '待发货', etaH: 16, risk: false, weight: 520, sku: 'OF-ORG-FR', cost: 12.8, track: null, note: '', timeline: [{ t: '今天 04:00', text: '已审单', done: true }] },
      { id: 'OZ-PR-3010', emoji: '🎧', name: 'TWS Pro 耳机', buyer: 'Сергей Н.', city: 'Краснодар', amount: 1890, logistics: '云途专线·俄线', logisticsId: 'yuntu', auto: ['已审单', '已匹配物流', '已取号'], status: 'ship', statusLabel: '待发货', etaH: 14, risk: false, weight: 180, sku: 'OF-TWS-001', cost: 48.5, track: 'YT2409263010CN', note: '', timeline: [{ t: '今天 03:00', text: '已取号', done: true }] },
      { id: 'OZ-PR-3011', emoji: '🔌', name: '65W GaN 快充', buyer: 'Мария Л.', city: 'Москва', amount: 980, logistics: '云途专线·俄线', logisticsId: 'yuntu', auto: ['已审单', '已匹配物流', '已取号'], status: 'shipped', statusLabel: '已发货', etaH: null, risk: false, weight: 95, sku: 'OF-GAN-65', cost: 22.0, track: 'YT2409253011CN', note: '', timeline: [{ t: '昨天 18:00', text: '已发货', done: true }] },
      { id: 'OZ-PR-3012', emoji: '🔋', name: 'MagSafe 充电宝', buyer: 'Игорь Б.', city: 'Тула', amount: 2290, logistics: '—', logisticsId: null, auto: [], status: 'audit', statusLabel: '待审核', etaH: 28, risk: false, weight: 380, sku: 'OF-PB-20K', cost: 68.0, track: null, note: '请尽快发货', timeline: [{ t: '今天 08:00', text: '订单同步自 Ozon', done: true }] },
      { id: 'OZ-PR-3013', emoji: '🧺', name: '冰箱收纳盒', buyer: 'Олег С.', city: 'Пермь', amount: 690, logistics: '燕文物流·经济', logisticsId: 'yanwen', auto: ['已审单', '已匹配物流', '已取号'], status: 'shipped', statusLabel: '已发货', etaH: null, risk: false, weight: 520, sku: 'OF-ORG-FR', cost: 12.8, track: 'YW2409243013CN', note: '', timeline: [{ t: '昨天 12:00', text: '已发货', done: true }] },
      { id: 'OZ-PR-3014', emoji: '💡', name: 'RGB 台灯', buyer: 'Виктор А.', city: 'Уфа', amount: 1450, logistics: '—', logisticsId: null, auto: ['已审单'], status: 'purchase', statusLabel: '待采购', etaH: 5, risk: true, weight: 420, sku: 'OF-LED-RGB', cost: 35.5, track: null, note: '', timeline: [{ t: '今天 06:30', text: '库存不足', done: true }] },
    ];
    const trend = [140, 155, 168, 172, 180, 195, 210];
    const rules = clone(BASE_RULES);
    rules.forEach((r, i) => { r.hits = 40 + i * 15; r.today = 8 + i * 3; });
    const channels = clone(CHANNELS);
    channels[0].today = 28; channels[1].today = 22; channels[2].today = 8;

    return {
      meta: {
        id: 'pressure',
        name: '多店超时履约压力',
        desc: '大量临近超时订单 + 低库存，适合演示一键审单、批量面单与风险处置',
        shopName: '义乌优选旗舰店',
      },
      settings: { fx: FX, commission: COMMISSION, paymentFee: PAYMENT_FEE, shipCnyPerKg: SHIP_CNY_PER_KG },
      shops, catalog, listings, products, inventory, orders, rules, channels, trend,
      claimedIds: [],
      nextOrderSeq: 3100,
      syncAgoMin: 0,
    };
  }

  const DATASETS = {
    yiwu: { build: seedYiwu, label: '义乌小店冷启动', desc: '少 SKU · 完整闭环' },
    guangzhou: { build: seedGuangzhou, label: '广州数码旺季', desc: '爆款多 · 规则引擎' },
    pressure: { build: seedPressure, label: '多店超时履约压力', desc: '超时风险 · 批量履约' },
  };

  return {
    DATASETS,
    list() {
      return Object.keys(DATASETS).map(id => ({ id, ...DATASETS[id], label: DATASETS[id].label, desc: DATASETS[id].desc }));
    },
    build(id) {
      const d = DATASETS[id];
      if (!d) throw new Error('Unknown dataset: ' + id);
      return d.build();
    },
    uid,
  };
})();
