# 智能签到系统 — AI 可执行产品规格

> **文档用途**：供 AI 或工程师在少追问的前提下独立完成设计、实现与自测。  
> **版本**：v1.1（可随迭代增补字段，变更请更新「变更记录」）  
> **技术栈**：前端 Vue 3 + **JavaScript** + Vite；后端 **Node.js**（详见 §2.5）

---

## 1. 文档约定（给实现者）

| 符号 | 含义 |
|------|------|
| **MUST** | 必须实现 |
| **SHOULD** | 建议实现；若省略需在 README 说明原因 |
| **MAY** | 可选 |
| `固定值` | 字面量或枚举名 |
| `变量` | 由实现填充 |

---

## 2. 产品一句话

组织者为「活动/课程/班次」创建签到任务，参与者通过 **地理位置** 和/或 **二维码** 在有效时间内完成签到；管理员可查看统计与异常。

---

## 2.5 技术栈与工程布局（固定）

### 2.5.1 前端（MUST）

| 项 | 选型 |
|----|------|
| 框架 | **Vue 3** |
| 语言 | **JavaScript**（不使用 TypeScript，除非后续单独变更规格） |
| 构建 | **Vite**（`@vitejs/plugin-vue`） |
| 入口 | 单页应用（SPA）；路由 **Vue Router**；全局状态 **Pinia**（MAY，简单场景可用 provide/inject） |
| HTTP | `fetch` 或 **axios**；统一封装 baseURL、携带 `Authorization: Bearer <token>` |
| 与后端联调 | 开发环境 **Vite `server.proxy`** 将 `/api` 转发到 Node 端口，避免 CORS；生产环境由反向代理或同域挂载 |

**前端能力映射**

- 地理签到：`navigator.geolocation.getCurrentPosition`，读取 `coords.latitude/longitude/accuracy`；拒绝权限时走 §10 `location_permission_denied`。
- 二维码：组织者端用库生成二维码图片（如 `qrcode`）；参与者端 **MAY** 用 `html5-qrcode` 调摄像头或手动输入 token。
- 地图选点（围栏中心）：**MAY** 嵌入高德/腾讯/Mapbox/Leaflet 等，坐标系与 §7 声明一致（通常 WGS-84 或统一做 GCJ-02，前后端一致即可）。

### 2.5.2 后端（MUST）

| 项 | 选型 |
|----|------|
| 运行时 | **Node.js**（建议使用当前 LTS 版本） |
| HTTP 框架 | **Express** 或 **Fastify**（二选一，全项目统一）；暴露 §9 REST JSON |
| 校验 | `zod` / `joi` MAY，对请求体做 schema 校验 |
| 认证 | JWT（`jsonwebtoken`）或 session（`cookie` + `express-session`）MAY；与 §4 `auth_token` 一致即可 |
| 持久化 | **Node.js 内置 `node:sqlite`**（`DatabaseSync`），文件默认 `server/app.db`；环境变量 `SQLITE_PATH` 可改路径。需 **Node 22+**（当前 LTS 即可） |
| 注册 | `POST /api/auth/register` 默认注册为参与者；环境变量 **`ORGANIZER_REGISTER_CODE`** 与请求体 `organizer_invite_code` 一致时可注册为组织者 |
| 活动邀请 | `participant_scope: invite` + 服务端存 `invite_code_hash`；`POST /api/sessions/:id/join` 校验口令后加入 `joined_user_ids` |
| 测试 | `node:test` 或 `vitest`（仅测 Node 逻辑）+ 对 Haversine、QR 校验写单元测试 |

**Node 侧职责划分（建议目录语义，可平铺等价实现）**

- `routes/` 或 `routes.js`：挂载 `/auth`、`/sessions`、checkin 子路径  
- `middleware/`：`auth`、`requireRole('organizer')`、错误码统一响应  
- `services/`：`checkinGeo`、`checkinQr`、`sessionStatus`  
- `db/`：迁移与仓储（queries）

### 2.5.3 仓库布局（SHOULD）

单仓双包（monorepo）或根目录两子目录均可，**建议**：

```text
SmartCheckIn/
  apps/web/          # Vue + Vite（package.json 独立或 workspace）
  apps/api/          # Node 服务
  docs/
    AI_DEV_PRODUCT_SPEC.md
```

根目录 **MAY** 使用 `pnpm-workspace.yaml` / npm workspaces 统一管理依赖与脚本（如 `pnpm dev` 同时起前后端）。

### 2.5.4 环境变量（约定命名）

