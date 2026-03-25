# SmartCheckIn UI / 视觉走查报告

> **角色**：产品视觉与界面设计走查（对标国际一线大厂移动端 Web / PWA 体验）  
> **目的**：汇总当前界面在**整体性、精致度、可访问性、设计系统一致性**上的问题，供后续迭代与 AI 自动修改时逐条对照。  
> **范围**：`src/style.css`、主要 Vue 视图与 `AppNavBar`；不涵盖业务逻辑正确性。

---

## 一、总体结论（Executive Summary）

当前产品采用 **iOS Human Interface Guidelines 浅色范式**（系统蓝、分组列表、毛玻璃导航），方向正确，信息结构清晰。但与「国际大厂」级体验相比，差距主要集中在：

1. **设计系统未闭环**：大量页面级 `inline style` 绕过 token，圆角、间距、字阶无法全局收敛。  
2. **无深色模式 / 无高对比主题**：大屏二维码页强行深色，与全局浅色体系**割裂**，且错误提示组件未做暗色适配。  
3. **品牌与层级弱**：缺少可识别的品牌图形语言（Logo、插画、空状态）；标题层级在业务页几乎被「列表+说明文」淹没。  
4. **可访问性（a11y）缺口**：键盘焦点环、`prefers-reduced-motion`、部分对比度与触控反馈未系统化。  
5. **质感单一**：阴影、分隔、动效停留在「够用」，缺少有节制的层级与微交互，难以形成「精致」观感。

以下按维度列出**可执行**问题，建议修复时优先处理标为 **P0** 的项。

---

## 二、设计系统与设计令牌（Design Tokens）

| 优先级 | 问题 | 说明 | 建议方向 |
|--------|------|------|----------|
| **P0** | 间距、字重、圆角在组件内外不一致 | 全局有 `--radius-*`、`--shadow-card`，但各视图大量 `margin-bottom: 20px`、`font-size: 14px` 等硬编码 | 引入 `--space-1…8` 或 4px 基准倍率；正文/辅助文字用 `.text-body` / `.text-caption` 等语义类 |
| **P0** | 无深色 / 高对比 token | `QrDisplayView` 使用独立深色内联样式，与 `:root` 浅色变量无关 | 定义 `data-theme="dark"` 或页面级 `.theme-display` 变量集（背景、分隔、文字、强调色、错误条背景） |
| **P1** | 阴影层级单一 | 仅 `--shadow-card` 一种 elevation | 区分「列表容器 / 浮起卡片 / 模态」2～3 级 shadow 或改用更轻的边框+背景（Material 3 / iOS 15+ 趋势） |
| **P1** | 主色与状态色未文档化 | 成功/警告/错误 pill 与 banner 各写一套 rgba | 集中为 `--color-success-*`、`--color-danger-*` 等，保证 pill 与 banner 同源 |
| **P2** | 无 `letter-spacing` / `line-height` 字阶表 | 中文 17px 正文与 13px 标签混用，行高不统一 | 为中文排版单独约定（如标题 `line-height: 1.25`，正文 `1.5`） |

---

## 三、排版与信息层级（Typography & Hierarchy）

| 优先级 | 问题 | 说明 | 建议方向 |
|--------|------|------|----------|
| **P0** | 业务页缺少「页面标题」视觉锚点 | 除登录页 `headline` 外，多数页仅依赖 `AppNavBar` 一行标题；首页用 `subhead` 当问候，层级与入口列表反差不足 | 首页可增加轻量标题区或插图；长表单页考虑分组标题（Section Header）样式统一 |
| **P1** | `label` 全大写（`text-transform: uppercase`） | 对**中文**标签不友好，且不符合中文 UI 惯例（Apple 中文版亦很少对中文做全大写） | 中文环境取消 uppercase，或仅对纯英文缩写使用 |
| **P1** | `.list-cell__title` 与 `.muted` 字阶接近 | 列表主标题 17px medium，辅文 15px secondary，对比略弱 | 主标题可略增字重或略降辅文对比度层级（tertiary） |
| **P1** | 说明性长文密度高 | `HomeView`、`SessionDetailView` 等大块 `muted` 段落，缺少列表/折叠/「了解更多」 | 关键句加粗已做，可补充图标引导或分段小标题 |
| **P2** | 等宽 `code` 在登录脚注 | 技术信息混在登录页底部，破坏「产品感」 | 移入「关于/帮助」或折叠面板，登录区保持干净 |

