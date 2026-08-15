import satori from "satori";
import { SITE } from "@/config";
import loadGoogleFonts from "../loadGoogleFont";
import { COLORS, getProfileImage } from "./shared";

export default async () => {
  const domain = new URL(SITE.website).hostname.toUpperCase();

  return satori(
    {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "72px",
          background: COLORS.background,
          color: COLORS.foreground,
          borderBottom: `14px solid ${COLORS.accent}`,
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                // 1200 - 144 (padding) - 340 (photo) - 64 (gap)
                width: "652px",
                marginRight: "64px",
              },
              children: [
                {
                  type: "span",
                  props: {
                    style: {
                      fontSize: 24,
                      fontWeight: 700,
                      letterSpacing: "4px",
                      color: COLORS.accent,
                    },
                    children: domain,
                  },
                },
                {
                  type: "span",
                  props: {
                    style: {
                      fontSize: 76,
                      fontWeight: 700,
                      lineHeight: 1.1,
                      marginTop: "24px",
                    },
                    children: SITE.title,
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      width: "96px",
                      height: "6px",
                      borderRadius: "3px",
                      background: COLORS.accent,
                      marginTop: "28px",
                    },
                  },
                },
                {
                  type: "span",
                  props: {
                    style: {
                      fontSize: 30,
                      lineHeight: 1.45,
                      color: COLORS.muted,
                      marginTop: "28px",
                    },
                    children: SITE.desc,
                  },
                },
              ],
            },
          },
          {
            type: "img",
            props: {
              src: getProfileImage(),
              width: 340,
              height: 340,
              style: {
                width: "340px",
                height: "340px",
                flexShrink: 0,
                borderRadius: "28px",
                objectFit: "cover",
                border: `6px solid ${COLORS.border}`,
              },
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      embedFont: true,
      fonts: await loadGoogleFonts(SITE.title + SITE.desc + domain),
    }
  );
};
