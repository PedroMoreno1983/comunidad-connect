import { HTMLAttributes, ReactNode, CSSProperties } from 'react';
import { ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';

/**
 * StatCard — the KPI block used across dashboards.
 *
 * Uses hardcoded fallback colors that match the design tokens,
 * with CSS variable overrides for theme switching.
 * This ensures cards render correctly on first paint without
 * waiting for CSS variable resolution.
 */

type ToneKey = 'brand' | 'warning' | 'success' | 'danger' | 'info';

const iconStylesLight: Record<ToneKey, CSSProperties> = {
  brand:   { backgroundColor: 'rgba(124, 58, 237, 0.12)', color: '#A58FFC' },
  warning: { backgroundColor: 'rgba(245, 158, 11, 0.12)',  color: '#FBBF5C' },
  success: { backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#34D399' },
  danger:  { backgroundColor: 'rgba(239, 68, 68, 0.12)',  color: '#F87171' },
  info:    { backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#60A5FA' },
};

const trendStylesLight = {
  positive: { backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#34D399' } as CSSProperties,
  negative: { backgroundColor: 'rgba(239, 68, 68, 0.12)',  color: '#F87171' } as CSSProperties,
};

export interface StatCardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  icon: ReactNode;
  value: string | number;
  label: string;
  trend?: {
    direction: 'up' | 'down';
    value: string;
    inverted?: boolean;
  };
  tone?: ToneKey;
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

  const iconStyle = iconStylesLight[tone] || iconStylesLight.brand;
  const trendStyle = trendPositive ? trendStylesLight.positive : trendStylesLight.negative;

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
          ...iconStyle,
        }}
      >
        {icon}
      </div>

      {/* Value */}
      <div
        style={{
          fontSize: '32px',
          fontWeight: 600,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          marginBottom: '6px',
        }}
      >
        {value}
      </div>

      {/* Label */}
      <div style={{ fontSize: '13px', opacity: 0.65 }}>
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
            ...trendStyle,
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
            opacity: 0.4,
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
        style={{ borderColor: 'rgba(128,128,128,0.15)' }}
        {...(props as any)}
      >
        {content}
      </a>
    );
  }

  return (
    <div
      className={baseClasses}
      style={{ borderColor: 'rgba(128,128,128,0.15)' }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...props}
    >
      {content}
    </div>
  );
}
