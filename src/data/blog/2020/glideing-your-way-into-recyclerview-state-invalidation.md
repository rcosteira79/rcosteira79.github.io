---
title: "Glide'ing your way into RecyclerView state invalidation"
description: "And Glide'ing your way out too! — A deep dive into RecyclerView state invalidation with Glide."
pubDatetime: 2020-03-09T10:00:00Z
tags:
  - android
draft: false
ogImage: ./glideing-your-way-into-recyclerview-state-invalidation/cover.jpg
ogImageAuthor: Christian Wiediger
ogImageAuthorUrl: https://unsplash.com/@christianw
---

A few days ago, I worked on a sample project for a tutorial. It was a very simple app: a list of images, where you could click any image to view it in full screen. The code was simple, well structured, did what it had to do, and did it well. There was only one problem: the `RecyclerView` responsible for showing the image list was resetting its state, i.e., its scroll position, when you came back to it after checking an image in full screen.

## A few things about RecyclerViews

Well, this can't be right... I know I'm doing everything I'm supposed to do in order for the `RecyclerView` to be able to retain its scroll position!

Given the huge amount of code samples online explaining how to manually save and restore `RecyclerView` state, it seems that a lot of people think that this isn't supposed to happen automatically. Well, it is, and it's actually quite simple to do. You just have to make sure that:

1. The `RecyclerView` has an ID.
2. You setup the `Adapter` with all the data **before** the `RecyclerView` goes through its first layout pass.

The first one is simple: you just go to the layout and add an ID to the `RecyclerView`. By default, if a `View` doesn't have an ID, its state <a href="https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android10-c2f2-release/core/java/android/view/View.java#20264" target="_blank">won't be stored</a>. This one's actually hard to miss since you're probably using an ID to access the view in the code.

The second one is trickier. It's not only a matter of setting up the `Adapter` before the `RecyclerView`. You need to make sure that when the `RecyclerView` is about to go through that first layout pass, it already has **all the data** it needs. If the layout pass starts and the `Adapter` doesn't have the same data or is empty, the `RecyclerView`'s scroll position will get reset, as its state will be invalidated. So, for instance, if an app displaying a `RecyclerView` undergoes a config change and has to send an API request for data, it'll be next to impossible for the data to arrive in time for the layout pass, which means that the `RecyclerView`'s scrolling position will inevitably be reset to the initial position.

The solution here is simple: just cache the data. For example, if you have all the data cached in a `LiveData`, something like this will work:

```Kotlin
override fun onCreateView(
    inflater: LayoutInflater,
    container: ViewGroup?,
    savedInstanceState: Bundle?
  ): View? {
  val view = inflater.inflate(R.layout.fragment_list, container, false)

  val myAdapter = createAdapter()

  setupRecyclerView(view, myAdapter)
  observeViewModel(myAdapter)

  return view
}

private fun setupRecyclerView(view: View, myAdapter: MyAdapter) {
  view.recyclerView.adapter = myAdapter

  // Other settings like listeners, setHasFixedSize, etc
}

private fun observeViewModel(myAdapter: MyAdapter) {
  viewModel.myLiveData.observe(viewLifecycleOwner) {
    myAdapter.submitList(it)
  }
}
```

By the time the `RecyclerView` starts getting drawn, the data is more than ready.

## Hello darkness my old friend

> "What am I missing?!"

This was the question I asked myself for three days. My `RecyclerView` had an ID, and my data was cached and ready on time, so what could be wrong?

I tried everything I could think of. Removing `setHasFixedSize(true)` from the `RecyclerView` setup, removing animations, using `RecyclerView.Adapter` instead of `ListAdapter`, `StaggeredGridLayout` instead of `GridLayout`, setting things up in different lifecycle methods and in different combinations, persisting everything... I even saved and restored the state manually at one point, but was not happy at all with the result (UI flickering). Going through the `RecyclerView`'s code, I could see that its state was indeed being saved and correctly retrieved, but later invalidated. I hadn't felt this mad at Android for years!

As I was close to give up on fixing the bug and on my software engineering career in general, I began browsing Slack channels. In one specific channel, I found something that <a href="https://twitter.com/JonFHancock" target="_blank">Jon F Hancock</a> said when trying to help someone else with a different `RecyclerView` problem:

