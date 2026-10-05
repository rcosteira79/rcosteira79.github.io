---
title: "Coroutines Need Your Cooperation"
description: Most coroutine code cancels correctly without you even trying. Sometimes, though, it might need a little push from you.
ogImage: ./coroutines-need-your-cooperation/cover.jpg
ogImageAuthor: Vardan Papikyan
ogImageAuthorUrl: https://unsplash.com/@varpap
pubDatetime: 2026-10-05T00:00:00Z
author: Ricardo Costeira
tags:
  - android
  - kotlin
draft: false
socialPost: "Been seeing a lot of coroutine cancellation issues and misconceptions in the wild, so I did a little write-up on the most common ones. Check it out 👉 {url}"
---

I regularly interview candidates for Android positions. Lately, I've been interviewing at least one person every week. In these interviews, candidates have to implement a few simple features in a very simple, two-screen (list-detail) app. This might sound weird, but it's always surprising to me when someone can handle coroutine cancellation properly. That's because, at this point, the vast majority of candidates I talk with either don't know how to do it, or know about it but somehow mess it up anyway. So, in this post I'll talk about a few cases I've seen, and how to fix them.

## The happy path

Coroutine cancellation is great. You launch your coroutine in your `ViewModel`, have it do its work, the user navigates away, `viewModelScope.cancel()` gets called, the scope gets cleaned up, things stop running, resources are freed. Since the suspend functions from `kotlinx.coroutines` and most libraries check for cancellation automatically, the code does the right thing without you asking. Usually. The problems start when you stray away from the happy path. These problems usually stem from one or more of the factors below:

- **Not all code checks for cancellation**: Cancellation signals are checked at suspension points (more on this later). Coroutine code that you write won't have suspension points unless it calls functions from `kotlinx.coroutines` or from specific libraries that already introduce the suspension points for you.

- **Not all `catch` blocks are as innocent as they look**: A `try-catch(e: Exception)` that you skilfully craft to handle any exceptions your code might spit out will also swallow `CancellationException`. Your error handling then treats cancellation as an error, and the coroutine carries on with work it should have dropped, after looking the `CancellationException` in the eye and saying "How about no?"

- **You break <a href="https://kotlinlang.org/docs/coroutines-basics.html#coroutine-scope-and-structured-concurrency" target="_blank">structured concurrency</a>**: Coroutines follow this thing called structured concurrency. As far as cancellation is concerned, this means that cancelling the parent coroutine also cancels the children. You break structured concurrency, you break this relationship.

We'll explore all of these as we go.

## What "cooperative" actually means

Where I live, there's a trampoline park called Jump City. You pay for your entrance in one-hour batches, and you go have fun jumping around and trying not to knee any little kids in the face. Every hour, there's a warning saying that an hour has passed. At that point, you have to _cooperatively_ (hah) leave the trampolines. If you're not actively listening to the warning, you'll just happily stay there until eventually someone comes and asks you how long you've been there and how long you actually paid for (a friend told me, never happened to me).

