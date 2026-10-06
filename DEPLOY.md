# OzonFlow 生产部署

静态前端 + 零依赖 Node 后端（`server/app.js`）+ JSON 文件持久化（`data/`）+ Docker Compose 一键起。

无 Ozon Api-Key 时走 **连接器路径**（浏览器插件捕获卖家后台数据）；有 Key 时同一后端开启 **代理写操作**（发货 / 运单 / 面单）。

## 一键 Docker

```bash
cp .env.example .env
# 按需填写 DEPLOY_TOKEN、ALLOW_ORIGIN；有 Key 再填 OZON_CLIENT_ID / OZON_API_KEY
bash scripts/deploy.sh
# 或：docker compose up -d --build
```

浏览器打开 `http://127.0.0.1:8787/`。健康检查：`GET /api/health`。

容器把 `./data` 挂到 `/data`，配置、状态、访问日志均落盘。

## 无 Docker：Node 直接启动

需要 Node ≥ 18。

```bash
cp .env.example .env   # 可选
npm start              # 等价于 node server/app.js
```

默认端口 `8787`。首次启动若未设 `DEPLOY_TOKEN`，会生成并打印到控制台（同时写入 `data/deploy.token`）。

## 前端对接（平台集成 → 自建部署）

1. 打开「平台集成」，找到「自建部署」卡片。
2. **API 基址**：同源部署填当前 origin（如 `http://127.0.0.1:8787`）；若前端仍在 GitHub Pages，填后端公网 HTTPS 地址，并在服务器设 `ALLOW_ORIGIN=https://rong001.github.io`。
3. **部署令牌**：填启动日志里的 `DEPLOY_TOKEN`。
4. 点「测试连接」→ 可选「推送/拉取状态」把浏览器 localStorage 经营状态与服务器 `data/state.json` 同步。
5. 有 Key 时在表单填写 Client-Id / Api-Key，点「保存到服务器」（密钥只存服务端，页面只显示掩码）。

也可在控制台设置：

```js
localStorage.setItem('ozonflow_api_base', 'https://your-host');
localStorage.setItem('ozonflow_deploy_token', '你的令牌');
```

## 免密钥连接器

1. 下载页面上的 `ozonflow-connector.zip`（或 `bash scripts/pack-connector.sh` 重新打包）。
2. Chrome/Edge 加载已解压扩展；登录 seller.ozon.ru，打开订单/财务/商品页。
3. 回到 OzonFlow「数据连接」→「从插件同步」。
4. 若页面跑在自建后端且配置了 API 基址，插件桥会尝试把捕获数据 POST 到 `/api/connector/ingest`。
5. **写操作（无 Key）**：在「订单履约」点发货 / 面单，或在「时效物流」回传运单号时，前端若探测到 health.credentials=false，会通过连接器向卖家后台下发 `ship` / `setTracking` / `applyWaybill`。扩展在已登录的订单页尝试启发式填写/点击；失败则打开对应订单、预填剪贴板并弹出步骤提示。**不会在平台未确认时把订单标为已发货。** 写结果可经 bridge 记入 `/api/connector/ingest`（`writeLog`）。

扩展 `content_scripts` 已包含 `http://localhost:8787/*` 与 GitHub Pages。其他自建域名请在 `extension/manifest.json` 的 bridge matches 中追加后重新打包加载。需要 `tabs` + `clipboardWrite` 权限（manifest 1.1.0+）。

## 接 Api-Key（写操作）

环境变量或「自建部署」表单写入后：

| 封装 | 上游 |
|------|------|
| `POST /api/ozon/ship` | `/v4/posting/fbs/ship` |
| `POST /api/ozon/tracking` | `/v2/fbs/posting/tracking-number/set` |
| `POST /api/ozon/waybill` | `/v2/posting/fbs/package-label` |

仍可通过 `POST /v*/…` 原样转发（需凭证；`WRITE_ALLOW=0` 时仅放行查询类路径）。

请求头：`Authorization: Bearer <DEPLOY_TOKEN>`（写配置、推状态、写操作封装需要）。

## 反向代理与 HTTPS

生产请在 Nginx / Caddy / 云负载均衡后挂 HTTPS，反代到 `127.0.0.1:8787`。

注意：

- 若前端与 API **不同源**，必须设 `ALLOW_ORIGIN`（可逗号分隔多个）。
- 同源（Compose 同时托管静态页与 API）可留空 `ALLOW_ORIGIN`。
- 不要把 `data/config.json`、`data/deploy.token`、`.env` 暴露到公网静态目录；后端已拒绝直接下载这些文件。
- WebSocket 非必需；当前为纯 HTTP JSON。

## API 一览

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/health` | 否 | `{ ok, version, credentials, mode, uptime }` |
| GET | `/api/config` | 否 | 掩码后的配置 |
| POST | `/api/config` | Bearer | 保存密钥 / ALLOW_ORIGIN / webhook 等 |
| GET | `/api/state` | 否 | 整包经营状态 |
| PUT | `/api/state` | Bearer | 写入 `data/state.json` |
| POST | `/api/connector/ingest` | 可选 | 连接器推送订单/结算/商品 |
| GET | `/api/connector/capture` | 否 | 查看已 ingest 数据 |
| POST | `/api/ozon/ship` | Bearer | 发货 |
| POST | `/api/ozon/tracking` | Bearer | 回传运单号 |
| POST | `/api/ozon/waybill` | Bearer | 面单 |
| * | `/v*/…` | 否（凭证在服务端） | Ozon 官方 API 代理 |
| GET | `/__health` | 否 | 兼容旧探活 |

## 排障

| 现象 | 处理 |
|------|------|
| `npm start` 端口占用 | 改 `PORT=` 或结束占用进程 |
| 前端跨域失败 | 设 `ALLOW_ORIGIN` 为前端 origin，重启 |
| 401 unauthorized | 检查 Bearer 令牌是否与服务器一致 |
| health.credentials=false | 未配 Key，属正常；用连接器即可 |
| 写操作返回 need:api-key | 在服务器配置 Key，或改在卖家后台手动发货 |
| Docker 构建失败 | 本机无 Docker 时用 `npm start`；确保 Dockerfile 与仓库文件齐全 |
| 插件不同步自建域名 | 把域名加入 `extension/manifest.json` bridge matches 后重装扩展 |

## 边界

- **不索要、不在仓库提交真实 Api-Key。**
- 无 Key：读链路（订单/结算/商品/比价/轨迹/状态同步）可上线；写操作走连接器卖家后台辅助（启发式，DOM 变更可能导致降级为「打开后台 + 剪贴板 + 步骤」），**禁止静默本地假成功**。
- 有 Key：同一部署启用代理写操作，密钥永不回传完整值。
- Docker：优先 `docker compose up -d --build`；本机无 Docker 时用 `npm start`（见下文依赖说明）。


## Docker 依赖

需要本机已安装 **Docker Engine + Compose 插件**（或兼容的 Podman）。

```bash
# Debian/Ubuntu 示例
sudo apt-get update
sudo apt-get install -y docker.io docker-compose   # 或带 compose 插件的 Docker Desktop / docker-compose-plugin
sudo systemctl enable --now docker
# 当前用户加入 docker 组后重新登录
sudo usermod -aG docker "$USER"
```

装不了或不想用容器时：

```bash
cp .env.example .env   # 可选
npm start              # node server/app.js，端口 8787
curl -s http://127.0.0.1:8787/api/health
```

静态前端也可继续用 GitHub Pages；只需把「自建部署」API 基址指到这台 Node 服务，并设好 `ALLOW_ORIGIN`。