> If the size of your RecyclerView depends on its children, you shouldn’t set that to true.

The "that" in the quote refers to `setHasFixedSize(true)`. But the bit that actually caught my attention was the first part: "_If the size of your RecyclerView depends on its children (...)_".

Holy crap. Could it be?

## I can see clearly now, the rain is gone

What Jon said was related to the `Recyclerview`'s size. However, it got me thinking about the size of the `RecyclerView`'s children.

So, here's the layout for the `RecyclerView` items:

```xml
<?xml version="1.0" encoding="utf-8"?>
<ImageView xmlns:android="http://schemas.android.com/apk/res/android"
  xmlns:tools="http://schemas.android.com/tools"
  android:id="@+id/image_view_image"
  android:layout_width="match_parent"
  android:layout_height="wrap_content"
  android:adjustViewBounds="true"
  android:contentDescription="@null"
  tools:src="@tools:sample/backgrounds/scenic" />
```

At a first glance, you probably won't see anything unusual. And there isn't! It's a pretty standard setup for an `ImageView`. However, this innocent code was masking a nasty bug.

The images that feed the `RecyclerView` come from an image API. The images are random, and are loaded by **Glide**. Here's the extension function for image loading:

```Kotlin
fun ImageView.load(imageAddress: String) {
  Glide.with(this)
      .load(imageAddress)
      .into(this)
}
```

Glide is smart enough to cache unmodified data, so it won't keep requesting the images from the API. However, Glide caches the images with their original size, so it will still have to resize them to fit in the `ImageView`. Not only that, but since the xml layout is setting the height for the `ImageView` as `wrap_content`, and Glide is not specifying any default size either, the latter will have to calculate the height of **each** image it loads.

This calculation takes its time, and while Glide is busy with it, the `RecyclerView` is setting up its layout. When it's ready to layout its children, it gets the height of each item so that it knows the space each of them will occupy, i.e., how many `ViewHolder` instances it needs. The `RecyclerView` reaches this step in a lot less time than Glide takes to be done with the image size calculations. As such, by having the height of the `ImageView` declared as `wrap_content`, its actual measured height **will default to zero** until it's finally displaying an image.

This effectively messes up the whole logic that comes afterwards:

1. The `RecyclerView`uses the scrolling position that comes from the previous state to know from which view it should start displaying the items.
2. Using the current position and the size of the items, the `RecyclerView` figures out how many more items it can show. It first goes from the current position to the last item, and then from the current position to the first item.
3. Since the item size is coming out as zero, it'll basically try to set **every item** in the item list as a visible item. This will then make it so that the previous state is invalidated, forcing the `RecyclerView`to reset everything and discard the scrolling position, drawing the items from the beginning.

Uff! How can you solve this then? There are a few options. You can:

- Hardcode the height in the layout

```xml
<?xml version="1.0" encoding="utf-8"?>
<ImageView xmlns:android="http://schemas.android.com/apk/res/android"
  xmlns:tools="http://schemas.android.com/tools"
  android:id="@+id/image_view_doggo"
  android:layout_width="match_parent"
  android:layout_height="200dp"
  android:adjustViewBounds="true"
  android:contentDescription="@null"
  tools:src="@tools:sample/backgrounds/scenic" />
```

- Override the view size with Glide

```Kotlin
fun ImageView.load(imageAddress: String) {
  Glide.with(this)
      .load(imageAddress)
      .override(Target.SIZE_ORIGINAL, 200)
      .into(this)
}
```

- Add a placeholder with Glide, so that the `RecyclerView` uses its height

```Kotlin
fun ImageView.load(imageAddress: String) {
  Glide.with(this)
      .load(imageAddress)
      .placeholder(R.drawable.placeholder)
      .into(this)
}
```

The main point here is that, as long as you set the height of the view **before** the `RecyclerView` tries to layout its children, you're good!

## Final thoughts

That's it for this article. Congratulations on your retained `RecyclerView` state! I hope this was helpful, or that you at least learned something new. Feel free to talk about it either in the comment section down below or at Twitter.

Until next time!