Coroutine cancellation works the same way. The parent scope (or the coroutine's job) doesn't reach in and stop your coroutine. Instead, it sets a cancellation flag[^1]: whether the coroutine actually stops depends entirely on its code checking that flag. If it does, great, it sees the cancellation and unwinds cleanly. If it doesn't, the flag just sits there, ignored, while the coroutine keeps running.

In practice, this check triggers a `CancellationException` at the next suspension point. Even if one suspension point gets its `CancellationException` swallowed, the next one throws it again. Every `suspend fun` call from the API — `withContext`, `delay`, and all their friends — is a suspension point and, as such, a potential interruption trigger. The same applies to any suspending calls from libraries like Retrofit or Room, which handle cancellation for you under the hood. When the coroutine reaches one of those points after cancellation was requested, the exception is thrown, the coroutine cleans up, and that's that. If cancellation happens and the coroutine has no suspension points to find out about it, then it won't cancel. In this case, the coroutine will simply keep churning until it either finishes work or the process gets terminated.

## Most code cooperates effortlessly

If your coroutine code is doing I/O, hitting the network, or querying a database through suspending APIs, you're most likely already cooperating with cancellation. As already mentioned, as long as you're using a proper library, every one of those calls is a suspension point, and every suspension point is a cancellation check. You didn't opt in or write any extra code. It just works, because the code for it to work was written for you, and suspension happens often enough that cancellation always has somewhere to land.

Most Android app code follows the same pattern: a coroutine launches from the `ViewModel`, jumps through a few boundary hoops until it reaches one or more data sources, and circles back. Through all of that, the code probably hits at least one `withContext`, maybe a Room or a Retrofit call. Since all of those check for cancellation, you're golden. Well, best-case scenario 😄

## When it stops cooperating

Now imagine you have some coroutine code that doesn't call anything from the coroutines API except `launch`. Something like:

```kotlin
var fileSavingJob: Job? = null

// ...

fileSavingJob = someCoroutineScope.launch(Dispatchers.IO) {
    val fileIsSaved = saveFile(file, fileName) // Takes longer the larger the file is

    if (fileIsSaved) {
        // Show success information to user
    } else {
        // Tell user what happened
    }
}

// ...

fun cancelSaving() {
    fileSavingJob?.cancel()
}

private suspend fun saveFile(file: File, fileName: String): Boolean {
    val destination = File(storageDirectory, fileName)

    file.inputStream().use { input ->
        destination.outputStream().use { output ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            var bytesRead = input.read(buffer)

            while (bytesRead != -1) {
                output.write(buffer, 0, bytesRead)
                bytesRead = input.read(buffer)
            }
        }
    }

    return destination.length() == file.length()
}
```

Let's say you're saving a 20 MB file, and the user cancels it right when it starts. `fileSavingJob?.cancel()` does cancel the coroutine, but the coroutine simply ignores it because there's no code in it that looks at cancellation signals. In the end, the user cancelled the save, but might still get a message stating that the file was saved successfully.

For cases like these, you have to explicitly (and periodically) check for cancellation yourself. A possible fix would be:

```kotlin
private suspend fun saveFile(file: File, fileName: String): Boolean {
    val destination = File(storageDirectory, fileName)

    file.inputStream().use { input ->
        destination.outputStream().use { output ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            var bytesRead = input.read(buffer)

            while (bytesRead != -1) {
                currentCoroutineContext().ensureActive() // Throws CancellationException if cancelled
                output.write(buffer, 0, bytesRead)
                bytesRead = input.read(buffer)
            }
        }
    }

    return destination.length() == file.length()
}
```

Note that this doesn't delete the file parts already written, but that's not the point here. That `ensureActive()` call checks whether the coroutine should keep going, saving you from writing the whole file if it shouldn't. `ensureActive()` needs a `CoroutineScope` receiver, which a plain `suspend fun` doesn't have. Hence the `currentCoroutineContext()` in front of it. FYI, there are other ways to check for cancellation (like `yield()`), but I find `ensureActive()` clearer about the intent.

## The bane of my existence

You've probably seen code like this:

```kotlin
someCoroutineScope.launch {
    val tomatoes = try {
        fetchTomatoes() // API call
    } catch (e: Exception) {
        handleError(e)
    }

    // More work
}
```

If not this exact code, maybe you've seen some kind of exception handling somewhere in the coroutine's control flow. Can you see the problem with this? This right here is the main reason why I'm writing this blog post. I don't have enough fingers to count how many times I've seen code similar to this when reviewing interview exercises. This swallows cancellation!

`CancellationException` extends `IllegalStateException`, which extends `RuntimeException`, which in turn extends `Exception` (which extends `Throwable`, also a common alternative for these `try-catch` blocks). As such, this `catch` will handle a cancellation exception as some kind of app error instead of letting it through, forcing the coroutine to carry on its work when it should have stopped already.

Another common case you might've seen. Something like:

```kotlin
suspend fun countGoodTomatoes() = runCatching {   // It's a trap!!!
    val myTomatoes: List<JuicyTomato> = getTomatoes()

    if (myTomatoes.any { it.isRotten }) {
        throw RottenTomatoException()
    }

    myTomatoes.size
}
```

`runCatching` is pretty cool for railway-oriented programming style, I love it. However, take a look at how it works under the hood:

```kotlin
public inline fun <R> runCatching(block: () -> R): Result<R> {
    return try {
        Result.success(block())
    } catch (e: Throwable) {
        Result.failure(e)
    }
}
```

Remember how I said `Exception` extends `Throwable`? Yeah 🫡

So, what are your options here? Well, the fix is very simple. You have to force the code to cooperate. This involves no threats or intimidation tactics. Instead, you simply rethrow `CancellationException`. Picking up on the `runCatching` example, what I usually do is create a suspending version of it, identical to the original but with the exception rethrowing logic:

```kotlin
suspend inline fun <R> suspendRunCatching(block: suspend () -> R): Result<R> = try {
    Result.success(block())
} catch (cancellation: CancellationException) {
    throw cancellation // Just rethrow it!
} catch (throwable: Throwable) {
    Result.failure(throwable)
}
```

That's it. You're back to being a law-abiding developer. Just have to make sure you don't swallow this `CancellationException` somewhere else after rethrowing it (I've seen it happen, and I wish I was kidding). If, for some reason, you don't want to have that `throw` in your code, you can still stay safe: just don't catch any of the types that `CancellationException` extends. As long as you keep that in mind, Kotlin handles everything for you.

## You were supposed to clean up, not set the dumpster on fire

Another easy-to-miss case. Suppose you have some cleanup to do after some code runs, and you decide to go with a `try-finally` block:

```kotlin
viewModelScope.launch {
    try {
        doWork()
    } finally {
        saveProgress()
    }
}
```

