# Coroutine Cooperative Cancellation — Article Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write and publish a wide-scope reference article on Kotlin coroutine cooperative cancellation, covering the full picture from the core mechanic to Job hierarchies.

**Architecture:** Single Markdown file in `src/data/blog/2026/`. Article starts as `draft: true`, published separately. Written section by section with a dev server running to verify rendering.

**Tech Stack:** Astro v5 / AstroPaper v5.5.1, Markdown, Kotlin code blocks. Dev server at `http://localhost:4321` (`pnpm dev`).

**Spec:** `docs/superpowers/specs/2026-03-19-coroutine-cooperative-cancellation-design.md`

**Voice skill:** `rcosteira-blog-voice` — read it before writing any prose. Key rules:
- Dry, self-deprecating humor. No exclamation points, no forced enthusiasm.
- Honest about trade-offs. Hedge where uncertainty is real.
- One strong analogy beats three paragraphs of explanation.
- Headers feel like chapter names in Ricardo's posts, not formal academic sections.
- Lessons: **bold one-liner**, then explanation tethered to the specific experience.
- Never: "In this post, I will..." / "Today I want to share..."

---

## File Structure

| Action | Path | Purpose |
|--------|------|---------|
| Create | `src/data/blog/2026/coroutine-cooperative-cancellation.md` | The article |

No other files are created or modified.

---

### Task 1: Read the voice skill before writing anything

**Files:** none

- [ ] **Step 1: Read the voice skill**

Read `/Users/ricardocosteira/.claude/skills/rcosteira-blog-voice/SKILL.md` in full before writing any prose. Key rules to keep in mind throughout:
- Dry, self-deprecating humor. No exclamation points, no forced enthusiasm.
- One strong analogy beats three paragraphs of explanation.
- Lessons: **bold one-liner**, then explanation grounded in the specific mechanic — not generic advice.
- Headers should feel like chapter names, not formal academic sections.
- Never: "In this post, I will..." / "Today I want to share..."

---

### Task 3: Create the file with frontmatter and start the dev server

**Files:**
- Create: `src/data/blog/2026/coroutine-cooperative-cancellation.md`

- [ ] **Step 1: Start the dev server in the background**

```bash
pnpm dev &
```

Keep it running throughout. Check http://localhost:4321 to verify renders.

- [ ] **Step 2: Create the file with draft frontmatter**

```markdown
---
title: "Coroutine Cancellation Is Cooperative (and That's the Whole Point)"
description: Most coroutine code cancels correctly by accident. Here's what's actually happening, and what goes wrong when it doesn't.
pubDatetime: 2026-03-19T00:00:00Z
author: Ricardo Costeira
tags:
  - android
  - kotlin
draft: true
---
```

- [ ] **Step 3: Verify the post appears in the dev server**

Navigate to http://localhost:4321/posts/ and confirm the draft post is visible (dev mode shows drafts).

- [ ] **Step 4: Commit**

```bash
git add src/data/blog/2026/coroutine-cooperative-cancellation.md
git commit -m "Add coroutine cancellation article scaffold (draft)"
```

---

### Task 4: Write the opening

**Files:**
- Modify: `src/data/blog/2026/coroutine-cooperative-cancellation.md`

The opening must drop directly into the argument. No preamble. It names the misconception and briefly frames the stakes — a CPU-bound loop that runs forever after the screen is gone, or a `try-catch` that silently absorbs a `CancellationException` and breaks the whole cancellation chain.

- [ ] **Step 1: Write the opening paragraphs**

Write 2–3 paragraphs below the frontmatter. Do NOT use "In this post" or "Today I want to share". Aim for something like:

> *Cancellation in coroutines looks like it works. You call `viewModelScope.cancel()`, or navigate away from a screen, and the scope gets cleaned up. Most of the time, things stop. The "cooperative" part never comes up — which is exactly why it catches people off guard when it does.*
>
> *Two common cases: a CPU-bound loop that keeps running long after the coroutine was supposed to be cancelled, and a `try-catch` that silently swallows a `CancellationException` and breaks the whole cancellation chain. Both look fine until they don't. Both come down to the same misunderstanding.*

