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
- **管理员**：网页上登录（`ADMIN_PASSWORD`）后可删除单条留言、一键清空、管理多把 webhook 密钥（添加/删除即时生效，可吊销某个调用方）
- **安全**：内容 HTML 转义防 XSS、可选密钥校验、每 IP 每分钟 10 条限流（登录另有独立限流）、内容长度截断
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

仓库不含 `wrangler.toml`（个人配置，已加入 `.gitignore`）。要用命令行部署，先在本地创建它：

```toml
name = "cf-message-broad"
compatibility_date = "2024-09-01"
pages_build_output_dir = "public"

[[kv_namespaces]]
binding = "MESSAGES_KV"
id = "你的_KV_namespace_ID"
```

然后：

```bash
npm install
npx wrangler login
npx wrangler kv namespace create MESSAGES_KV   # 用输出的 id 替换上面占位
npm run deploy
```

## 可选配置（Pages 项目 Settings → Environment variables）

| 变量 | 说明 |
|------|------|
| `ADMIN_PASSWORD` | 管理员密码。设置后网页右上角出现登录入口，登录后可删除留言、清空全部、管理 webhook 密钥。**要启用管理功能必须配置它**。登录状态在浏览器本机保留 7 天（跨标签页共享）：盾牌按钮只切换管理面板的显示/隐藏，不影响登录态；点面板里的"退出登录"或 7 天到期后才会要求重新输入密码 |
| `PRIVATE_FLAG` | 私密模式开关。设为 `true`（或 `True`/`1`，大小写不限）后，**查看留言必须先输入管理员密码**：未登录时任何页面地址都只显示解锁界面，留言数据接口 `GET /api/messages` 也强制验证管理员密码，无法绕过。**必须同时配置 `ADMIN_PASSWORD`，否则包括你自己在内所有人都无法查看**。webhook 发送不受影响 |
| `WEBHOOK_SECRET` | 默认 webhook 密钥（可选，与密钥管理面板中的密钥等效）。配置了任意密钥后，发送留言必须携带：`?secret=xxx`、请求头 `X-Webhook-Secret` 或 `Authorization: Bearer xxx`；一个都没配置则开放发送 |

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

# 纯文本（text/plain、application/text 或无 Content-Type 均可），请求体即正文
curl -X POST https://你的域名.pages.dev/api/messages -H "Content-Type: text/plain" -d "来自脚本的一句话"

# 带 source 标记来源（网页上显示为小标签）
curl -X POST https://你的域名.pages.dev/api/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "部署完成", "source": "GitHub Actions"}'
```

**署名规则**（调用方未显式提供 `name` 时自动决定）：

1. 调用方在请求体里提供了 `name` → 使用它
2. 用的是管理面板里的密钥且填了备注名 → 显示备注名
3. 密钥没有备注名（或用的是 `WEBHOOK_SECRET`）→ 直接显示密钥值
4. 服务端未配置任何密钥（开放模式）→ 显示"匿名"

### 获取留言

```bash
curl "https://你的域名.pages.dev/api/messages?limit=50"   # 最新在前，limit 最大 200
```

若开启了 `PRIVATE_FLAG` 私密模式，获取留言需要管理员密码：

```bash
curl "https://你的域名.pages.dev/api/messages?limit=50" -H "X-Admin-Secret: 管理员密码"
```

### 删除留言（管理员）

登录管理员后可在网页上直接删除，也可以用 API。密码通过 `X-Admin-Secret` 头携带：

```bash
# 删除单条
curl -X DELETE "https://你的域名.pages.dev/api/messages/<id>" -H "X-Admin-Secret: 管理员密码"

# 清空全部
curl -X DELETE "https://你的域名.pages.dev/api/messages" -H "X-Admin-Secret: 管理员密码"
```

### Webhook 密钥管理（管理员）

网页管理面板中可视化操作，等价 API：

```bash
# 列出密钥
curl "https://你的域名.pages.dev/api/admin/secrets" -H "X-Admin-Secret: 管理员密码"

# 添加密钥（secret 留空则自动生成 wh_ 开头的随机值）
curl -X POST "https://你的域名.pages.dev/api/admin/secrets" \
  -H "Content-Type: application/json" -H "X-Admin-Secret: 管理员密码" \
  -d '{"name": "CI 机器人"}'

# 删除密钥（立即吊销）
curl -X DELETE "https://你的域名.pages.dev/api/admin/secrets/<id>" -H "X-Admin-Secret: 管理员密码"
```

## 本地开发

仓库不含 `wrangler.toml`，本地跑之前先按「方式二」的模板创建一份（本地开发会模拟 KV 存储，`id` 随便填也能跑）。然后：

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
│       ├── _lib.js          # 共享辅助（管理员验证 / 密钥管理 / 限流），不生成路由
│       ├── messages.js      # GET 列表 / POST 发送 / DELETE 清空 /api/messages
│       ├── messages/[id].js # DELETE /api/messages/:id 删除单条
│       └── admin/
│           ├── login.js     # POST /api/admin/login 验证管理员密码
│           └── secrets.js   # GET/POST /api/admin/secrets
│               └── [id].js  # DELETE /api/admin/secrets/:id
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
