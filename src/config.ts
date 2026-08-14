export const SITE = {
  website: "https://ricardocosteira.dev/",
  author: "Ricardo Costeira",
  profile: "https://github.com/rcosteira79",
  desc: "Android engineer writing about Kotlin, mobile development, and software craft.",
  title: "Ricardo Costeira",
  // Empty on purpose: pages fall back to the generated card at /og.png.
  // Point this at a file in public/ only if you want a fixed image instead.
  ogImage: "",
  lightAndDarkMode: true,
  postPerIndex: 10,
  postPerPage: 10,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
  showArchives: true,
  showBackButton: true, // show back button in post detail
  editPost: {
    enabled: false,
    text: "Edit page",
    url: "https://github.com/rcosteira79/rcosteira79.github.io/edit/master/src/data/blog",
  },
  dynamicOgImage: true,
  dir: "ltr", // "rtl" | "auto"
  lang: "en", // html lang code. Set this empty and default will be "en"
  timezone: "Europe/Lisbon", // Default global timezone (IANA format) https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
  socialTemplate: `Hey there! Just published a new article: "{title}"

Take a peek at {url}`,
} as const;
