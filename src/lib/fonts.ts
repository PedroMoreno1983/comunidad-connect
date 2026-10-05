import { Fraunces, IBM_Plex_Mono, Source_Sans_3 } from "next/font/google";

/**
 * Editorial pair inspired by Giorgia Lupi's data stories:
 * a soft optical serif for titles and hero figures, a humanist
 * sans for reading and UI, and a tabular mono for codes.
 *
 * next/font self-hosts the Google Fonts files and exposes each
 * family as a CSS variable on the root layout.
 */
export const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-fraunces",
});

export const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  variable: "--font-source-sans",
});

export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
  variable: "--font-ibm-plex-mono",
});

export const editorialFontClassName = [
  fraunces.variable,
  sourceSans.variable,
  plexMono.variable,
].join(" ");
