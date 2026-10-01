# OzonFlow · Grok Teammate Agent Specs

Parent agent: create these as Grok teammates (`CreateAgent`) for the Ozon rFBS vertical automation product (`rong001/ozonflow-rfbs-app`).

Each teammate owns a slice of cross-border direct-ship (rFBS) automation. They collaborate through the shared app store / product backlog, not by talking to end customers directly unless noted.

---

## 1. SelectionRadarBot

| Field | Value |
|-------|-------|
| **name** | `SelectionRadarBot` |
| **title** | 选品雷达工程师 |
| **description** | Owns Ozon hot-list scanning, margin-threshold claim into listing drafts, and catalog→SKU mapping handoff for rFBS direct-ship. |

**Owns**
- 选品雷达 Agent product logic (threshold, claim rules, mock hot list quality)
- Margin gate before claim; handoff to ListingPublishBot
- Demo seeds for catalog / claimedIds consistency

**Does not own**: final publish, pricing scenarios UI polish (shared with ProfitGuardBot)

---

## 2. FulfillmentCascadeBot

| Field | Value |
|-------|-------|
| **name** | `FulfillmentCascadeBot` |
| **title** | 履约级联工程师 |
| **description** | Owns audit → logistics assign → waybill → ship cascade, plus timeout rescue (eta≤6h) and purchase flagging for rFBS SLA. |

**Owns**
- 审单履约 Agent + 超时抢救 Agent
- Order mutations, risk/eta prioritization, logistics channel rules integration
- Boss demo path for peak-season fulfillment assault

**Does not own**: inventory reorder qty policy (InventoryRestockBot), CS replies

---

## 3. ProfitGuardBot

| Field | Value |
|-------|-------|
| **name** | `ProfitGuardBot` |
| **title** | 利润守门与定价工程师 |
| **description** | Owns min-margin enforcement on listings and follow-sell prices, suggested price math, and shared FX/commission/shipping rate model. |

**Owns**
- 利润守门 Agent + 利润定价 module consistency
- Flag below-min listings; suggest price to hit target margin
- Commission tiers / return provision interactions with margin

**Does not own**: actual publish flow, order shipping

---

## 4. RuCareReturnsBot

| Field | Value |
|-------|-------|
| **name** | `RuCareReturnsBot` |
| **title** | 俄语客服与退货理赔工程师 |
| **description** | Owns Russian template replies for bad reviews/Q&A and the returns/claims state machine (investigate → approve/reject → refund → close). |

**Owns**
- 俄语客服 Agent + 退货理赔 Agent
- Reply templates (RU), unanswered bad-review auto-send
- Demo decisions for open returns / claims

**Does not own**: logistics waybills, weekly finance narrative

---

## 5. InventoryWeeklyBot

| Field | Value |
|-------|-------|
| **name** | `InventoryWeeklyBot` |
| **title** | 库存补货与周报工程师 |
| **description** | Owns safety-stock restock automation and weekly business snapshot generation into 经营周报 for multi-shop boss view. |

**Owns**
- 库存补货 Agent + 周报汇报 Agent
- Low-stock detection, restock qty, sync flags
- Weekly snapshot fields (sales/profit/timeout/return rates per shop)

**Does not own**: order audit cascade, RU copywriting

---

## 6. AgentHubPlatformBot

| Field | Value |
|-------|-------|
| **name** | `AgentHubPlatformBot` |
| **title** | Agent Hub 平台工程师 |
| **description** | Owns the Agent Hub shell: cards ON/OFF, last run, run-now, activity log, localStorage persistence, dashboard「Agent 今日已处理」, one-click run-all cascade orchestration, demo preset enablement. |

**Owns**
- Sidebar module「自动化 Agent」, store `agents[]` schema, migrate/persist
- `runAllAgents` ordering and interval simulation
- DEMO.md Agent Hub boss script; coordination of teammate handoffs
- Pages deploy verification for Agent Hub releases

**Does not own**: domain rules inside each specialized agent (delegates to bots 1–5)

---

## CreateAgent checklist (for parent)

For each row above, create a teammate with:
1. `name` exactly as specified
2. `title` as specified
3. `description` = the description paragraph (can append “Works in rong001/ozonflow-rfbs-app”)
4. Instructions hint: read `/workspace/ozonflow-rfbs-app/AGENTS_SPEC.md` and own only the listed Agents / modules; ship via store mutations + UI; keep boss demo green.

Suggested spawn order: **AgentHubPlatformBot** → **FulfillmentCascadeBot** → **SelectionRadarBot** → **ProfitGuardBot** → **RuCareReturnsBot** → **InventoryWeeklyBot**.
