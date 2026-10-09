# 部署教程

本文介绍三种部署方式，按场景选一种即可：

| 方式 | 适合场景 | 难度 | 外网 | HTTPS |
| --- | --- | --- | --- | --- |
| **A. 考场笔记本 + 局域网** | 单场或少量考试，现场临时使用 | ★ | 不需要 | 无（不影响核心功能） |
| **B. Linux 服务器 + PM2 + Nginx** | 长期使用，多考场同时核查 | ★★★ | 需要 | 推荐 |
| **C. Docker** | 服务器上已经在用 Docker | ★★ | 需要 | 由 Nginx 等负责 |

---

## 0. 通用准备

### 环境要求

- **Node.js 22 LTS**（最低 20）。安装后用 `node -v` 确认版本
- 系统：Linux / macOS / Windows，x64 或 arm64 均可
- 配置：2 核 2G 足够上百人同时核查。照片压缩后每千人约 25MB，数据库很小

### 打包代码

部署只需要源代码，**不要**拷贝以下内容：

- `node_modules/`：里面有按操作系统编译的原生模块（SQLite、图片处理），Mac 上装的依赖在 Linux / Windows 上无法运行，必须在目标机器上重新安装
- `dist/`：在目标机器上重新构建
- `server/data/`：本机的测试数据
- 照片文件夹、Excel：这些是业务数据，部署后在后台上传

在开发机的项目目录下执行：

```bash
tar --exclude='node_modules' --exclude='dist' --exclude='server/data' \
    --exclude='软件学院2026级证件照' --exclude='*.xlsx' --exclude='.DS_Store' \
    -czf identify.tar.gz .
```

得到约 200KB 的 `identify.tar.gz`。Windows 上也可以直接复制整个文件夹，再手动删除上面这些目录。

### 国内网络加速（可选）

如果安装依赖很慢或失败：

```bash
npm config set registry https://registry.npmmirror.com
```

---

## A. 考场笔记本 + 局域网（最简单）

一台笔记本当服务器，监考员的手机连同一个网络访问。

### 1. 安装运行

1. 安装 Node.js 22 LTS：<https://nodejs.org/zh-cn>（Windows 选 `.msi` 安装包，一路下一步）
2. 把代码解压到任意目录，例如 `D:\identify`
3. 在该目录打开终端（Windows：地址栏输入 `cmd` 回车）：

```bash
npm run setup     # 安装依赖，首次需要联网
npm run build     # 构建
npm start         # 启动
```

启动成功后会显示：

```
服务已启动: http://localhost:3000  局域网: http://192.168.1.23:3000
```

Windows 首次启动若弹出防火墙提示，选择**允许访问**（勾选“专用网络”）。

### 2. 让手机连上来

- 电脑浏览器打开 `http://localhost:3000`，用管理员登录
- 监考员手机连**同一个 Wi-Fi**，浏览器打开上面显示的**局域网地址**

> ⚠️ **校园网、酒店等公共 Wi-Fi 通常开启了“客户端隔离”，手机访问不到电脑。** 解决办法（任选其一）：
> - 用笔记本开**移动热点**，让手机连这个热点（Windows：设置 → 网络 → 移动热点）
> - 带一台普通无线路由器，笔记本和手机都连它（不插网线也可以用）

### 3. 考试当天注意

- 笔记本接上电源，关闭自动睡眠（睡眠后服务会中断）
- 终端窗口不要关闭；关掉就停止服务。需要后台常驻请参考 B 方案中的 PM2
- 局域网 IP 可能变化，每次启动以终端显示的地址为准

---

## B. Linux 服务器 + PM2 + Nginx（推荐长期使用）

以 Ubuntu 22.04 / 24.04 为例，其他发行版命令类似。

### 1. 安装 Node.js、PM2、Nginx

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
# 编译工具：原生模块的预编译包下载失败时用于本地编译，装上更稳妥
sudo apt-get install -y python3 make g++

sudo npm install -g pm2
node -v && pm2 -v
```

### 2. 上传代码并构建

```bash
# 在开发机上
scp identify.tar.gz user@服务器IP:/tmp/

