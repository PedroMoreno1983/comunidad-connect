/* src/components/cc/Brand.tsx ───────────────────────────────── */
import * as React from "react";

type BrandProps = {
  size?: number;
  className?: string;
  /** Show the small "c" badge before the wordmark. */
  withMark?: boolean;
  tone?: "default" | "inverse";
};

/**
 * Convive Connect wordmark.
 * Uses Instrument Serif with the word "Connect" italicized in copper.
 */
export function Brand({ size = 22, className = "", withMark = false, tone = "default" }: BrandProps) {
  const isInverse = tone === "inverse";

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {withMark && (
        <span
          className="grid place-items-center"
          style={{
            width: size * 1.45,
            height: size * 1.45,
            borderRadius: size * 0.55,
            fontFamily: "var(--cc-font-display)",
            fontStyle: "italic",
            fontSize: size * 0.9,
            lineHeight: 1,
            background: isInverse ? "rgba(250, 247, 241, 0.12)" : "var(--cc-ink)",
            color: isInverse ? "var(--cc-copper-soft)" : "var(--cc-copper-soft)",
            boxShadow: isInverse ? "inset 0 0 0 1px rgba(250, 247, 241, 0.14)" : "none",
          }}
        >
          c
        </span>
      )}
      <span
        style={{
          fontFamily: "var(--cc-font-display)",
          fontSize: size,
          lineHeight: 1,
          letterSpacing: "-0.01em",
          color: isInverse ? "var(--cc-paper)" : "var(--cc-ink)",
        }}
      >
        Convive{" "}
        <span style={{ fontStyle: "italic", color: isInverse ? "var(--cc-copper-soft)" : "var(--cc-copper)" }}>Connect</span>
      </span>
    </span>
  );
}
