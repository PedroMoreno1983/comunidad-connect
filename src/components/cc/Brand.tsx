/* src/components/cc/Brand.tsx ───────────────────────────────── */
import * as React from "react";

type BrandProps = {
  size?: number;
  className?: string;
  /** Show the small "c" badge before the wordmark. */
  withMark?: boolean;
};

/**
 * Convive & Connect wordmark.
 * Uses Instrument Serif with the ampersand italicized in copper.
 */
export function Brand({ size = 22, className = "", withMark = false }: BrandProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {withMark && (
        <span
          className="grid place-items-center bg-ink text-copper-soft"
          style={{
            width: size * 1.45,
            height: size * 1.45,
            borderRadius: size * 0.55,
            fontFamily: "var(--cc-font-display)",
            fontStyle: "italic",
            fontSize: size * 0.9,
            lineHeight: 1,
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
          color: "var(--cc-ink)",
        }}
      >
        Convive
        <span style={{ fontStyle: "italic", color: "var(--cc-copper)" }}>{" & "}</span>
        Connect
      </span>
    </span>
  );
}
