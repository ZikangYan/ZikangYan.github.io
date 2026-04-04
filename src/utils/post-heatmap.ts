import { execSync } from "node:child_process";
import { formatDateToYYYYMMDD } from "./date-utils";

export function getPostHeatmap(months = 3): Record<string, number> {
	const map: Record<string, number> = {};

	try {
		const sinceDate = new Date();
		sinceDate.setHours(0, 0, 0, 0);
		sinceDate.setMonth(sinceDate.getMonth() - months);
		const since = formatDateToYYYYMMDD(sinceDate);

		const output = execSync(
			`git log --since="${since}" --diff-filter=A --name-only --format="DATE:%as" -- "src/content/posts/*.md" "src/content/posts/*.mdx" "src/content/posts/**/*.md" "src/content/posts/**/*.mdx"`,
			{ encoding: "utf-8", cwd: process.cwd() },
		);

		let currentDate = "";
		for (const line of output.split("\n")) {
			const trimmed = line.trim();
			if (trimmed.startsWith("DATE:")) {
				currentDate = trimmed.slice(5);
				continue;
			}

			if (
				trimmed &&
				(trimmed.endsWith(".md") || trimmed.endsWith(".mdx")) &&
				trimmed.includes("src/content/posts/") &&
				currentDate
			) {
				map[currentDate] = (map[currentDate] ?? 0) + 1;
			}
		}
	} catch {
		// Ignore git errors and render empty stats.
	}

	return map;
}
