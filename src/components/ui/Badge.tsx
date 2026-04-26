import { HTMLAttributes, CSSProperties } from 'react';

/**
 * Badge — ComunidadConnect
 *
 * Two families: role (admin / conserje / residente) and status (success / warning / danger / info).
 * Optional live dot indicates "currently active / happening now" — omit for static metadata.
 */

type BadgeVariant = 
  | 'admin' | 'conserje' | 'residente'
  | 'success' | 'warning' | 'danger' | 'info'
  | 'neutral' | 'secondary' | 'destructive';

const badgeStyleMap: Record<BadgeVariant, CSSProperties> = {
  admin:       { backgroundColor: 'var(--cc-role-admin-bg)',     color: 'var(--cc-role-admin-fg)',     borderColor: 'var(--cc-role-admin-border)' },
  conserje:    { backgroundColor: 'var(--cc-role-conserje-bg)',  color: 'var(--cc-role-conserje-fg)',  borderColor: 'var(--cc-role-conserje-border)' },
  residente:   { backgroundColor: 'var(--cc-role-residente-bg)', color: 'var(--cc-role-residente-fg)', borderColor: 'var(--cc-role-residente-border)' },
  success:     { backgroundColor: 'var(--cc-success-bg)',        color: 'var(--cc-success-fg)',        borderColor: 'var(--cc-success-border)' },
  warning:     { backgroundColor: 'var(--cc-warning-bg)',        color: 'var(--cc-warning-fg)',        borderColor: 'var(--cc-warning-border)' },
  danger:      { backgroundColor: 'var(--cc-danger-bg)',         color: 'var(--cc-danger-fg)',         borderColor: 'var(--cc-danger-border)' },
  destructive: { backgroundColor: 'var(--cc-danger-bg)',         color: 'var(--cc-danger-fg)',         borderColor: 'var(--cc-danger-border)' },
  info:        { backgroundColor: 'var(--cc-info-bg)',           color: 'var(--cc-info-fg)',           borderColor: 'var(--cc-info-border)' },
  neutral:     { backgroundColor: 'var(--cc-bg-elevated)',       color: 'var(--cc-text-secondary)',    borderColor: 'var(--cc-border-default)' },
  secondary:   { backgroundColor: 'var(--cc-bg-elevated)',       color: 'var(--cc-text-secondary)',    borderColor: 'var(--cc-border-default)' },
};

const dotColorMap: Record<BadgeVariant, string> = {
  admin:       'var(--cc-role-admin-fg)',
  conserje:    'var(--cc-role-conserje-fg)',
  residente:   'var(--cc-role-residente-fg)',
  success:     'var(--cc-success-fg)',
  warning:     'var(--cc-warning-fg)',
  danger:      'var(--cc-danger-fg)',
  destructive: 'var(--cc-danger-fg)',
  info:        'var(--cc-info-fg)',
  neutral:     'var(--cc-text-tertiary)',
  secondary:   'var(--cc-text-tertiary)',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Shows a small pulse dot — use for active/live states */
  dot?: boolean;
}

export function Badge({ variant = 'neutral', dot = false, className = '', style, children, ...props }: BadgeProps) {
  const variantStyle = badgeStyleMap[variant] ?? badgeStyleMap.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-[0.02em] border whitespace-nowrap ${className}`}
      style={{ ...variantStyle, ...style }}
      {...props}
    >
      {dot && (
        <span
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '9999px',
            flexShrink: 0,
            backgroundColor: dotColorMap[variant] ?? 'currentColor',
          }}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
