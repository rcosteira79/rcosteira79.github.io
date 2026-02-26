# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal blog and portfolio at [rcosteira79.github.io](https://rcosteira79.github.io), built with Astro v5 and the AstroPaper v5.5.1 theme. Deployed automatically to GitHub Pages via GitHub Actions on every push to `master`.

## Commands

```bash
pnpm install       # Install dependencies
pnpm dev           # Start dev server at http://localhost:4321
pnpm build         # Build static site to dist/
pnpm preview       # Preview the built site locally
```

Note: The system may have an old Node.js v12 at `/usr/local/bin/node`. Use the Homebrew-managed Node at `/usr/local/Cellar/node/25.6.1_1/bin/node` if commands fail due to Node version issues.

## Writing Posts

Posts live in `src/data/blog/` as Markdown files. Frontmatter schema (from `src/content.config.ts`):

```markdown
---
author: Ricardo Costeira        # optional, defaults to SITE.author
pubDatetime: 2026-02-26T00:00:00Z  # required, ISO datetime
modDatetime: 2026-02-27T00:00:00Z  # optional, last modified
title: Post Title               # required
featured: false                 # shows on homepage featured section
draft: false                    # true = excluded from listings/feeds
tags:
  - android
description: Short description  # required, used in listings and SEO
---

Post body in Markdown...
```

The slug is derived from the filename automatically — do not include a `slug` field.

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
