/* src/components/cc/Button.tsx ──────────────────────────────── */
import * as React from "react";

type Variant = "primary" | "ghost" | "copper" | "dark" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, React.CSSProperties> = {
  primary: { background: "var(--cc-ink)", color: "var(--cc-paper)", border: "1px solid transparent" },
  copper:  { background: "var(--cc-copper)", color: "#fff", border: "1px solid transparent" },
  dark:    { background: "var(--cc-ink)", color: "var(--cc-paper)", border: "1px solid transparent" },
  ghost:   { background: "transparent", color: "var(--cc-ink)", border: "1px solid var(--cc-line-strong)" },
  danger:  { background: "var(--cc-rose)", color: "#fff", border: "1px solid transparent" },
};

const SIZES: Record<Size, React.CSSProperties> = {
  sm: { padding: "8px 14px", fontSize: 12, borderRadius: 10 },
  md: { padding: "12px 18px", fontSize: 14, borderRadius: 12 },
  lg: { padding: "16px 22px", fontSize: 14, borderRadius: 14 },
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Stretch to full width of its container. */
  block?: boolean;
};

/**
 * Premium button. Inline-flex + gap → place an icon as a child.
 *
 *   <Button variant="primary" size="lg" block>
 *     Pagar ahora <ArrowRight size={14} />
 *   </Button>
 */
export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className = "",
  children,
  style,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={{
        ...VARIANT[variant],
        ...SIZES[size],
        fontFamily: "var(--cc-font-sans)",
        letterSpacing: "-0.01em",
        width: block ? "100%" : undefined,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
