import type { Props } from "astro";
import IconMail from "@/assets/icons/IconMail.svg";
import IconGitHub from "@/assets/icons/IconGitHub.svg";
import IconBrandX from "@/assets/icons/IconBrandX.svg";
import IconLinkedin from "@/assets/icons/IconLinkedin.svg";
import IconBluesky from "@/assets/icons/IconBluesky.svg";
import IconMastodon from "@/assets/icons/IconMastodon.svg";
import IconKodeco from "@/assets/icons/IconKodeco.svg";
import IconStackOverflow from "@/assets/icons/IconStackOverflow.svg";
import IconMedium from "@/assets/icons/IconMedium.svg";
import IconWhatsapp from "@/assets/icons/IconWhatsapp.svg";
import IconFacebook from "@/assets/icons/IconFacebook.svg";
import IconTelegram from "@/assets/icons/IconTelegram.svg";
import IconPinterest from "@/assets/icons/IconPinterest.svg";
import { SITE } from "@/config";

interface Social {
  name: string;
  href: string;
  linkTitle: string;
  icon: (_props: Props) => Element;
}

export const SOCIALS: Social[] = [
  {
    name: "GitHub",
    href: "https://github.com/rcosteira79",
    linkTitle: `${SITE.title} on GitHub`,
    icon: IconGitHub,
  },
  {
    name: "Stack Overflow",
    href: "https://stackoverflow.com/users/2333010/ricardo-costeira?tab=profile",
    linkTitle: `${SITE.title} on Stack Overflow`,
    icon: IconStackOverflow,
  },
  {
    name: "Kodeco",
    href: "https://www.kodeco.com/u/rcosteira",
    linkTitle: `${SITE.title} on Kodeco`,
    icon: IconKodeco,
  },
  {
    name: "Medium",
    href: "https://medium.com/@rcosteira79",
    linkTitle: `${SITE.title} on Medium`,
    icon: IconMedium,
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/in/rcosteira/",
    linkTitle: `${SITE.title} on LinkedIn`,
    icon: IconLinkedin,
  },
  {
    name: "Mastodon",
    href: "https://androiddev.social/@rcosteira79",
    linkTitle: `${SITE.title} on Mastodon`,
    icon: IconMastodon,
  },
  {
    name: "Bluesky",
    href: "https://bsky.app/profile/rcosteira.bsky.social",
    linkTitle: `${SITE.title} on Bluesky`,
    icon: IconBluesky,
  },
  {
    name: "X",
    href: "https://x.com/rcosteira79",
    linkTitle: `${SITE.title} on X`,
    icon: IconBrandX,
  },
] as const;

export const SHARE_LINKS: Social[] = [
  {
    name: "WhatsApp",
    href: "https://wa.me/?text=",
    linkTitle: `Share this post via WhatsApp`,
    icon: IconWhatsapp,
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/sharer.php?u=",
    linkTitle: `Share this post on Facebook`,
    icon: IconFacebook,
  },
  {
    name: "X",
    href: "https://x.com/intent/post?url=",
    linkTitle: `Share this post on X`,
    icon: IconBrandX,
  },
  {
    name: "Telegram",
    href: "https://t.me/share/url?url=",
    linkTitle: `Share this post via Telegram`,
    icon: IconTelegram,
  },
  {
    name: "Pinterest",
    href: "https://pinterest.com/pin/create/button/?url=",
    linkTitle: `Share this post on Pinterest`,
    icon: IconPinterest,
  },
  {
    name: "Mail",
    href: "mailto:?subject=See%20this%20post&body=",
    linkTitle: `Share this post via email`,
    icon: IconMail,
  },
] as const;
