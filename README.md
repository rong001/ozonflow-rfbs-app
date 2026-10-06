# OzonFlow · rFBS 跨境直发中台

Ozon Russia **rFBS** 跨境直发运营中台：开店 Wizard → 选品 → 利润定价 → 刊登 → 出单履约 → 客服评价 → 退货异常 → 经营周报。  
全链路共享状态、**多店真实分区**、**简单角色权限**、可离线运行。

> 相对 [可点击原型](https://rong001.github.io/ozonflow-rfbs-prototype/)：本仓库是**真实改状态**的单页应用（localStorage `ozonflow_rfbs_v2` + 三套经营场景数据集），无需任何 Ozon / 1688 API Key。

## Live

**https://rong001.github.io/ozonflow-rfbs-app/**

## 本地运行

```bash
cd ozonflow-rfbs-app
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```


## 生产部署

完整后端（静态托管 + 配置/状态持久化 + 连接器接入 + Ozon 代理）一键起：

```bash
cp .env.example .env
npm start
# 或：bash scripts/deploy.sh   # Docker Compose
```

- 无 Api-Key：连接器免密钥读路径 + 卖家后台写辅助（发货/运单/面单；失败则打开后台+剪贴板+步骤，不假装已发货）+ 状态同步。
- 有 Api-Key：同一服务开启发货/运单/面单代理写操作。

详见 **[DEPLOY.md](./DEPLOY.md)**（Docker、环境变量、反向代理 HTTPS、API 列表与排障）。

## 模块

| 导航 | 能力 |
|------|------|
| 经营总览 | KPI、趋势、今日待办、合规提示、开店进度 |
| 开店 Wizard | 绑定店铺 / rFBS / 默认物流 / 导入首批商品 |
| 智能选品 | 爆款池、利润测算、认领 |
| 利润定价 | 共享费率、佣金阶梯、跟卖价/活动价情景、净利₽与毛利率 |
| 刊登上架 | 草稿→映射→发布（生成在售+库存，带 shopId） |
| 订单履约 | 同步订单、一键审单、面单、发货、采购跟单（按当前店过滤） |
| 自动化规则 | IF/THEN 真实执行 |
| 物流与库存 | 渠道、库存同步、补货、轨迹异常 |
| 客服评价 | 评价回复、Q&A、俄语模板、差评升级 |
| 退货异常 | 取消/退货/索赔状态机 |
| 经营周报 | 分店/SKU 销售·毛利·超时率·退货率，本地导出提示 |
| 自动化 Agent | 13 个垂直 Agent · ON/OFF · 一键跑全部级联 |
| AI 指令台 / 审批中心 / 能力矩阵 | 自然语言指令 → 计划预览 → 执行或送审；人在环审批 + 审计；62 条需求地图 |
| 市场选品 | 公开权重评分 + 红线过滤、季节节点备货倒推、断货换供 |
| 价格竞争 | 价格指数/跟卖/底价、外部比价、成本栈与底价毛利、采购价变动重算、VAT 压力测试、佣金重排 |
| 内容合规 | 内容分与 AI 补齐、俄语标题改写、EAC 证书到期、Честный знак、风险词、图片、Q&A 回写、防盗图 |
| 推广活动 | 广告 ДРР/ROI、亏损送审暂停、按利润分预算、活动报名利润测算（低于底价走审批） |
| 店铺健康 | 服务质量指标、错误指数分档与罚金、风险分、多账号与合并违规、临期抢救、申诉 |
| 财务对账 | 结算 vs 订单利润逐单对账与争议、回款日历、汇兑损益、收款合规清单 |
| 供应链库存 | 多店共享库存防超卖、rFBS/FBP/FBO 决策、海外仓补货与滞销清理 |
| 时效物流 | 休息日对截单影响、运单号回传、渠道运价比较、报关一致性、IML 退货处置 |
| 客服收件箱 | 多店买家聊天聚合 + 俄语意图回复、差评根因聚类回流 |
| 平台集成 | Seller API 适配层与代理配置、废弃/订阅门槛监控、规则知识库、MCP 工具导出、每日简报、角色说明 |

## 多店分区 & 角色

- **店铺切换**：订单 / 刊登 / 库存 / 评价 / 退货均带 `shopId`，列表与徽章按当前店过滤。
- **角色**（顶栏切换）：老板 / 运营 / 仓管 / 客服 / 财务 — 控制可见导航与可执行动作。

## 免 Api-Key 接入真实店铺（推荐）

没有 Ozon Client-Id / Api-Key 也能用真实数据，全部在卖家自己的浏览器里完成：

1. **安装连接器插件**：下载 [ozonflow-connector.zip](https://rong001.github.io/ozonflow-rfbs-app/ozonflow-connector.zip) 并解压 → Chrome/Edge 打开 `chrome://extensions` → 打开“开发者模式” → “加载已解压的扩展程序”，选解压出来的 `ozonflow-connector` 文件夹。
2. **正常登录 Ozon 卖家后台**（seller.ozon.ru），打开订单、财务、商品页面；插件旁路读取后台自己加载的数据，右下角显示已捕获数量。不保存密码、不额外发请求。
3. 打开 OzonFlow **「数据连接」**，点“从插件同步”：订单并入订单履约（状态、发货截止时间、临期标红），结算按订单号并入财务对账。

不装插件也可以：在后台导出订单 / 财务报表（CSV 或 XLSX），拖进「数据连接 → 报表导入」，按俄文表头自动识别。

| 能力 | 实现方式 | 需求 |
|---|---|---|
| 卖家后台订单 / 结算 / 商品 | 插件读取已登录后台的页面数据，或导入后台报表 | R60 R40 |
| Ozon / WB 同款价格 | 插件在卖家浏览器里调用前台搜索，最低价写入价格指数 | R06 |
| 物流轨迹 | 菜鸟国际公开查询接口（经插件跨域） | R31 R33 |
| 以图搜货 | 1688 拍立淘 / Яндекс / Google Lens 跳转 | R08 |
| 白底主图 / 短视频 / 富内容 | 「素材工坊」浏览器本地处理，900×1200 JPG、MP4、Rich-контент JSON | R12 R13 |
| 简报推送 | 企业微信 / 钉钉 / 飞书群机器人、Telegram、Webhook、桌面通知 | R48 |
| 口语指令 | 规则引擎 + 浏览器内语义模型 bge-small-zh（transformers.js），无需大模型 Key | R55 |
| AI 助手接入 | `node server/mcp-ozonflow.js --state ozonflow-state.json`（MCP stdio，写操作只进审批） | R59 |
| API 变更监控 | 插件每周比对 Ozon 文档端点清单并提醒 | R61 |

边界：卖家必须自己登录一次（不绕过 Ozon 登录）。无 Key 时发货/回传运单/面单由连接器在卖家后台辅助执行（启发式 DOM，失败降级为打开对应订单 + 预填剪贴板 + 步骤提示，订单不会被静默标为已发货）；有 Key 走 `server/app.js` 的 `/api/ozon/*`（或精简代理 `server/ozon-proxy.js`）。

## 接真实店铺（有 Api-Key 时）

```bash
OZON_CLIENT_ID=xxx OZON_API_KEY=yyy ALLOW_ORIGIN=https://rong001.github.io PORT=8787 node server/ozon-proxy.js
```

然后在「平台集成」页把模式切到“代理”，填入代理的 HTTPS 地址，点“测试连接”。密钥只在服务器上，不进浏览器。

## 经营场景

1. **小白冷启动** — Wizard + SKU 完整闭环  
2. **旺季履约突击** — 爆款、规则、差评、履约/物流压力  
3. **多店公司化** — 三店分区 + 角色 + 周报  

详见 [SCENARIOS.md](./SCENARIOS.md)。

## 目录

```
ozonflow-rfbs-app/
├── index.html
├── css/styles.css
├── js/
│   ├── demo-seeds.js
│   ├── store.js
│   ├── app.js
│   ├── ai-ops.js           # AI 指令台 / 审批 / 能力矩阵
│   ├── requirements-data.js
│   ├── adapters/ozon-seller-api.js
│   └── suite/              # 10 个经营模块
├── server/app.js          # 生产后端（静态+API+代理，零依赖）
├── server/ozon-proxy.js    # 精简 Ozon 代理（可选）
├── Dockerfile / docker-compose.yml / .env.example
├── DEPLOY.md
├── SCENARIOS.md
├── AGENTS_SPEC.md
└── README.md
```

## 技术栈

Vanilla HTML / CSS / JS，无构建步骤，GitHub Pages 直接托管。

## 自动化 Agent Hub

侧栏 **自动化 Agent**：选品雷达 / 刊登过审 / 审单履约 / 超时抢救 / **1688采购跟单** / **物流轨迹异常** / 利润守门 / **汇率佣金重算** / 俄语客服 / **差评预警升级** / 退货理赔 / 库存补货 / 周报汇报。  
支持 ON/OFF、运行、活动日志、一键跑全部级联；旺季与多店场景预启用相关 Agent。详见 `SCENARIOS.md` 与 `AGENTS_SPEC.md`。
