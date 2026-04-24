import { HTMLAttributes, ReactNode, CSSProperties } from 'react';
import { ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';

/**
 * StatCard — the KPI block used across dashboards.
 *
 * Uses CSS custom properties directly (via style={}) so styles are always
 * resolved regardless of Tailwind JIT purge settings in production.
 */

const iconStyles: Record<string, CSSProperties> = {
  brand:   { backgroundColor: 'var(--cc-role-admin-bg)',     color: 'var(--cc-role-admin-fg)' },
  warning: { backgroundColor: 'var(--cc-role-conserje-bg)',  color: 'var(--cc-role-conserje-fg)' },
  success: { backgroundColor: 'var(--cc-role-residente-bg)', color: 'var(--cc-role-residente-fg)' },
  danger:  { backgroundColor: 'var(--cc-danger-bg)',         color: 'var(--cc-danger-fg)' },
  info:    { backgroundColor: 'var(--cc-info-bg)',           color: 'var(--cc-info-fg)' },
};

const trendStyles = {
  positive: { backgroundColor: 'var(--cc-success-bg)', color: 'var(--cc-success-fg)' } as CSSProperties,
  negative: { backgroundColor: 'var(--cc-danger-bg)',  color: 'var(--cc-danger-fg)'  } as CSSProperties,
};

export interface StatCardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  icon: ReactNode;
  value: string | number;
  label: string;
  trend?: {
    direction: 'up' | 'down';
    value: string;
    /** When true, an "up" trend is painted red and "down" is green (e.g. overdue payments down is good). */
    inverted?: boolean;
  };
  tone?: 'brand' | 'warning' | 'success' | 'danger' | 'info';
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

  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--cc-bg-surface)',
    borderColor: 'var(--cc-border-subtle)',
    color: 'var(--cc-text-primary)',
  };

  const content = (
    <>
      {/* Icon box */}
      <div
        style={{
          width: '40px',
          height: '40px',
          minWidth: '40px',
          minHeight: '40px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
          ...(iconStyles[tone] || iconStyles.brand),
        }}
      >
        {icon}
      </div>

      {/* Value */}
      <div
        style={{
          fontFamily: 'var(--cc-font-display)',
          fontSize: '32px',
          fontWeight: 600,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          marginBottom: '6px',
          color: 'var(--cc-text-primary)',
        }}
      >
        {value}
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: '13px',
          color: 'var(--cc-text-secondary)',
        }}
      >
        {label}
      </div>

      {/* Trend badge */}
      {trend && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: '12px',
            padding: '2px 8px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            ...(trendPositive ? trendStyles.positive : trendStyles.negative),
          }}
        >
          {trend.direction === 'up' ? (
            <TrendingUp style={{ width: '12px', height: '12px' }} strokeWidth={2.5} />
          ) : (
            <TrendingDown style={{ width: '12px', height: '12px' }} strokeWidth={2.5} />
          )}
          {trend.value}
        </div>
      )}

      {/* Chevron for interactive cards */}
      {isInteractive && (
        <ChevronRight
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            width: '18px',
            height: '18px',
            color: 'var(--cc-text-tertiary)',
            transition: 'all 200ms ease-out',
          }}
          strokeWidth={2}
        />
      )}
    </>
  );

  const baseClasses = `group relative overflow-hidden rounded-lg p-5 border transition-all duration-200 ease-out ${
    isInteractive ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : ''
  } ${className}`;

  if (href) {
    return (
      <a
        href={href}
        className={baseClasses}
        style={cardStyle}
        {...(props as any)}
      >
        {content}
      </a>
    );
  }

  return (
    <div
      className={baseClasses}
      style={cardStyle}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...props}
    >
      {content}
    </div>
  );
}
