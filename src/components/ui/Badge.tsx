import { HTMLAttributes, CSSProperties } from 'react';

/**
 * Badge — ComunidadConnect
 *
 * Two families: role (admin / conserje / residente) and status (success / warning / danger / info).
 * Optional live dot indicates "currently active / happening now" — omit for static metadata.
 *
 * Uses hardcoded RGBA colors to ensure correct rendering on first paint
 * without depending on CSS variable resolution.
 */

type BadgeVariant = 
  | 'admin' | 'conserje' | 'residente'
  | 'success' | 'warning' | 'danger' | 'info'
  | 'neutral' | 'secondary' | 'destructive';

const badgeStyleMap: Record<BadgeVariant, CSSProperties> = {
  admin:       { backgroundColor: 'rgba(124, 58, 237, 0.12)', color: '#A58FFC', borderColor: 'rgba(124, 58, 237, 0.28)' },
  conserje:    { backgroundColor: 'rgba(245, 158, 11, 0.12)',  color: '#FBBF5C', borderColor: 'rgba(245, 158, 11, 0.30)' },
  residente:   { backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#34D399', borderColor: 'rgba(16, 185, 129, 0.30)' },
  success:     { backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#34D399', borderColor: 'rgba(16, 185, 129, 0.30)' },
  warning:     { backgroundColor: 'rgba(245, 158, 11, 0.12)',  color: '#FBBF5C', borderColor: 'rgba(245, 158, 11, 0.30)' },
  danger:      { backgroundColor: 'rgba(239, 68, 68, 0.12)',  color: '#F87171', borderColor: 'rgba(239, 68, 68, 0.30)' },
  destructive: { backgroundColor: 'rgba(239, 68, 68, 0.12)',  color: '#F87171', borderColor: 'rgba(239, 68, 68, 0.30)' },
  info:        { backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#60A5FA', borderColor: 'rgba(59, 130, 246, 0.30)' },
  neutral:     { backgroundColor: 'rgba(128, 128, 128, 0.10)', color: 'inherit', borderColor: 'rgba(128, 128, 128, 0.18)' },
  secondary:   { backgroundColor: 'rgba(128, 128, 128, 0.10)', color: 'inherit', borderColor: 'rgba(128, 128, 128, 0.18)' },
};

const dotColorMap: Record<BadgeVariant, string> = {
  admin:       '#A58FFC',
  conserje:    '#FBBF5C',
  residente:   '#34D399',
  success:     '#34D399',
  warning:     '#FBBF5C',
  danger:      '#F87171',
  destructive: '#F87171',
  info:        '#60A5FA',
  neutral:     'currentColor',
  secondary:   'currentColor',
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
