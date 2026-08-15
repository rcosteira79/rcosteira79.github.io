import fs from "node:fs";
import path from "node:path";

// Mirrors the dark theme palette in src/styles/global.css, so social cards
// look like the site they link to.
export const COLORS = {
  background: "#212737",
  foreground: "#eaedf3",
  accent: "#ff6b01",
  muted: "#9aa5c0",
  border: "#343f60",
};

let profileDataUri;

/**
 * Reads public/profile.jpg once and returns it as a data URI, since satori
 * cannot fetch local files by path.
 *
 * Resolved from the working directory rather than `import.meta.url`, because
 * this module is bundled into dist/ before the OG routes run at build time.
 */
export function getProfileImage() {
  if (!profileDataUri) {
    const file = fs.readFileSync(
      path.resolve(process.cwd(), "public/profile.jpg")
    );
    profileDataUri = `data:image/jpeg;base64,${file.toString("base64")}`;
  }
  return profileDataUri;
}
