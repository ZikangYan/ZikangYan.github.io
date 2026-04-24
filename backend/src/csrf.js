import { config } from "./config.js";
import { HttpError } from "./errors.js";

function normalizeOrigin(value) {
	return value.replace(/\/+$/, "");
}

function getRequestOrigin(req) {
	const origin = req.get("origin");
	if (origin) {
		return normalizeOrigin(origin);
	}

	const referer = req.get("referer");
	if (!referer) {
		return null;
	}

	try {
		return normalizeOrigin(new URL(referer).origin);
	} catch {
		return null;
	}
}

export function requireTrustedOrigin(req, _res, next) {
	const requestOrigin = getRequestOrigin(req);
	if (!requestOrigin || requestOrigin !== normalizeOrigin(config.corsOrigin)) {
		next(new HttpError(403, "Untrusted request origin.", { code: "invalid_origin" }));
		return;
	}

	next();
}
