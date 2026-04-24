import { HTMLAttributes, ReactNode } from 'react';
import { ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';

/**
 * StatCard — the KPI block used across dashboards.
 *
 * Always pair a number with CONTEXT (trend, period, comparison). A bare number
 * is just noise. If you don't have a comparison yet, omit the trend prop —
 * don't fake it.
 */

const iconWrapStyles = cva(
  'w-10 h-10 rounded-md grid place-items-center mb-4',
  {
    variants: {
      tone: {
        brand:    'bg-role-admin-bg text-role-admin-fg',
        warning:  'bg-role-conserje-bg text-role-conserje-fg',
        success:  'bg-role-residente-bg text-role-residente-fg',
        danger:   'bg-danger-bg text-danger-fg',
        info:     'bg-info-bg text-info-fg',
      },
    },
    defaultVariants: { tone: 'brand' },
  }
);

export interface StatCardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'>,
    VariantProps<typeof iconWrapStyles> {
  icon: ReactNode;
  value: string | number;
  label: string;
  trend?: {
    direction: 'up' | 'down';
    value: string;
    /** When true, an "up" trend is painted red and "down" is green (e.g. overdue payments down is good). */
    inverted?: boolean;
  };
  onClick?: () => void;
  href?: string;
}

export function StatCard({
  icon,
  value,
  label,
  trend,
  tone = 'brand',
  onClick,
  href,
  className = '',
  ...props
}: StatCardProps) {
  const isInteractive = !!(onClick || href);

  const trendPositive = trend
    ? trend.inverted
      ? trend.direction === 'down'
      : trend.direction === 'up'
    : false;

  const content = (
    <>
      <div className={iconWrapStyles({ tone })}>{icon}</div>
      <div className="font-display text-[32px] font-semibold tracking-tight leading-none mb-1.5">
        {value}
      </div>
      <div className="text-[13px] text-secondary">{label}</div>
      {trend && (
        <div
          className={`inline-flex items-center gap-1 mt-3 px-2 py-0.5 rounded-md text-xs font-medium ${
            trendPositive ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg'
          }`}
        >
          {trend.direction === 'up' ? (
            <TrendingUp className="w-3 h-3" strokeWidth={2.5} />
          ) : (
            <TrendingDown className="w-3 h-3" strokeWidth={2.5} />
          )}
          {trend.value}
        </div>
      )}
      {isInteractive && (
        <ChevronRight
          className="absolute top-5 right-5 w-[18px] h-[18px] text-tertiary transition-all duration-normal ease-out group-hover:translate-x-1 group-hover:text-secondary"
          strokeWidth={2}
        />
      )}
    </>
  );

  const baseClasses = `group relative overflow-hidden
    bg-surface border border-subtle rounded-lg p-5
    transition-all duration-normal ease-out
    ${isInteractive ? 'cursor-pointer hover:border-default hover:-translate-y-0.5 hover:shadow-md' : ''}
    ${className}`;

  if (href) {
    return (
      <a href={href} className={baseClasses} {...(props as any)}>
        {content}
      </a>
    );
  }

  return (
    <div
      className={baseClasses}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...props}
    >
      {content}
    </div>
  );
}
