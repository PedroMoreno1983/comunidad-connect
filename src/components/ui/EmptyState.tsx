import { CSSProperties, ReactNode } from 'react';

/**
 * EmptyState — the most important component in the current codebase.
 *
 * Every list, table, or section that could be empty needs one. Never show
 * "0" as a bare number when the cause is "no data yet" — use this instead.
 *
 * Structure: icon + title + description (what will go here when there IS data)
 * + primary action (the most likely next step).
 *
 * Uses CSS custom properties directly (via style={}) so styles are always
 * resolved regardless of Tailwind JIT purge settings in production.
 */

const iconToneStyles: Record<string, CSSProperties> = {
  brand:   { backgroundColor: 'var(--cc-role-admin-bg)',  color: 'var(--cc-role-admin-fg)' },
  success: { backgroundColor: 'var(--cc-success-bg)',     color: 'var(--cc-success-fg)' },
  warning: { backgroundColor: 'var(--cc-warning-bg)',     color: 'var(--cc-warning-fg)' },
  info:    { backgroundColor: 'var(--cc-info-bg)',        color: 'var(--cc-info-fg)' },
  neutral: { backgroundColor: 'var(--cc-bg-elevated)',    color: 'var(--cc-text-tertiary)' },
};

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: 'brand' | 'success' | 'warning' | 'info' | 'neutral';
  /** Use dashed border (true, default) for "nothing here yet"; solid for "positive empty" like "all caught up" */
  dashed?: boolean;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
  dashed = true,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`py-12 px-8 text-center rounded-xl ${className}`}
      style={{
        backgroundColor: 'var(--cc-bg-surface)',
        borderWidth: '1px',
        borderStyle: dashed ? 'dashed' : 'solid',
        borderColor: dashed ? 'var(--cc-border-default)' : 'var(--cc-border-subtle)',
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '12px',
          display: 'grid',
          placeItems: 'center',
          margin: '0 auto 20px',
          ...(iconToneStyles[tone ?? 'neutral'] || iconToneStyles.neutral),
        }}
      >
        {icon}
      </div>
      <h4
        style={{
          fontFamily: 'var(--cc-font-display)',
          fontSize: '20px',
          fontWeight: 600,
          letterSpacing: '-0.02em',
          marginBottom: '8px',
          color: 'var(--cc-text-primary)',
        }}
      >
        {title}
      </h4>
      <p
        style={{
          fontSize: '14px',
          color: 'var(--cc-text-secondary)',
          maxWidth: '384px',
          margin: '0 auto 24px',
          lineHeight: 1.7,
        }}
      >
        {description}
      </p>
      {action}
    </div>
  );
}
