---
title: "Coroutines Need Your Cooperation"
description: Most coroutine code cancels correctly by accident. But sometimes, it might need a little push on your end.
ogImage: ./coroutines-need-your-cooperation/cover.jpg
ogImageAuthor: Vardan Papikyan
ogImageAuthorUrl: https://unsplash.com/@varpap
pubDatetime: 2026-04-10T00:00:00Z
author: Ricardo Costeira
tags:
  - android
  - kotlin
draft: true
socialPost: "Been seeing a lot of coroutine cancellation issues and misconceptions in the wild, so I wrote up everything I wish I'd known about coroutine cancellation before it bit me in production. Check it out at {url}"
---
 
Coroutine cancellation is great. You launch your coroutine on your `ViewModel`, have it do its work, the user navigates away, `viewModelScope.cancel()` gets called, the scope gets cleaned up, things stop running, resources are freed. Since suspend functions yield at cancellation checkpoints automatically, the code does the right thing without you asking. Usually. The problems start when – yes, _when_, not _if_ – you stray away from the happy path. These problems usually stem from either one of these factors, or both: 

 - Not all code suspends.
 - Not all `catch` blocks are as innocent as they look. 
 
For instance, a CPU-bound loop with no suspension points will keep grinding away after the coroutine was supposed to be cancelled — the cancellation signal arrived, but your expensive loop couldn't care less about it. A `try-catch(e: Exception)` that you skillfully craft to handle any exceptions your code might spit out, will also swallow `CancellationException` unless you're explicit about it not doing it, quietly breaking the whole cancellation chain and leaving parent scopes waiting for a coroutine that looked the `CancellationException` in the eye and said "How about no?".

Both cases look fine during development. Both tend to surface in production, under load, in the form of leaks or hangs that are annoying to reproduce. Both come down to the same misunderstanding: cancellation in Kotlin coroutines is a request, not a command, and it only works if the code is written to honor it.

## What "cooperative" actually means

Where I live, there's a trampoline park called Jump City. You pay for your entrance in one-hour batches, and you go have fun jumping around and trying not to knee any little kids in the face. Every hour, there's a warning saying that the hour has passed. At that point, you have to _cooperatively_ leave the trampolines. If you're not actively listening to the warning, you'll just happily stay there until eventually someone comes asking you how long you've been there and for how long you actually paid (a friend told me, never happened to me).

Coroutine cancellation works the same way. The parent scope doesn't reach in and stop your coroutine: Instead, it sets a cancellation flag. Whether anyone actually stops depends entirely on whether the code ever checks that flag. If it does, great, it sees the cancellation and unwinds cleanly. If it doesn't, the flag just sits there, being ignored, while the coroutine keeps running.

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

`CancellationException` is the carrier signal for coroutine cancellation. When a coroutine is cancelled, the runtime throws one at the next suspension point, and it propagates up the call stack from there. The whole machinery depends on that exception making it out unobstructed. If something catches it and doesn't rethrow it, the signal stops. The parent scope thinks cancellation completed cleanly. The coroutine thinks... nothing, actually, because it's carrying on as if nothing happened.

The reason this is easy to miss: `CancellationException` is a subclass of `IllegalStateException`. So a blanket `catch (e: Exception)` catches it, silently, alongside every other error you were actually trying to handle.

(Side note: `withTimeout` and `withTimeoutOrNull` throw a `CancellationException` when the deadline passes, so everything below applies there too.)

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

## Cleanup and `finally`

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

The smell to watch for: reaching for `supervisorScope` because a child is throwing and you'd rather not deal with it cascading. That's not "the tasks are independent" — that's suppressing a failure signal. The propagation is a feature. If child 1 failing genuinely shouldn't affect child 2, `supervisorScope` is the right tool. If you're not sure, that's probably a sign the tasks are more coupled than they look.

## What I Took Away

**Cancellation is a request, and a coroutine that never suspends will never receive it.** The machinery doesn't push the signal in — it makes it available at suspension points, and the code has to reach one for anything to happen. A tight loop with no `delay`, no `yield`, no `withContext`, nothing — that loop will run to completion regardless of what the scope does. The gap isn't a bug in the runtime; it's in the assumption that "I cancelled the scope" and "the work stopped" are the same thing.

**Catching `Exception` in a coroutine will eventually eat a `CancellationException`, and you won't notice until something is running that shouldn't be.** `CancellationException` is a `RuntimeException`. A blanket `catch` doesn't discriminate. I've written exactly that pattern — a suspend call inside a `try-catch(e: Exception)`, a `CancellationException` walked in, and the coroutine kept doing work on behalf of a screen that had already left. The fix was a two-line rethrow. The diagnosis took considerably longer. Catch specifically, or at minimum rethrow cancellation before handling anything else.

**`supervisorScope` is a deliberate opt-out, not a cleanup tool.** Structured concurrency propagates failures for a reason — so that partial states don't silently linger, and so that one task failing doesn't leave its siblings running on stale assumptions. When `supervisorScope` is the right call, it's because the tasks genuinely don't share fate. When it's reached for because a child is throwing and the cascade is inconvenient, that's not failure isolation — that's a failure getting swallowed. The signal is still worth reading.

**Most coroutine code cancels correctly because it happens to suspend a lot, not because it was written with cancellation in mind.** Network calls, Room queries, `delay` — they're all suspension points, so they're all cancellation checks, automatically, without any extra effort. That's the free lunch, and it covers the common case thoroughly enough that the mechanism can feel like magic. The problem is that "it's always worked" is a weak basis for "it will always work." A blocking loop here, a blanket catch there, a suspend call in a `finally` block — and suddenly you're left wondering why things are still running after you told them to stop.
