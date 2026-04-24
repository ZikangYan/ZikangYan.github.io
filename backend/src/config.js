import dotenv from "dotenv";

dotenv.config();

function required(name) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

export const config = {
	port: Number(process.env.PORT || 3000),
	corsOrigin: required("CORS_ORIGIN"),
	adminUsername: required("ADMIN_USERNAME"),
	adminPassword: required("ADMIN_PASSWORD"),
	adminSessionSecret: required("ADMIN_SESSION_SECRET"),
	adminSessionTtlMs: Number(process.env.ADMIN_SESSION_TTL_MS || 1000 * 60 * 60 * 8),
	githubToken: required("GITHUB_TOKEN"),
	githubRepoOwner: required("GITHUB_REPO_OWNER"),
	githubRepoName: required("GITHUB_REPO_NAME"),
	githubRepoBranch: process.env.GITHUB_REPO_BRANCH || "main",
};
