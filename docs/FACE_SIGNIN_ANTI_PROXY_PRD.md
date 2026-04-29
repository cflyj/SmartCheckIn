# 人脸签到防「随意改样本代签」— 产品与需求说明（PRD）

**文档版本**：1.0  
**关联实现**：`/api/users/me/face`、`face_descriptor_audit`、`FACE_ENROLLMENT_*` 环境变量  
**与 `FACE_CHECKIN_PRD.md` 关系**：原 PR 描述识别能力与技术形态；**本文补齐「身份绑定与治理」**，避免样本被高频替换演变为系统性代签。

---

## 1. 背景与问题陈述

### 1.1 品类能力边界（诚实披露）

本产品使用浏览器端计算的 **128 维人脸向量** 与用户账号先前录入的向量做相似度比对，**不承担金融级身份认证或防伪活体**。在「校园/例会」等非强合规场景可与地理、二维码互为补充。

### 1.2 产品与风控矛盾

若在 **不发生额外成本的前提下**允许用户：

- **无限制、可随时**在个人中心「重置 / 更换」人脸样本，

则在现实流程中可被利用为：**甲先录入本人 → 签到前改用乙的向量（由乙现场协助采样）→ 甲账号完成「人脸签到」**，等价于为他人代签到（**代签**）。  
若组织方仅以「刷脸」作为主要约束，该类行为会系统性削弱可信度。

本文在 **产品与工程**两侧定义 **最低限度治理**：在不大改业务流程（如不引入活体 SDK、不重做账号体系）下，显著提高「临场换脸代签」成本与可追溯性。

---

## 2. 目标与非目标

| 维度 | 内容 |
|------|------|
| **目标（MVP）** | ① 限制 **重复覆盖**录入的时间间隔（冷却）；② 在用户已报名的、含人脸签到能力的活动 **临近开始到结束期间**，禁止更换样本（**活动前冻结**，防临场换绑）；③ 记录每次 **初次录入 / 覆盖** 的操作审计条目，便于追责与迭代。 |
| **非目标** | 活体检测硬件、公安库比对、组织级一键「解锁」后台（可作 Phase 2）；防止用户与第三人共谋在冷却期之前就完成换人绑定（只能靠组织与其他签到方式叠加缓解）。 |

---

## 3. 用户画像与诉求

| 角色 | 诉求 |
|------|------|
| **参与者** | 首次录入无障碍；因伤容、设备更换等正当理由偶发重置，并接受合理等待；不希望被误判「无法参加活动」。 |
| **组织者 / 院系** | 希望「人脸」在活动窗口内代表的是 **事先绑定的脸庞**；希望对异常频繁变更可追溯。 |
| **平台** | 配置项清晰、默认值偏保守；错误码与前端文案可本地化、可运维。 |

---

## 4. 需求明细（可追溯）

### 4.1 策略 A：替换冷却（Cooldown）

**规则**：若账号 **已存在有效人脸样本**，则两次 **成功覆盖保存**之间须间隔不少于 `FACE_ENROLLMENT_COOLDOWN_HOURS`（默认 **168**，即 7 天）。  
**首次录入**（此前无有效向量）不适用冷却。

**验收**：

- 在间隔内调用 `POST /api/users/me/face` 返回业务错误，`error.code === 'face_enrollment_cooldown'`，并在 payload 中带 `next_eligible_at`。
- GET `/api/users/me/profile` 中 `face_enrollment` 对象含 `cooldown_hours`、`next_replace_eligible_at`（若在冷却则为未来时间）。

### 4.2 策略 B：活动窗口内禁止替换（Pre-session Freeze）

**规则**：若满足 **全部**：

1. 会话 `checkin_modes` 为人脸相关（`FACE` / `GEO_FACE` / `GEO_QR_FACE`）；  
2. 会话尚未结束（`ends_at > now`）；  
3. 用户在 **名单制** 中为 `allowed_user_ids` 之一，或在 **邀请制** 中已加入（`joined_user_ids`）；  
4. 当前时刻落在 **[活动开始时刻 − Freeze 小时 , 活动结束]** 区间内（ Freeze 默认 **48** 小时，见环境变量）。

