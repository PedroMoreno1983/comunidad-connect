/* src/components/cc/Tag.tsx ─────────────────────────────────── */
import * as React from "react";

type Tone = "copper" | "sage" | "amber" | "rose" | "plum" | "ink" | "neutral";

const TONE: Record<Tone, { fg: string; border: string; bg: string }> = {
  copper:  { fg: "var(--cc-copper)",   border: "rgba(181,102,78,0.30)", bg: "var(--cc-copper-tint)" },
  sage:    { fg: "var(--cc-sage)",     border: "rgba(110,130,104,0.30)", bg: "var(--cc-sage-tint)"  },
  amber:   { fg: "var(--cc-amber)",    border: "rgba(201,154,74,0.30)",  bg: "var(--cc-amber-tint)" },
  rose:    { fg: "var(--cc-rose)",     border: "rgba(181,82,78,0.30)",   bg: "var(--cc-rose-tint)"  },
  plum:    { fg: "var(--cc-plum)",     border: "rgba(92,72,104,0.30)",   bg: "var(--cc-plum-tint)"  },
  ink:     { fg: "var(--cc-paper)",    border: "transparent",            bg: "var(--cc-ink)"        },
  neutral: { fg: "var(--cc-ink-muted)",border: "var(--cc-line-strong)",  bg: "transparent"          },
};

type TagProps = {
  tone?: Tone;
  /** Pulsing dot on the left. Use for "live" / active states. */
  dot?: boolean;
  /** Solid background instead of border-only. */
  solid?: boolean;
  size?: "sm" | "md";
  children: React.ReactNode;
  className?: string;
};

/**
 * Pill / badge with optional status dot.
 *
 *   <Tag tone="copper" dot>En sesión</Tag>
 *   <Tag tone="sage" solid>Pagado</Tag>
 */
export function Tag({
  tone = "neutral",
  dot = false,
  solid = false,
  size = "sm",
  children,
  className = "",
}: TagProps) {
  const t = TONE[tone];
  const sizePx = size === "md" ? { padding: "5px 12px", fontSize: 12 } : { padding: "3px 10px", fontSize: 11 };
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium leading-none ${className}`}
      style={{
        ...sizePx,
        borderRadius: 999,
        color: t.fg,
        background: solid ? t.bg : "transparent",
        border: solid ? "1px solid transparent" : `1px solid ${t.border}`,
        letterSpacing: "0.02em",
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "currentColor",
          }}
        />
      )}
      {children}
    </span>
  );
}
