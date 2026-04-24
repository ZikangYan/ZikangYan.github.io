# ZikangYan Blog Backend

`backend/` 是博客前端的独立管理后端，负责：

- 管理员登录态
- 草稿创建、删除、发布
- 读取 GitHub 仓库中的文章与草稿
- 为 `/login/`、`/edit/`、`/check-in/` 提供 API

这个服务适合单独拆成一个新仓库，部署到 `Render` 或 `Railway`。当前实现是常驻 Node.js 服务，不适合直接按现在的形态部署到 Vercel。

## 本地运行

```bash
npm install
cp .env.example .env
npm run dev
```

默认端口是 `3000`。

## 环境变量

参考 [.env.example](./.env.example)：

- `PORT`: 服务端口，平台通常会自动注入
- `CORS_ORIGIN`: 允许访问后台 API 的前端站点，例如 `https://zikangyan.github.io`
- `ADMIN_USERNAME`: 后台登录用户名
- `ADMIN_PASSWORD`: 后台登录密码
- `ADMIN_SESSION_SECRET`: 会话签名密钥，至少 32 位随机字符串
- `ADMIN_SESSION_TTL_MS`: 登录会话有效期，默认 8 小时
- `GITHUB_TOKEN`: 具有仓库内容读写权限的 GitHub PAT
- `GITHUB_REPO_OWNER`: 前端仓库 owner
- `GITHUB_REPO_NAME`: 前端仓库名
- `GITHUB_REPO_BRANCH`: 内容写入分支，默认 `main`

## 部署建议

### Render

- New Web Service
- Root Directory: 仓库根目录
- Build Command: `npm install`
- Start Command: `npm start`

仓库里已附带 [render.yaml](./render.yaml)，可直接用 Blueprint 导入。

### Railway

- New Project -> Deploy from GitHub Repo
- Start Command: `npm start`

仓库里已附带 [railway.json](./railway.json)。

### Vercel

当前代码使用了内存会话存储：

- 多实例/冷启动下会丢登录态
- 不适合无状态函数环境

如果一定要上 Vercel，需要至少做两件事：

1. 把会话存储迁移到 Redis / Upstash / 数据库
2. 把 Express 入口改成 serverless 适配层

所以当前版本优先推荐 `Render` 或 `Railway`。

## 拆仓建议

建议创建一个新仓库，例如 `zikangyan-blog-backend`，然后把下面这些文件拷进去：

- `package.json`
- `.gitignore`
- `.env.example`
- `README.md`
- `render.yaml`
- `railway.json`
- `src/`

推送后，在部署平台中配置环境变量即可。