则 **不允许覆盖**人脸样本（**首次录入仍允许**，避免新报名用户永远无法绑定）。

**验收**：

- 上述区间外，替换规则仍受冷却约束。  
- 冲突时接口返回 `error.code === 'face_enrollment_session_lock'`，并可带 `locked_session`、`locked_until_session_ends`。  
- Profile 暴露 `blocked_by: 'session_lock'` 与活动标题等业务可读字段。

### 4.3 优先级

若同时命中活动冻结与冷却，服务端 **优先返回活动冻结**（更贴近临场代签场景），再校验冷却。

### 4.4 审计

每次成功写入 `face_descriptor` 时插入 `face_descriptor_audit`：`occurred_at`、`action` ∈ {`initial`|`replace`}。

**验收**：数据库存在表与索引；可追溯某用户最近一次 initial/replace。

### 4.5 兼容与锚点（服务端必须满足）

| 要点 | 说明 |
|------|------|
| **存量无 `face_updated_at`** | 若仅有 `face_descriptor` 且无 `face_updated_at`，旧实现会跳过整条冷却。**启动迁移**对已存在_descriptor 且无时间的行补上 `face_updated_at`（以迁移执行时刻为锚）；之后与其它用户一样受冷却约束。 |
| **锚点时间** | 冷却计算的「上一次成功写入」取 **`users.face_updated_at` 与 `face_descriptor_audit` 中最近一次 `occurred_at` 的较晚者**，避免单列漏写时出现漏洞。 |
| **环境变量为 0** | `FACE_ENROLLMENT_COOLDOWN_HOURS`、`FACE_ENROLLMENT_PRESSESSION_FREEZE_HOURS` 若为 **0**：实现上等价漏配 → **回退默认 168h / 48h**，禁止误关掉限制。 |

**备注**：本产品的人脸数据采集指 **签到用 128 维 descriptor**，与「头像 / 昵称旁展示图」若为独立功能须另表存储；当前仓库仅存 descriptor，无头像上传路由。

---

## 5. API 与数据模型（摘要）

### 5.1 `GET /api/users/me/profile` 扩展

在原有 `has_face_descriptor` 外增加（示例）：

```json
{
  "has_face_descriptor": true,
  "face_enrollment": {
    "cooldown_hours": 168,
    "presession_freeze_hours": 48,
    "is_first_enrollment": false,
    "can_submit_new_sample": false,
    "blocked_by": "cooldown",
    "next_replace_eligible_at": "2026-05-06T12:00:00.000Z",
    "locked_session": null,
    "policy_note": "……"
  }
}
```

`can_submit_new_sample === true` 时允许调用 `POST /users/me/face`。

### 5.2 `POST /api/users/me/face` 错误码

| `error.code` | HTTP | 说明 |
|--------------|------|------|
| `face_enrollment_cooldown` | 403 | 冷却中 |
| `face_enrollment_session_lock` | 403 | 活动窗口内禁止替换 |

---

## 6. 配置项（运维）

| 环境变量 | 含义 | 默认 |
|----------|------|------|
| `FACE_ENROLLMENT_COOLDOWN_HOURS` | 两次成功 **覆盖** 的最小间隔（小时） | `168` |
| `FACE_ENROLLMENT_PRESSESSION_FREEZE_HOURS` | 活动开始前多少小时起至结束，禁止 **覆盖** | `48` |

---

## 7. 前端体验原则

- 人脸录入页在加载后拉取 profile，**若不可提交**则显著提示原因与（若有）可再次操作时间。  
- 保存按钮在 `can_submit_new_sample === false` 且非「首次录入」场景下禁用或引导只读说明。  
- 文案明确：**首次录入不要求冷却**；**更换**受限系防代签，与组织者说明一致。

---

## 8. 已知局限与路线图（Roadmap）

| 阶段 | 内容 |
|------|------|
| **Phase 2** | 组织维度「豁免一次重置」审计流；活体 / 翻拍检测（云服务或端侧）；与名单同步的「活动开始前锁定名单」联防。 |
| **Phase 3** | 与校园统一身份打通、设备指纹等高敏方案（本产品默认不承诺）。 |

---

## 9. 变更记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-04-29 | 1.0 | 首发：冷却 + 活动前冻结 + 审计 |
