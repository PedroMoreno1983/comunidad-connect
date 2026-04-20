import { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

/**
 * Badge — ComunidadConnect
 *
 * Two families: role (admin / conserje / residente) and status (success / warning / danger / info).
 * Optional live dot indicates "currently active / happening now" — omit for static metadata.
 */
const badgeStyles = cva(
  [
    'inline-flex items-center gap-1.5',
    'px-2.5 py-1',
    'rounded-full',
    'text-[11px] font-medium tracking-[0.02em]',
    'border',
    'whitespace-nowrap',
  ],
  {
    variants: {
      variant: {
        admin:     'bg-role-admin-bg text-role-admin-fg border-role-admin-border',
        conserje:  'bg-role-conserje-bg text-role-conserje-fg border-role-conserje-border',
        residente: 'bg-role-residente-bg text-role-residente-fg border-role-residente-border',
        success:   'bg-success-bg text-success-fg border-success-border',
        warning:   'bg-warning-bg text-warning-fg border-warning-border',
        danger:    'bg-danger-bg text-danger-fg border-danger-border',
        info:      'bg-info-bg text-info-fg border-info-border',
        neutral:   'bg-elevated text-secondary border-subtle',
      },
    },
    defaultVariants: { variant: 'neutral' },
  }
);

const dotStyles = cva('w-[5px] h-[5px] rounded-full flex-shrink-0', {
  variants: {
    variant: {
      admin:     'bg-role-admin-fg',
      conserje:  'bg-role-conserje-fg',
      residente: 'bg-role-residente-fg',
      success:   'bg-success-fg',
      warning:   'bg-warning-fg',
      danger:    'bg-danger-fg',
      info:      'bg-info-fg',
      neutral:   'bg-tertiary',
    },
  },
});

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeStyles> {
  /** Shows a small pulse dot — use for active/live states */
  dot?: boolean;
}

export function Badge({ variant, dot = false, className = '', children, ...props }: BadgeProps) {
  return (
    <span className={`${badgeStyles({ variant })} ${className}`} {...props}>
      {dot && <span className={dotStyles({ variant })} aria-hidden="true" />}
      {children}
    </span>
  );
}
