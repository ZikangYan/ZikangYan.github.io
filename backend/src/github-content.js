import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import { parseDocument, stringify } from "yaml";
import { config } from "./config.js";
import { GitHubApiError, HttpError } from "./errors.js";

const DRAFTS_DIR = "src/content/drafts";
const POSTS_DIR = "src/content/posts";
const SAFE_FILE_NAME_RE = /^[a-z0-9\u4e00-\u9fa5._-]+$/i;
const REPO_ROOT = path.resolve(process.cwd(), "..");

function apiUrl(targetPath) {
	return `https://api.github.com/repos/${config.githubRepoOwner}/${config.githubRepoName}/contents/${targetPath}`;
}

async function parseGitHubError(response) {
	let payload;
	try {
		payload = await response.json();
	} catch {
		payload = null;
	}

	const message = payload?.message || response.statusText || "GitHub API request failed.";
	throw new GitHubApiError(response.status, message, {
		details: payload,
	});
}

async function githubFetch(targetPath, init = {}) {
	const url = new URL(apiUrl(targetPath));
	if (!init.method || init.method === "GET") {
		url.searchParams.set("ref", config.githubRepoBranch);
	}

	const response = await fetch(url, {
		...init,
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${config.githubToken}`,
			"X-GitHub-Api-Version": "2022-11-28",
			...(init.headers || {}),
		},
	});

	if (!response.ok) {
		await parseGitHubError(response);
	}

	return response;
}

function decodeContent(content) {
	return Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8");
}

function encodeContent(content) {
	return Buffer.from(content, "utf8").toString("base64");
}

function slugify(input) {
	return input
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");
}

function splitFrontmatter(markdown) {
	const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) {
		return { frontmatter: "", body: markdown.trim() };
	}

	return {
		frontmatter: match[1],
		body: match[2].trim(),
	};
}

function parseFrontmatter(markdown) {
	const { frontmatter } = splitFrontmatter(markdown);
	const defaults = {
		title: "",
		published: new Date().toISOString().slice(0, 10),
		updated: undefined,
		draft: true,
		description: "",
		image: "",
		tags: [],
		category: "",
		lang: "",
	};

	if (!frontmatter) {
		return defaults;
	}

	const document = parseDocument(frontmatter);
	if (document.errors.length > 0) {
		throw new HttpError(400, "Invalid YAML frontmatter.", {
			code: "invalid_frontmatter",
			details: document.errors.map((error) => error.message),
		});
	}

	const data = document.toJS() || {};
	return {
		title: typeof data.title === "string" ? data.title : defaults.title,
		published: data.published ? String(data.published) : defaults.published,
		updated: data.updated ? String(data.updated) : undefined,
		draft: typeof data.draft === "boolean" ? data.draft : defaults.draft,
		description: typeof data.description === "string" ? data.description : defaults.description,
		image: typeof data.image === "string" ? data.image : defaults.image,
		tags: Array.isArray(data.tags) ? data.tags.map((item) => String(item)) : defaults.tags,
		category: typeof data.category === "string" ? data.category : defaults.category,
		lang: typeof data.lang === "string" ? data.lang : defaults.lang,
	};
}

function buildFrontmatter(data) {
	const payload = {
		title: data.title,
		published: data.published,
		...(data.updated ? { updated: data.updated } : {}),
		draft: data.draft,
		description: data.description,
		image: data.image,
		tags: data.tags,
		category: data.category,
		lang: data.lang,
	};

	return `---\n${stringify(payload).trimEnd()}\n---\n\n`;
}

function normalizeMarkdown(markdown) {
	const parsed = parseFrontmatter(markdown);
	const { body } = splitFrontmatter(markdown);
	return `${buildFrontmatter({
		...parsed,
		title: parsed.title || "Untitled Draft",
		draft: true,
	})}${body}\n`;
}

function sanitizeFileName(originalName, fallbackTitle) {
	if (typeof originalName !== "string" || !originalName.trim()) {
		return buildDraftFileName(fallbackTitle);
	}

	const baseName = path.posix.basename(originalName.replace(/\\/g, "/")).trim();
	const normalized = baseName
		.normalize("NFKC")
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9\u4e00-\u9fa5._-]+/gi, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");

	if (!normalized || !normalized.toLowerCase().endsWith(".md")) {
		return buildDraftFileName(fallbackTitle);
	}

	if (!SAFE_FILE_NAME_RE.test(normalized)) {
		throw new HttpError(400, "Invalid draft file name.", { code: "invalid_file_name" });
	}

	return normalized;
}

async function readFile(targetPath) {
	const response = await githubFetch(targetPath);
	const payload = await response.json();
	return {
		sha: payload.sha,
		content: decodeContent(payload.content),
		name: payload.name,
		path: payload.path,
		size: payload.size,
	};
}

async function readLocalFile(targetPath) {
	const absolutePath = path.resolve(REPO_ROOT, targetPath);
	const content = await fs.readFile(absolutePath, "utf8");
	const stat = await fs.stat(absolutePath);
	return {
		sha: "",
		content,
		name: path.basename(targetPath),
		path: targetPath.replace(/\\/g, "/"),
		size: stat.size,
	};
}

async function listLocalMarkdownFiles(targetDir) {
	const absoluteDir = path.resolve(REPO_ROOT, targetDir);
	const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => ({
			type: "file",
			name: entry.name,
			path: `${targetDir}/${entry.name}`.replace(/\\/g, "/"),
		}));
}

async function writeFile(targetPath, content, message, sha) {
	try {
		await githubFetch(targetPath, {
			method: "PUT",
			body: JSON.stringify({
				message,
				content: encodeContent(content),
				branch: config.githubRepoBranch,
				sha,
			}),
		});
	} catch (error) {
		if (error instanceof GitHubApiError && error.status === 409) {
			throw new HttpError(409, "GitHub content conflict.", {
				code: "github_conflict",
				details: error.details,
			});
		}

		if (error instanceof GitHubApiError && error.status === 422) {
			throw new HttpError(409, "A file with the target name already exists.", {
				code: "file_exists",
				details: error.details,
			});
		}

		throw error;
	}
}

async function removeFile(targetPath, sha, message) {
	await githubFetch(targetPath, {
		method: "DELETE",
		body: JSON.stringify({
			message,
			sha,
			branch: config.githubRepoBranch,
		}),
	});
}

function buildDraftFileName(title) {
	const date = new Date().toISOString().slice(0, 10);
	const slug = slugify(title || `draft-${Date.now()}`) || `draft-${Date.now()}`;
	return `${date}-${slug}.md`;
}

function toDraftSummary(file, meta, body) {
	return {
		name: file.name,
		path: file.path,
		sha: file.sha,
		size: file.size,
		title: meta.title || file.name,
		description: meta.description,
		published: meta.published,
		updated: meta.updated,
		tags: meta.tags,
		category: meta.category,
		lang: meta.lang,
		body,
	};
}

function toPostSummary(file, meta, body) {
	return {
		name: file.name,
		path: file.path,
		sha: file.sha,
		size: file.size,
		title: meta.title || file.name,
		description: meta.description,
		published: meta.published,
		updated: meta.updated,
		tags: meta.tags,
		category: meta.category,
		lang: meta.lang,
		excerpt: body.replace(/\s+/g, " ").trim().slice(0, 180),
	};
}

export async function listDrafts() {
	try {
		const files = await listLocalMarkdownFiles(DRAFTS_DIR);
		const drafts = await Promise.all(
			files.map(async (entry) => {
				const file = await readLocalFile(entry.path);
				const meta = parseFrontmatter(file.content);
				const { body } = splitFrontmatter(file.content);
				return toDraftSummary(file, meta, body);
			}),
		);
		return drafts.sort((a, b) => b.name.localeCompare(a.name));
	} catch (error) {
		if (error instanceof Error && error.code === "ENOENT") {
			return [];
		}
	}

	try {
		const response = await githubFetch(DRAFTS_DIR);
		const files = await response.json();
		const drafts = await Promise.all(
			files
				.filter((entry) => entry.type === "file" && entry.name.endsWith(".md"))
				.map(async (entry) => {
					const file = await readFile(entry.path);
					const meta = parseFrontmatter(file.content);
					const { body } = splitFrontmatter(file.content);
					return toDraftSummary(file, meta, body);
				}),
		);
		return drafts.sort((a, b) => b.name.localeCompare(a.name));
	} catch (error) {
		if (error instanceof GitHubApiError && error.status === 404) {
			return [];
		}
		throw error;
	}
}

export async function listPosts() {
	try {
		const files = await listLocalMarkdownFiles(POSTS_DIR);
		const posts = await Promise.all(
			files.map(async (entry) => {
				const file = await readLocalFile(entry.path);
				const meta = parseFrontmatter(file.content);
				const { body } = splitFrontmatter(file.content);
				return toPostSummary(file, meta, body);
			}),
		);
		return posts.sort((a, b) => (b.published || "").localeCompare(a.published || "") || b.name.localeCompare(a.name));
	} catch (error) {
		if (!(error instanceof Error) || error.code !== "ENOENT") {
			// Fall back to GitHub only when local files are unavailable.
		}
	}

	try {
		const response = await githubFetch(POSTS_DIR);
		const files = await response.json();
		const posts = await Promise.all(
			files
				.filter((entry) => entry.type === "file" && entry.name.endsWith(".md"))
				.map(async (entry) => {
					const file = await readFile(entry.path);
					const meta = parseFrontmatter(file.content);
					const { body } = splitFrontmatter(file.content);
					return toPostSummary(file, meta, body);
				}),
		);
		return posts.sort((a, b) => (b.published || "").localeCompare(a.published || "") || b.name.localeCompare(a.name));
	} catch (error) {
		if (error instanceof GitHubApiError && error.status === 404) {
			return [];
		}
		throw error;
	}
}

export async function createDraft(markdown, originalName) {
	const normalized = normalizeMarkdown(markdown);
	const meta = parseFrontmatter(normalized);
	const fileName = sanitizeFileName(originalName, meta.title);
	const targetPath = `${DRAFTS_DIR}/${fileName}`;
	await writeFile(targetPath, normalized, `chore: create draft ${fileName}`);
	return readDraft(targetPath);
}

export async function readDraft(targetPath) {
	const file = await readFile(targetPath);
	const meta = parseFrontmatter(file.content);
	const { body } = splitFrontmatter(file.content);
	return toDraftSummary(file, meta, body);
}

export async function publishDraft(targetPath) {
	const draft = await readFile(targetPath);
	const meta = parseFrontmatter(draft.content);
	const { body } = splitFrontmatter(draft.content);
	const postFileName = `${slugify(meta.title || draft.name.replace(/\.md$/, "")) || `post-${Date.now()}`}.md`;
	const postPath = `${POSTS_DIR}/${postFileName}`;
	const postContent = `${buildFrontmatter({
		...meta,
		title: meta.title || "Untitled Post",
		draft: false,
	})}${body}\n`;

	try {
		await writeFile(postPath, postContent, `feat: publish post ${postFileName}`);
	} catch (error) {
		if (error instanceof HttpError && error.status === 409) {
			throw new HttpError(409, "Publishing failed because the target post file already exists.", {
				code: "publish_conflict",
				details: { postPath },
			});
		}
		throw error;
	}

	await removeFile(targetPath, draft.sha, `chore: remove published draft ${draft.name}`);
	return { postPath, postFileName };
}

export async function deleteDraft(targetPath, sha) {
	const fileSha = sha || (await readFile(targetPath)).sha;
	await removeFile(targetPath, fileSha, `chore: delete draft ${targetPath.split("/").pop()}`);
}
