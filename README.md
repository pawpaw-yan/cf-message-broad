# 📮 Webhook 留言板

一个纯 JavaScript 的留言板：任何程序都可以通过 Webhook（HTTP POST）把消息发进来，网页实时展示。运行在 **Cloudflare Pages + Pages Functions + KV** 上，无服务器、零成本起步。

```
┌──────────┐   POST /api/messages    ┌─────────────────────┐
│ 任意程序  │ ──────────────────────▶ │  Cloudflare Pages    │
│ 脚本/CI/  │   JSON / form / text    │  Functions ──▶ KV    │
│ 机器人    │ ◀────────────────────── │                     │
└──────────┘      { ok: true, id }   └─────────┬───────────┘
                                               │ GET /api/messages
                                     ┌─────────▼───────────┐
                                     │   留言板网页（30 秒轮询）│
                                     └─────────────────────┘
```

## 功能

- **Webhook 发送**：`POST /api/messages`，支持 JSON、表单、纯文本三种格式，字段名兼容 `message/text/content/body` 与 `name/author/username`
- **网页展示**：留言卡片、头像配色、相对时间、自动链接化，每 30 秒自动刷新（后台标签页暂停）
- **安全**：内容 HTML 转义防 XSS、可选密钥校验、每 IP 每分钟 10 条限流、内容长度截断
- **管理**：带密钥删除留言
- 零依赖：前端原生 JS，后端 Pages Functions 原生接口

## 快速部署

### 方式一：Git 连接部署（推荐）

1. 把本仓库推送到 GitHub / GitLab
2. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → 选择 **Pages** → **Connect to Git**，选中本仓库
3. 构建设置：
   - **Framework preset**：`None`
   - **Build command**：留空
   - **Build output directory**：`public`
4. 创建 KV 存储：Dashboard 左侧 **Storage & Databases** → **KV** → **Create namespace**，名字随意（如 `messages`），复制其 ID
5. 回到 Pages 项目 → **Settings** → **Functions** → **KV namespace bindings** → 添加绑定：
   - Variable name：`MESSAGES_KV`
   - KV namespace：选择刚创建的
6. 重新部署一次（Settings → Deployments → Retry deployment），绑定才会生效

### 方式二：命令行部署

```bash
npm install
npx wrangler login
npx wrangler kv namespace create MESSAGES_KV   # 把输出的 id 填入 wrangler.toml
npm run deploy
```

## 可选配置（Pages 项目 Settings → Environment variables）

| 变量 | 说明 |
|------|------|
| `WEBHOOK_SECRET` | 设置后，发送留言必须携带密钥：`?secret=xxx`、请求头 `X-Webhook-Secret` 或 `Authorization: Bearer xxx` 任一即可 |
| `ADMIN_SECRET` | 删除留言的管理密钥；未设置时回退使用 `WEBHOOK_SECRET`（都没有则禁用删除） |

## API

### 发送留言

```bash
curl -X POST https://你的域名.pages.dev/api/messages \
  -H "Content-Type: application/json" \
  -d '{"name": "小明", "message": "你好，世界！"}'
```

响应 `201`：

```json
{ "ok": true, "id": "9999945678901:2f1c…", "name": "小明", "message": "你好，世界！", "timestamp": 1769475800000 }
```

其他格式同样有效：

```bash
# 表单
curl -X POST https://你的域名.pages.dev/api/messages -d "name=CI机器人&message=构建完成 ✅"

# 纯文本（署名默认为 Webhook）
curl -X POST https://你的域名.pages.dev/api/messages -H "Content-Type: text/plain" -d "来自脚本的一句话"

# 带 source 标记来源（网页上显示为小标签）
curl -X POST https://你的域名.pages.dev/api/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "部署完成", "source": "GitHub Actions"}'
```

### 获取留言

```bash
curl "https://你的域名.pages.dev/api/messages?limit=50"   # 最新在前，limit 最大 200
```

### 删除留言

```bash
curl -X DELETE "https://你的域名.pages.dev/api/messages/<id>?secret=你的管理密钥"
```

## 本地开发

```bash
npm install
npm run dev        # 打开 http://localhost:8788
```

本地会自动模拟 KV 存储。项目根目录的 `.dev.vars`（已加入 `.gitignore`）可在本地模拟密钥环境变量：

```
WEBHOOK_SECRET=test123
ADMIN_SECRET=admin456
```

测试 webhook（Windows 的 Git Bash 里 curl 发中文会因本地编码乱码，建议用 Node/程序发送）：

```bash
curl -X POST http://localhost:8788/api/messages -H "Content-Type: application/json" -d '{"name":"test","message":"hello"}'
```

## 目录结构

```
message-broad/
├── public/                  # 静态前端（Pages 构建输出目录）
│   ├── index.html
│   ├── style.css
│   └── app.js
├── functions/               # Pages Functions，按文件路径自动成为 API 路由
│   └── api/
│       ├── messages.js      # GET 获取 / POST 发送 /api/messages
│       └── messages/[id].js # DELETE /api/messages/:id
├── wrangler.toml            # Pages 配置与 KV 绑定
└── package.json
```

## 接入示例

在任意 Node 脚本里发送：

```js
await fetch('https://你的域名.pages.dev/api/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: '备份脚本', message: `数据库备份完成，耗时 ${s}s` }),
});
```
