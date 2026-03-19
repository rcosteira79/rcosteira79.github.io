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

## When the free lunch ends

CPU-bound work is the obvious case. A loop that processes a large list, crunches numbers, or walks a data structure doesn't suspend — it just runs. If the coroutine gets cancelled while it's in there, the cancellation signal arrives and then waits politely at the door while the loop finishes whatever it was doing.

```kotlin
viewModelScope.launch {
    // This loop will NOT stop if the coroutine is cancelled.
    // No suspension points = no cancellation checks.
    for (item in hugeList) {
        processItem(item)
    }
}
```

The coroutine was cancelled. The work keeps going. The scope is waiting for it to finish. Nobody's happy.

There are three tools for this. They differ in how much control you keep over what happens when cancellation is detected.

**`isActive`** is a property on the coroutine context. You check it yourself, and decide what to do about it:

```kotlin
viewModelScope.launch {
    for (item in hugeList) {
        if (!isActive) break  // check before each unit of work
        processItem(item)
    }
}
```

Verbose, but you're in charge. The `break` lands you in whatever cleanup or post-loop code you have. If you need to do something specific when cancellation happens — log something, write partial results, distinguish this from an actual error — `isActive` is how you do it.

**`ensureActive()`** does the same check but throws `CancellationException` instead of returning a boolean:

```kotlin
viewModelScope.launch {
    for (item in hugeList) {
        ensureActive()  // throws if cancelled, propagates up
        processItem(item)
    }
}
```

Terser. One line, no branch. But control flow leaves the loop immediately via an exception, so if you had cleanup logic after the loop, it won't run unless it's in a `finally` block. Which is fine — that's what `finally` is for — but it's a different shape than the `isActive` version.

**`yield()`** is the most cooperative of the three. It suspends briefly, checks for cancellation, and also lets the dispatcher run other coroutines before resuming:

```kotlin
viewModelScope.launch {
    for (item in hugeList) {
        yield()  // cancellation check + cooperative multitasking
        processItem(item)
    }
}
```

Like `ensureActive()`, it throws on cancellation. Unlike `ensureActive()`, it's an actual suspension point, so it does real cooperative scheduling work. If you're on a shared dispatcher and the loop is heavy enough to starve other coroutines, `yield()` is the honest fix.

The trade-off to be clear about: `isActive` leaves you in control of the cancellation path. `ensureActive()` and `yield()` both throw, so at the point of the throw, you can't distinguish cancellation from any other error without catching `CancellationException` specifically — which you generally shouldn't be catching anyway (more on that shortly). None of them is always the right answer. It depends on what the code around the loop actually needs to do when things stop.
