const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const configuredBaseUrl = trimTrailingSlash(
	import.meta.env.PUBLIC_API_BASE_URL || "",
);

export function getApiBaseUrl() {
	return configuredBaseUrl;
}

export function hasApiBaseUrl() {
	return configuredBaseUrl.length > 0;
}

export function apiUrl(path: string) {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	if (!configuredBaseUrl) {
		return normalizedPath;
	}
	return `${configuredBaseUrl}${normalizedPath}`;
}
