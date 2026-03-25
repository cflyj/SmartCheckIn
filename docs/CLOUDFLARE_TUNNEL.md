# Cloudflare Quick Tunnel（trycloudflare）中转 HTTPS

适用于：**国内云服务器暂时无法用 Let’s Encrypt / 自有域名 HTTPS**（如未备案、HTTP 校验被拦截），又需要 **手机浏览器在 HTTPS 下使用定位、摄像头（扫码）** 等能力时，用 **Cloudflare 提供的临时公网 HTTPS 地址** 把流量隧道到本机应用。

> 说明：流量经 Cloudflare；快速隧道**无 SLA**、**地址会变**，适合**测试与验证**，正式环境仍以 **备案域名 + 本机 Nginx 证书** 为准。详见仓库内 `docs/DEPLOY.md`。

---

## 1. 和本机 / 服务器的关系

| 组件 | 作用 |
|------|------|
| **你的应用（Node + `dist`）** | 仍在服务器上由 **PM2** 运行，默认监听 **`127.0.0.1:3001`**（与 `DEPLOY.md` 一致）。数据与数据库在服务器。 |
| **`cloudflared`** | 建议装在**同一台服务器**上，主动连接 Cloudflare，把公网请求转发到 **`http://127.0.0.1:3001`**。 |
| **`https://xxxx.trycloudflare.com`** | 浏览器只与 Cloudflare 建立 HTTPS；Cloudflare 通过隧道把请求送到你机器上的 3001。 |

**关掉本机 Cursor / 停止本机 `pnpm dev`**，只要 **服务器上 PM2 + `cloudflared` 仍在运行**，手机访问隧道地址 **不受影响**。

若 `cloudflared` 跑在你**自己电脑**上、`--url` 指向本机开发端口，则关电脑或停开发服务后，手机将无法访问。

---

## 2. 前置条件

- 服务器已按 `DEPLOY.md` 部署，且：

  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/
  ```

  返回 **200**（或至少能连上）。

- `pm2 status` 中 **`smartcheckin`** 为 **online**。

- 服务器能访问外网（隧道为**出站**连接）。

---

## 3. 安装 `cloudflared`（推荐：官方 apt 源）

避免从 GitHub 直连下载 `.deb`（国内常很慢或超时）：

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update
sudo apt-get install -y cloudflared
cloudflared --version
```

**备用**：在能访问 GitHub 的电脑上下载 `cloudflared-linux-amd64.deb`（或 `arm64`），用 `scp` 传到服务器的 `/tmp/` 后执行 `sudo dpkg -i /tmp/cloudflared.deb`。

---

## 4. 启动快速隧道（临时测试）

在服务器上执行（**保持该终端不关闭**，否则隧道断开）：

```bash
cloudflared tunnel --url http://127.0.0.1:3001
```

日志中会出现：

```text
Your quick Tunnel has been created! Visit it at:
https://随机子域.trycloudflare.com
```

用手机 **移动数据（4G/5G）** 打开该 **https** 链接，验证登录、地理签到、扫码等。

**可忽略的警告**：若出现 `ICMP proxy` / `ping_group_range` 相关 **WRN**，一般**不影响**网页与接口。

---

## 5. 后台常驻（systemd）

新建服务（注意：`ExecStart` 中的 `cloudflared` 路径以 `which cloudflared` 为准，常见为 `/usr/bin/cloudflared`）：

```bash
which cloudflared
```

```bash
sudo tee /etc/systemd/system/cloudflared-quick.service <<'EOF'
[Unit]
Description=Cloudflare Quick Tunnel -> SmartCheckIn :3001
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/cloudflared tunnel --url http://127.0.0.1:3001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

若 `which cloudflared` 不是 `/usr/bin/cloudflared`，请编辑 `ExecStart` 为实际路径。

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared-quick
sudo journalctl -u cloudflared-quick -f
```

在日志中查找 **`https://....trycloudflare.com`**。  
**每次重启该服务，子域名通常会变化**，需重新查看日志。

常用命令：

```bash
sudo systemctl status cloudflared-quick
sudo systemctl restart cloudflared-quick
sudo systemctl stop cloudflared-quick
```

---

## 6. 局限与注意

1. **地址不稳定**：Quick Tunnel 重启后 **URL 常变**；不适合作为长期唯一入口。正式环境用 **备案域名 + HTTPS**（`DEPLOY.md`）。
2. **无可用性承诺**：Cloudflare 对无账号快速隧道不提供 SLA。
3. **公网可访问**：任何知道链接的人可能访问到你的测试站，勿存放真实敏感数据；对外分享需谨慎。
4. **合规**：流量经境外节点；生产与合规要求请自行评估。
5. **与 Nginx**：隧道直连 **3001** 时，可不经过 Nginx；之后若改回域名 + Nginx，按 `DEPLOY.md` 配置即可。

---

## 7. 与「本机 Cursor / 开发环境」对比（备忘）

| 场景 | 手机能否访问 |
|------|----------------|
| 隧道 + 应用在 **云服务器** PM2，`cloudflared` 在服务器 | 关本机 Cursor / 停本机 `pnpm dev` **不影响** |
| 应用或隧道只在 **你的电脑** | 关电脑或停服务 → **无法访问** |

---

## 8. 故障排查简表

| 现象 | 检查 |
|------|------|
| 隧道无 URL / 报错 | `journalctl -u cloudflared-quick -n 50` 或前台运行看日志 |
| 页面 502 / 打不开 | `pm2 status`、`curl http://127.0.0.1:3001/` |
| 手机仍提示非 HTTPS | 确认地址为 **`https://`**，且为 **`trycloudflare.com` 子域** |

---

## 9. 相关文档

- 常规部署与 HTTPS（域名 / Certbot）：`docs/DEPLOY.md`
- 无域名 nip.io + Let’s Encrypt：在国内部分云平台可能被拦截，若遇 `dnspod.qcloud.com/.../webblock.html` 类错误，可优先使用本文隧道方案做验证。
