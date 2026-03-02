---
title: "Going with the Flow: from RxJava to Kotlin coroutines - Part 1"
description: Refactoring an API request — a step-by-step guide from RxJava to Kotlin coroutines.
pubDatetime: 2019-08-19T00:00:00Z
tags:
  - android
draft: false
ogImage: ./going-with-the-flow-rxjava-to-coroutines-part-1/cover.jpg
ogImageAuthor: Denys Nevozhai
ogImageAuthorUrl: https://unsplash.com/@dnevozhai
---

I've been playing around with Kotlin's coroutines library. I had some trouble wrapping my head around the whole coroutine concept, mainly because I was consistently looking out for RxJava resemblances. Well, the truth is RxJava is one thing, and coroutines are another thing. Sure, they can be used for the same use cases, but they're two different concepts. I'll try not to go too deep into the rabit hole here, but RxJava is an API for asynchronous and/or concurrent programming that follows the **functional** and **reactive** paradigms. On the other hand, the coroutines library aims to facilitate asynchronous and/or concurrent programming, while **deferring the decision of going functional or reactive to the user**. Once I became aware of this, coroutines became a lot easier to understand. And it took me a lot less time than RxJava. I dare say that this might mean they're easier to grasp for beginners, or at least to someone that's not familiarized with RxJava.

In this article series, I'll go through a sample app built with RxJava and refactor it using the coroutines library. The plan for the series is to:

- Refactor API requests with coroutines;
- Refactor a Database event subscription with Flow;
- Refactor a UI interaction with Flow and Channels;

I will show you both implementations and explain the reasoning behind them, albeit assuming that you're at least familiar with RxJava. I will measure performance (I'm an Engineer™) and show you how can you write tests for both versions. In this article, I'll start with the refactoring that, in my opinion, lays the foundation to understand the upcoming ones - refactoring API requests with coroutines. So, let's get started.

### The app

Well, more like "The view". I didn't want to show you just small "before" and "after" code samples, but I also didn't want to make an extremely complex and hard to follow app.

<figure>
  <img src="{{site.url}}/assets/images/going-with-the-flow-rxjava-to-coroutines-part-1-1.png" alt="App screenshot"/>
  <figcaption>Design skills too stronk.</figcaption>
</figure>

The UI is composed by a `Fragment` with a search bar and a `RecyclerView` (don't mind the `BottomNavigationView`, it's there just so that I can jump between different code samples - this is my skeleton/playground project). Each `RecyclerView` item shows a card with user information. When the app starts, it checks the database for existing data, and displays it accordingly. It also queries the Github API for more data in order to update the database. The search bar filters the user list by name, and the _DELETE_ button on each card sends a delete command to the database for the corresponding user.

I'm using Room for the database and Retrofit for the Github API requests. Dependencies are provided by Dagger. The app as a whole is built using a common pattern ([Clean Architecture](http://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)). State is managed through view state and view event classes. Data flow between the view and the `ViewModel` is unidirectional. If you want to know more about the implementation details, you can check the [repository](https://github.com/rcosteira79/AndroidMultiModuleCleanArchTemplate). That said, let's dive into the API request details.

### Handling an API request with RxJava

To fetch the users we need to contact the Github API. However, some of the information we want to show, such as location or blog url, are not available in the list that the API returns. As such, we need to do another request - one for **each** user - to retrieve those details.

Given this, the app has the following Retrofit API:

```Kotlin
interface Api {
  @GET("users")
  fun getAllUsers(): Maybe<List<GithubUser>>

  @GET("users/{username}")
  fun getUserDetails(@Path("username") username: String): Maybe<GithubDetailedUser>
}
```

Yes, I could use `Observable` instead of `Maybe` here, but `Maybe` makes more _semantic_ meaning to me: maybe I'll get the response I expect, or maybe I won't. Still, `getAllUsers` returns a `List<GithubUser>` stream, and we need to operate on each individual user. So the **repository** converts this stream into an `Observable` stream of `GithubUser`. The other stream remains the same:

