# Social Sharing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically post to all Buffer-connected profiles (Twitter/X, Mastodon, Bluesky) when a new blog post is published.

**Architecture:** A plain Node.js ESM script (`scripts/share-post.mjs`) runs as a separate `share` job in `deploy.yml` after a successful deploy. It diffs `HEAD~1` vs `HEAD` to find newly added posts in `src/data/blog/`, reads the message template from `src/config.ts`, and calls the Buffer API. No external dependencies — uses only Node built-ins and the Buffer API token stored as a GitHub Actions secret.

**Tech Stack:** Node.js 20 (built-in `fetch`, `fs`, `path`), Buffer public API (beta), GitHub Actions

---

### Task 1: Update config and content schema

**Files:**
- Modify: `src/config.ts`
- Modify: `src/content.config.ts`

**Step 1: Add `socialTemplate` to `src/config.ts`**

Add the field inside the `SITE` object, before the closing `} as const;`. Use a template literal so it supports multi-line messages:

```typescript
  socialTemplate: `New post: {title}

{description}

{url}`,
```

The full file after the edit should end with:
```typescript
  socialTemplate: `New post: {title}

{description}

{url}`,
} as const;
```

Supported variables: `{title}`, `{description}`, `{url}`.

**Step 2: Add `socialPost` to the blog content schema in `src/content.config.ts`**

Add one optional field to the `z.object({...})` schema, after `canonicalURL`:

```typescript
      socialPost: z.string().optional(),
```

**Step 3: Build to verify no TypeScript errors**

```bash
source ~/.nvm/nvm.sh && pnpm build
```

Expected: build completes with 0 errors.

**Step 4: Commit**

```bash
git add src/config.ts src/content.config.ts
git commit -m "feat: add socialTemplate config and socialPost frontmatter field"
```

---

### Task 2: Write the sharing script

**Files:**
- Create: `scripts/share-post.mjs`

**Step 1: Create the `scripts/` directory and the script**

Create `scripts/share-post.mjs` with the following content:

