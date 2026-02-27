# Social Sharing Design

Date: 2026-02-27

## Context

The blog is built with Astro v5 and deployed via GitHub Actions to GitHub Pages. Posts are Markdown files in `src/data/blog/` with `draft: false` to publish. The owner wants social posts to fire automatically on Twitter/X, Mastodon, and Bluesky when a new article is published — using Buffer as the single integration point to avoid managing three separate platform APIs.

## Goals

- Automatically share new posts to all Buffer-connected profiles (Twitter/X, Mastodon, Bluesky) immediately after deploy
- Use a global message template as the default
- Allow per-post message override via `socialPost` frontmatter field
- Minimal maintenance surface: one API token, one script

## Trigger

A new step added to the existing `deploy.yml`, in the `deploy` job after the Pages deployment succeeds. It runs a Node script that detects new posts and calls the Buffer API.

## Detection

Compare `HEAD~1` to `HEAD` using git diff, filtered to files Added (not modified) in `src/data/blog/`. Parse frontmatter of each added file — if `draft` is not `true`, treat it as a newly published post.

This correctly handles the normal authoring workflow: write post → set `draft: false` → push → deploy → share.

Edge cases:
- Multiple posts added in a single push: all are shared
- Modified posts: ignored (not new additions)
- Posts added with `draft: true`: ignored

## Message

**Default template** — defined in `src/config.ts` as `socialTemplate`:

```
New post: {title}

{description}

{url}
```

Supported variables: `{title}`, `{description}`, `{url}`

**Per-post override** — add `socialPost` to a post's frontmatter:

```markdown
---
title: My Post
socialPost: "Just published something I'm excited about — {url}"
---
```

The script uses `socialPost` if present, otherwise falls back to `socialTemplate` from config. Template variables work in both.

## Components

### `scripts/share-post.mjs`

Node.js script (ESM) that:
1. Reads the list of newly added `.md` files from stdin or a CLI argument (passed from the Actions step via `git diff`)
2. Parses frontmatter of each file using a lightweight parser
3. Builds the message (custom or template)
4. Constructs the post URL from `SITE.website` + the filename slug
5. Calls Buffer API with the message, targeting all connected profiles

### `src/config.ts`

Add a `socialTemplate` field to the `SITE` config object:

```typescript
socialTemplate: "New post: {title}\n\n{description}\n\n{url}",
```

### `.github/workflows/deploy.yml`

Add a step to the `deploy` job after the Pages deployment step:

```yaml
- name: Share new posts to Buffer
  if: success()
  env:
    BUFFER_API_TOKEN: ${{ secrets.BUFFER_API_TOKEN }}
    SITE_URL: https://ricardocosteira.github.io
  run: |
    NEW_POSTS=$(git diff HEAD~1 HEAD --name-only --diff-filter=A -- src/data/blog/)
    if [ -n "$NEW_POSTS" ]; then
      node scripts/share-post.mjs $NEW_POSTS
    fi
```

### GitHub Secret

`BUFFER_API_TOKEN` — stored in repo Settings → Secrets and variables → Actions.

## Buffer API

Buffer's public API is in beta as of early 2026. The script will need to be written against the current beta docs at the time of implementation. The expected shape is a POST request to create a new update/post, with:
- `text`: the message
- `profile_ids[]`: all connected profile IDs (fetched once via a `/profiles` endpoint)
- Authorization via Bearer token

The logic is stable regardless of exact endpoint — only the HTTP call details depend on the beta API version.

## Out of Scope

- Scheduling posts for a future time (post immediately after deploy)
- Per-platform different messages (same message to all platforms)
- Editing or deleting social posts after publishing
