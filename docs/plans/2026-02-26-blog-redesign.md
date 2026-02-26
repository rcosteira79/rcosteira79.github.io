# Blog Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild rcosteira79.github.io as a modern Astro + AstroPaper blog deployed via GitHub Actions to GitHub Pages.

**Architecture:** Astro with the AstroPaper theme scaffolded from the official template. Source lives on `master` branch; GitHub Actions builds and deploys the static output automatically on every push. Existing Jekyll/Ghost output files are removed and replaced with Astro source.

**Tech Stack:** Astro, AstroPaper theme, GitHub Actions, GitHub Pages

---

### Task 1: Remove old site files

**Files:**
- Delete: all root-level `.html` files, `assets/`, `tag/`, `about/`, `feed.xml`, `atom.xml`, `404.html`, `CNAME`, `Rakefile`, `gulpfile.js`, `package.json`, `package-lock.json`, `script.py`, `GHOST.txt`

**Step 1: Remove old output files**

```bash
git rm -r *.html feed.xml atom.xml 404.html CNAME Rakefile gulpfile.js package.json package-lock.json script.py GHOST.txt about/ tag/ assets/
```

**Step 2: Commit**

```bash
git commit -m "chore: remove old Jekyll/Ghost site output"
```

---

### Task 2: Scaffold Astro + AstroPaper

**Files:**
- Create: all Astro project files (via template)

**Step 1: Scaffold the project into the current directory**

```bash
npm create astro@latest . -- --template satnaing/astro-paper
```

When prompted:
- "How would you like to start your new project?" → select the AstroPaper template
- "Install dependencies?" → Yes
- "Initialize a new git repository?" → No (already in one)

**Step 2: Verify it builds**

```bash
npm run build
```

Expected: `dist/` folder created, no errors.

**Step 3: Preview locally**

```bash
npm run dev
```

Open http://localhost:4321 and verify the AstroPaper theme loads.

**Step 4: Commit**

```bash
git add .
git commit -m "feat: scaffold Astro + AstroPaper"
```

---

### Task 3: Configure site metadata

**Files:**
- Modify: `src/config.ts`
- Modify: `astro.config.mjs`

**Step 1: Update `astro.config.mjs`**

Set the `site` field so Astro generates correct URLs for GitHub Pages:

```javascript
export default defineConfig({
  site: "https://ricardocosteira.dev", // update once domain is confirmed
  // ... rest of existing config
});
```

**Step 2: Update `src/config.ts`**

```typescript
export const SITE: Site = {
  website: "https://ricardocosteira.dev/",
  author: "Ricardo Costeira",
  profile: "https://github.com/rcosteira79",
  desc: "Android engineer writing about Kotlin, mobile development, and software craft.",
  title: "Ricardo Costeira",
  ogImage: "astropaper-og.jpg",
  lightAndDarkMode: true,
  postPerIndex: 10,
  postPerPage: 10,
  scheduledPostMargin: 15 * 60 * 1000,
  showArchives: true,
  showBackButton: true,
  editPost: {
    url: "https://github.com/rcosteira79/rcosteira79.github.io/edit/master/src/content/blog",
    text: "Suggest Changes",
    appendFilePath: true,
  },
};
```

Note: check that all fields in the `Site` type are covered — the exact shape may differ slightly depending on the AstroPaper version installed. Read `src/config.ts` before editing.

**Step 3: Build and verify**

```bash
npm run build && npm run dev
```

Expected: site title and author reflect the new values in the browser.

**Step 4: Commit**

```bash
git add src/config.ts astro.config.mjs
git commit -m "feat: configure site metadata"
```

---

### Task 4: Set up GitHub Actions deployment

**Files:**
- Create: `.github/workflows/deploy.yml`

**Step 1: Create the workflow file**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

**Step 2: Enable GitHub Actions as the Pages source**

Go to: GitHub repo → Settings → Pages → Source → select **"GitHub Actions"**

