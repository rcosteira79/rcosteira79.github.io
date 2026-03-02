---
title: Not All Certificate Errors Are Certificate Errors
description: A CertPathValidatorException that had nothing to do with certificates, and the missing HTTP header that caused it.
pubDatetime: 2026-03-05T00:00:00Z
author: Ricardo Costeira
ogImage: ./not-all-certificate-errors-are-certificate-errors/cover.jpg
ogImageAuthor: Jametlene Reskp
ogImageAuthorUrl: https://unsplash.com/@reskp
tags:
  - android
draft: true
---

One of those bugs where the error message looks you in the eye and tells you to go f* yourself.

## The Problem

For this new feature I was building, images from a specific domain had to load across Android, iOS, and web. iOS and web loaded them without complaint. Android was the outlier — and a confusing one, since the domain in question was the app's main production domain, just one we'd never pulled images from before. To make things worse, we only caught it close to release, when the beta build went up and the images simply weren't there. The Android app uses [Coil](https://coil-kt.github.io/coil/) for image loading in Compose, and Coil was failing with this:

```
CertPathValidatorException: Trust anchor for certification path not found.
```

For the uninitiated: a *trust anchor* is a root certificate that your device inherently trusts — the starting point of the certificate chain that Android uses to verify a server is who it claims to be. This error is Android's way of saying "I tried to validate this server's identity and couldn't establish a trusted chain." It's a real and common error class. It typically means the certificate is self-signed, the chain is broken, something's expired, or the app's network security config is missing something.

None of those were the problem. But I didn't know that yet, and the error message made absolutely sure I wouldn't figure it out quickly.

## Going Down Every Wrong Path

I checked the network security config — everything looked fine. With a release very close and the error still unexplained, the team went with the fastest thing that worked: the backend added a fallback field to one of our API responses, an alternate image URL for the same image on a different domain that always loaded. Problem "solved." Except this was the kind of solution that eventually bites you in the rear: a workaround maintained across multiple teams, indefinitely, until everyone forgets why it's there and/or it becomes an issue in the future[^1] — in this case, with two sources of truth for the same data, it was a matter of time until someone forgot to update both fields when changing images.

Some time after the release, I found the time to come back to it. This time I went deeper: checked every certificate in the chain — all valid, not expired, properly chained. Tried certificate pinning. Tried passing a custom OkHttp instance into Coil, since it creates its own by default and I wanted to rule out any quirk in how it was being initialised. Added extra logging. At one point I even spun up a brand new, empty Android project (with and without `network_security_config.xml` properly configured) that did nothing but try to load the image — no existing configuration, no layers of abstraction, just Coil and a URL. Still nothing. And yes, I did try other URLs in this new app to make sure it worked. 

The iOS and web parity made a certificate explanation hard to fully accept — if the chain were genuinely broken, it would have broken all platforms equally. So I kept at it. There may or may not have been tears at this point. 

## The Glide Experiment

Extremely close to giving up, and completely out of ideas, I had one last-ditch effort: *what if I try Glide?*

