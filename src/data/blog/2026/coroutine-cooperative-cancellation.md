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

## What "cooperative" actually means

Imagine asking a colleague to stop working on something. If you walk over and say "hey, can you wrap that up?", they finish the sentence they're on and put it down. That's cooperative cancellation. The alternative — walking over to their desk and cutting the power to their computer — gets the job done, but you're probably not getting a coherent state back. Kotlin coroutines work like the first scenario: the runtime asks, and the coroutine has to be the kind of code that actually listens.

The mechanism is that cancellation throws a `CancellationException` at the next suspension point. Every `suspend` call is a potential interruption site — `delay`, network calls, `withContext`, all of them. When the coroutine reaches one of those points and cancellation has been requested, the exception is thrown, the coroutine unwinds, and that's that. If there's no suspension point — a tight CPU loop, say, or a blocking call dressed up in a coroutine — the exception has nowhere to land, so cancellation just waits, politely, until the code is done doing whatever it's doing.

Most code cooperates without you thinking about it, because most code suspends. The interesting cases are the ones that don't.

## The free lunch

Every `suspend` function call is a cancellation checkpoint. `delay()`, `withContext()`, `await()`, a Retrofit call, a Room query — all of them. The coroutine checks its cancellation state at each one automatically, no extra work on your part. If cancellation was requested between two suspension points, the next `suspend` call is where it lands.

That covers most Android coroutine code. If you're doing I/O, hitting the network, or querying a database through suspending APIs, you're already cooperating. The problem is the code that never suspends — and that's more common than it sounds.
