import { DM_Sans, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";

/**
 * Editorial pair inspired by Giorgia Lupi's data stories:
 * Source Serif 4 for titles and hero figures, DM Sans for reading
 * and UI, and a tabular mono for codes. Selected in a visual comparison.
 *
 * next/font self-hosts the Google Fonts files and exposes each
 * family as a CSS variable on the root layout.
 */
export const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-source-serif",
});

export const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  variable: "--font-dm-sans",
});

export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
  variable: "--font-ibm-plex-mono",
});

export const editorialFontClassName = [
  sourceSerif.variable,
  dmSans.variable,
  plexMono.variable,
].join(" ");
