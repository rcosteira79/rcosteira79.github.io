#!/usr/bin/env node
// scripts/share-post.mjs
//
// Usage:
//   node scripts/share-post.mjs <file1.md> [file2.md] ...
//   node scripts/share-post.mjs --dry-run <file1.md> ...
//   node scripts/share-post.mjs --schedule <file1.md> ...   (schedules 7 days out, for testing)
//
// Environment variables:
//   BUFFER_API_TOKEN  — required (unless --dry-run)
//   SITE_URL          — defaults to https://rcosteira79.github.io

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, basename, dirname, join } from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const SCHEDULE = process.argv.includes("--schedule");
const BUFFER_API_TOKEN = process.env.BUFFER_API_TOKEN;
const SITE_URL = (process.env.SITE_URL ?? "https://rcosteira79.github.io").replace(/\/$/, "");
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

async function postToBuffer(token, profileIds, text, schedule = false) {
  const scheduledAt = String(Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000));
  const body = new URLSearchParams(
    schedule ? { text, scheduled_at: scheduledAt } : { text, now: "true" }
  );
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

    if (["true", "yes", "on"].includes((fm.draft ?? "").toLowerCase())) {
      console.log(`Skipping draft: ${file}`);
      continue;
    }

    const slug = basename(file, ".md")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
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
      await postToBuffer(BUFFER_API_TOKEN, profileIds, message, SCHEDULE);
      if (SCHEDULE) {
        console.log(`✓ Scheduled on Buffer (7 days out): "${fm.title}"`);
      } else {
        console.log(`✓ Posted to Buffer: "${fm.title}"`);
      }
    }
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
