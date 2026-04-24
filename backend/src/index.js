import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import { clearSessionCookie, createSession, invalidateSession, isAuthenticated, isValidAdminCredentials, requireAdmin, setSessionCookie } from "./auth.js";
import { config } from "./config.js";
import { requireTrustedOrigin } from "./csrf.js";
import { HttpError } from "./errors.js";
import { createDraft, deleteDraft, listDrafts, listPosts, publishDraft } from "./github-content.js";

const app = express();

app.use(
	cors({
		origin: config.corsOrigin,
		credentials: true,
	}),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

function escapeHtml(value) {
	return String(value ?? "").replace(/[&<>"]/g, (char) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
	}[char]));
}

function renderTagList(tags) {
	if (!tags?.length) {
		return '<span class="muted">无</span>';
	}

	return tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
}

function renderPostRows(posts) {
	if (!posts.length) {
		return '<tr><td colspan="7" class="empty">当前没有文章内容。</td></tr>';
	}

	return posts
		.map(
			(post) => `<tr>
				<td>${escapeHtml(post.published || "-")}</td>
				<td><strong>${escapeHtml(post.title)}</strong><div class="sub">${escapeHtml(post.description || post.excerpt || "")}</div></td>
				<td>${renderTagList(post.tags)}</td>
				<td>${escapeHtml(post.category || "-")}</td>
				<td>${escapeHtml(post.lang || "-")}</td>
				<td>${escapeHtml(post.name)}</td>
				<td><code>${escapeHtml(post.path)}</code></td>
			</tr>`,
		)
		.join("");
}

function renderGitHubStatus(errorMessage) {
	if (!errorMessage) {
		return "";
	}

	return `<section class="card" style="margin-bottom:16px;">
      <h2>GitHub 连接状态</h2>
      <div class="muted">当前无法从 GitHub 读取博客内容，后端首页仍然可用，但文章表格和草稿统计会受影响。</div>
      <div style="margin-top:12px;padding:14px 16px;border-radius:16px;background:rgba(239,68,68,0.12);color:#b91c1c;font-weight:600;">
        ${escapeHtml(errorMessage)}
      </div>
    </section>`;
}

