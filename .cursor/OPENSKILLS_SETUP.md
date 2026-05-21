# Skills 的配置

下文的演示基于 OpenSkills 生态：它提供一套通用的 Skills 加载/管理方式，让 Cursor 等 AI coding agent 可以读取并使用以 SKILL.md 为核心的技能包。参考链接：[Cursor Agent Skills](https://cursor.com/docs/context/skills)、[openskills](https://github.com/numman-ali/openskills)。

## 1) 前置依赖

OpenSkills 通过 npm 分发，并会从 GitHub 拉取 skills 仓库，因此建议准备：

Node.js 20.6+（含 npm）  
Git  

## 2) 安装/运行 OpenSkills

OpenSkills 支持直接用 npx 运行：

```
npx openskills --version
```

如需多项目复用，也可全局安装：

```
npm i -g openskills
openskills --version
```

## 3) 一键安装 Skills

OpenSkills 支持直接从 GitHub 仓库安装 Skills，并自动放入默认目录（一般为项目内 ./.claude/skills/），Cursor 会自动从 .claude/skills/（以及 .cursor/skills/）发现 skills 并加载

下面以两个上游仓库为例展示 Skills 的安装方式：

```
# research 相关：zechenzhangAGI/AI-research-SKILLs
npx openskills install zechenzhangAGI/AI-research-SKILLs

# Anthropic 官方 skills
npx openskills install anthropics/skills
```

执行后 OpenSkills 会弹出交互式选择（勾选需要的 Skill 即可，默认全部安装）

## 4) 在 Cursor 中查看与使用 Skills

Skills 安装到 .claude/skills/ 后，Cursor 启动时会自动发现并提供给 Agent 使用。建议按以下方式验证：

确认 skills 已安装：npx openskills list 能看到目标 skills  
在 Cursor Settings 中查看：打开 Cursor Settings，进入 Rules, Skills, Subagents，在 Skills 区域可看到已发现的 skills  
在对话中手动调用：在 Agent Chat 输入 /，搜索 skill 名称并手动插入  
在对话中自然触发：直接提出明显对应 skill 的需求（例如“用会议模板开新稿”“写一个 booktabs 表格”），若行为与 Skill 文档一致，则配置生效  
配置完成后，无需记忆复杂 prompt，在对话中直接说明「要做什么」和「已有信息」即可。例如：提供研究 repo 路径与目标会议，说明「用 ICLR 2026 模板新建一篇论文、项目放在当前目录」。  

---

## 5) 常见问题：`Failed to clone` / `Recv failure: Connection was reset`

**含义**：`openskills install` 底层会执行 `git clone` 拉 GitHub。该报错多数是 **HTTPS 访问 GitHub 的网络被中断或重置**（与「私服未授权」无关，公开仓库也会如此）。

可按顺序尝试：

### A. 换网络或代理

使用手机热点、家庭宽带、VPN、公司提供的 GitHub 专线等后再执行一次安装命令。

### B. 使用 SSH（已配置 GitHub SSH 密钥时）

`openskills install` 支持 Git URL，可改为 SSH：

```
npx openskills install git@github.com:zechenzhangAGI/AI-research-SKILLs.git -y
```

同理 Anthropic：`git@github.com:anthropics/skills.git`

### C. 为 Git 配置 HTTP 代理（本机已有代理监听时）

在 PowerShell 中按你的代理端口设置，例如：

```
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890
```

安装成功后可按需取消：`git config --global --unset http.proxy`（以及 `https.proxy`）。

### D. 手动安装（绕过 `openskills` 克隆）

1. 在能打开 GitHub 的浏览器中下载仓库 **ZIP**：  
   `https://github.com/zechenzhangAGI/AI-research-SKILLs/archive/refs/heads/main.zip`
2. 解压后，将该仓库根目录下**各个含 `SKILL.md` 的技能子文件夹**，复制到你的项目：
   ```
   SmartCheckIn/.claude/skills/<技能文件夹名>/SKILL.md
   ```
3. 重启 Cursor（或 Reload Window），在 **Settings → Rules, Skills, Subagents → Skills** 中确认已发现。

Anthropic 官方 skills 同理：  
`https://github.com/anthropics/skills/archive/refs/heads/main.zip`，再按需复制其子目录（如 `skills/docx`、`skills/document-skills/` 等你需要的包）到 `.claude/skills/`。**注意**：Anthropic 仓库结构可能是「多 skill 放在一个 monorepo 里」，以该仓库 README 为准，保证每个 Cursor skill 独占一个目录且根下有 `SKILL.md`。

---

## 6) 关于 `npm warn Unknown user config "home"`

这是 **npm 读取到无效配置项 `home`** 的告警，一般不会阻止 `openskills` 运行。可在用户级 `~/.npmrc`（Windows 常为 `C:\Users\<用户名>\.npmrc`）中删掉错误的 `home=...` 行后重试。