**Step 3: Commit and push**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat: add GitHub Actions deployment workflow"
git push origin master
```

**Step 4: Verify deployment**

Go to the Actions tab in GitHub. Wait for the workflow to complete (green check). Visit the Pages URL shown in Settings → Pages to confirm the site loads.

---

### Task 5: Configure custom domain

**Files:**
- Create: `public/CNAME`

Do this task only once the `.dev` domain is purchased and ready to configure.

**Step 1: Create CNAME file**

Create `public/CNAME` with a single line (no trailing newline):

```
ricardocosteira.dev
```

**Step 2: Update `astro.config.mjs` and `src/config.ts`**

Change `site` / `website` fields to match the new domain (already set in Task 3 if domain was known).

**Step 3: Configure DNS at your registrar**

Add these DNS records:
- `A` record: `@` → `185.199.108.153`
- `A` record: `@` → `185.199.109.153`
- `A` record: `@` → `185.199.110.153`
- `A` record: `@` → `185.199.111.153`
- `CNAME` record: `www` → `rcosteira79.github.io`

DNS propagation can take up to 24 hours.

**Step 4: Commit and push**

```bash
git add public/CNAME
git commit -m "feat: configure custom domain"
git push origin master
```

**Step 5: Enforce HTTPS**

After DNS propagates, go to Settings → Pages and check "Enforce HTTPS".

---

### Task 6: Add /about page

**Files:**
- Modify or create: `src/pages/about.astro`

**Step 1: Check if AstroPaper already includes an about page**

```bash
ls src/pages/
```

If `about.astro` or `about.md` exists, open it and replace the placeholder content. If not, create `src/pages/about.astro`.

**Step 2: Fill in the about page content**

Minimum viable content:

```astro
---
import Layout from "@layouts/Layout.astro";
import Header from "@components/Header.astro";
import Footer from "@components/Footer.astro";
import { SITE } from "@config";
---

<Layout title={`About | ${SITE.title}`}>
  <Header activeNav="about" />
  <main id="main-content">
    <section id="about">
      <h1>About</h1>
      <p>
        I'm Ricardo Costeira, a mobile software engineer specialising in Android
        development with Kotlin. I write about clean code, Kotlin, KMP, and software craft.
      </p>
      <!-- Add experience, education, links as needed -->
      <h2>Links</h2>
      <ul>
        <li><a href="https://github.com/rcosteira79">GitHub</a></li>
      </ul>
    </section>
  </main>
  <Footer />
</Layout>
```

**Step 3: Verify About appears in navigation**

AstroPaper includes About in the nav by default. Check `src/config.ts` for a `NAV_ITEMS` or equivalent array and confirm About is listed.

**Step 4: Build and preview**

```bash
npm run build && npm run dev
```

Navigate to http://localhost:4321/about and verify it renders correctly.

**Step 5: Commit**

```bash
git add src/pages/about.astro
git commit -m "feat: add about page"
```

---

### Task 7: Add /projects page (hidden from nav)

**Files:**
- Create: `src/pages/projects.astro`

**Step 1: Create the page**

```astro
---
import Layout from "@layouts/Layout.astro";
import Header from "@components/Header.astro";
import Footer from "@components/Footer.astro";
import { SITE } from "@config";

const projects: Array<{
  name: string;
  description: string;
  url: string;
  tags: string[];
}> = [
  // Uncomment and populate when ready:
  // {
  //   name: "Project Name",
  //   description: "Short description of the project.",
  //   url: "https://github.com/rcosteira79/project-name",
  //   tags: ["Kotlin", "Android"],
  // },
];
---

<Layout title={`Projects | ${SITE.title}`}>
  <Header /> <!-- no activeNav - page is intentionally unlisted -->
  <main id="main-content">
    <section id="projects">
      <h1>Projects</h1>
      {projects.length === 0 ? (
        <p>Coming soon.</p>
      ) : (
        <ul>
          {projects.map(project => (
            <li>
              <a href={project.url}>{project.name}</a>
              <p>{project.description}</p>
              <p>{project.tags.join(", ")}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  </main>
  <Footer />
</Layout>
```

**Step 2: Confirm it is NOT in the nav config**

Open `src/config.ts`, find the nav links array, and verify `projects` is not listed there.

**Step 3: Build and preview**

```bash
npm run build && npm run dev
```

- Navigate to http://localhost:4321/projects → should render "Coming soon."
- Check the navigation bar → `/projects` should NOT appear.

**Step 4: Commit**

```bash
git add src/pages/projects.astro
git commit -m "feat: add projects page (hidden from nav)"
git push origin master
```

---

### Task 8: Write and publish first post

**Files:**
- Create: `src/content/blog/hello-world.md`

**Step 1: Create the post**

```markdown
---
title: Hello, World
author: Ricardo Costeira
pubDate: 2026-02-26
description: The blog is back, rebuilt from scratch.
tags:
  - meta
draft: false
---

The old blog has been rebuilt from scratch with a modern stack.
Same content focus: Android, Kotlin, and software craft.
```

**Step 2: Build and preview**

```bash
npm run build && npm run dev
```

Verify the post appears in the home listing.

**Step 3: Commit and push**

```bash
git add src/content/blog/hello-world.md
git commit -m "feat: add first post"
git push origin master
```

**Step 4: Verify on live site**

After the Actions workflow completes, visit the live URL and confirm the post appears.
