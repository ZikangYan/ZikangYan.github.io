export class HttpError extends Error {
	constructor(status, message, options = {}) {
		super(message);
		this.name = "HttpError";
		this.status = status;
		this.code = options.code;
		this.details = options.details;
	}
}

export class GitHubApiError extends HttpError {
	constructor(status, message, options = {}) {
		super(status, message, { ...options, code: options.code || "github_api_error" });
		this.name = "GitHubApiError";
	}
}
