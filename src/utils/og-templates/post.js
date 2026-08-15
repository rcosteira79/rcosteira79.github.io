import satori from "satori";
import { SITE } from "@/config";
import loadGoogleFonts from "../loadGoogleFont";
import { COLORS } from "./shared";

export default async post => {
  const domain = new URL(SITE.website).hostname.toUpperCase();
  const { title, author } = post.data;

  return satori(
    {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "72px",
          background: COLORS.background,
          color: COLORS.foreground,
          borderBottom: `14px solid ${COLORS.accent}`,
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
                display: "flex",
                flexGrow: 1,
                alignItems: "center",
                fontSize: title.length > 55 ? 56 : 68,
                fontWeight: 700,
                lineHeight: 1.2,
                overflow: "hidden",
                marginTop: "24px",
              },
              children: title,
            },
          },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                alignItems: "center",
                marginTop: "24px",
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      width: "48px",
                      height: "6px",
                      borderRadius: "3px",
                      background: COLORS.accent,
                      marginRight: "20px",
                    },
                  },
                },
                {
                  type: "span",
                  props: {
                    style: { fontSize: 28, color: COLORS.muted },
                    children: "by",
                  },
                },
                {
                  type: "span",
                  props: {
                    style: {
                      fontSize: 28,
                      fontWeight: 700,
                      marginLeft: "12px",
                    },
                    children: author,
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      embedFont: true,
      fonts: await loadGoogleFonts(title + author + domain + "by "),
    }
  );
};