Adjust tone and wording to feel natural in Ricardo's voice. The key beats are: (1) it usually works, (2) the cooperative part is invisible, (3) here's where it goes wrong.

- [ ] **Step 2: Verify it renders correctly at the dev server**

- [ ] **Step 3: Commit**

```bash
git add src/data/blog/2026/coroutine-cooperative-cancellation.md
git commit -m "Add article opening"
```

---

### Task 5: Write "What cooperative actually means"

**Files:**
- Modify: `src/data/blog/2026/coroutine-cooperative-cancellation.md`

The core mechanism in one focused section. Uses one strong analogy to make the mechanic visceral before explaining it technically.

- [ ] **Step 1: Write the section**

Add a `##` header (something like `## What "cooperative" actually means`, matching Ricardo's style — not "Introduction").

Content beats:
1. **The analogy first** — asking a colleague to stop what they're doing vs. cutting their power. One requires their participation. Land the punchline before the technical explanation.
2. **The mechanism** — cancellation works by throwing a `CancellationException` at the next suspension point. If there's no suspension point, there's no cancellation. One paragraph, no fluff.
3. **Why this matters** — brief bridge to the next section: most code has suspension points and gets this for free; but not all code does.

- [ ] **Step 2: Verify render**

- [ ] **Step 3: Commit**

```bash
git add src/data/blog/2026/coroutine-cooperative-cancellation.md
git commit -m "Add 'what cooperative means' section"
```

---

### Task 6: Write Layer 1 — Suspend points as free checkpoints

**Files:**
- Modify: `src/data/blog/2026/coroutine-cooperative-cancellation.md`

Reassures the reader that common Android coroutine code cooperates automatically. Sets up why understanding the mechanic matters anyway.

- [ ] **Step 1: Write the section**

Add a `##` header. Content beats:
1. Any call to a `suspend` function — `delay()`, `withContext()`, `await()`, Retrofit suspending calls, Room suspending queries — is a natural cancellation checkpoint. The coroutine checks its cancellation state at every suspension point for free.
2. Most Android coroutine code falls here. If you're doing I/O, network calls, or database work through suspending APIs, you're already cooperating without knowing it.
3. Bridge: the problem is code that doesn't suspend — and that's more common than it sounds.

Keep this section short. Its job is to reassure before complicating.

- [ ] **Step 2: Verify render**

- [ ] **Step 3: Commit**

```bash
git add src/data/blog/2026/coroutine-cooperative-cancellation.md
git commit -m "Add Layer 1: suspend points as free cancellation checkpoints"
```

---

### Task 7: Write Layer 2 — When you're not cooperating

**Files:**
- Modify: `src/data/blog/2026/coroutine-cooperative-cancellation.md`

The main failure mode. Introduces `isActive`, `ensureActive()`, and `yield()` with code examples, and honestly acknowledges the trade-offs between them.

- [ ] **Step 1: Write the section prose and code examples**

Add a `##` header. Content beats:

1. **The failure mode** — CPU-bound or blocking work that never suspends. The coroutine is cancelled but the loop keeps running. Show this first:

```kotlin
viewModelScope.launch {
    // This loop will NOT stop if the coroutine is cancelled.
    // No suspension points = no cancellation checks.
    for (item in hugeList) {
        processItem(item)
    }
}
```

2. **Three tools to fix it:**

**`isActive`** — check the flag manually, branch on it:

```kotlin
viewModelScope.launch {
    for (item in hugeList) {
        if (!isActive) break  // check before each unit of work
        processItem(item)
    }
}
```

**`ensureActive()`** — throws `CancellationException` if the coroutine is cancelled. Terser, but changes control flow:

```kotlin
viewModelScope.launch {
    for (item in hugeList) {
        ensureActive()  // throws if cancelled, propagates up
        processItem(item)
    }
}
```

**`yield()`** — suspends briefly, which both checks for cancellation *and* gives the dispatcher a chance to run other coroutines. Best when the loop is genuinely compute-heavy and should play nice with the thread:

```kotlin
viewModelScope.launch {
    for (item in hugeList) {
        yield()  // cancellation check + cooperative multitasking
        processItem(item)
    }
}
```

3. **The honest trade-off note** — `isActive` gives you explicit control over the cleanup path (you decide what to do on cancellation). `ensureActive()` and `yield()` are terser but throw, so you lose the ability to handle cancellation differently from other errors at that point. Neither is always better. Pick based on what the code around it needs.

- [ ] **Step 2: Verify render**

- [ ] **Step 3: Commit**

```bash
git add src/data/blog/2026/coroutine-cooperative-cancellation.md
git commit -m "Add Layer 2: when you're not cooperating (isActive, ensureActive, yield)"
```

---

### Task 8: Write Layer 3 — CancellationException

**Files:**
- Modify: `src/data/blog/2026/coroutine-cooperative-cancellation.md`

Explains `CancellationException`, the swallowing footgun, Ricardo's personal anecdote, and the fix.

- [ ] **Step 1: Write the section prose and code examples**

Add a `##` header. Content beats:

1. **Brief `withTimeout` acknowledgment first** — one sentence at the top of the section: `withTimeout` and `withTimeoutOrNull` are common cancellation sources in Android code; a timed-out call throws a `CancellationException` too, so readers who first encountered it through a timeout should recognise what follows. Then pivot to the main topic.

2. **What `CancellationException` is and why it's special** — it's the carrier of the cancellation signal. When a coroutine is cancelled, a `CancellationException` is thrown at the next suspension point and propagates up the call stack. If something catches it and doesn't rethrow it, the signal stops propagating — the scope thinks cancellation completed cleanly, but the coroutine may still do work it wasn't supposed to do.

3. **The footgun** — `CancellationException` is a subclass of `RuntimeException`, so a blanket `catch (e: Exception)` silently swallows it. Easy to write, hard to notice:

```kotlin
viewModelScope.launch {
    try {
        fetchData()
    } catch (e: Exception) {
        // looks reasonable. but if fetchData() was cancelled,
        // CancellationException ends up here and gets swallowed.
        handleError(e)
    }
}
```

4. **Ricardo's personal anecdote** — brief, honest, in first person. Something like: "I did exactly this. A suspend call inside a `try-catch` that caught `Exception`, a `CancellationException` went in, nothing came out, and the coroutine carried on doing things it definitely shouldn't have been doing after the screen was gone. The fix was embarrassingly simple once I understood what was happening." Keep it short — it's an illustration, not the main event.

5. **The fix** — two options:

Option A: rethrow `CancellationException` explicitly:

```kotlin
viewModelScope.launch {
    try {
        fetchData()
    } catch (e: CancellationException) {
        throw e  // always rethrow cancellation
    } catch (e: Exception) {
        handleError(e)
    }
}
```

Option B: catch a more specific exception type instead of `Exception`:

```kotlin
viewModelScope.launch {
    try {
        fetchData()
    } catch (e: IOException) {
        // only catches what we actually care about
        handleError(e)
    }
}
```

Option B is usually cleaner — it forces you to think about what errors you actually expect.

- [ ] **Step 2: Verify render**

- [ ] **Step 3: Commit**

```bash
git add src/data/blog/2026/coroutine-cooperative-cancellation.md
git commit -m "Add Layer 3: CancellationException and why you must not swallow it"
```

---

### Task 9: Write Layer 4 — Cleanup under cancellation with NonCancellable

**Files:**
- Modify: `src/data/blog/2026/coroutine-cooperative-cancellation.md`

Explains the problem with suspending cleanup in `finally` blocks, and the targeted use of `withContext(NonCancellable)`.

- [ ] **Step 1: Write the section prose and code examples**

Add a `##` header. Content beats:

1. **`finally` blocks still run** — when a coroutine is cancelled, `finally` blocks execute as expected. Good.

2. **The problem** — if the cleanup inside `finally` involves suspending work (writing to a database, closing a connection cleanly, sending a goodbye message to a server), those suspend calls immediately throw `CancellationException` again — because the coroutine is still in a cancelled state:

```kotlin
viewModelScope.launch {
    try {
        doWork()
    } finally {
        saveProgress()  // suspend fun — throws CancellationException immediately
                        // because the coroutine is cancelled. saveProgress never runs.
    }
}
```

3. **The fix** — `withContext(NonCancellable)` opts a block out of cancellation entirely:

```kotlin
viewModelScope.launch {
    try {
        doWork()
    } finally {
        withContext(NonCancellable) {
            saveProgress()  // now runs to completion even if the coroutine was cancelled
        }
    }
}
```

4. **The footgun** — `NonCancellable` should only appear in `finally` blocks for genuine cleanup. Wrapping regular business logic in it defeats the point of structured concurrency and can cause real leaks. Keep the block as small as possible.

- [ ] **Step 2: Verify render**

- [ ] **Step 3: Commit**

```bash
git add src/data/blog/2026/coroutine-cooperative-cancellation.md
git commit -m "Add Layer 4: cleanup under cancellation with NonCancellable"
```

---

### Task 10: Write Layer 5 — Job hierarchies and structured cancellation

**Files:**
- Modify: `src/data/blog/2026/coroutine-cooperative-cancellation.md`

Covers parent-child Job relationships, failure propagation, and the difference between `coroutineScope` / `supervisorScope` as scoped alternatives to constructing Jobs manually.

- [ ] **Step 1: Write the section prose and code examples**

Add a `##` header. Content beats:

1. **Parent-child Jobs** — every coroutine launched inside another coroutine forms a parent-child relationship. Cancelling the parent cancels all children. When a child fails with a non-cancellation exception, the failure propagates to the parent, which cancels the parent and all its other children. This is structured concurrency: predictable, leak-free by default.

Show this concretely — not just the nesting structure, but what actually happens:

```kotlin
viewModelScope.launch {  // parent
    launch {  // child 1
        delay(1_000)
        throw RuntimeException("something went wrong")
        // this exception propagates to the parent,
        // which cancels the parent and child 2
    }
    launch {  // child 2
        delay(5_000)
        println("this never runs")  // cancelled before it gets here
    }
}
```

2. **`SupervisorJob` — briefly explain the concept** before introducing the scoped alternatives. A `SupervisorJob` changes child-failure behaviour so a failing child doesn't cancel its siblings or the parent. Mention that it's typically passed to a `CoroutineScope` constructor (e.g., `CoroutineScope(SupervisorJob() + Dispatchers.IO)`). Then note that in most cases you don't need to construct it manually — the scoped builders are cleaner.

3. **`coroutineScope` vs `supervisorScope`** — scoped alternatives that are preferred over constructing `Job` / `SupervisorJob` manually:

```kotlin
// coroutineScope: default structured concurrency behaviour.
// One child fails → the scope and all other children are cancelled.
coroutineScope {
    launch { loadFeed() }   // if this throws a real exception...
    launch { loadAds() }    // ...this gets cancelled too
}

// supervisorScope: children are independent.
// One child fails → siblings and the parent are unaffected.
supervisorScope {
    launch { loadFeed() }   // if this throws...
    launch { loadAds() }    // ...this still runs
}
```

4. **When `supervisorScope` is appropriate** — genuinely independent parallel tasks where one failing shouldn't abort the others (e.g., loading independent feed sections on a home screen). Honest hedge: `supervisorScope` is useful but it opts you out of structured concurrency's safety net. If you're reaching for it to silence a failure rather than because the tasks are genuinely independent, that's a smell. The failure propagation in structured concurrency is a feature, not a bug.

- [ ] **Step 2: Verify render**

- [ ] **Step 3: Commit**

```bash
git add src/data/blog/2026/coroutine-cooperative-cancellation.md
git commit -m "Add Layer 5: Job hierarchies, coroutineScope, and supervisorScope"
```

---

### Task 11: Write "What I Took Away"

**Files:**
- Modify: `src/data/blog/2026/coroutine-cooperative-cancellation.md`

Four lessons in Ricardo's style: **bold one-liner**, then explanation grounded in the specific mechanic — not generic advice.

- [ ] **Step 1: Write the lessons section**

Add a `## What I Took Away` header (or similar — matching Ricardo's existing posts). Write these four lessons:

**Lesson 1: Cancellation is a request, not a command.**
Tether the explanation to the specific mechanism: no suspension point means no cancellation check. The machinery is fine; the gap is in what developers assume it does automatically. A coroutine that never suspends will never check whether it's been cancelled.

**Lesson 2: Catching `Exception` in a coroutine is a trap.**
`CancellationException` is a subclass of `RuntimeException`. A blanket catch swallows the signal and breaks the cancellation chain without any visible error. Ricardo's own anecdote anchors this — brief, first-person, honest. The fix (rethrow or catch more specifically) is so simple it's almost insulting once you know what happened.

**Lesson 3: `supervisorScope` is an escape hatch, not a default.**
Structured concurrency's failure propagation is a feature. A child failing and cancelling its siblings is the system working correctly — it means failures don't get silently swallowed and partially-completed states don't linger. Opting out with `supervisorScope` should feel like a deliberate choice, not a way to make an error go away.

**Lesson 4: The common case is fine. It's the edge case that gets you.**
Most Android coroutine code cancels correctly because it happens to use `delay()` or network/database suspending calls. Fine. But not understanding *why* it works means you won't notice when you write code that doesn't — a blocking loop here, a blanket catch there. The machinery is not magic; it just looks like it is until it isn't.

- [ ] **Step 2: Verify render**

- [ ] **Step 3: Commit**

```bash
git add src/data/blog/2026/coroutine-cooperative-cancellation.md
git commit -m "Add 'What I Took Away' section"
```

---

### Task 12: Final polish — frontmatter, social post, and full read-through

**Files:**
- Modify: `src/data/blog/2026/coroutine-cooperative-cancellation.md`

- [ ] **Step 1: Read the full article top to bottom**

Read it as a reader, not the author. Check:
- Does the opening drop you into the argument immediately?
- Does each section flow naturally into the next?
- Are any sections too long, preachy, or too documentation-like?
- Do the lessons feel earned, or generic?
- Does the tone stay consistent — dry, honest, no forced enthusiasm?

Fix anything that feels off before proceeding.

- [ ] **Step 2: Update the frontmatter**

Finalize the title and description based on how the article actually came out. Add a `socialPost` field in Ricardo's casual tone. Example:

```markdown
socialPost: "Wrote a reference article on coroutine cooperative cancellation — the bit that trips people up when it's invisible and fine until it suddenly isn't 👉 {url}"
```

Adjust to match the actual article voice.

- [ ] **Step 3: Set `pubDatetime` to today's date**

Use ISO format: `2026-03-19T00:00:00Z`

- [ ] **Step 4: Verify the full article renders correctly**

Check http://localhost:4321 — title, description, tags, all code blocks.

- [ ] **Step 5: Final commit**

```bash
git add src/data/blog/2026/coroutine-cooperative-cancellation.md
git commit -m "Polish coroutine cancellation article — final draft"
```

---

### Task 13: Publish

**Files:**
- Modify: `src/data/blog/2026/coroutine-cooperative-cancellation.md`

- [ ] **Step 1: Set `draft: false`**

Change the frontmatter field.

- [ ] **Step 2: Commit and push**

```bash
git add src/data/blog/2026/coroutine-cooperative-cancellation.md
git commit -m "Publish coroutine cooperative cancellation article"
git push
```

- [ ] **Step 3: Verify deployment**

Wait for GitHub Actions to complete, then check the live site to confirm the post is visible and renders correctly.
