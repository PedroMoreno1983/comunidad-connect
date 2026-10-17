#!/usr/bin/env node
/**
 * Dark-mode contrast QA (static, no network).
 *
 * In dark mode src/app/tokens.css redefines --cc-ink as a light colour. Any
 * element whose surface is fixed white (bg-white without a dark: variant) and
 * whose text uses var(--cc-ink) / text-ink ends up light-on-white: invisible.
 *
 * Fails when a single JSX opening tag has:
 *   - a fixed light surface (bg-white, Tailwind -50 tints, light hex backgrounds; not white with opacity)
 *     and no dark:bg-* variant, AND text-ink / text-[var(--cc-ink)] in its
 *     classes or style color var(--cc-ink); or
 *   - a var(--cc-ink) surface (light in dark mode) with fixed text-white / #fff.
 * Opt out a reviewed tag by putting the string dark-contrast-ok in it.
 *
 * Fix: make the surface follow the theme (bg-[var(--cc-paper)] …) or keep it
 * light and pin the text with var(--cc-on-light) / text-on-light.
 *
 * `node scripts/dark-contrast-qa.js --audit` also lists bg-white tags that set
 * no text colour (they inherit the light body text in dark mode). Informational.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const AUDIT = process.argv.includes("--audit");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Yields JSX-ish opening tags: { text, index }. Tracks quotes and braces. */
function* openingTags(src) {
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== "<" || !/[A-Za-z]/.test(src[i + 1] || "")) continue;
    let depth = 0;
    let quote = null;
    let j = i + 1;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) {
        if (c === "\\") { j++; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth <= 0) break;
      else if (c === "<" && depth <= 0 && /[A-Za-z]/.test(src[j + 1] || "")) break; // not a tag (generic etc.)
      if (j - i > 4000) break;
    }
    if (src[j] === ">") yield { text: src.slice(i, j + 1), index: i };
  }
}

// Fixed light surfaces: bg-white, Tailwind *-50 tints, light hex backgrounds.
const BG_WHITE = /(^|[\s"'`{(])(?:bg-white|bg-(?:amber|slate|gray|zinc|stone|neutral|orange|yellow|emerald|green|sky|blue|rose|red)-50|bg-\[#(?:F|f)[0-9A-Fa-f]{5}\])(?![\w/-])/;
// Theme-inverting surface (--cc-ink turns light in dark) with fixed white text.
const INK_BG = /bg-\[var\(--cc-ink\)\]|(^|[\s"'`])bg-ink(?![\w-])|background\s*:\s*["'`]var\(--cc-ink\)["'`]/;
const WHITE_TEXT = /(^|[\s"'`])text-white(?![\w/-])|color\s*:\s*["'`](?:#fff|#ffffff|white)["'`]/i;
const DARK_BG = /dark:bg-/;
const INK_TEXT = /(^|[\s"'`])(?:[\w-]+:)?text-(?:ink|\[var\(--cc-ink\)\])(?![\w-])/;
const INK_STYLE = /color\s*:\s*["'`]var\(--cc-ink\)["'`]/;
const ANY_TEXT_COLOR = /(^|[\s"'`])text-(?:white|black|ink|on-light|\[[^\]]+\]|(?:slate|gray|zinc|neutral|stone|red|rose|amber|emerald|green|sky|blue|indigo|violet|orange|yellow|teal|cyan|pink|purple|lime|fuchsia)-\d{2,3})|cc-text-|\bcolor\s*:/;

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

const failures = [];
const inherited = [];
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, "utf8");
  for (const { text, index } of openingTags(src)) {
    if (text.includes("dark-contrast-ok")) continue;
    const rel = path.relative(ROOT, file);
    if (INK_BG.test(text) && WHITE_TEXT.test(text) && !DARK_BG.test(text)) {
      failures.push(`${rel}:${lineOf(src, index)}  (surface var(--cc-ink) + text-white: use var(--cc-paper) text or a fixed dark surface)`);
      continue;
    }
    if (!BG_WHITE.test(text) || DARK_BG.test(text)) continue;
    if (INK_TEXT.test(text) || INK_STYLE.test(text)) {
      failures.push(`${rel}:${lineOf(src, index)}  (light surface + var(--cc-ink)/text-ink: use var(--cc-on-light) or a theme surface)`);
    } else if (AUDIT && !ANY_TEXT_COLOR.test(text)) {
      inherited.push(`${rel}:${lineOf(src, index)}`);
    }
  }
}

if (AUDIT && inherited.length) {
  console.log(`[audit] ${inherited.length} bg-white tags without dark:bg and without an explicit text colour (inherit --cc-ink):`);
  for (const f of inherited) console.log(`  - ${f}`);
}

if (failures.length) {
  console.error(`dark-contrast-qa: ${failures.length} light-on-white risk(s) in dark mode:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("dark-contrast-qa: OK (no fixed-light surface + --cc-ink text, no --cc-ink surface + white text)");