| 变量 | 用途 |
|------|------|
| `VITE_API_BASE_URL` | 前端生产构建时的 API 根路径；开发可空并用 proxy |
| `PORT` / `API_PORT` | Node 监听端口 |
| `JWT_SECRET` | 签发/校验 token（若用 JWT） |
| `DATABASE_URL` | 数据库连接串（若用 SQL） |

---

## 3. 范围与非目标

### 3.1 本期 MUST 包含

- 用户身份与角色（至少：组织者、参与者；MAY：管理员合并到组织者）
- 活动/签到会话的创建、时间窗、状态（未开始 / 进行中 / 已结束）
- **地理签到**：围栏判定、精度与作弊基础防护（见 §7）
- **二维码签到**：展示、扫描或输入、防截图重放（见 §8）
- 签到记录：成功/失败原因、时间、方式、设备侧可记录信息
- 基础列表与统计（按活动人数、成功率、方式分布）

### 3.2 本期明确非目标（避免范围蔓延）

- 人脸识别、硬件闸机、NFC
- 复杂排班与考勤薪资联动（可预留扩展字段）
- 多租户 SaaS 计费（除非单独需求）

---

## 4. 角色与权限矩阵

| 能力 | 参与者 | 组织者 |
|------|--------|--------|
| 查看可签到活动 | ✓（被邀请或公开码） | ✓ |
| 发起签到 | ✗ | ✓ |
| 配置地理围栏/二维码策略 | ✗ | ✓ |
| 查看他人签到明细 | ✗ | ✓ |
| 导出签到数据 | ✗ | ✓（CSV/Excel MAY） |

**认证**：MUST 支持登录态（账号密码 / 企业 SSO / 微信等任选一种，规格中统称 `auth_token`）。

---

## 5. 用户故事与验收标准（Gherkin 风格）

### US-1 组织者创建签到会话

- **Given** 已登录为组织者  
- **When** 填写活动名称、开始/结束时间、允许的签到方式（`GEO` | `QR` | `BOTH`）  
- **Then** 系统生成 `session_id`，状态为 `scheduled` 或 `active`（由当前时间决定）

**验收**：创建后参与者侧在时间内可见该活动；超时后不可签到。

### US-2 地理位置签到

- **Given** 会话启用 `GEO` 或 `BOTH`，且已配置围栏  
- **When** 参与者提交当前经纬度（及 MAY：精度米、时间戳）  
- **Then** 服务端用 Haversine（或等价）计算与围栏中心距离，≤ 半径则成功

**验收**：围栏外固定距离点 MUST 失败；围栏内 MUST 成功（在 Mock 坐标下可测）。

### US-3 二维码签到

- **Given** 会话启用 `QR` 或 `BOTH`  
- **When** 参与者提交扫码得到的令牌（或深链中的 `token`）  
- **Then** 校验令牌有效、未过期、未使用（或策略允许单次/多次，见 §8）

**验收**：过期令牌失败；正确令牌在首次策略下成功；重放按策略失败或记审计。

### US-4 防重复签到

- **Given** 同一用户、同一会话  
- **When** 再次签到  
- **Then** 返回明确结果：`already_checked_in`（幂等），不重复写成功记录或仅更新 `last_attempt_at`（二选一，文档化）

---

## 6. 核心领域模型（逻辑实体）

实现时可映射为关系表或文档；字段为最小集，可扩展。

### 6.1 User

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string/uuid | |
| role | enum | `organizer` \| `participant` |
| display_name | string | |
| external_id | string MAY | 对接 SSO |

### 6.2 Session（签到会话/活动）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | |
| title | string | |
| organizer_id | fk | |
| starts_at | datetime (UTC) | |
| ends_at | datetime (UTC) | |
| checkin_modes | enum[] | `GEO`, `QR`, `BOTH` 展开为所含集合 |
| status | enum | `scheduled` \| `active` \| `ended` \| `cancelled` |
| geo_config | object MAY | 见 §7 |
| qr_config | object MAY | 见 §8 |
| created_at | datetime | |

### 6.3 CheckInRecord

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | |
| session_id | fk | |
| user_id | fk | |
| method | enum | `geo` \| `qr` |
| success | boolean | |
| failure_code | string MAY | 机器可读 |
| client_reported_at | datetime MAY | 客户端时间 |
| server_at | datetime | 服务端收到时间 |
| latitude | float MAY | 成功或尝试均可记录 |
| longitude | float MAY | |
| accuracy_m | float MAY | |
| raw_meta | json MAY | 限大小，勿存 PII 明文密码 |

**唯一约束建议**：`(session_id, user_id)` 在「每人每场一次成功签到」模型下 UNIQUE（成功时）；若允许多次，则去掉 UNIQUE 并加版本字段。

