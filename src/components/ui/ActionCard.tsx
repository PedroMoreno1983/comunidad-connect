import { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

/**
 * ActionCard — the "Acceso Rápido" quick action component.
 *
 * Uses CSS custom properties directly (via style={}) so styles are always
 * resolved regardless of Tailwind JIT purge settings in production.
 */

const iconStyles: Record<string, CSSProperties> = {
  brand:   { backgroundColor: 'var(--cc-role-admin-bg)',     color: 'var(--cc-role-admin-fg)' },
  warning: { backgroundColor: 'var(--cc-role-conserje-bg)',  color: 'var(--cc-role-conserje-fg)' },
  success: { backgroundColor: 'var(--cc-success-bg)',        color: 'var(--cc-success-fg)' },
  danger:  { backgroundColor: 'var(--cc-danger-bg)',         color: 'var(--cc-danger-fg)' },
  info:    { backgroundColor: 'var(--cc-info-bg)',           color: 'var(--cc-info-fg)' },
};

export interface ActionCardProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  title: string;
  description?: string;
  href?: string;
  tone?: 'brand' | 'warning' | 'success' | 'danger' | 'info';
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
  const cardStyle: CSSProperties = {
    backgroundColor: 'var(--cc-bg-surface)',
    borderColor: 'var(--cc-border-subtle)',
    color: 'var(--cc-text-primary)',
  };

  const baseClasses = `group flex items-center gap-3.5 w-full
    px-4 py-3.5 border rounded-lg
    text-left font-sans
    transition-all duration-150 ease-out
    hover:translate-x-1
    focus-visible:outline-none
    ${className}`;

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
          ...(iconStyles[tone] || iconStyles.brand),
        }}
      >
        {icon}
      </div>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--cc-text-primary)',
            marginBottom: '2px',
          }}
        >
          {title}
        </div>
        {description && (
          <div style={{ fontSize: '12px', color: 'var(--cc-text-tertiary)' }}>
            {description}
          </div>
        )}
      </div>

      {/* Chevron */}
      <ChevronRight
        style={{
          width: '18px',
          height: '18px',
          color: 'var(--cc-text-tertiary)',
          transition: 'all 200ms ease-out',
          flexShrink: 0,
        }}
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