# 在服务器上
sudo mkdir -p /opt/identify && sudo chown $USER /opt/identify
tar -xzf /tmp/identify.tar.gz -C /opt/identify
cd /opt/identify
npm run setup
npm run build
```

### 3. 用 PM2 启动并设置开机自启

先编辑 `deploy/ecosystem.config.cjs`：要放在 Nginx 后面，就把 `HOST` 改成 `'127.0.0.1'`，这样 3000 端口不会直接暴露到公网。

```bash
cd /opt/identify
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup        # 按提示复制并执行它输出的那条 sudo 命令
```

验证：

```bash
curl http://127.0.0.1:3000/api/health     # 返回 {"ok":true,...}
pm2 logs identify --lines 50              # 查看日志，首次启动会打印默认管理员账号
```

> ⚠️ **只能运行一个实例。** 在线状态、照片处理进度、WebSocket 房间都保存在进程内存中，不要改成 `cluster` 模式或 `instances: 'max'`。

不想用 PM2 的话，可以用 systemd，配置见 `deploy/identify.service`。

### 4. 配置 Nginx 反向代理

```bash
sudo cp deploy/nginx.conf /etc/nginx/conf.d/identify.conf
sudo nano /etc/nginx/conf.d/identify.conf     # 修改 server_name 为你的域名或 IP
sudo nginx -t && sudo systemctl reload nginx
```

配置文件里已经处理好三件事，自己写配置时别漏掉：

| 配置 | 作用 | 漏掉会怎样 |
| --- | --- | --- |
| `Upgrade` / `Connection` 头 | WebSocket 实时推送 | 后台一直显示“重连中”，只能靠轮询刷新 |
| `client_max_body_size 2g` | 允许上传大照片包 | 上传 zip 报 413 |
| `proxy_read_timeout 600s` | 长连接和大文件上传 | 连接频繁断开 |

> 系统必须部署在**域名根路径**（如 `https://exam.example.com/`），不支持 `https://example.com/identify/` 这类子路径。

### 5. 开启 HTTPS（推荐）

有域名时，用 Let's Encrypt 免费证书：

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d exam.example.com
```

没有 HTTPS 也能正常核查，但浏览器只在 HTTPS（或 localhost）下开放以下功能：

- 管理后台的**桌面通知**（异常上报时的系统弹窗；页面内的弹窗和提示音不受影响）
- 账号管理中的**一键复制账号密码**（下载 CSV 不受影响）

### 6. 防火墙 / 安全组

- 云服务器控制台的安全组放行 **80、443**
- **不要**放行 3000（已由 Nginx 转发）
- 使用 ufw 时：`sudo ufw allow 'Nginx Full'`

---

## C. Docker 部署

在项目根目录执行：

```bash
# 先修改 docker-compose.yml 中的 ADMIN_PASSWORD
docker compose up -d --build
docker compose logs -f
```

- 数据保存在项目目录下的 `./data`（数据库 + 照片），删除容器不会丢失数据
- 国内服务器构建慢：把 `docker-compose.yml` 中的 `NPM_REGISTRY` 改成 `https://registry.npmmirror.com`
- 镜像内置健康检查（`/api/health`），`docker ps` 能看到 healthy 状态
- 对外提供服务仍建议在前面加 Nginx + HTTPS，配置同 B 方案第 4、5 步（`proxy_pass` 指向容器映射出来的端口）

> 注：Dockerfile 按标准 Node 22 镜像编写，但未在本机实际构建测试过；如遇问题，B 方案是经过验证的路径。

