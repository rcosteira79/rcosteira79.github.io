---
title: Never Trust a Trust Anchor
description: One or two sentences describing the post. Used in listings, SEO, and social sharing.
pubDatetime: 2026-01-01T00:00:00Z
author: Ricardo Costeira
tags:
  - android
draft: true
# Optional fields:
# modDatetime: 2026-01-02T00:00:00Z   — set when editing a published post
# featured: true                       — shows in the featured section on the home page
# socialPost: "Custom message for social sharing. Supports {title}, {description}, {url}."
---

Intro paragraph.

## Section

I have to pick the problem I solved last week (as of this writing), since it impacted a few different teams at my current work, and it was quite challenging to figure out – even though the final fix is super simple. Gonna get a bit technical here and I don't know who'll read this, so I'll try to translate it into "normal people language" as I go. I was trying to display an image with Coil (image loading library, can fetch, load and display images from URLs) in Compose (UI toolkit on Android, it's how you build the screens). Usually, this is just plug and play. However, for a particular domain (that "something.com" part you have in URLs), images weren't being loaded. As I started investigating it, all I was getting back from Coil was an exception (this kind of error that code returns to let developers know something went wrong or was unexpected) stating something like "CertPathValidatorException: Trust anchor for certification path not found.". This suggests that there's some missing certificate to let the server (or the app) know that we (or the server!) mean no harm, or that something's wrong with the network configuration. All the certificates were seemingly in place, and the app's network config also had everything that it's supposed to have, so as a workaround for this (we were out of time due to a pending release), backend added an extra field in one of our request responses where we could get a different URL for the image (using a different domain, that we knew always worked). The problem was that this workaround required a coordinated effort of multiple teams to maintain, which is definitely not ideal. So I kept investigating, brainstorming with Anthropic's Claude what could be the reason. Didn't really give me a lot of help or new ideas different to what I'd already tried: changing the network config parameters, checking for invalid or expired certificates, extra logging, passing my own OKHttp (library that handles all the intricacies of a network request) instance into Coil (it'll create its own if you don't), etc. Until I had the idea of trying a different image loading library, Glide. With Glide, the image loaded! So it was something that Coil was doing differently. After talking with Claude about it, it suggested that Coil could be missing request headers (bits of information that you add to a network request, that the server then uses to better understand who you are, where you come from, and what you want). Turns out, that was it! Glide add this "User-Agent" header automatically, while Coil doesn't, and the domain was rejecting any requests that came in without it. Adding the header to Coil requests completely fixed the issue, also allowing the backend to simplify a lot of logic on their end.