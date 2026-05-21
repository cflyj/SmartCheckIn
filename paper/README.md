# 毕业论文资料目录（SmartCheckIn）

本目录存放**论文结构与写作导引**，与仓库内实现（`docs/`、`src/`、`server/`）应对齐；正式排版请使用**学院下发的 Word 模板**（封面、字体、页码、参考文献 GB/T 7714 等以学校为准）。

| 文件 | 用途 |
|------|------|
| [毕设论文与SmartCheckIn对照索引.md](./毕设论文与SmartCheckIn对照索引.md) | **项目—论文章节对照**；`GEO_FACE` / `GEO_QR_FACE` 与 `/checkin/geo-face` 的准确语义（答辩易混点） |
| [论文主体架构与目录.md](./论文主体架构与目录.md) | **摘要（中英）**、**详细目录（章—节—目）**、各章写作提要 |
| [章节与仓库对照.md](./章节与仓库对照.md) | 正文撰写时与本项目模块、文档、图示的映射，避免「论文≠程序」 |
| [学术流水线与四技能用法.md](./学术流水线与四技能用法.md) | 使用 `deep-research` / `academic-paper` / `paper-reviewer` / `academic-pipeline` 的分工与卡点 |
| [OpenSkills 配置说明](../.cursor/OPENSKILLS_SETUP.md) | OpenSkills CLI 安装、从 GitHub 拉取 Skills、在 Cursor 中验证与 `@` 调用 |

## 分章正文（已按当前代码实现撰写，可迁入 Word）

| 章 | 文件 |
|----|------|
| 第 1 章 绪论 | [chapter-01-绪论.md](./chapter-01-绪论.md) |
| 第 2 章 相关技术与理论基础 | [chapter-02-相关技术与理论基础.md](./chapter-02-相关技术与理论基础.md) |
| 第 3 章 需求分析 | [chapter-03-需求分析.md](./chapter-03-需求分析.md) |
| 第 4 章 总体设计 | [chapter-04-总体设计.md](./chapter-04-总体设计.md) |
| 第 5 章 详细设计与实现 | [chapter-05-详细设计与实现.md](./chapter-05-详细设计与实现.md) |
| 第 6 章 测试与分析 | [chapter-06-系统测试与分析.md](./chapter-06-系统测试与分析.md) |
| 第 7 章 总结与展望 | [chapter-07-总结与展望.md](./chapter-07-总结与展望.md) |
| **全文合并稿** | [毕业论文全文-SmartCheckIn.md](./毕业论文全文-SmartCheckIn.md) |

摘要与拆分目录仍以 [论文主体架构与目录.md](./论文主体架构与目录.md) 为准；拆分稿中的 **参考文献占位与图表说明**须在 Word 中按学院模板补全。修订分章后可在仓库根目录执行 `node paper/_merge-full-thesis.mjs` 重新生成全文稿。