If that `saveProgress()` is a suspend fun, you might run into issues during cancellation. If the coroutine gets cancelled, `finally` still gets called. The problem is that the moment `saveProgress()` hits a suspension point, it finds out about the cancellation and stops. In other words, your progress might not be saved.

The fix for this one is also straightforward:

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

That `withContext(NonCancellable)` ignores any kind of cancellation in its block: `NonCancellable` is actually a `Job` that is always active and can't be cancelled, and `withContext` replaces the original `Job` with `NonCancellable` for this block.

One thing to keep in mind here. `NonCancellable` should only appear in `finally` blocks for actual cleanup. Since whatever you put inside a non-cancellable block **does not cancel**, if it hangs, the parent scope can't do anything about it. So, reserve it for quick work that _really_ needs to run at the end.

## Someone else's child

Here's another one I've seen in an interview exercise. This is a pattern you've almost certainly written: search-as-you-type. The user types, you debounce so you're not hammering the network on every keystroke, and you kick off a search when they pause.

```kotlin
private fun observeSearchQuery() {
    viewModelScope.launch {
        uiState
            .map { it.searchQuery.trim() }
            .distinctUntilChanged()
            .debounce(SEARCH_DEBOUNCE_MILLIS)
            .collect { query ->
                loadCoffeeShops(query) // leads to an API request
            }
    }
}
```

This code has two issues. The first and fairly straightforward one is that `collect` should be `collectLatest` instead. Using `collectLatest`, you cancel the previous block (i.e. the previous `loadCoffeeShops` call) when a new value arrives. In other words, when the user types another letter, the in-flight search for the old query gets thrown away and replaced. Exactly what search-as-you-type wants.

This leads us to the second problem. A bit harder to find since it's an implementation detail. Check out `loadCoffeeShops`:

```kotlin
private fun loadCoffeeShops(query: String) {
    viewModelScope.launch {              // <-- The footgun: launch always creates a new coroutine!
        val shops = searchCoffeeShops(query)
        _uiState.update { it.copy(coffeeShops = shops) }
    }
}
```

Even with `collectLatest`, the search doesn't run inside the block. The block does call `loadCoffeeShops`, but due to that `viewModelScope.launch`, the search itself is fired in a _separate_ coroutine, and `loadCoffeeShops` returns immediately. As far as `collectLatest` is concerned, the block did next to nothing and finished, so there's nothing left running for it to cancel.

Since every incoming query triggers a new coroutine without cancelling the previous one (if still in flight), you can easily run into concurrency issues. On a slow/troubled connection, a request for "Pour Decisions" can still be running when the request for "Pour Judgement" goes out. You now have a race to update `_uiState`, and whichever finishes last wins. All you need is for "Pour Decisions" to take some more time finishing, and you get the wrong coffee shop in the search results. Due to your pour judgement. I'll walk myself out.

What makes this hard to spot is that the call site looks innocent. `loadCoffeeShops(query)` reads like ordinary work happening inside the collector, so you'd assume it's a child of the coroutine running `collectLatest` and dies with it. But the `viewModelScope.launch` buried inside attaches the work to `viewModelScope` instead, making it a _sibling_ of the collector, not a child. Explicit cancellation[^2] only flows downward, parent to child.

I strongly suspect that the candidate who wrote this code tripped themselves up by accident: they used `loadCoffeeShops("")` to load the first list of coffee shops to display when the screen launched. In that case, the `viewModelScope.launch` made sense, all things considered. But then, they failed to update the method when reusing it for the actual search. Smells like a wrong **DRY** application, but that's a different blog post.

Anyway, for completeness' sake, the fix. Just use `collectLatest` and remove the `launch`:

```kotlin
private fun observeSearchQuery() {
    viewModelScope.launch {
        uiState
            .map { it.searchQuery.trim() }
            .distinctUntilChanged()
            .debounce(SEARCH_DEBOUNCE_MILLIS)
            .collectLatest { query ->
                loadCoffeeShops(query)
            }
    }
}

private suspend fun loadCoffeeShops(query: String) {   // suspend, no inner launch
    val shops = searchCoffeeShops(query)
    _uiState.update { it.copy(coffeeShops = shops) }
}
```

This way, `collectLatest` can properly cancel the previous block whenever a new query arrives.

## Main takeaways

The TL;DR mainly boils down to three things:

- Cancellation is cooperative, and it's something you need to consider depending on your use case.
- `CancellationException` is a control signal, not an error — so don't treat it like one 😄. Always rethrow it, or don't catch it at all.
- Be mindful that some library methods use `try-catch` internally. `runCatching` is definitely the biggest trap here.

Now go make sure your codebase doesn't have `runCatching` sprinkled all over your coroutines, like mine had for years 😉

[^1]: Internally it's a bit more complex than a simple flag, but no need to dig that deep here.

[^2]: I say "explicit" here because a failed child coroutine can cancel its parent, unless the parent uses a `SupervisorJob`.
