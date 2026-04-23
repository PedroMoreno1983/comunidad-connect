import { ButtonHTMLAttributes, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import Link from 'next/link';

/**
 * ActionCard — the "Acceso Rápido" quick action component.
 *
 * Unlike a plain button, it carries CONTEXT: icon (tone-coded), title, subtitle.
 * Used in dashboard sidebars to surface the 2–4 most likely next actions.
 */

const iconTones: Record<string, string> = {
  brand:    'bg-role-admin-bg text-role-admin-fg',
  warning:  'bg-role-conserje-bg text-role-conserje-fg',
  success:  'bg-success-bg text-success-fg',
  danger:   'bg-danger-bg text-danger-fg',
  info:     'bg-info-bg text-info-fg',
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
  const baseClasses = `group flex items-center gap-3.5 w-full
    px-4 py-3.5
    bg-surface border border-subtle rounded-lg
    text-left font-sans
    transition-all duration-fast ease-out
    hover:bg-elevated hover:border-default hover:translate-x-1
    focus-visible:outline-none focus-visible:shadow-ring
    ${className}`;

  const content = (
    <>
      <div 
        className={`rounded-md flex items-center justify-center flex-shrink-0 ${iconTones[tone] || iconTones.brand}`}
        style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px' }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-primary mb-0.5">{title}</div>
        {description && <div className="text-xs text-tertiary">{description}</div>}
      </div>
      <ChevronRight
        className="w-[18px] h-[18px] text-tertiary transition-all duration-normal ease-out group-hover:translate-x-0.5 group-hover:text-secondary flex-shrink-0"
        strokeWidth={2}
      />
    </>
  );

  if (href) {
    return (
      <Link href={href} className={baseClasses}>
        {content}
      </Link>
    );
  }

  return (
    <button className={baseClasses} {...props}>
      {content}
    </button>
  );
}