---

## 四、色彩、对比与模式（Color & Contrast）

| 优先级 | 问题 | 说明 | 建议方向 |
|--------|------|------|----------|
| **P0** | `QrDisplayView` 上仍使用 `.banner-error` | 浅色设计的红底浅红字组件放在**深色背景**上，对比与色相可能不协调 | 提供 `.banner-error--on-dark` 或在该页用专用错误条样式 |
| **P1** | 主文字 `--ios-label: #000` | 在 OLED 与长时间阅读场景偏硬 | 可改为 `#1c1c1e` 级中性黑，与 Apple 标签色对齐 |
| **P1** | 链接与按钮同为系统蓝 | 文内 `<router-link>` 与主按钮同色，可点击性边界略模糊 | 正文链接可用下划线或次要蓝；按钮保持填充主按钮 |
| **P2** | `pill-active` 与 `pill-checked-in` 均为绿系 | 语义不同（进行中 vs 已签到）但视觉接近 | 已签到可略偏青/或加图标区分 |

---

## 五、组件一致性与布局（Components & Layout）

| 优先级 | 问题 | 说明 | 建议方向 |
|--------|------|------|----------|
| **P0** | 海量 `style="..."` 分散在各 `.vue` | 同一模式（如 `margin-bottom: 16px`、`card` 间距）重复数十处，难以统一调整 | 抽取 `.stack` / `.section` / `.page-hint` 等工具类或小型布局组件 |
| **P1** | 卡片与列表「双系统」 | `.card` 与 `.grouped-list` 均为白底+圆角+阴影，并列表意接近 | 明确何时用「分组列表」何时用「独立卡片」；或统一圆角与阴影参数 |
| **P1** | 主按钮纵向堆叠间距不统一 | 常见 `margin-top: 12px` / `20px` 混用 | 用统一栈式间距 token |
| **P1** | `chevron` 使用字符 `›` | 跨字体渲染不一致，粗细与行高依赖系统字体 | 可考虑 SVG 图标或 Icon font，保证与字重对齐 |
| **P2** | `max-width: 560px` 居中 | 大屏两侧留白过大时略显空 | 平板断点下可适当放宽 max-width 或增加侧栏/品牌区（可选） |

---

## 六、导航与顶栏（Navigation）

| 优先级 | 问题 | 说明 | 建议方向 |
|--------|------|------|----------|
| **P1** | 顶栏标题过长无截断 | 活动名、组织名可能很长，单行 `nav-bar__title` 可能溢出或挤压两侧按钮 | `ellipsis` + `min-width: 0`；长标题详情页用副标题展示全称 |
| **P1** | 右侧 `nav-bar__action` 无最小触控对齐 | 与返回键 48px 最小触控区相比，纯文字链接触控区可能偏小 | 增加 `min-height` / `padding` 与点击热区 |
| **P2** | 无「当前在哪」的弱提示 | 除标题外无底部 Tab 或面包屑 | 若产品保持单栈导航，可通过列表选中态或首页分区强化方位感 |

---

## 七、表单与输入（Forms）

| 优先级 | 问题 | 说明 | 建议方向 |
|--------|------|------|----------|
| **P1** | 输入框与卡片同为 elevated 白底 | `.input` 与 `.card` 同为白底+阴影，嵌套时层次不清 | 输入框可改为浅灰底或内嵌描边，符合 iOS grouped inset 风格 |
| **P1** | 缺少明确 `focus-visible` 样式 | 键盘用户难以看见焦点 | 为 `input`/`button`/`select` 增加 `:focus-visible` ring（与品牌色一致） |
| **P2** | `select` 原生外观平台差异大 | Android / iOS / 桌面下拉样式不一 | 可接受；若追求极致可自定义下拉（成本较高） |

