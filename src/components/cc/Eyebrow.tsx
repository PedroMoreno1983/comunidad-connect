/* src/components/cc/Eyebrow.tsx ─────────────────────────────── */
import * as React from "react";

/**
 * Uppercase, tracked, tertiary-color section label.
 * Use ABOVE display headings.
 *
 *   <Eyebrow>Resumen administrador</Eyebrow>
 *   <h1>Tu edificio, de un vistazo</h1>
 */
export function Eyebrow({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--cc-ink-tertiary)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Display heading helper — combines Instrument Serif with optional italic accent.
 *
 *   <DisplayHeading>Buenos días, <em>Martina</em>.</DisplayHeading>
 *
 * Pass <em> for italic-copper accents; they're styled automatically.
 */
export function DisplayHeading({
  children,
  size = 40,
  className = "",
  style,
}: {
  children: React.ReactNode;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <h1
      className={className}
      style={{
        margin: 0,
        fontFamily: "var(--cc-font-display)",
        fontSize: size,
        lineHeight: 1.02,
        letterSpacing: "-0.02em",
        fontWeight: 400,
        color: "var(--cc-ink)",
        ...style,
      }}
    >
      {children}
    </h1>
  );
}
