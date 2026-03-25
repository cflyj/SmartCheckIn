# SmartCheckIn 部署与更新说明

适用于：**腾讯云轻量应用服务器**、**Ubuntu 22.04 / 24.04**、**Node 20 + PM2 + Nginx** 的一体式部署（`NODE_ENV=production` 时由 Express 同时提供 `/api` 与 `dist` 静态资源）。

---

## 1. 服务器与端口自检

在 SSH 中执行：

```bash
sudo ss -tlnp | head -30
df -h
```

- **22**：SSH，正常。
- **80 / 443**：若未监听，说明尚未安装或未启动 Nginx，后续可安装反代。
- **3001**：部署后由 Node 监听（建议仅本机访问，由 Nginx 反代）。
- 若存在 **OpenClaw** 等应用镜像自带的进程（如仅监听 `127.0.0.1:21563` 等），与 SmartCheckIn **不冲突**；确保 **80/443** 留给 Nginx 即可。

**轻量云防火墙**：放行 **TCP 22、80、443**；**不要**对公网放行 **3001**（应用只给 Nginx 访问）。

---

## 2. 首次部署（从零开始）

### 2.1 系统与依赖

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx
```

安装 Node.js 20 与 pnpm：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
sudo npm install -g pnpm
```

### 2.2 获取代码

**方式 A：Git**

```bash
sudo mkdir -p /var/www/smartcheckin
sudo chown -R $USER:$USER /var/www/smartcheckin
cd /var/www/smartcheckin
git clone https://github.com/<你的用户名>/SmartCheckIn.git .
```

**方式 B**：在本机打包项目（不含 `node_modules`），用 `scp` 上传到服务器后解压到目标目录。

### 2.3 环境变量

在项目根目录（与 `package.json` 同级）创建 `.env`：

```env
NODE_ENV=production
API_PORT=3001
JWT_SECRET=<使用强随机字符串，勿用仓库默认值>
```

生成随机密钥示例：

```bash
openssl rand -base64 32
```

**nano 简要操作**：粘贴多用终端 **右键** 或 **Shift+Insert**；保存 **`Ctrl+O`** 回车；退出 **`Ctrl+X`**。

### 2.4 安装与构建

```bash
cd /var/www/smartcheckin
pnpm install
pnpm build
```

### 2.5 PM2 进程守护

```bash
sudo npm install -g pm2
pm2 start server/index.js --name smartcheckin
pm2 save
pm2 startup
```

执行 `pm2 startup` 打印的 **那一行 `sudo …` 命令**，以便开机自启。

自检：

```bash
curl -s http://127.0.0.1:3001/api/health
```

### 2.6 Nginx 反向代理

创建站点配置（无域名时可先用公网 IP 作为 `server_name`）：

```bash
sudo nano /etc/nginx/sites-available/smartcheckin
```

示例：

```nginx
server {
    listen 80;
    server_name 你的公网IP或域名;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用并重载：

```bash
sudo ln -sf /etc/nginx/sites-available/smartcheckin /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

浏览器访问 `http://服务器IP` 应能打开前端；接口为同源 `/api`，一般**无需**设置 `VITE_API_BASE_URL`。

### 2.7 HTTPS（可选）

1. 域名 **A 记录** 指向服务器公网 IP。  
2. 若使用国内服务器对公网提供网站，需按云厂商要求完成 **ICP 备案**。  
3. 申请证书示例：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## 3. 数据与备份

- 数据库文件默认路径：**`server/app.db`**（及可能产生的 `-wal` / `-shm`）。  
- 备份：定期复制 `app.db`（建议在低峰或停写时拷贝，或使用云快照）。  
- **`.env`** 已在 `.gitignore` 中，勿提交到 Git。

---

## 4. 代码更新后重新部署

### 4.1 使用 Git

```bash
cd /var/www/smartcheckin

git pull
pnpm install          # package.json 依赖有变更时必须执行
pnpm build            # 仅当修改了前端（如 src/）时需要
pm2 restart smartcheckin
```

- **只改后端**（`server/` 等）且依赖未变：可 **`git pull` → `pm2 restart`**，不必每次 `pnpm build`。  
- **改了前端**：必须 **`pnpm build`** 后再 **`pm2 restart`**。  
- **修改了 `.env`**：保存后执行 **`pm2 restart smartcheckin`**。

### 4.2 不使用 Git（上传覆盖）

覆盖文件后（**勿误删** `server/app.db`）：

```bash
cd /var/www/smartcheckin
pnpm install
pnpm build
pm2 restart smartcheckin
```

### 4.3 Nginx

仅应用代码更新时通常**无需**重载 Nginx。若修改了 Nginx 配置：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 4.4 回滚建议

重要更新前记录 commit 或打 tag；异常时可：

```bash
git checkout <旧提交的 hash>
pnpm install && pnpm build
pm2 restart smartcheckin
```

---

## 5. 规格与扩展说明

- **2 核 2G** 轻量机：适合中小规模并发；SQLite 单文件库，单节点写入为主。  
- 若未来用户量或写入压力很大，可再评估迁移至 **PostgreSQL / MySQL**（需改数据层）。  
- 生产环境务必将 **`JWT_SECRET`** 设为强随机值，勿使用开发默认字符串。

---

## 6. 故障排查

```bash
pm2 logs smartcheckin --lines 50
curl -s http://127.0.0.1:3001/api/health
sudo nginx -t
```

根据报错检查：端口占用、`.env` 是否加载、`dist` 是否已构建、防火墙是否放行 80/443。
