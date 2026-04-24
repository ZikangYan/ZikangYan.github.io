import crypto from "node:crypto";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

export const SESSION_COOKIE = "admin_session";
const sessionStore = new Map();

function sha256(value) {
	return crypto.createHash("sha256").update(value).digest("hex");
}

function randomToken() {
	return crypto.randomBytes(32).toString("base64url");
}

function now() {
	return Date.now();
}

function pruneExpiredSessions() {
	const currentTime = now();
	for (const [key, session] of sessionStore.entries()) {
		if (session.expiresAt <= currentTime) {
			sessionStore.delete(key);
		}
	}
}

export function isValidAdminCredentials(username, password) {
	return username === config.adminUsername && password === config.adminPassword;
}

function hashSessionToken(token) {
	return sha256(`${token}:${config.adminSessionSecret}`);
}

export function createSession(username) {
	pruneExpiredSessions();
	const token = randomToken();
	const tokenHash = hashSessionToken(token);
	sessionStore.set(tokenHash, {
		username,
		expiresAt: now() + config.adminSessionTtlMs,
	});
	return token;
}

export function invalidateSession(token) {
	if (!token) {
		return;
	}
	sessionStore.delete(hashSessionToken(token));
}

export function getAuthenticatedSession(req) {
	pruneExpiredSessions();
	const token = req.cookies?.[SESSION_COOKIE];
	if (!token) {
		return null;
	}

	const session = sessionStore.get(hashSessionToken(token));
	if (!session) {
		return null;
	}

	if (session.expiresAt <= now()) {
		sessionStore.delete(hashSessionToken(token));
		return null;
	}

	return session;
}

export function isAuthenticated(req) {
	return Boolean(getAuthenticatedSession(req));
}

export function setSessionCookie(res, value) {
	res.cookie(SESSION_COOKIE, value, {
		path: "/",
		httpOnly: true,
		sameSite: "none",
		secure: true,
		maxAge: config.adminSessionTtlMs,
	});
}

export function clearSessionCookie(res) {
	res.clearCookie(SESSION_COOKIE, {
		path: "/",
		httpOnly: true,
		sameSite: "none",
		secure: true,
	});
}

export function requireAdmin(req, res, next) {
	const session = getAuthenticatedSession(req);
	if (!session) {
		next(new HttpError(401, "Unauthorized", { code: "unauthorized" }));
		return;
	}
	req.adminSession = session;
	next();
}
