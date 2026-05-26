/* src/components/cc/EmptyState.tsx ──────────────────────────── */
import * as React from "react";

export type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  cta?: React.ReactNode;
  className?: string;
};

/**
 * Empty state for lists/sections with no data.
 * Editorial — uses display serif for the title.
 *
 *   <EmptyState
 *     icon={<Bell size={20} />}
 *     title="Sin avisos por ahora"
 *     description="Cuando tu administración publique anuncios aparecerán acá."
 *     cta={<Button variant="ghost">Ver historial</Button>}
 *   />
 */
export function EmptyState({ icon, title, description, cta, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`bg-paper-warm border border-dashed rounded-xl text-center ${className}`}
      style={{
        borderRadius: 18,
        borderColor: "var(--cc-line-strong)",
        padding: "40px 24px",
      }}
    >
      {icon && (
        <div
          className="grid place-items-center mx-auto"
          style={{
            width: 52,
            height: 52,
            borderRadius: 999,
            background: "var(--cc-paper)",
            color: "var(--cc-ink-muted)",
            marginBottom: 18,
          }}
        >
          {icon}
        </div>
      )}
      <div
        style={{
          fontFamily: "var(--cc-font-display)",
          fontSize: 22,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          color: "var(--cc-ink)",
        }}
      >
        {title}
      </div>
      {description && (
        <p style={{ marginTop: 8, fontSize: 13, color: "var(--cc-ink-muted)", lineHeight: 1.5, maxWidth: 360, marginInline: "auto" }}>
          {description}
        </p>
      )}
      {cta && <div style={{ marginTop: 20 }}>{cta}</div>}
    </div>
  );
}