---

## 7. 地理位置签到 — 规则与算法

### 7.1 geo_config 结构（MUST 可 JSON 序列化）

```json
{
  "center": { "lat": 39.9, "lng": 116.4 },
  "radius_m": 150,
  "min_accuracy_m": 80
}
```

- **center**：组织者选定或地图选点得到（WGS-84 或统一坐标系，全链路一致）。
- **radius_m**：允许误差半径（米）。
- **min_accuracy_m**：客户端上报的 `accuracy_m` 大于该值时 SHOULD 拒绝并返回 `accuracy_too_low`（防粗定位刷过）；MAY 由组织者关闭。

### 7.2 判定流程（服务端 MUST）

1. 校验会话时间窗与 `checkin_modes` 含地理能力。  
2. 若配置 `min_accuracy_m`，且 `accuracy_m` 缺失或过大 → 失败。  
3. `distance = haversine(client_lat, client_lng, center.lat, center.lng)`。  
4. `distance <= radius_m` → 成功，否则 `outside_geofence`。

### 7.3 客户端 MUST

- 使用系统定位 API 获取坐标与精度；无权限时明确错误码 `location_permission_denied`。
- MAY 展示地图预览与「距中心点约 X 米」。

### 7.4 作弊与滥用（SHOULD）

- 不信任客户端单独上报：最终以服务端计算为准。  
- MAY：记录 IP、User-Agent；异常频率限流（同 IP / 同用户）。  
- **说明**：纯软件无法完全杜绝模拟定位；可在产品层标注「增强模式」为 MAY（如 Root/越狱检测、与二维码双因子）。

---

## 8. 二维码签到 — 规则与安全

### 8.1 策略选择（组织者在创建/编辑会话时选一种，写入 `qr_config`）

| 策略 | 说明 | MUST/MAY |
|------|------|----------|
| `static_token` | 长周期密钥嵌入二维码，依赖保密 | MAY（弱） |
| `rotating_token` | 服务端每 T 秒换新 token，屏显或投影 | SHOULD |
| `signed_payload` | JWT 或 HMAC 载荷含 `session_id`、`exp`、`nonce` | SHOULD |

**推荐默认**：`rotating_token` 或 `signed_payload`，`exp` 短于 60s～300s 可配置。

### 8.2 qr_config 示例

```json
{
  "strategy": "rotating_token",
  "ttl_seconds": 60,
  "allow_reuse_within_ttl": false
}
```

### 8.3 API 行为（MUST）

- 组织者端：`GET /sessions/:id/qr/current` 返回当前有效 `token` 或完整 URL（需 `organizer` 权限）。  
- 参与者提交：`POST /sessions/:id/checkin/qr`，body `{ "token": "..." }`。  
- 校验：存在性、未过期、`session_id` 匹配、按策略是否单次消费。  
- 过期：`qr_token_expired`；伪造：`qr_token_invalid`。

### 8.4 展示

- 组织者大屏：轮询或 WebSocket 刷新二维码 MAY。  
- 参与者：相机扫码或手动粘贴 token（MAY）。

---

## 9. API 契约草案（REST，由 **Node.js** 实现；行为须与本文一致，框架 Express/Fastify 不限）

**通用响应**：

```json
{ "ok": true, "data": { } }
{ "ok": false, "error": { "code": "string", "message": "human readable" } }
```

### 9.1 POST `/auth/login` MAY

Body: `{ "username", "password" }` → `{ "token", "user" }`

### 9.2 POST `/sessions`

权限：组织者。Body 含 §6.2 可填字段。→ `{ "session" }`

### 9.3 GET `/sessions` / GET `/sessions/:id`

列表与详情；参与者仅可见被授权会话（邀请码或组织关系 MAY）。

### 9.4 POST `/sessions/:id/checkin/geo`

Body:

```json
{
  "lat": 39.91,
  "lng": 116.41,
  "accuracy_m": 25,
  "client_time": "2025-03-25T08:00:00Z"
}
```

→ `{ "record" }` 或 error code。

### 9.5 POST `/sessions/:id/checkin/qr`

Body: `{ "token": "..." }` → 同上。

### 9.6 GET `/sessions/:id/stats`

组织者：总人数、成功数、按方式分布、失败 Top codes。

### 9.7 GET `/sessions/:id/records` MAY

分页、筛选 `success`；参与者禁止。

---

## 10. 错误码表（机器可读，UI 可映射文案）

