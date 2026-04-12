import type { CollectionEntry } from "astro:content";
import { SITE } from "@/config";

const showDrafts = !!import.meta.env.SHOW_DRAFTS;

const postFilter = ({ data }: CollectionEntry<"blog">) => {
  const isPublishTimePassed =
    Date.now() >
    new Date(data.pubDatetime).getTime() - SITE.scheduledPostMargin;
  return (showDrafts || !data.draft) && (import.meta.env.DEV || isPublishTimePassed);
};

export default postFilter;
