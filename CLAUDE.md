# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal blog and portfolio at [rcosteira79.github.io](https://rcosteira79.github.io), built with Astro v5 and the AstroPaper v5.5.1 theme. Deployed automatically to GitHub Pages via GitHub Actions on every push to `master`.

## Commands

```bash
pnpm install        # Install dependencies
pnpm dev            # Start dev server at http://localhost:4321
pnpm build          # Type-check, build to dist/, and generate pagefind search index
pnpm preview        # Preview the built site locally
pnpm lint           # ESLint (run before pushing; CI enforces this)
pnpm format:check   # Prettier check (run before pushing; CI enforces this)
pnpm format         # Prettier auto-fix
```

Node is managed via nvm. If commands fail, run `source ~/.nvm/nvm.sh` first (or add it to your shell profile).

## Writing Posts

Posts live in `src/data/blog/` as Markdown files. Frontmatter schema (from `src/content.config.ts`):

```markdown
---
author: Ricardo Costeira        # optional, defaults to SITE.author
pubDatetime: 2026-02-26T00:00:00Z  # required, ISO datetime
modDatetime: 2026-02-27T00:00:00Z  # optional, set when editing a published post
title: Post Title               # required
featured: false                 # shows in Featured section on home page
draft: false                    # true = excluded from listings/feeds
tags:
  - android
description: Short description  # required, used in listings and SEO
# Optional:
# ogImage: ./cover.png          # custom OG image (relative path or URL)
# canonicalURL: https://...     # if republished from elsewhere
# socialPost: "Custom share message. Supports {title}, {description}, {url}."
# timezone: Europe/Lisbon       # overrides SITE.timezone for pubDatetime display
---

Post body in Markdown...
```

The slug is derived from the filename automatically — do not include a `slug` field.

Files prefixed with `_` (e.g. `_template.md`) are excluded from the blog collection by the glob loader.

**Home page filtering**: the index only shows featured posts and posts published within the last year. Older posts are accessible via `/posts/` and `/archives/`.

## Architecture

- **`src/config.ts`** — site-wide settings: title, author, description, URL, posts per page, social links
- **`src/constants.ts`** — social links array
- **`src/data/blog/`** — blog posts (Markdown)
- **`src/pages/`** — page routes: `index.astro` (blog listing), `about.md` (about/CV), `projects.astro` (hidden, not in nav)
- **`src/layouts/`** — page layout components
- **`src/components/`** — UI components including `Header.astro` (nav is hardcoded here)
- **`.github/workflows/deploy.yml`** — builds and deploys to GitHub Pages on push to master

## Navigation

Nav links are hardcoded in `src/components/Header.astro`. To add a page to the nav, add an `<a>` tag there. The `/projects` page is intentionally not linked.

## Deployment

Pushing to `master` triggers GitHub Actions, which runs `pnpm build` and deploys `dist/` to GitHub Pages. Requires GitHub repo Settings → Pages → Source set to "GitHub Actions".

After deploy, a `share` job automatically posts new articles to Buffer (`BUFFER_API_TOKEN` secret). It triggers when a `.md` file is newly added to `src/data/blog/`, or when an existing post has `draft: true` flipped to `draft: false` (or removed). The share message uses `SITE.socialTemplate` from `src/config.ts` unless the post overrides it with `socialPost` in frontmatter.