| code | HTTP | 说明 |
|------|------|------|
| `unauthorized` | 401 | 未登录 |
| `forbidden` | 403 | 角色不足 |
| `session_not_found` | 404 | |
| `session_not_started` | 409 | 当前时间 < starts_at |
| `session_ended` | 409 | 当前时间 > ends_at |
| `mode_not_allowed` | 409 | 该会话未开此方式 |
| `outside_geofence` | 422 | 地理不合格 |
| `accuracy_too_low` | 422 | 精度过差 |
| `location_permission_denied` | 422 | 客户端可先行拦截 |
| `qr_token_expired` | 422 | |
| `qr_token_invalid` | 422 | |
| `already_checked_in` | 200 或 409 | 幂等策略择一，全局统一 |
| `rate_limited` | 429 | |

---

## 11. 非功能需求

| 项 | 要求 |
|----|------|
| 时间 | 全链路 UTC 存储，前端按本地展示 |
| 并发 | 签到写入应幂等或事务防重 |
| 安全 | HTTPS；token 不在 URL 日志中明文长期留存 |
| 隐私 | 坐标精度展示可模糊；导出合规提示 |
| 可用性 | 核心签到接口 P99 MAY < 500ms（内网/同城） |

---

## 12. 前端页面清单（MVP，Vue Router 路由）

1. 登录页（写入 token，跳转角色首页）  
2. 参与者：`/sessions` 列表 → `/sessions/:id` 详情 → 子路由或 Tab：**地理签到**（调用 Geolocation）/ **扫码签到**（扫码或输入 token）  
3. 组织者：`/organizer/sessions/new`、`/organizer/sessions/:id/edit`（含地图选点 MAY）→ `/organizer/sessions/:id/qr` 大屏轮询 `GET .../qr/current`  
4. 组织者：`/organizer/sessions/:id/stats`、记录列表  

组件划分 SHOULD：`SessionForm.vue`、`GeoCheckIn.vue`、`QrDisplay.vue`、`QrScan.vue`（或合并），与 §9 接口一一对应。

---

## 13. 测试用例矩阵（AI 自测清单）

- [ ] 会话开始前/后边界各 1 次  
- [ ] 围栏内/外各 1 次（Mock 坐标）  
- [ ] 精度阈值边界（等于、大于 `min_accuracy_m`）  
- [ ] QR 过期与有效  
- [ ] 同一用户重复签到（幂等）  
- [ ] 参与者访问组织者-only 接口 → 403  
- [ ] `checkin_modes` 不含某方式时调用该接口 → `mode_not_allowed`  

---

## 14. 实现顺序建议（供 AI 分步提交）

**后端（Node）**

1. 初始化 `apps/api`（或 `server/`）：Express/Fastify、JSON 解析、统一错误体（§9）  
2. 数据模型 + 迁移 + Session CRUD  
3. 时间窗与状态校验中间件  
4. `POST .../checkin/geo` + Haversine + 单元测试  
5. QR 策略 + `GET .../qr/current` + `POST .../checkin/qr` + 测试  
6. `stats` / `records` + MAY 导出  

**前端（Vue + Vite + JS）**

7. 初始化/对齐 `apps/web`：Router、API 封装、环境变量 `VITE_API_BASE_URL`、开发 proxy  
8. 登录与会话列表/详情  
9. 地理签到页、组织者二维码页（轮询）  
10. 统计与记录页；端到端联调  

可先完成 1–6 再用静态页或 Postman 验收，再推进 7–10。

---

## 15. 变更记录

| 日期 | 变更 |
|------|------|
| 2025-03-25 | 初版：地理 + 二维码 + API + 验收清单 |
| 2025-03-25 | v1.1：固定技术栈为 Vue3+JS+Vite 与 Node.js；§2.5 工程布局与环境变量；§12/§14/§9 对齐实现 |
| 2025-03-25 | v1.2：SQLite（node:sqlite）、公开注册、活动邀请码模式、地理签到取消默认精度门槛 |

---

## 16. 给 AI 的提示（可选附录）

复制以下块作为 Cursor/Copilot 系统提示的补充：

```
你是本仓库的实现代理。唯一事实来源是 docs/AI_DEV_PRODUCT_SPEC.md。
技术栈固定：前端 Vue 3 + JavaScript + Vite；后端 Node.js（Express 或 Fastify）。不要用 TypeScript，除非用户改规格。
实现时：先满足所有 MUST；错误码与 API 形状与文档一致；边界条件以 §13 测试矩阵为准。
开发时用 Vite 代理或同域转发连接 Node API；生产环境配置 VITE_API_BASE_URL。
不要引入文档未要求的第三方付费服务，除非在 PR 说明中列出理由与环境变量。
```
