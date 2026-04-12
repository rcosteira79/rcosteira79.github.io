#!/usr/bin/env node
// scripts/share-post.mjs
//
// Usage:
//   node scripts/share-post.mjs <file1.md> [file2.md] ...   (adds to Buffer queue)
//   node scripts/share-post.mjs --now <file1.md> ...         (publishes immediately)
//   node scripts/share-post.mjs --schedule <file1.md> ...    (schedules 7 days out, for testing)
//   node scripts/share-post.mjs --dry-run <file1.md> ...
//
// Environment variables:
//   BUFFER_API_TOKEN  — required (unless --dry-run)
//   SITE_URL          — defaults to https://rcosteira79.github.io

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, basename, dirname, join, relative } from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const SHARE_NOW = process.argv.includes("--now");
const SCHEDULE = process.argv.includes("--schedule");
const BUFFER_API_TOKEN = process.env.BUFFER_API_TOKEN;
const SITE_URL = (process.env.SITE_URL ?? "https://ricardocosteira.dev").replace(/\/$/, "");
const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Frontmatter parser
// Handles simple single-line key: value pairs. Values may contain colons.
// socialPost supports \n escape sequences for multi-line posts:
//   socialPost: "Line one\n\nLine two\n\n{url}"
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
    // Strip surrounding quotes then unescape \n sequences
    result[key] = raw.replace(/^["'`]|["'`]$/g, "").replace(/\\n/g, "\n");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Reads socialTemplate from src/config.ts
// Expects the value to be a template literal: socialTemplate: `...`
// ---------------------------------------------------------------------------
function readSocialTemplate() {
  const config = readFileSync(join(__dirname, "../src/config.ts"), "utf-8");
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
// Buffer GraphQL API — https://developers.buffer.com
// ---------------------------------------------------------------------------
const BUFFER_API_URL = "https://api.buffer.com";

async function bufferGraphQL(token, query, variables = {}) {
  const res = await fetch(BUFFER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Buffer API failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Buffer API error: ${json.errors.map(e => e.message).join(", ")}`);
  }
  return json.data;
}

async function fetchBufferChannelIds(token) {
  const orgData = await bufferGraphQL(token, `
    query { account { organizations { id } } }
  `);
  const orgId = orgData.account.organizations[0]?.id;
  if (!orgId) throw new Error("No Buffer organization found.");

  const channelData = await bufferGraphQL(token, `
    query GetChannels($input: ChannelsInput!) {
      channels(input: $input) { id name service }
    }
  `, { input: { organizationId: orgId } });

  return channelData.channels.map(c => c.id);
}

async function postToBuffer(token, channelIds, text, { now = false, schedule = false } = {}) {
  let mode = "addToQueue";
  let dueAt;

  if (now) {
    mode = "shareNow";
  } else if (schedule) {
    mode = "customScheduled";
    dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  for (const channelId of channelIds) {
    const data = await bufferGraphQL(token, `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          ... on PostActionSuccess { post { id } }
          ... on MutationError { message }
        }
      }
    `, {
      input: {
        channelId,
        text,
        schedulingType: "automatic",
        mode,
        ...(dueAt && { dueAt }),
      },
    });

    const result = data.createPost;
    if (result.message) {
      throw new Error(`Buffer rejected post for channel ${channelId}: ${result.message}`);
    }
  }
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

  let channelIds = [];
  if (!DRY_RUN) {
    if (!BUFFER_API_TOKEN) {
      throw new Error("BUFFER_API_TOKEN environment variable is not set.");
    }
    channelIds = await fetchBufferChannelIds(BUFFER_API_TOKEN);
    console.log(`Sharing to ${channelIds.length} Buffer channel(s).`);
  }

  for (const file of files) {
    const content = readFileSync(resolve(file), "utf-8");
    const fm = parseFrontmatter(content);

    if (["true", "yes", "on"].includes((fm.draft ?? "").toLowerCase())) {
      console.log(`Skipping draft: ${file}`);
      continue;
    }

    // Skip posts older than 2 days — prevents accidentally sharing backdated or restored posts
    const pubDate = fm.pubDatetime ? new Date(fm.pubDatetime) : null;
    if (pubDate && Date.now() - pubDate.getTime() > 2 * 24 * 60 * 60 * 1000) {
      console.log(`Skipping old post (published ${fm.pubDatetime}): ${file}`);
      continue;
    }

    const blogDir = join(__dirname, "../src/data/blog");
    const slug = relative(blogDir, resolve(file))
      .replace(/\.md$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9/]+/g, "-")
      .replace(/^-|-$/g, "");
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
      await postToBuffer(BUFFER_API_TOKEN, channelIds, message, { now: SHARE_NOW, schedule: SCHEDULE });
      if (SHARE_NOW) {
        console.log(`✓ Published immediately to Buffer: "${fm.title}"`);
      } else if (SCHEDULE) {
        console.log(`✓ Scheduled on Buffer (7 days out): "${fm.title}"`);
      } else {
        console.log(`✓ Added to Buffer queue: "${fm.title}"`);
      }
    }
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