---

## 八、状态与反馈（Loading, Empty, Error）

| 优先级 | 问题 | 说明 | 建议方向 |
|--------|------|------|----------|
| **P1** | 加载态仅为文案「加载中…」 | 无骨架屏或轻量 spinner，感知品质一般 | 列表/卡片区用骨架或系统级 `activity indicator` 风格 |
| **P1** | 空状态多为一行灰字 | 缺少插图、主按钮引导 | 为空列表设计统一 `EmptyState` 组件（图标+一句文案+主操作） |
| **P2** | 成功/错误 banner 形状一致 | 语义靠颜色区分，色弱用户吃力 | 可加左侧竖条图标或前缀图标（✓ / !） |

---

## 九、动效与触感（Motion & Haptics）

| 优先级 | 问题 | 说明 | 建议方向 |
|--------|------|------|----------|
| **P1** | 仅 `btn:active` scale | 列表行、卡片无按压反馈 | 可为 `list-cell` 按钮增加轻微背景变化或 opacity |
| **P2** | 未尊重 `prefers-reduced-motion` | 动效虽少，但 scale 动画应对系统设置关闭 | `@media (prefers-reduced-motion: reduce)` 内禁用 transform 动画 |

---

## 十、品牌与情感化（Brand & Delight）

| 优先级 | 问题 | 说明 | 建议方向 |
|--------|------|------|----------|
| **P1** | 无产品 Logo / 启动记忆点 | 登录页仅文字 `SmartCheckIn` | 增加简洁字标或图形标；`theme-color` / favicon 与主色故事一致 |
| **P2** | 大屏二维码页是唯一「场景化」页面 | 深色沉浸合理，但与主站无过渡 | 从编辑页进入时可用短暂过渡或统一暗色 token，避免「两个产品」感 |

---

## 十一、可访问性（Accessibility）清单

| 优先级 | 问题 | 建议 |
|--------|------|------|
| **P0** | 焦点样式缺失 | 全局 `:focus-visible` |
| **P1** | 图标按钮/扫描页关闭依赖文字 | 补充 `aria-label` |
| **P1** | 错误信息仅颜色 | 文案前缀或图标 |
| **P2** | 动态二维码页对比度 | 用工具测 WCAG AA |

---

## 十二、建议的后续执行顺序（供 AI / 迭代拆分）

1. **第一批（设计系统打底）**：间距/字阶/圆角 token 化；去掉或替换中文 `uppercase` label；`focus-visible`。  
2. **第二批（深色与例外页）**：抽象 `QrDisplayView` 为 `theme-display` token；暗色错误条。  
3. **第三批（去 inline）**：高频 margin/font 改为 utility 或 section 组件。  
4. **第四批（质感与品牌）**：空状态、加载、Logo、列表按压反馈、`prefers-reduced-motion`。

---

## 十三、文件索引（便于 AI 定位）

| 区域 | 主要文件 |
|------|----------|
| 全局样式 | `src/style.css` |
| 导航 | `src/components/AppNavBar.vue` |
| 首页 | `src/views/HomeView.vue` |
| 登录/注册 | `src/views/LoginView.vue`、`RegisterView.vue` |
| 参与者列表与条目 | `src/views/participant/SessionListView.vue`（含 `participant-session-list_*`） |
| 参与者详情 / 扫描 | `src/views/participant/SessionDetailView.vue` |
| 大屏二维码 | `src/views/organizer/QrDisplayView.vue` |
| 组织与活动表单 | `OrgDetailView.vue`、`SessionFormView.vue` 等（inline style 密集） |

---

*文档版本：与当前仓库走查同步，后续 UI 改动后应更新本清单勾选状态或追加条目。*