[Glide](https://bumptech.github.io/glide/) is another image loading library for Android — same idea as Coil, different choices under the hood. It was simple to swap between them since we use Glide for our View-based screens.

The image... The image loaded.

Which was satisfying and infuriating in equal measure. Same URL. Same device. Different library, different result. The certificate chain was fine — it had to be, because Glide wasn't complaining about it. The problem wasn't the backend, the network, or even the domain. It was a subtle behavioural difference between two libraries doing ostensibly the same job.

Now I was getting somewhere.

## The Missing Header

With the Glide angle to work with, I looped in Claude to brainstorm. We'd ruled out the obvious certificate causes, so the question had shifted to: what does Glide do that Coil doesn't?

Claude's suggestion: check whether Glide was automatically adding HTTP request headers that Coil wasn't sending.

Request headers are metadata that travel alongside HTTP requests. They tell the server things like what client is making the request, what content types are acceptable, and so on. One of the most standard ones is `User-Agent` — it identifies the application sending the request. Pretty much every HTTP client adds it automatically.

Except Coil doesn't. Glide does.

And the server in question was rejecting any request that arrived without a `User-Agent` header. Silently, without a helpful error message, in a way that somehow manifested as a certificate validation failure on the client side. Even the backend team was confused when I told them about this.

The fix was adding the `User-Agent` header to Coil requests. There are two ways to go about it.

**Option 1: replace Coil's OkHttp client.** Like I mentioned before, if you don't provide one, Coil creates its own OkHttp instance internally. You can substitute it with a configured client that adds the header on every request via an interceptor:

```kotlin
val imageLoader = ImageLoader.Builder(context)
    .okHttpClient {
        OkHttpClient.Builder()
            .addInterceptor { chain ->
                chain.proceed(
                    chain.request().newBuilder()
                        .header("User-Agent", "I'm an Android device, swear on me mum")
                        .build()
                )
            }
            .build()
    }
    .build()
```

The problem is that most projects already have an OkHttp instance in production — loaded up with interceptors, timeouts, auth headers, and years of accumulated configuration. Passing *that* into Coil means threading it through as a dependency, which is messy. And creating a fresh instance just for Coil, like I tried while debugging, isn't great either: OkHttp instances aren't cheap, since they manage their own thread pool and connection pool.

**Option 2: add the header at the request level.** Coil's `ImageRequest.Builder` exposes `addHeader()`, which injects the header into the individual HTTP request that Coil passes to its internal OkHttp instance. No client configuration needed. I wrapped this in a thin builder so callers don't have to remember to add it manually:

```kotlin
private const val USER_AGENT_KEY = "User-Agent"

class CustomImageRequest private constructor() {

    class Builder(private val context: Context) {
        private val coilBuilder = ImageRequest.Builder(context)

        fun data(data: Any?) = apply {
            coilBuilder.data(data)
        }

        fun crossfade(enable: Boolean) = apply {
            coilBuilder.crossfade(enable)
        }

        fun placeholder(@DrawableRes drawableResId: Int) = apply {
            coilBuilder.placeholder(drawableResId)
        }

        fun error(@DrawableRes drawableResId: Int) = apply {
            coilBuilder.error(drawableResId)
        }

        fun build() = coilBuilder
            .addHeader(USER_AGENT_KEY, UserAgentUtils.getUserAgent(context))
            .build()
    }
}
```

The callsites replace `ImageRequest.Builder` with `CustomImageRequest.Builder` and otherwise look identical:

```kotlin
AsyncImage(
    model = CustomImageRequest.Builder(LocalContext.current)
        .data(product.image.orEmpty())
        .crossfade(enable = true)
        .build(),
    placeholder = painterResource(R.drawable.placeholder),
    error = painterResource(R.drawable.placeholder),
    contentDescription = null,
    modifier = Modifier.size(94.dp)
)
```

Images loaded. The backend cleaned up their logic. The multi-team workaround went away.

## What I Took Away

**The error message was a red herring.** `CertPathValidatorException` is an almost perfect description of a completely different class of problem. I'm still not entirely sure how a missing `User-Agent` produces a certificate validation error on the client — my best guess is the server's rejection response was malformed in a way that broke the TLS handshake interpretation. Whatever the mechanism, the error was genuinely misleading, and that cost time (and the colour on some of my hairs).

**Differential debugging is underrated.** Swapping out Coil for Glide was the only thing that actually moved the investigation forward. When you're stuck on an opaque error, the most useful question isn't always "why is this failing?" — sometimes it's "does this fail with a different tool, or in different conditions?". That's also why I built a clean app to debug the issue. A different result gives you something to compare.

**AI as a rubber duck, but one that occasionally has good ideas.** Most of what Claude suggested during the initial investigation I'd already tried. But having something to think out loud with — especially once the problem was more precisely framed after the Glide experiment — was useful. The header suggestion wasn't a breakthrough insight, but it was a hypothesis I hadn't landed on myself, and it led me to the root cause way faster than if I had to dig into the libraries' code to figure out the differences myself.

**Workarounds should be workarounds.** The backend fix was good enough to ship and probably would have lived in the codebase for years. But shipping a workaround doesn't make the bug go away — it just makes it someone else's problem, spread across more people and more codebases. Finding the root cause removed a cross-team maintenance burden that nobody wanted. Worth it.

So, like it says in the title. When Android tells you there's a trust anchor problem, and everything seems to be ok with your `network_security_config`, be sus.

[^1]: As I'm writing this, I'm currently handling another one of these — this time a problem originating in web, with the workaround now bleeding into Android and iOS. But that's drama for another time.
