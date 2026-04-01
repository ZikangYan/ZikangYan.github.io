# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Fuwari**, a static blog built with [Astro](https://astro.build), using Svelte for interactive components, Tailwind CSS for styling, and Pagefind for search. It is deployed to GitHub Pages / Vercel.

## Commands

Use `pnpm` (required — `npm` and `yarn` are blocked via `.npmrc`).

```sh
pnpm install          # Install dependencies (Node >= 20 required)
pnpm dev              # Start dev server at localhost:4321
pnpm build            # Build production site to ./dist/ and run pagefind indexing
pnpm preview          # Preview production build locally
pnpm check            # Run Astro type checks
pnpm lint             # Lint and auto-fix with Biome
pnpm format           # Format source with Biome
pnpm new-post <name>  # Scaffold a new post in src/content/posts/
```

## Architecture

### Configuration

All blog customization lives in **`src/config.ts`** — site title, language, theme color, banner, navbar links, profile, and license. This is the primary file users edit to personalize the blog. `astro.config.mjs` references `src/config.ts` for `expressiveCodeConfig` (code block theme).

### Content

Blog posts are Markdown/MDX files in **`src/content/posts/`**, validated by the Zod schema in `src/content/config.ts`. Required frontmatter: `title`, `published`. Optional: `updated`, `draft`, `description`, `image`, `tags`, `category`, `lang`.

### Pages

`src/pages/` follows Astro's file-based routing:
- `[...page].astro` — paginated home/post listing
- `posts/` — individual post pages
- `archive.astro`, `about.astro` — static pages
- `rss.xml.ts`, `robots.txt.ts` — generated files

### Layouts

Two layouts in `src/layouts/`:
- `Layout.astro` — base HTML shell (head, meta, fonts, scripts)
- `MainGridLayout.astro` — two-column grid with sidebar, navbar, banner, TOC, and footer; wraps `Layout.astro`

### Components

- `src/components/*.astro` / `*.svelte` — top-level UI: Navbar, Footer, PostCard, PostMeta, PostPage, Search (Svelte), LightDarkSwitch (Svelte), ArchivePanel (Svelte)
- `src/components/widget/` — sidebar widgets (Categories, Tags, TOC, etc.)
- `src/components/control/` — interactive controls (BackToTop, etc.)
- `src/components/misc/` — utilities (ImageWrapper, etc.)

Svelte is used for client-interactive components. Page transitions use Swup (`@swup/astro`).

### Path Aliases

TypeScript path aliases (defined in `tsconfig.json`):
- `@components/*` → `src/components/*`
- `@utils/*` → `src/utils/*`
- `@i18n/*` → `src/i18n/*`
- `@layouts/*` → `src/layouts/*`
- `@assets/*` → `src/assets/*`
- `@constants/*` → `src/constants/*`
- `@/*` → `src/*`

### Plugins

`src/plugins/` contains custom remark/rehype plugins and Expressive Code plugins:
- `remark-reading-time.mjs` — injects reading time into frontmatter
- `remark-excerpt.js` — extracts post excerpt
- `remark-directive-rehype.js` — bridges remark directives to rehype components
- `rehype-component-admonition.mjs` — renders note/tip/important/caution/warning blocks
- `rehype-component-github-card.mjs` — renders GitHub repo cards
- `expressive-code/language-badge.ts` — adds language badge to code blocks
- `expressive-code/custom-copy-button.js` — custom copy button for code blocks

### i18n

`src/i18n/translation.ts` exports `i18n(key)` which returns a string for the current `siteConfig.lang`. Language files are in `src/i18n/languages/`. To add a language, add a file there and register it in `translation.ts`.

### Styling

Tailwind CSS with custom configuration in `tailwind.config.cjs`. PostCSS handles nesting and imports. Global styles are in `src/styles/`. CSS is excluded from Biome linting/formatting.

## Linting & Formatting

Biome (`biome.json`) handles both linting and formatting. Uses tabs for indentation, double quotes for JS strings. Some rules are relaxed for `.svelte`, `.astro`, and `.vue` files (e.g., `useConst`, `noUnusedVariables` are off).
