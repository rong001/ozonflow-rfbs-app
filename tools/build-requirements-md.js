#!/usr/bin/env node
/**
 * 由 js/requirements-data.js 生成 REQUIREMENTS_MAP.md
 * 用法：node tools/build-requirements-md.js
 */
const fs = require('fs');
const path = require('path');
const R = require(path.join(__dirname, '..', 'js', 'requirements-data.js'));

const { VERTICALS, LIST, STATUS_LABEL } = R;
const PRIS = ['P0', 'P1', 'P2'];
const STATUSES = ['live', 'partial', 'planned'];
const VIEW_LABEL = {
  dashboard: '工作台', selection: '选品', listing: '刊登', orders: '订单', rules: '自动化规则',
  logistics: '物流', profit: '利润定价', cs: '客服/评价', returns: '退货', weekly: '周报', agents: 'Agent 中心',
  market: '竞品监控', content: '商品卡优化', health: '店铺健康', finance: '结算对账', promo: '促销/广告',
  approvals: '审批队列', copilot: 'AI 指令台', capability: '能力矩阵',
};
const AGENT_LABEL = {
  selection_radar: '选品雷达', listing_publish: '刊登过审', order_fulfill: '审单履约', timeout_rescue: '超时抢救',
  purchase_1688: '1688采购跟单', logistics_anomaly: '物流轨迹异常', profit_guard: '利润守门', fx_commission: '汇率佣金重算',
  ru_cs: '俄语客服', review_escalate: '差评预警升级', return_claim: '退货理赔', inventory_restock: '库存补货', weekly_report: '周报汇报',
};
const esc = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const vName = id => (VERTICALS.find(v => v.id === id) || { name: id }).name;
const stat = r => STATUS_LABEL[r.status] + (r.status === 'live' ? ' ✅' : r.status === 'partial' ? ' 🟡' : ' ⏳');
const count = (fn) => LIST.filter(fn).length;

const out = [];
out.push('# OzonFlow · rFBS 跨境卖家需求地图');
out.push('');
out.push('> 本文件由 `node tools/build-requirements-md.js` 从 `js/requirements-data.js` 自动生成，请勿手改。');
out.push('> 状态口径：**已上线** = 现有视图/Agent 已实现；**部分上线** = 现有模块部分覆盖；**规划** = 尚未实现。');
out.push('> 「推断」= 痛点或做法为团队推断，未找到直接公开证据。');
out.push('');
out.push(`共 **${LIST.length}** 条需求，覆盖 **${new Set(LIST.map(r => r.vertical)).size}** 个业务垂直；` +
  STATUSES.map(s => `${STATUS_LABEL[s]} ${count(r => r.status === s)}`).join(' · ') + '；' +
  PRIS.map(p => `${p} ${count(r => r.priority === p)}`).join(' · ') + '。');
out.push('');

// 汇总表
out.push('## 一、汇总：垂直 × 优先级 × 状态');
out.push('');
out.push('| 垂直 | 合计 | P0 | P1 | P2 | 已上线 | 部分上线 | 规划 |');
out.push('|---|---:|---:|---:|---:|---:|---:|---:|');
for (const v of VERTICALS) {
  const rows = LIST.filter(r => r.vertical === v.id);
  if (!rows.length) continue;
  const c = (fn) => rows.filter(fn).length;
  out.push(`| ${v.name} | ${rows.length} | ${PRIS.map(p => c(r => r.priority === p)).join(' | ')} | ${STATUSES.map(s => c(r => r.status === s)).join(' | ')} |`);
}
out.push(`| **合计** | **${LIST.length}** | ${PRIS.map(p => '**' + count(r => r.priority === p) + '**').join(' | ')} | ${STATUSES.map(s => '**' + count(r => r.status === s) + '**').join(' | ')} |`);
out.push('');

// 优先级 × 状态交叉
out.push('### 优先级 × 状态');
out.push('');
out.push('| 优先级 | 已上线 | 部分上线 | 规划 |');
out.push('|---|---:|---:|---:|');
for (const p of PRIS) out.push(`| ${p} | ${STATUSES.map(s => count(r => r.priority === p && r.status === s)).join(' | ')} |`);
out.push('');

// Top P0
out.push('## 二、Top P0 需求');
out.push('');
out.push('| ID | 需求 | 垂直 | 状态 | 对应视图 / Agent |');
out.push('|---|---|---|---|---|');
const order = { planned: 0, partial: 1, live: 2 };
for (const r of LIST.filter(r => r.priority === 'P0')) {
  const where = [r.view ? (r.status === 'planned' ? '目标：' : '') + (VIEW_LABEL[r.view] || r.view) : '', r.agent ? (AGENT_LABEL[r.agent] || r.agent) + ' Agent' : ''].filter(Boolean).join(' / ') || '—';
  out.push(`| ${r.id} | ${esc(r.title)}${r.inferred ? '（推断）' : ''} | ${vName(r.vertical)} | ${stat(r)} | ${esc(where)} |`);
}
out.push('');
const p0gap = LIST.filter(r => r.priority === 'P0' && r.status !== 'live').sort((a, b) => order[a.status] - order[b.status]);
out.push(`**P0 待建（${p0gap.length} 条，规划优先）：** ` + p0gap.map(r => `${r.id} ${r.title}（${STATUS_LABEL[r.status]}）`).join('；') + '。');
out.push('');

// 分垂直
out.push('## 三、分垂直明细');
out.push('');
VERTICALS.forEach((v, i) => {
  const rows = LIST.filter(r => r.vertical === v.id);
  if (!rows.length) return;
  out.push(`### 3.${i + 1} ${v.name}`);
  out.push('');
  for (const r of rows) {
    const where = [r.view ? (r.status === 'planned' ? '目标视图：' : '视图：') + (VIEW_LABEL[r.view] || r.view) : '', r.agent ? 'Agent：' + (AGENT_LABEL[r.agent] || r.agent) : ''].filter(Boolean).join(' · ');
    out.push(`#### ${r.id} ${r.title}${r.inferred ? ' 〔推断〕' : ''}`);
    out.push('');
    out.push(`- **痛点**：${r.pain}`);
    out.push(`- **角色**：${r.who}`);
    out.push(`- **工具缺口**：${r.gap}`);
    out.push(`- **AI 原生解法**：${r.solution}`);
    out.push(`- **优先级 / 状态**：${r.priority} · ${stat(r)}${where ? ' · ' + where : ''}`);
    if (r.evidence.length) out.push(`- **证据**：${r.evidence.map((u, k) => `[${k + 1}](${u})`).join(' ')}${r.inferred ? '（痛点为推断，链接仅作背景）' : ''}`);
    else out.push('- **证据**：无直接公开证据（推断）');
    out.push('');
  }
});

out.push('---');
out.push('');
out.push('证据链接为 2026 年公开资料（平台公告转载、服务商博客、社区 SDK 文档），规则与费率以 Ozon 卖家后台最新公告为准。');
out.push('');

fs.writeFileSync(path.join(__dirname, '..', 'REQUIREMENTS_MAP.md'), out.join('\n'));
console.log('REQUIREMENTS_MAP.md written:', LIST.length, 'requirements');