```javascript
#!/usr/bin/env node
// scripts/share-post.mjs
//
// Usage:
//   node scripts/share-post.mjs <file1.md> [file2.md] ...
//   node scripts/share-post.mjs --dry-run <file1.md> ...
//
// Environment variables:
//   BUFFER_API_TOKEN  — required (unless --dry-run)
//   SITE_URL          — defaults to https://rcosteira79.github.io

import { readFileSync } from "node:fs";
import { resolve, basename } from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const BUFFER_API_TOKEN = process.env.BUFFER_API_TOKEN;
const SITE_URL = (process.env.SITE_URL ?? "https://rcosteira79.github.io").replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Frontmatter parser
// Handles simple single-line key: value pairs. Values may contain colons.
// Note: socialPost must be a single-line value (quote it if it contains
// special YAML characters like colons or leading/trailing spaces).
// ---------------------------------------------------------------------------
function parseFrontmatter(fileContent) {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const result = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const raw = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes if present
    result[key] = raw.replace(/^["'`]|["'`]$/g, "");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Reads socialTemplate from src/config.ts
// Expects the value to be a template literal: socialTemplate: `...`
// ---------------------------------------------------------------------------
function readSocialTemplate() {
  const config = readFileSync("src/config.ts", "utf-8");
  const match = config.match(/socialTemplate:\s*`([\s\S]*?)`/);
  if (!match) {
    throw new Error("socialTemplate not found in src/config.ts");
  }
  return match[1];
}

// ---------------------------------------------------------------------------
// Template interpolation — replaces {title}, {description}, {url}
// ---------------------------------------------------------------------------
function interpolate(template, vars) {
  return template
    .replace(/\{title\}/g, vars.title ?? "")
    .replace(/\{description\}/g, vars.description ?? "")
    .replace(/\{url\}/g, vars.url ?? "");
}

// ---------------------------------------------------------------------------
// Buffer API
//
// IMPORTANT: Buffer's public API is in beta. Verify these endpoints against
// the current docs at https://buffer.com/developers before running.
// The expected request shape is based on Buffer's published API design.
// ---------------------------------------------------------------------------
async function fetchBufferProfileIds(token) {
  const res = await fetch("https://api.bufferapp.com/1/profiles.json", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Buffer /profiles failed (${res.status}): ${await res.text()}`);
  }
  const profiles = await res.json();
  return profiles.map(p => p.id);
}

async function postToBuffer(token, profileIds, text) {
  const body = new URLSearchParams({ text, now: "true" });
  profileIds.forEach(id => body.append("profile_ids[]", id));

  const res = await fetch("https://api.bufferapp.com/1/updates/create.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Buffer create post failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const files = process.argv.slice(2).filter(a => !a.startsWith("--"));

  if (files.length === 0) {
    console.log("No new posts to share.");
    return;
  }

  const template = readSocialTemplate();

  let profileIds = [];
  if (!DRY_RUN) {
    if (!BUFFER_API_TOKEN) {
      throw new Error("BUFFER_API_TOKEN environment variable is not set.");
    }
    profileIds = await fetchBufferProfileIds(BUFFER_API_TOKEN);
    console.log(`Sharing to ${profileIds.length} Buffer profile(s).`);
  }

  for (const file of files) {
    const content = readFileSync(resolve(file), "utf-8");
    const fm = parseFrontmatter(content);

    if (fm.draft === "true") {
      console.log(`Skipping draft: ${file}`);
      continue;
    }

    const slug = basename(file, ".md");
    const url = `${SITE_URL}/posts/${slug}/`;
    const messageTemplate = fm.socialPost ?? template;
    const message = interpolate(messageTemplate, {
      title: fm.title,
      description: fm.description,
      url,
    });

    if (DRY_RUN) {
      console.log(`\n[DRY RUN] File: ${file}`);
      console.log(`Message:\n---\n${message}\n---`);
    } else {
      await postToBuffer(BUFFER_API_TOKEN, profileIds, message);
      console.log(`✓ Posted to Buffer: "${fm.title}"`);
    }
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
```

**Step 2: Test the script locally with `--dry-run`**

```bash
source ~/.nvm/nvm.sh && node scripts/share-post.mjs --dry-run src/data/blog/hello-world.md
```

Expected output:
```
[DRY RUN] File: src/data/blog/hello-world.md
Message:
---
New post: Hello, World

The blog is back, rebuilt from scratch.

https://rcosteira79.github.io/posts/hello-world/
---
```

If the message looks wrong, debug `parseFrontmatter` or `readSocialTemplate` before continuing.

**Step 3: Commit**

```bash
git add scripts/share-post.mjs
git commit -m "feat: add share-post script for Buffer social sharing"
```

---

### Task 3: Add share job to deploy.yml

**Files:**
- Modify: `.github/workflows/deploy.yml`

**Step 1: Read the current deploy.yml**

Read `.github/workflows/deploy.yml` to understand the current structure before editing.

**Step 2: Add the `share` job**

Append the following job to the end of the file (after the `deploy` job):

```yaml
  share:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Share new posts to Buffer
        env:
          BUFFER_API_TOKEN: ${{ secrets.BUFFER_API_TOKEN }}
          SITE_URL: https://rcosteira79.github.io
        run: |
          NEW_POSTS=$(git diff HEAD~1 HEAD --name-only --diff-filter=A -- src/data/blog/)
          if [ -n "$NEW_POSTS" ]; then
            echo "New posts detected:"
            echo "$NEW_POSTS"
            node scripts/share-post.mjs $NEW_POSTS
          else
            echo "No new posts in this push."
          fi
```

Note: `fetch-depth: 2` is required so the diff between `HEAD~1` and `HEAD` is available. Without it, the shallow clone has no previous commit to diff against.

**Step 3: Commit and push**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat: add Buffer social sharing step to deploy workflow"
git push origin master
```

**Step 4: Verify the workflow ran**

Go to the [Actions tab](https://github.com/rcosteira79/rcosteira79.github.io/actions) and check that:
- The `share` job appears in the latest workflow run
- It completes with "No new posts in this push." (expected — this push only modified the workflow)

---

### Task 4: Add BUFFER_API_TOKEN secret (manual)

This is a manual step that cannot be automated.

**Step 1: Get your Buffer API token**

Log into Buffer → Settings → Developers (or the API section in their beta docs). Generate an access token. Copy it.

**Step 2: Add the secret to GitHub**

Go to: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

- Name: `BUFFER_API_TOKEN`
- Value: your Buffer access token

**Step 3: Verify the secret exists**

The secret should appear in the list (value hidden). No further action needed here — the workflow will pick it up automatically on the next run.

---

### Task 5: End-to-end verification

**Step 1: Create a test post**

Create `src/data/blog/test-social-share.md`:

```markdown
---
author: Ricardo Costeira
pubDatetime: 2026-02-27T00:00:00Z
title: Test Social Share
draft: false
tags:
  - meta
description: Testing the social sharing workflow.
---

This is a test post to verify the social sharing automation.
```

**Step 2: Push and watch the workflow**

```bash
git add src/data/blog/test-social-share.md
git commit -m "test: verify social sharing workflow"
git push origin master
```

Go to the Actions tab. In the `share` job logs you should see:
```
New posts detected:
src/data/blog/test-social-share.md
Sharing to N Buffer profile(s).
✓ Posted to Buffer: "Test Social Share"
```

**Step 3: Verify in Buffer**

Check Buffer's queue/recent posts — the post should appear as published to all connected profiles.

**Step 4: Delete the test post**

```bash
git rm src/data/blog/test-social-share.md
git commit -m "chore: remove test social sharing post"
git push origin master
```