---

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `HOST` | `0.0.0.0` | 局域网直连用 `0.0.0.0`；在 Nginx 后面用 `127.0.0.1` |
| `DATA_DIR` | `server/data` | 数据库、照片、密钥所在目录 |
| `TZ` | 系统时区 | 影响导出 Excel 中的时间。云服务器默认 UTC，建议设为 `Asia/Shanghai`（PM2 / systemd / Docker 配置中已设置） |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin123` | **仅在数据库中没有管理员时**创建初始账号用，之后修改无效 |
| `JWT_SECRET` | 首次启动随机生成，保存到 `DATA_DIR/.jwt-secret` | 登录令牌签名密钥，一般无需设置 |

---

## 上线前检查清单

- [ ] 用默认管理员登录，**立即修改密码**（右上角 → 修改密码）
- [ ] 新建考试 → 导入名单 → 上传照片 zip
- [ ] 考试统计中「缺照片」为 0，或已确认缺照片的名单
- [ ] 账号管理 → 批量生成员工账号 → 分配考试 → 下载 CSV 下发给员工
- [ ] 用一部手机实际走一遍：登录 → 核查一人「正常」→ 一人「有问题」→ 悬浮窗发一条消息
- [ ] 后台确认收到异常弹窗和提示音（浏览器需先在页面上点击一次才能播放声音），右上角显示“实时在线”
- [ ] 测试完在后台把测试考生「重置状态」
- [ ] 执行一次 `npm run backup`，确认备份正常

---

## 日常运维

### 常用命令（PM2）

```bash
pm2 status                 # 运行状态
pm2 logs identify          # 实时日志
pm2 restart identify       # 重启
pm2 stop identify          # 停止
```

### 备份

数据都在 `DATA_DIR`（默认 `server/data/`）：

| 内容 | 位置 | 备份方式 |
| --- | --- | --- |
| 名单、核查记录、账号、聊天 | `identify.db` | `npm run backup`（运行中也可安全执行） |
| 压缩后的照片 | `photos/` | 直接复制目录，丢失也可重新上传 zip |
| 登录密钥 | `.jwt-secret` | 丢失只会让所有人重新登录 |

```bash
npm run backup                         # 备份到 server/data/backups/，自动保留最近 30 份
npm run backup -- /mnt/backup/identify # 备份到指定目录
```

考试期间建议每 10 分钟自动备份一次（`crontab -e`）：

```cron
*/10 * * * * cd /opt/identify && /usr/bin/node server/scripts/backup.js >> /var/log/identify-backup.log 2>&1
```

**注意：不要在运行中直接复制 `identify.db`**。数据库启用了 WAL 模式，最近的写入可能还在 `identify.db-wal` 里，直接复制会得到不完整的数据。请用上面的备份命令，或先停止服务再复制。

### 恢复

```bash
pm2 stop identify
cd /opt/identify/server/data
rm -f identify.db-wal identify.db-shm
cp backups/identify-20261010-093000.db identify.db
pm2 start identify
```

### 忘记管理员密码

在服务器上执行（运行中也可以）：

```bash
cd /opt/identify
npm run reset-password -- admin 新密码
# Docker：docker compose exec identify node server/scripts/reset-password.js admin 新密码
```

### 升级版本

```bash
npm run backup                              # 先备份
tar -xzf /tmp/identify.tar.gz -C /opt/identify   # 覆盖代码，server/data 不受影响
cd /opt/identify
npm run setup && npm run build
pm2 restart identify
```

数据库表结构在启动时自动同步，无需手动迁移。

---

## 常见问题

**手机打不开页面**
1. 确认手机和服务器在同一网络，地址用局域网 IP，不要用 `localhost`
2. 关闭手机上的 VPN / 代理
3. Windows 检查防火墙是否允许 Node.js；Linux 检查安全组和 ufw
4. 公共 Wi-Fi 的客户端隔离：见 A 方案第 2 步

**后台一直显示“重连中”**
WebSocket 没有连通。检查 Nginx 是否配置了 `Upgrade` 和 `Connection` 头（见 `deploy/nginx.conf`）。此时系统会自动降级为轮询，每 10 秒刷新一次，功能仍可用，只是不够及时。

**上传 zip 时报 413 或上传到一半失败**
Nginx 的 `client_max_body_size` 太小，或代理超时。按 `deploy/nginx.conf` 配置。使用 CDN 或云负载均衡时，也要检查它们的上传大小限制。

**`npm run setup` 时 better-sqlite3 或 sharp 安装失败**
- 换国内镜像：见“国内网络加速”
- 安装编译工具：`sudo apt-get install -y python3 make g++`（Windows 安装 Node 时勾选 “Tools for Native Modules”）
- 确认 Node 版本 ≥ 20：`node -v`

**员工看不到考试**
- 账号管理中，该员工是否分配了这场考试
- 这场考试是否处于“启用”状态（停用的考试员工端不可见）

**导出的 Excel 时间差了 8 小时**
服务器时区是 UTC。设置 `TZ=Asia/Shanghai` 后重启（PM2 配置已包含此项，修改后需执行 `pm2 delete identify && pm2 start deploy/ecosystem.config.cjs`）。

**可以多台服务器 / 多进程部署吗？**
不可以。本系统设计为单进程运行（SQLite + 进程内实时状态），单实例足以支撑几百名监考员同时使用。
