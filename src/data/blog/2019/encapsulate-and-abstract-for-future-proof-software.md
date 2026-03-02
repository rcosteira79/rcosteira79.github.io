---
title: Encapsulate and abstract for future proof software
description: Change is coming — how design principles help you write future-proof code.
pubDatetime: 2019-04-22T10:00:00Z
tags:
  - android
draft: false
ogImage: ./encapsulate-and-abstract-for-future-proof-software/cover.jpg
ogImageAuthor: Bennett Tobias
ogImageAuthorUrl: https://unsplash.com/@bwtobias
---

Change will always affect your software. No matter the domain, the uses cases, the developers, or even the users. Change is the one constant in software development.

This is one of the first topics addressed by the authors of the renowned [Head First Design Patterns](http://shop.oreilly.com/product/9780596007126.do). They approach it as one reason for the importance of design patterns. As they say in the book:

> "No matter how well you design an application, over time an application must grow and change or it will _die_."

Along with design patterns, the authors also introduce a bundle of design principles. While the patterns are outside the scope of this article, I want to focus on the first two principles:

- **Encapsulate what varies.**
- **Program to interfaces, not implementations.**

The first principle is the basis for all design patterns, and most of them also make use of the second one. The first one dictates that if you have code that keeps changing, pull it out and isolate it. The second principle complements this through the use of interfaces.

Now, a word of caution. As [Vasiliy Zukanov](https://medium.com/@techyourchance) explained in [this comment](https://medium.com/@techyourchance/i-havent-read-head-first-design-patterns-yet-but-i-heard-that-it-s-a-worthy-book-b53f72e9b495), this “interface” does not refer to the interface construct seen in some OOP languages. Well, it can refer to it, but it has a broader meaning. Here, “interface” refers to a component’s external point of interaction. It is what other components can use to interact with the specific component. So, this “interface” can be an interface, an abstract class, a normal class or even a function. It can be anything as long as it serves as a communication point with the component. With it, we need not know the inner details of the component. It lets us **abstract** from the component’s implementation. So, whenever there’s a change, you only need to refactor the corresponding code. The outside code will never even notice it. The purpose of the principle is indeed to focus on **what** the code does, and not **how** it does it.

### A ticking time bomb: Android Libraries

The Android open source community is awesome. No matter the complexity of what you need, a library implementing it is likely to exist already. This not only makes our jobs easier but also lets us focus on the true business logic problems.

Yet, things change (I know). Libraries become obsolete. Sometimes, new versions introduce breaking changes. Requirements change, and we no longer need a library. External changes force us to change our code. We’re left with a huge codebase full of deprecated dependencies or code built around them. This is where the design principles mentioned above come in handy.

Suppose that you need to store/retrieve a Configuration object on/from disk in JSON format. You have experience with Gson from previous projects, so you use it. You defined Configuration as:

```kotlin
data class Configuration(
  val aNumber: Int,
  val somethingWithCharacters: String)
```

You first start by creating an abstraction for Gson. Here, a simple class will do (unless you’re using [Clean Architecture](http://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html): in that case, you would probably have this class implement an interface):

```kotlin
/** Imports */

class ConfigurationStorageHandler {

  private val gson: Gson

  // ...

  fun read(): Configuration {
    val jsonConfiguration = /** Get json string from disk */
    return gson.fromJson(jsonConfiguration, Configuration::class.java)
  }

  fun write(configuration: Configuration) {
    val jsonString = gson.toJson(configuration)
    /** Store jsonString on disk */
  }
}
```

Then, you use it along with the rest of your product:

```kotlin
class MagicBusiness constructor(
  private val configurationStorageHandler: ConfigurationStorageHandler
) {
  // ...

  fun doMagicAccordingToConfig() {
    val config = configurationStorageHandler.read()
    /** use config for magic */
  }

  fun saveConfigForLateNightMagic(configuration: Configuration) {
    /** 10x programmer magic */

    configurationStorageHandler.write(configuration)
  }
}
```

```kotlin
class MagicActivity : AppCompatActivity() {

  // ...

  override fun onCreate(savedInstanceState: Bundle?) {
    // ...
    val storageHandler = ConfigurationStorageHandler()
    val magicBusiness = MagicBusiness(
      configurationStorageHandler = storageHandler
    )
    // ...
  }

  // ...
}
```

Time goes by, and your abstraction gets sprinkled throughout your code. One day, you come across this hip library called Moshi, that also deals with json parsing. Moshi seems to be faster, more flexible, and works like a charm when used together with Retrofit. You got to use it.

Luckily, you saw this coming. You use Gson everywhere in your code. But since you have it encapsulated, you can swap it with Moshi almost for free!

Simply replace Gson with Moshi:

```kotlin
/** Imports */

class ConfigurationStorageHandler {

  private val moshi: Moshi

  // ...

  fun read(): Configuration {
    val jsonConfiguration = /** Get json string from disk */
    val adapter = moshi.adapter(Configuration::class.java)

    return adapter.fromJson(jsonConfiguration)
  }

  fun write(configuration: Configuration) {
    val adapter = moshi.adapter(Configuration::class.java)
    val jsonString = adapter.toJson(configuration)
    /** Store jsonString on disk */
  }
}
```

And you’re done — all the code that used Gson now uses Moshi. Just by changing this class.

You can later change libraries again. You can even ditch json and use something else. As long as you create the proper abstraction (which is actually the hard part), you’re good to go. Your code is now robust and flexible, and your future self will be proud.

Note that the codebase is further improved by injecting the dependencies. Even if you don’t use Dagger or any other framework — the dependency injection itself is what matters. This way, you keep your classes decoupled and set yourself up for easy testing. Here, if you inject a mock or fake storage handler, you can test `MagicBusiness` in isolation.

### Conclusion

> “Abstractions Live Longer than Details“ — The Pragmatic Programmer, chapter 7, page 209

I showed you an example of how you can create boundaries around your code. These boundaries protect your code from external dependencies. Still, it goes much deeper than this. Recipes like design patterns or architectural patterns such as Clean Architecture are great. They’re battle tested, and their usefulness is more than proven. Using these design principles is one reason for their greatness. You can (and should!) apply these design principles even if you don’t use external code. Use them with caution, though. We know that design principle abuse increases code complexity. It’s a commitment you must consider, and balance with care.
