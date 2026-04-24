# GitHub Pages + 独立后端实现记录

## 目标

将当前 Astro 博客调整为以下部署方式：

- 前端继续部署到 GitHub Pages
- 后端单独部署到 Render 或同类平台
- 前端通过 `fetch` 访问后端接口
- 管理后台登录、草稿上传、发布操作全部迁移到外部后端

## 这次改动做了什么

### 1. 前端从服务端模式改为静态模式

修改文件：

- `astro.config.mjs`

调整点：

- `output` 从 `server` 改成 `static`
- 移除 `@astrojs/vercel/serverless` adapter
- 站点目标改为适合 GitHub Pages 的静态部署

原因：

GitHub Pages 不能运行 Astro 的服务端路由，必须输出静态文件。

### 2. 删除了仓库内置的 Astro API 路由

删除：

- `src/pages/api/admin/login.ts`
- `src/pages/api/admin/logout.ts`
- `src/pages/api/admin/session.ts`
- `src/pages/api/admin/drafts.ts`
- `src/pages/api/admin/publish.ts`

原因：

这些路由在 GitHub Pages 上不会作为真实后端存在，继续保留只会误导后续维护。

### 3. 删除了仅服务端可用的鉴权与 GitHub 内容操作工具

删除：

- `src/utils/admin-auth.ts`
- `src/utils/github-content.ts`

原因：

这些能力已经迁移到独立后端。

### 4. 新增统一前端 API 基址配置

新增：

- `src/utils/api-client.ts`

用途：

- 统一管理 `PUBLIC_API_BASE_URL`
- 生成外部后端地址
- 在未配置后端地址时，前端明确禁用管理功能

### 5. 改造前端管理页面

修改：

- `src/components/Navbar.astro`
- `src/pages/login.astro`
- `src/pages/edit.astro`

调整点：

- 原先请求 `/api/admin/*`
- 现在改为请求 `${PUBLIC_API_BASE_URL}/api/admin/*`
- 登录态检查改成纯前端完成
- 在没有配置 `PUBLIC_API_BASE_URL` 时，前端提示管理功能不可用

## 新增后端示例项目

位置：

- `backend/`

目录：

```text
backend/
  .env.example
  package.json
  src/
    auth.js
    config.js
    github-content.js
    index.js
```

### 后端职责

- 提供健康检查接口：`GET /api/health`
- 提供登录接口：`POST /api/admin/login`
- 提供退出接口：`POST /api/admin/logout`
- 提供登录态接口：`GET /api/admin/session`
- 提供草稿列表接口：`GET /api/admin/drafts`
- 提供草稿保存接口：`POST /api/admin/drafts`
- 提供草稿删除接口：`DELETE /api/admin/drafts`
- 提供发布接口：`POST /api/admin/publish`

### 后端依赖

- `express`
- `cors`
- `cookie-parser`
- `dotenv`

### 鉴权方式

使用 HTTP-only Cookie：

- Cookie 名：`admin_session`
- 跨域场景启用：
  - `httpOnly: true`
  - `sameSite: "none"`
  - `secure: true`

这意味着生产环境必须走 HTTPS。

## 环境变量

### 前端

根目录 `.env` 示例：

```env
PUBLIC_API_BASE_URL=https://your-backend.onrender.com
```

用途：

- 告诉前端外部后端在哪里

### 后端

`backend/.env` 示例：

```env
PORT=3000
CORS_ORIGIN=https://yourname.github.io
ADMIN_USERNAME=your-admin-username
ADMIN_PASSWORD=your-admin-password
ADMIN_SESSION_SECRET=replace-with-a-long-random-secret
GITHUB_TOKEN=github_pat_xxx
GITHUB_REPO_OWNER=ZikangYan
GITHUB_REPO_NAME=ZikangYan.github.io
GITHUB_REPO_BRANCH=main
```

用途：

- `CORS_ORIGIN`：只允许你的 GitHub Pages 前端访问
- `ADMIN_*`：后台登录
- `GITHUB_*`：让后端通过 GitHub API 读写仓库中的草稿和文章

## 本地开发步骤

### 1. 启动后端

在 `backend/`：

```bash
npm install
cp .env.example .env
npm run dev
```

Windows PowerShell 可手动复制 `.env.example` 为 `.env`。

### 2. 配置前端

根目录创建 `.env`：

```env
PUBLIC_API_BASE_URL=http://localhost:3000
```

### 3. 启动前端

项目根目录：

```bash
pnpm dev
```

### 4. 联调检查

先验证：

- `http://localhost:3000/api/health`
- `http://localhost:4321/login/`
- 登录后能否进入 `/edit/`
- 是否能拉取草稿
- 是否能保存草稿
- 是否能发布草稿

## Render 部署步骤

### 1. 准备后端仓库

建议把 `backend/` 单独拆成一个仓库，或者让 Render 指向包含 `backend/` 的仓库并设置 Root Directory 为 `backend`

### 2. 在 Render 创建 Web Service

设置：

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`

### 3. 在 Render 配环境变量

填入：

- `PORT`
- `CORS_ORIGIN`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `GITHUB_TOKEN`
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `GITHUB_REPO_BRANCH`

### 4. 首次部署后验证

打开：

```text
https://your-backend.onrender.com/api/health
```

预期返回：

```json
{
  "ok": true,
  "service": "zikangyan-blog-backend"
}
```

## GitHub Pages 部署步骤

### 1. 配置前端环境变量

确保构建时能拿到：

```env
PUBLIC_API_BASE_URL=https://your-backend.onrender.com
```

### 2. 构建静态站点

```bash
pnpm build
```

### 3. 部署 `dist/` 到 GitHub Pages

如果你已有 GitHub Actions 流程，只需要确认它发布的是静态构建产物。

## 跨域与 Cookie 说明

因为现在是：

- 前端：`https://yourname.github.io`
- 后端：`https://your-backend.onrender.com`

所以必须满足：

1. 前端请求加 `credentials: "include"`
2. 后端 CORS 必须：
   - `origin` 精确等于前端域名
   - `credentials: true`
3. Session Cookie 必须：
   - `SameSite=None`
   - `Secure=true`

否则浏览器不会带上 Cookie，请求会表现为始终未登录。

## 安全建议

- `ADMIN_PASSWORD` 不要使用弱密码
- `ADMIN_SESSION_SECRET` 使用足够长的随机字符串
- `GITHUB_TOKEN` 只授予必需仓库权限
- `CORS_ORIGIN` 不要写 `*`
- 后续可增加限流和登录失败次数限制

## 当前限制

- 后端示例使用最小实现，没有引入数据库
- 后端通过 GitHub API 直接操作仓库内容，适合轻量博客后台
- 若后续需要评论、用户系统、复杂内容模型，建议再接数据库

## 建议的后续动作

1. 在本地先跑通 `backend/`
2. 配置根目录 `PUBLIC_API_BASE_URL`
3. 完成前后端联调
4. 将 `backend/` 部署到 Render
5. 再把前端部署到 GitHub Pages
