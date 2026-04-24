import { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

/**
 * ActionCard — the "Acceso Rápido" quick action component.
 *
 * Uses hardcoded fallback colors that match the design tokens,
 * ensuring correct rendering on first paint.
 */

type ToneKey = 'brand' | 'warning' | 'success' | 'danger' | 'info';

const iconStylesMap: Record<ToneKey, CSSProperties> = {
  brand:   { backgroundColor: 'rgba(124, 58, 237, 0.12)', color: '#A58FFC' },
  warning: { backgroundColor: 'rgba(245, 158, 11, 0.12)',  color: '#FBBF5C' },
  success: { backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#34D399' },
  danger:  { backgroundColor: 'rgba(239, 68, 68, 0.12)',  color: '#F87171' },
  info:    { backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#60A5FA' },
};

export interface ActionCardProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  title: string;
  description?: string;
  href?: string;
  tone?: ToneKey;
}

export function ActionCard({
  icon,
  title,
  description,
  href,
  tone = 'brand',
  className = '',
  ...props
}: ActionCardProps) {
  const baseClasses = `group flex items-center gap-3.5 w-full px-4 py-3.5 border rounded-lg text-left transition-all duration-150 ease-out hover:translate-x-1 focus-visible:outline-none ${className}`;
  const cardStyle: CSSProperties = { borderColor: 'rgba(128,128,128,0.15)' };

  const iconStyle = iconStylesMap[tone] || iconStylesMap.brand;

  const content = (
    <>
      {/* Icon box */}
      <div
        style={{
          width: '36px',
          height: '36px',
          minWidth: '36px',
          minHeight: '36px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          ...iconStyle,
        }}
      >
        {icon}
      </div>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '2px' }}>
          {title}
        </div>
        {description && (
          <div style={{ fontSize: '12px', opacity: 0.55 }}>
            {description}
          </div>
        )}
      </div>

      {/* Chevron */}
      <ChevronRight
        style={{ width: '18px', height: '18px', opacity: 0.4, transition: 'all 200ms ease-out', flexShrink: 0 }}
        strokeWidth={2}
      />
    </>
  );

  if (href) {
    return (
      <Link href={href} className={baseClasses} style={cardStyle}>
        {content}
      </Link>
    );
  }

  return (
    <button className={baseClasses} style={cardStyle} {...props}>
      {content}
    </button>
  );
}
