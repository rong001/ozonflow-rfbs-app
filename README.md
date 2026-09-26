# OzonFlow · rFBS 跨境直发中台（可演示完整版）

Ozon rFBS 跨境直发运营中台：**选品 → 刊登 → 出单 → 规则自动履约 → 面单发货 → 库存**，全链路共享状态、可离线演示。

> 相对 [可点击原型](https://rong001.github.io/ozonflow-rfbs-prototype/)：本仓库是**真实改状态**的单页应用（localStorage 持久化 + 三套演示数据集），无需任何 Ozon / 1688 API Key。

## Live Demo

**https://rong001.github.io/ozonflow-rfbs-app/**

（若 Pages 尚未生效，请用下方本地方式打开。）

## 本地运行

纯静态，任意静态服务器即可：

```bash
cd ozonflow-rfbs-app
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```

或直接用浏览器打开 `index.html`（部分环境下 localStorage 对 `file://` 可用）。

## 模块

| 导航 | 能力 |
|------|------|
| 经营总览 | KPI、趋势、待办、热销 TOP（全部来自共享 store） |
| 智能选品 | 爆款池、利润测算（共享佣金/头程/汇率）、**认领** |
| 刊登上架 | 草稿→映射→待发布→**发布**（生成在售商品 + 库存行） |
| 订单履约 | 同步订单、一键审单、面单、发货 |
| 自动化规则 | IF/THEN 真实执行：审单 / 物流 / 采购标记 / 库存预警 |
| 物流与库存 | 渠道连接、库存同步、补货 |

## 演示数据集

顶栏 **「演示集」** 可切换（切换会重载全部模块状态）：

1. **义乌小店冷启动** — 少 SKU，适合演示认领→刊登→发布闭环  
2. **广州数码旺季** — 爆款多、订单多，适合规则引擎与批量履约  
3. **多店超时履约压力** — 大量临近超时 + 低库存，适合风险处置  

「重置」按钮或演示集菜单内「重置当前演示数据」可恢复本集初始种子。

状态保存在 `localStorage`（key: `ozonflow_rfbs_v1`），刷新不丢。

## 目录结构

```
ozonflow-rfbs-app/
├── index.html
├── css/styles.css
├── js/
│   ├── demo-seeds.js   # 三套种子数据
│   ├── store.js        # 共享状态 + mutations + 规则引擎
│   └── app.js          # UI 渲染与事件
├── DEMO.md             # 三套演示点击脚本
└── README.md
```

后续若要接真实 API：在 `store.js` 旁增加 `adapters/ozon.js` / `adapters/1688.js`，把 `syncOrders` / `publishListing` 等 mutation 改为调适配器即可；UI 无需重写。

## 技术栈

Vanilla HTML / CSS / JS，无构建步骤，GitHub Pages 直接托管。
