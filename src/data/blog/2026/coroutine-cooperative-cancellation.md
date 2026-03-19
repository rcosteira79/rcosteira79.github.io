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

Coroutine cancellation looks like it works. You call `viewModelScope.cancel()`, the user navigates away, the scope gets cleaned up. Things stop running. You never have to think about it — until you do, at which point the word "cooperative" starts to feel less like a feature description and more like a warning you missed.

The cooperative part is invisible in the happy path. Suspend functions yield at cancellation checkpoints automatically, so the code does the right thing without you asking. The trouble is that not all code suspends, and not all `catch` blocks are as innocent as they look. A CPU-bound loop with no suspension points will keep grinding away after the coroutine was supposed to be cancelled — the cancellation signal arrived, but there was nowhere for it to land. And a `try-catch(e: Exception)` that intercepts a `CancellationException` and swallows it quietly breaks the whole cancellation chain, leaving parent scopes waiting for a coroutine that has decided it would rather not be cancelled today.

Both cases look fine during development. Both tend to surface in production, under load, in the form of leaks or hangs that are annoying to reproduce. Both come down to the same misunderstanding: cancellation in Kotlin coroutines is a request, not a command, and it only works if the code is written to honor it.
