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

## The exception you should never catch

`withTimeout` and `withTimeoutOrNull` are another common way to meet `CancellationException` — a timed-out call throws one too, so if you've already crossed paths with it through that route, what follows will look familiar. But the footgun lives a bit deeper.

`CancellationException` is the carrier signal for coroutine cancellation. When a coroutine is cancelled, the runtime throws one at the next suspension point, and it propagates up the call stack from there. The whole machinery depends on that exception making it out unobstructed. If something catches it and doesn't rethrow it, the signal stops. The parent scope thinks cancellation completed cleanly. The coroutine thinks... nothing, actually, because it's carrying on as if nothing happened.

The reason this is easy to miss: `CancellationException` is a subclass of `RuntimeException`. So a blanket `catch (e: Exception)` catches it, silently, alongside every other error you were actually trying to handle.

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

No warning. No crash. The code just keeps running after the scope was supposed to have cancelled it.

I did this. A suspend call inside a `try-catch` that caught `Exception`, a `CancellationException` walked in, and the coroutine kept executing work it had absolutely no business doing after the screen was already gone. The fix, once I understood what was happening, was embarrassingly straightforward. The time between "why is this still running" and "oh" was longer than I'd like to admit.

There are two ways out of this.

Option A: catch `CancellationException` explicitly and rethrow it before handling anything else:

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

Option B: don't catch `Exception` at all — catch only the specific exceptions you actually expect:

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

Option B tends to be cleaner, for the same reason narrow types are generally cleaner: it forces you to be honest about what can go wrong and what you're prepared to do about it. But it requires knowing what `fetchData()` throws, which isn't always obvious when the call goes several layers deep. Option A is the safety net when you need to catch broadly and can't easily narrow it down. Both are valid. Neither is a reason to feel clever.

## Finally, about `finally`

`finally` blocks still run when a coroutine is cancelled. The `CancellationException` propagates up the stack and `finally` does exactly what it's supposed to — this part works fine, no special handling required.

The trouble starts when the cleanup inside `finally` needs to suspend.

```kotlin
viewModelScope.launch {
    try {
        doWork()
    } finally {
        saveProgress()  // suspend fun — throws CancellationException immediately
                        // because the coroutine is still cancelled. saveProgress never runs.
    }
}
```

The coroutine is cancelled. `finally` runs. `saveProgress()` is a suspend function, so the first thing it does is hit a suspension point — and at that suspension point, the coroutine's cancellation state is still active. `CancellationException` gets thrown again, right there, and `saveProgress()` exits before doing anything useful. The cleanup you put in `finally` to ensure work got saved quietly didn't.

`withContext(NonCancellable)` is the escape hatch for this. It runs its block in a context that ignores cancellation entirely:

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

The surrounding coroutine is still cancelled — `NonCancellable` doesn't change that. It just opts the block out long enough for the cleanup to finish.

The footgun, since we're being honest: `NonCancellable` should only appear in `finally` blocks for genuine cleanup. If you find yourself wrapping business logic in it — a network call, a state update, anything that isn't strictly "undo what I started" — you've opted that code out of structured concurrency entirely. Cancellation can't touch it. Timeouts can't touch it. If something goes wrong inside it, the parent scope has no leverage. Keep the block as small as possible, and make sure everything inside it actually needs to finish regardless of what the rest of the coroutine was doing when it was cancelled.

## The hierarchy

Every coroutine launched inside another inherits a parent-child relationship through their `Job`s. Cancel the parent, and the runtime cancels all children. That's the obvious direction. The less obvious one: when a child fails with a non-cancellation exception, the failure propagates *up* to the parent, which then cancels itself and all remaining siblings. Structured concurrency — predictable, leak-free by default, and occasionally surprising if you haven't thought it through.

```kotlin
viewModelScope.launch {  // parent
    launch {  // child 1
        delay(1_000)
        throw RuntimeException("something went wrong")
        // the exception travels up to the parent,
        // which cancels the parent and child 2
    }
    launch {  // child 2
        delay(5_000)
        println("this never runs")  // cancelled before it gets here
    }
}
```

Both children started fine. Child 1 failed. Child 2 never gets to its `println`. The parent coroutine is gone too. This isn't a bug — it's the design. A failure in one part of a coordinated operation cancelling the whole thing is usually what you want. If you fetched user data and then the preferences fetch threw, do you really want to keep going with a half-initialised screen?

Sometimes, though, the tasks genuinely aren't coordinated. Loading a feed and loading ads aren't part of the same logical operation — one failing doesn't make the other's result useless. That's where `SupervisorJob` comes in.

A `SupervisorJob` changes the child-failure behaviour so a failing child doesn't cancel its siblings or the parent. It's usually passed to a `CoroutineScope` constructor directly:

```kotlin
val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
```

In practice, you rarely need to wire this up by hand. The scoped builders are cleaner.

`coroutineScope` gives you default structured concurrency behaviour — one child fails, the scope and all other children are cancelled:

```kotlin
// coroutineScope: standard propagation.
// One child throws a real exception → the scope and siblings are cancelled.
coroutineScope {
    launch { loadFeed() }   // if this throws...
    launch { loadAds() }    // ...this gets cancelled too
}
```

`supervisorScope` makes children independent. A failing child doesn't take the others down:

```kotlin
// supervisorScope: failure isolation.
// One child throws → siblings and the parent are unaffected.
supervisorScope {
    launch { loadFeed() }   // if this throws...
    launch { loadAds() }    // ...this still runs
}
```

`supervisorScope` is genuinely useful for parallel tasks that don't depend on each other. But it's worth being honest about the trade-off: using it opts you out of the safety net that structured concurrency provides. The failure still happened — it just won't propagate. You're responsible for handling it somewhere inside the failing child (typically with `CoroutineExceptionHandler` or a `try-catch` inside the `launch`), because if you don't, it gets swallowed silently and you're back to the debugging experience you were trying to avoid.

The smell to watch for: reaching for `supervisorScope` because a child is throwing and you'd rather not deal with it cascading. That's not "the tasks are independent" — that's suppressing a failure signal. The propagation is a feature. If child 1 failing genuinely shouldn't affect child 2, use `supervisorScope`. If you're not sure, that uncertainty is probably worth sitting with before you reach for it.
