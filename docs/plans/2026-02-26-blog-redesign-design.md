# Blog Redesign Design

Date: 2026-02-26

## Context

The current site (rcosteira79.github.io) is a GitHub Pages blog built on a Jekyll + Ghost Casper theme. It is a production output repository — the source lives in a separate `jasper2` repo. The setup is old, fragile, and the owner wants to start fresh with a modern stack.

The domain will likely change from `.com` to `.dev`.

## Goals

- Personal blog as primary purpose (technical articles)
- CV / about page
- Project showcase linking to GitHub (initially hidden)
- Minimal, professional visual design
- Markdown-based authoring workflow
- Keep hosting on GitHub Pages (free, simple, no new accounts)

## Tech Stack

- **Framework:** Astro
- **Theme:** AstroPaper — minimal, clean typography, dark/light mode, blog-first with tags and built-in search. Actively maintained.
- **Hosting:** GitHub Pages
- **Content:** Markdown files with frontmatter

## Site Structure

| Route | Description | Nav |
|---|---|---|
| `/` | Blog post listing | Yes |
| `/posts/[slug]` | Individual blog post | No (linked from listing) |
| `/about` | CV page (experience, skills, links) | Yes |
| `/projects` | Project showcase with GitHub links | **Hidden initially** |
| `/tags/[tag]` | Posts grouped by tag | No (linked from posts) |

`/projects` exists and is accessible via direct URL but is not linked in the navigation until ready.

## Content Workflow

1. Write a `.md` file in `src/content/blog/`
2. Set frontmatter: `title`, `pubDate`, `tags`, `draft` (optional)
3. Push to `master`
4. GitHub Actions builds the site and deploys to GitHub Pages automatically

**Drafts:** Set `draft: true` in frontmatter to exclude a post from listings and feeds without deleting it.

## Deployment Pipeline

- GitHub Actions workflow triggers on push to `master`
- Runs `npm run build` (Astro build)
- Deploys the `dist/` output folder to GitHub Pages using the official Astro GitHub Pages action
- CNAME file handled automatically by the action (for custom `.dev` domain)

## Out of Scope

- Scheduled publishing (draft flag is sufficient)
- Comments system
- Analytics (can be added later)
- CMS / admin interface