function renderHomePage({ authenticated, drafts, posts, githubError }) {
	return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ZikangYan Backend Admin</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f6f7fb;
      --card: rgba(255, 255, 255, 0.88);
      --text: #111827;
      --muted: #6b7280;
      --primary: #0f766e;
      --border: rgba(15, 23, 42, 0.08);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0b1220;
        --card: rgba(15, 23, 42, 0.88);
        --text: #f8fafc;
        --muted: #94a3b8;
        --primary: #2dd4bf;
        --border: rgba(148, 163, 184, 0.14);
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(45, 212, 191, 0.16), transparent 32%),
        radial-gradient(circle at right, rgba(249, 115, 22, 0.14), transparent 24%),
        var(--bg);
    }
    .wrap { max-width: 1280px; margin: 0 auto; padding: 28px 20px 56px; }
    .hero, .card {
      background: var(--card);
      border: 1px solid var(--border);
      backdrop-filter: blur(18px);
      border-radius: 24px;
    }
    .hero { padding: 28px; margin-bottom: 18px; }
    .hero h1 { margin: 8px 0 12px; font-size: 34px; line-height: 1.15; }
    .muted, .sub { color: var(--muted); }
    .stats {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      margin-top: 20px;
    }
    .stat {
      padding: 18px;
      border-radius: 20px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.56);
    }
    @media (prefers-color-scheme: dark) {
      .stat { background: rgba(255,255,255,0.04); }
    }
    .stat .label {
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .stat .value {
      margin-top: 10px;
      font-size: 28px;
      font-weight: 700;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      padding: 8px 14px;
      border-radius: 999px;
      background: ${authenticated ? "rgba(15, 118, 110, 0.14)" : "rgba(107, 114, 128, 0.14)"};
      color: ${authenticated ? "var(--primary)" : "var(--muted)"};
      font-weight: 700;
    }
    .section-grid {
      display: grid;
      gap: 16px;
      grid-template-columns: 0.9fr 1.1fr;
      margin-bottom: 16px;
    }
    @media (max-width: 960px) {
      .section-grid { grid-template-columns: 1fr; }
    }
    .card { padding: 24px; }
    .card h2 { margin: 0 0 14px; font-size: 22px; }
    ul { margin: 0; padding-left: 18px; }
    li + li { margin-top: 10px; }
    a { color: var(--primary); text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
    code {
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(15, 118, 110, 0.12);
      color: var(--primary);
      font-family: Consolas, "SFMono-Regular", monospace;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      padding: 14px 12px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
    }
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 20px;
      background: rgba(255,255,255,0.56);
    }
    @media (prefers-color-scheme: dark) {
      .table-wrap { background: rgba(255,255,255,0.03); }
    }
    .tag {
      display: inline-flex;
      margin: 0 6px 6px 0;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(15, 118, 110, 0.12);
      color: var(--primary);
      font-size: 12px;
      font-weight: 700;
    }
    .sub {
      margin-top: 6px;
      max-width: 420px;
      line-height: 1.5;
    }
    .empty {
      text-align: center;
      color: var(--muted);
      padding: 28px;
    }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <div class="muted">本地后端管理面板</div>
      <h1>ZikangYan Backend Admin</h1>
      <p class="muted">这里直接展示后端当前连接的博客内容和管理入口。你可以在这个页面查看文章总览、草稿数量和前端管理入口。</p>
      <div class="stats">
        <div class="stat">
          <div class="label">服务状态</div>
          <div class="value">运行中</div>
        </div>
        <div class="stat">
          <div class="label">会话状态</div>
          <div class="value"><span class="pill">${authenticated ? "已登录" : "未登录"}</span></div>
        </div>
        <div class="stat">
          <div class="label">文章数量</div>
          <div class="value">${posts.length}</div>
        </div>
        <div class="stat">
          <div class="label">草稿数量</div>
          <div class="value">${drafts.length}</div>
        </div>
      </div>
    </section>

    ${renderGitHubStatus(githubError)}

    <section class="section-grid">
      <section class="card">
        <h2>管理入口</h2>
        <ul>
          <li><a href="${config.corsOrigin}/login/" target="_blank" rel="noopener">登录页</a></li>
          <li><a href="${config.corsOrigin}/edit/" target="_blank" rel="noopener">文章管理</a></li>
          <li><a href="${config.corsOrigin}/check-in/" target="_blank" rel="noopener">打卡管理</a></li>
          <li><a href="/api/health" target="_blank" rel="noopener">健康检查</a></li>
          <li><a href="/api/admin/overview" target="_blank" rel="noopener">后端概览接口</a></li>
        </ul>
      </section>

      <section class="card">
        <h2>当前配置</h2>
        <ul>
          <li>GitHub 仓库：<code>${escapeHtml(config.githubRepoOwner)}/${escapeHtml(config.githubRepoName)}</code></li>
          <li>分支：<code>${escapeHtml(config.githubRepoBranch)}</code></li>
          <li>前端来源：<code>${escapeHtml(config.corsOrigin)}</code></li>
        </ul>
      </section>
    </section>

    <section class="card">
      <h2>博客文章列表</h2>
      <div class="muted" style="margin-bottom: 14px;">表格中展示日期、标题、标签、分类、语言、文件名和仓库路径。</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>名称</th>
              <th>标签</th>
              <th>分类</th>
              <th>语言</th>
              <th>文件名</th>
              <th>路径</th>
            </tr>
          </thead>
          <tbody>
            ${renderPostRows(posts)}
          </tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>`;
}

app.get("/", async (req, res, next) => {
	try {
		const authenticated = isAuthenticated(req);
		let drafts = [];
		let posts = [];
		let githubError = "";

		try {
			[drafts, posts] = await Promise.all([listDrafts(), listPosts()]);
		} catch (error) {
			githubError = error instanceof Error ? error.message : "读取 GitHub 内容失败。";
		}

		res.type("html").send(renderHomePage({ authenticated, drafts, posts, githubError }));
	} catch (error) {
		next(error);
	}
});

app.get("/api/health", (_req, res) => {
	res.json({ ok: true, service: "zikangyan-blog-backend" });
});

app.get("/api/admin/overview", requireAdmin, async (_req, res, next) => {
	try {
		let drafts = [];
		let posts = [];
		let githubError = null;
		try {
			[drafts, posts] = await Promise.all([listDrafts(), listPosts()]);
		} catch (error) {
			githubError = error instanceof Error ? error.message : "读取 GitHub 内容失败。";
		}

		res.json({
			ok: true,
			authenticated: true,
			repo: `${config.githubRepoOwner}/${config.githubRepoName}`,
			branch: config.githubRepoBranch,
			corsOrigin: config.corsOrigin,
			postCount: posts.length,
			draftCount: drafts.length,
			githubError,
			endpoints: {
				health: "/api/health",
				session: "/api/admin/session",
				drafts: "/api/admin/drafts",
				publish: "/api/admin/publish",
			},
		});
	} catch (error) {
		next(error);
	}
});

app.get("/api/admin/session", (req, res) => {
	res.json({ authenticated: isAuthenticated(req) });
});

app.post("/api/admin/login", requireTrustedOrigin, (req, res) => {
	const { username, password } = req.body || {};
	if (typeof username !== "string" || typeof password !== "string" || !isValidAdminCredentials(username.trim(), password)) {
		res.status(401).json({ message: "Invalid username or password." });
		return;
	}

	setSessionCookie(res, createSession(username.trim()));
	res.json({ ok: true });
});

app.post("/api/admin/logout", requireTrustedOrigin, (req, res) => {
	invalidateSession(req.cookies?.admin_session);
	clearSessionCookie(res);
	res.json({ ok: true });
});

app.get("/api/admin/drafts", requireAdmin, async (_req, res, next) => {
	try {
		const drafts = await listDrafts();
		res.json({ drafts });
	} catch (error) {
		next(error);
	}
});

app.post("/api/admin/drafts", requireTrustedOrigin, requireAdmin, async (req, res, next) => {
	try {
		const { markdown, fileName } = req.body || {};
		if (typeof markdown !== "string" || !markdown.trim()) {
			res.status(400).json({ message: "Markdown content is required." });
			return;
		}

		const draft = await createDraft(markdown, typeof fileName === "string" ? fileName : undefined);
		res.json({ draft });
	} catch (error) {
		next(error);
	}
});

app.delete("/api/admin/drafts", requireTrustedOrigin, requireAdmin, async (req, res, next) => {
	try {
		const { path, sha } = req.body || {};
		if (typeof path !== "string" || !path.startsWith("src/content/drafts/")) {
			res.status(400).json({ message: "Invalid draft path." });
			return;
		}

		await deleteDraft(path, typeof sha === "string" ? sha : undefined);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

app.post("/api/admin/publish", requireTrustedOrigin, requireAdmin, async (req, res, next) => {
	try {
		const { path } = req.body || {};
		if (typeof path !== "string" || !path.startsWith("src/content/drafts/")) {
			res.status(400).json({ message: "Invalid draft path." });
			return;
		}

		const published = await publishDraft(path);
		res.json({ published });
	} catch (error) {
		next(error);
	}
});

app.use((error, _req, res, _next) => {
	console.error(error);
	if (error instanceof HttpError) {
		res.status(error.status).json({
			message: error.message,
			code: error.code,
			details: error.details,
		});
		return;
	}

	res.status(500).json({ message: error instanceof Error ? error.message : "Internal server error." });
});

app.listen(config.port, () => {
	console.log(`Backend listening on port ${config.port}`);
});