```Kotlin
override fun getUsersFromApi(): Observable<User> {
  return api.getAllUsers() // returns Maybe for semantic purposes - one possible response on each request.
    .flattenAsObservable { it } // However, we need to transform each element of the list
    .map { userMapper.mapToEntity(it) }
}

override fun getUserDetailsFromApi(username: Username): Maybe<DetailedUser> {
  return api.getUserDetails(username.value) // Username is an inline class. Handy for domain modeling!
    .map { detailedUserMapper.mapToEntity(it) }
}
```

Following Clean Architecture, I have `UseCase` classes connecting the `ViewModel` to the repository. Regardless, I'm skipping them here since I'm only using them to forward the calls from the `ViewModel` to the repository. This is actually something that bothers me, because according to the Clean Architecture definition, a use case is called a "use case" because it encapsulates use case logic. On Android though, we tend to keep the this logic both in the repository and the `ViewModel` (at least in most Clean Architecture implementations I've seen so far). In other words, the `UseCase` classes are used only to improve code readability - as their intent is, by nature, straightforward - and define boundaries. Since most of the work done by an Android app is fetching data from wherever and showing it on the screen, one might wonder if the extra classes, extra maintenance effort, extra performance cost and extra APK size increase are really worth it. Anyway, this is a subject for another article, maybe. Back to the refactoring.

The API is ready, and the repository is ready. Now we just need to make the call in the `ViewModel`, and subscribe to it:

```Kotlin
// Gets users from the api and stores them in the database
private fun updateCache() {
  getUsersFromApiAsSingle()
    .doOnSuccess { Logger.d("Updating database") }
    .subscribeOn(Schedulers.io())
    .subscribe(
      { updateCachedUsers(it) }, //onSuccess
      { handleErrors(it) } // onError
    )
    .addTo(compositeDisposable) // Extension function
}

private fun getUsersFromApiAsSingle(): Single<List<DetailedUser>> {
  return getUsersFromApi(NoParameters()) // NoParameters is a UseCase implementation detail
    .take(10) // Github API has a hourly call limit :D and 10 are more than enough for what we're doing
    .flatMapMaybe { getUserDetailsFromApi(it.username) } // 2nd api call with information from the 1st one
    .toList() // gather all stream events back into one Single list
}
```

I'm going to pretend I don't have all these layers and boundaries for a second, so that the whole process is easier to visualize:

```Kotlin
api.getAllUsers() // returns Maybe for semantic purposes - one possible response on each request.
  .flattenAsObservable { it } // However, we need to transform each element of the list
  .map { userMapper.mapToEntity(it) }
  .take(10) // Github API has a hourly call limit :D and 10 are more than enough for what we're doing
  .flatMapMaybe { // 2nd api call with information from the 1st one
      api.getUserDetails(username.value)
          .map { detailedUserMapper.mapToEntity(it) }
  }
  .toList() // gather all stream events back into one Single list -> Single<List<DetailedUser>>
  .doOnSuccess { Logger.d("Updating database") }
  .subscribeOn(Schedulers.io())
  .subscribe(
    { updateCachedUsers(it) }, //onSuccess
    { handleErrors(it) } // onError
  )
  .addTo(compositeDisposable) // Extension function
```

Ok, so what's happening here?

- We send a request to the API and get back a `Maybe<List<GithubUser>>` stream;
- We flatten the list into an `Observable<GithubUser>` stream;
- We map each element to a domain entity called `User` (even though I'm pretending there are no boundaries, I left this mapping on purpose since it's part of the stream's operations);
- We take the first ten elements just because we'll have to do another API call for each user, and Github has a very low limit for unauthenticated requests;
- We use `flatMapMaybe` to get the user details for each of the ten users, and map each one of the returned objects (`GithubDetailedUser`) to a domain entity called `DetailedUser`. Why `flatMapMaybe` instead of a regular `flatMap`? Because the `getUserDetails` API call returns a `Maybe<GithubDetailedUser>`, and a simple `flatMap` requires that you provide it with the same kind of stream you apply it on, since it has to return the same type (in this case, an `Observable` stream). As such, `flatMapMaybe` is expecting a Maybe stream as its parameter, and returns an `Observable` stream at the end;
- After `flatMapMaybe` does its magic and flattens the incoming streams into one `Observable<DetailedUser>` stream, we call the `toList` operator, which in turn will output a `Single<List<DetailedUser>>` stream;
- Finally, we do some logging, bind all operations to a thread from the IO pool and subscribe to the whole thing. Since the last operation outputs a `Single` stream, the observer only has two functions: an `onSuccess` lambda that calls the `updateCachedUsers` method, and an `onError` lambda that calls the `handleErrors` method. If everything goes through the happy path, `updateCachedUsers` then proceeds to update the database with the information it gets as parameter, i.e. a `List<DetailedUser>`. The lack of an `observeOn` operator is not a bug: `updateCachedUsers` is supposed to run in the background, so we can keep the stream running in the same thread.

Whew. That's a whole lot of stream operations. But it does exactly what we want: it fetched data from a remote API and updates the local database, all in an asynchronous - and partially concurrent, thanks to the flatMapMaybe - fashion. Let's see how can we do the same with coroutines.

### Coroutines

First, I want to talk a little about how coroutines work in Kotlin. I'll only graze the surface on the topic, but it should be enough to get you started. To make it easier to process, I'll talk about the basic coroutine theory now, and then talk about the practical concepts as they show up while refactoring. If you already understand how coroutines work under the hood, you can skip to the next section.

So, a coroutine is a construct meant to turn async programming into a walk in a park. They are usually referred to as _lightweigth threads_, since they are so much lighter to use than a regular thread. On Android at least, a typical thread occupies 1 to 2 MB of memory (that's why we love thread pools!). Each Java thread gets mapped to a kernel thread, which means that the OS manages them. The OS then schedules which thread runs at a given time, jumps between them (context switching), has to invalidate cache in the process... All of these and other related operations have their performance cost.

Coroutines are executed in threads. These threads come from thread pools managed by coroutines themselves. Coroutines are not bound to any particular thread, which means that they can start in one thread, _suspend_, and resume in another thread. Since this process is fully managed by coroutines through `Continuation`s, we don't get the context switching overhead (more on this in a minute). They also aren't managed by the OS, which automatically frees us from the thread scheduler overhead mentioned above. The coroutine object in itself has a small memory footprint (bytes), which means that you can have a bunch of them being executed at the same time without having to worry about running out of memory. There are a few examples online where people launch 100.000 coroutines at the same time without having any problems at all, while getting an OutOfMemoryException when they try to do the same with regular threads.

I mentioned `Continuation` before. This happens to be one of the most important aspects about coroutines, if not the most important. Kotlin coroutines implement what is called a **continuation passing style**. Whenever you write a **suspendable function** (you've probably seen `suspend fun` written somewhere by now), you're letting Kotlin know that this function is to be executed in a coroutine. Why? Because under the hood, the compiler translates the `suspend fun` to a function that receives a `Continuation` as a parameter! So, when you write something like this

```Kotlin
suspend fun login(user: User): Token { ... }
```

It gets decompiled to something similar to

```Java
Object login(User user, Continuation<Token> continuation) { ... }
```

Every time a coroutine suspends, it stores its state in the continuation. When it wants to resume its execution, it only has to check the continuation for the information it needs, and that's it. This seamless suspend-resume process is what allows us to write seemingly **sequential** code instead of callbacks for async work. Whenever there's async work to be done, the coroutine suspends, and later resumes when the work is done. Meanwhile, the world keeps spinning like nothing's going on, as this suspension **does not** block the thread the coroutine is running on. In fact, while this coroutine is suspended, another coroutine can immediately start some work on the same thread.

Ok, you're still reading. I know this is a lot, but hopefully it'll help you understand things when we get our hands on the code (it certainly did help me).

### Handling an API request with coroutines

Retrofit has native support for coroutines, so the first step is to add the `suspend` keyword to the methods and change their return parameters:

```Kotlin
@GET("users")
suspend fun getAllUsers(): List<GithubUser>

@GET("users/{username}")
suspend fun getUserDetails(@Path("username") username: String): GithubDetailedUser
```

Easy enough. Now, propagate the same changes to the repository:

```Kotlin
override suspend fun getUsersFromApi(): List<User> {
  return api.getAllUsers()
    .map { userMapper.mapToEntity(it) }
}

override suspend fun getUserDetailsFromApi(username: Username): DetailedUser {
  val detailedUser = api.getUserDetails(username.value)
  return detailedUserMapper.mapToEntity(detailedUser)
}
```

It's not that different from what we had before. We're still just mapping the data entities to domain entities. Nothing more.

Next up is the `ViewModel`. Here is where the differences are noticeable:

```Kotlin
private fun updateCacheWithCoroutines() {
  // I don't like try-catch. So we're using an exception handler instead
  val exceptionHandler = CoroutineExceptionHandler { _, throwable ->
    handleErrors(throwable)
  }

  // we want the coroutine to be bounded to the `ViewModel`'s lifecycle (it's on the main thread)
  viewModelScope.launch(exceptionHandler) {
    // But the request should go to the backgound
    withContext(Dispatchers.IO) {
      getUsersFromApiThroughCoroutine(this)
    } // Don't forget: at this point, we're in the main thread context again!
  }
}

private suspend fun getUsersFromApiThroughCoroutine(coroutineScope: CoroutineScope) {
  val userList = getUsersFromApi(NoParameters()) // List<User>
    .take(10) // Github API has a hourly call limit :D and 10 are more than enough for what we're doing
    .map { coroutineScope.async { getUserDetailsFromApi(it.username) } } // Yay parallelism!
    .map { it.await() } // Wait for them to finish... These two last maps are pretty much a flatMap

  if (userList.isNotEmpty()) {
    Logger.d("Updating database")
    updateCachedUsers(userList)
  }
}
```

Before I start explaining what's happening here, there are a few keypoints that you need to be aware of (if you know how coroutines are launched and what contexts and jobs are, you can skip to the next code snippet):

- Coroutines are launched through a `CoroutineBuilder`. The typical ones are `launch` and `async` (theres also `runBlocking`, which we'll use for testing). As you can see above, you can launch coroutines inside coroutines: we're launching coroutines with `async`, while in another coroutine that was launched by `launch`. The `async` builder is used for concurrent tasks. You execute concurrent coroutines with it and wait for them with the `await` suspending function, which suspends the parent coroutine until the async children finish;
- `Dispatchers` are used to confine coroutine execution to specific threads. They are used either with a `CoroutineBuilder` or with the `withContext` suspendable function;
- Every coroutine is bound to a `CoroutineScope`. These scopes let you bind the coroutine to specific lifecycles. `CoroutineBuilder`s are actually extension functions defined in `CoroutineScope` types (except for `runBlocking`). On Android, we probably want to avoid `GlobalScope`, which is meant for coroutines that run throughout the app's lifetime. In the code, I use a `ViewModelScope` to bind the coroutines to the `ViewModel`'s lifecycle;
- Coroutines can be cancelled. We can cancel them either by throwing a `CancellationException` or through a `Job`. Every coroutine is associated with a `Job`. Canceling a `Job` will cancel its coroutine. `Job`s can form parent-child hierarchies, where cancellation of the parent also cancels all children, and failure/cancellation of a child also cancels the parent (except if the child throws a `CancellationException`). There's also the `SupervisorJob`, where a child can fail without affecting other children or the parent. The typical way to obtain a coroutine's `Job` is either by storing the return value of the `launch` builder, or by accessing it directly inside the coroutine;
- Just like Android, coroutines have a **context**. It's main elements are the coroutine's `Job` and `Dispatcher`. When the coroutine is launched, we have the choice of passing a `CoroutineContext` to the builder. If we don't, it'll use a default one. We can also change the coroutine's context later through the `withContext` function. A bunch of different classes implement the `CoroutineContext` interface, which is really handy (for instance, `Dispatchers` implement it, so we can pass them to a `CoroutineBuilder` or `withContext`).

Back to the code. Like I did with the RxJava version, I'm going to pretend that there are no layers and join the whole thing:

```Kotlin
// I don't like try-catch. So we're using an exception handler instead
val exceptionHandler = CoroutineExceptionHandler { _, throwable ->
  handleErrors(throwable)
}

// we want the coroutine to be bounded to the `ViewModel`'s lifecycle (it's on the main thread)
viewModelScope.launch(exceptionHandler) {
  // But the request should go to the background
  withContext(Dispatchers.IO) {
    val userList = api.getAllUsers()
      .map { userMapper.mapToEntity(it) }
      .take(10) // Github API has a hourly call limit :D and 10 are more than enough for what we're doing
      .map {
        async { // Yay concurrency!
          val detailedUser = api.getUserDetails(it.username.value)
          detailedUserMapper.mapToEntity(detailedUser)
        }
      }
      .map { it.await() } // Wait for all calls to finish... These two last maps are pretty much a flatMap

    if (userList.isNotEmpty()) {
      Logger.d("Updating database")
      updateCachedUsers(userList)
    }
  } // Don't forget: at this point, we're in the main thread context again!
}
```

Lets begin:

- We start by creating a `CoroutineExceptionHandler`. Coroutines bubble up exceptions all the way to the top-most coroutine, so instead of having `try-catch` blocks all over the place, we pass an exception handler **to the top-most coroutine**. This handler works for simple cases, as it will handle all exceptions (note that child coroutines can still have their own exception handling mechanisms);
- We `launch` a coroutine on the `viewModelScope` and pass it the exception handler (`CoroutineExceptionHandler` also implements `CoroutineContext`). By launching the coroutine on this scope, we're also binding it to the **main thread**. On a side note, we need to clear all the `viewModelScope`'s `Job`s at the end of the `ViewModel`'s lifecycle, just like we do with Rx's `CompositeDisposable`;
- As soon as we start the coroutine, we change its context so that it'll run on the IO thread pool. Now, this is **very** important: the code inside `withContext`'s lambda will run on an IO thread. As **soon** as the lambda ends in line 25, we're back to the main thread! Unlike RxJava where we're used to bind the upstream to a thread and the downstream to another thread, coroutines rely on the actual **blocks** of code. In other words, everything inside the `launch {}` block will run on the main thread, but since we explicitly specify that an inner block should run on an IO thread with `withContext`, so it will be;
- We get the users from the API, map them to domain entities and take the first ten;
- Now for the other interesting bit. For each `User`, we're launching a new coroutine with `async` in order to fetch the details from the API. We then map each response item to a domain entity. Due to the `async` calls, this `map` will return `List<Deferred<DetailedUser>>`, as each `async` returns a `Deferred<T>` type. All `async` calls effectively run in a concurrent manner;
- Right below, we have another `map` being called. We're calling it so that we can call `await` on each of the `Deferred` values, in order for the coroutine to suspend until they all finish. In the end, by using this `map` together with the one with the `async` calls, we're mimicking what an Rx's `flatMap` would do;
- That's it. The rest is just sequential, normal code. However, a side note on this. `updateCachedUsers` is a call that gets propagated through the repository until it triggers Room to actually update itself with the new data. Now, the caveat: if the actual Room function was a `suspend` function, this `updateCachedUsers` call above would have to be out the `withContext` block, and be executed in the main thread. As it turns out, Room `suspend` functions are **main-safe**, as Room uses its own custom `Dispatcher` - calling it from any other thread other that main will only slow things down.

### Final words

This concludes the part 1 of this series. I wanted to include both testing and performance measurements for this refactoring in this article as well, but damn, this is already huge as it is. That said, in part 2 I'll be writing about how can you unit test both implementations (although I don't agree that you should in this specific case, but I'll explain why in the article) and compare them both in terms of performance. I'm expecting them to be really close to each other in execution time, but I'm rather curious with the memory footprint of each implementation. If I had to bet, I'd say that RxJava is heavier on memory usage, but we'll see.

As for RxJava vs. coroutines... Well, as I said in the beginning, you really can't compare two different things. The only thing I can say right now is that both are really fun to use, and if your RxJava use case is one where you only use it for async work **and you're looking for an alternative**, you should totally consider coroutines.

<hr>

Thank you so much for taking your time to read this. Do you have any thoughts or opinions? If so, please leave a comment or reach out on Twitter. See you in part 2!
