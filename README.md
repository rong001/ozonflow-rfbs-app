# OzonFlow · rFBS 跨境直发中台（老板演示版）

Ozon Russia **rFBS** 跨境直发运营中台：开店 Wizard → 选品 → 利润定价 → 刊登 → 出单履约 → 客服评价 → 退货异常 → 经营周报。  
全链路共享状态、**多店真实分区**、**简单角色权限**、可离线演示。

> 相对 [可点击原型](https://rong001.github.io/ozonflow-rfbs-prototype/)：本仓库是**真实改状态**的单页应用（localStorage `ozonflow_rfbs_v2` + 三套演示数据集），无需任何 Ozon / 1688 API Key。

## Live Demo

**https://rong001.github.io/ozonflow-rfbs-app/**

## 本地运行

```bash
cd ozonflow-rfbs-app
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```

## 模块

| 导航 | 能力 |
|------|------|
| 经营总览 | KPI、趋势、强化今日待办、合规提示、开店进度 |
| 开店 Wizard | 绑定店铺(mock) / rFBS / 默认物流 / 导入演示商品 |
| 智能选品 | 爆款池、利润测算、认领 |
| 利润定价 | 共享费率、佣金阶梯、跟卖价/活动价情景、净利₽与毛利率 |
| 刊登上架 | 草稿→映射→发布（生成在售+库存，带 shopId） |
| 订单履约 | 同步订单、一键审单、面单、发货（按当前店过滤） |
| 自动化规则 | IF/THEN 真实执行 |
| 物流与库存 | 渠道、库存同步、补货 |
| 客服评价 | 评价回复、Q&A、俄语模板 |
| 退货异常 | 取消/退货/索赔状态机 |
| 经营周报 | 分店/SKU 销售·毛利·超时率·退货率，模拟导出 |

## 多店分区 & 角色

- **店铺切换**：订单 / 刊登 / 库存 / 评价 / 退货均带 `shopId`，列表与徽章按当前店过滤。
- **角色**（顶栏演示切换）：老板 / 运营 / 仓管 / 客服 — 控制可见导航与可执行动作。

## 演示数据集

1. **小白冷启动** — Wizard + 少 SKU 完整闭环  
2. **旺季履约突击** — 爆款、规则、差评、资金异常  
3. **多店公司化** — 三店分区 + 角色 + 周报  

详见 [DEMO.md](./DEMO.md)。

## 目录

```
ozonflow-rfbs-app/
├── index.html
├── css/styles.css
├── js/
│   ├── demo-seeds.js
│   ├── store.js
│   └── app.js
├── DEMO.md
└── README.md
```

## 技术栈

Vanilla HTML / CSS / JS，无构建步骤，GitHub Pages 直接托管。
