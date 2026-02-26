# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **production output repository** for the blog at [ricardocosteira.com](https://ricardocosteira.com). It is hosted on GitHub Pages. The **source** that generates this repository is at https://github.com/rcosteira79/jasper2 (a Jekyll-based Ghost Casper theme adaptation).

Blog posts are pre-generated static HTML files committed directly to this repo — they are not templates or markdown source files.

## Commands

### CSS Build Pipeline

```bash
npm install        # Install dependencies
npx gulp           # Build CSS and start watcher + live reload (port 1234)
```

The Gulp pipeline processes `assets/css/*.css` through PostCSS (imports, custom properties, color functions, autoprefixer, minification) and outputs to `assets/built/`.

### Deployment

```bash
rake site:build    # Build with Jekyll
rake site:serve    # Serve locally at http://localhost:4000
rake site:deploy   # Build and push to gh-pages branch
```

Deployment requires `GIT_NAME`, `GIT_EMAIL`, and `GH_TOKEN` environment variables. The Rakefile handles Travis CI auto-detection.

## Architecture

### Repository Role

This repo holds **generated output only**. The workflow is:
1. Content is authored and built in the `jasper2` source repo
2. The output (static HTML) is committed here
3. GitHub Pages serves this repo at the custom domain in `CNAME`

### Key Files

- `assets/css/screen.edited.css` — CSS customizations on top of the Casper theme
- `assets/css/screen.css` — Main Casper theme CSS (do not edit directly)
- `gulpfile.js` — PostCSS pipeline: processes source CSS → `assets/built/`
- `Rakefile` — Jekyll build and GitHub Pages deployment automation
- `assets/js/` — Client-side libraries: Prism.js (syntax highlighting), infinite scroll, FitVids

### Content Structure

- Root-level `.html` files — individual blog posts
- `index.html` — blog listing page
- `about/index.html` — about page
- `tag/` — tag index pages with their own feeds
- `feed.xml` / `atom.xml` — RSS/Atom feeds
