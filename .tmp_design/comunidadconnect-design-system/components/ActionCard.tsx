import { ButtonHTMLAttributes, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';

/**
 * ActionCard — the "Acceso Rápido" quick action component.
 *
 * Unlike a plain button, it carries CONTEXT: icon (tone-coded), title, subtitle.
 * Used in dashboard sidebars to surface the 2–4 most likely next actions.
 */

const iconWrapStyles = cva(
  'w-9 h-9 rounded-md grid place-items-center flex-shrink-0',
  {
    variants: {
      tone: {
        brand:    'bg-role-admin-bg text-role-admin-fg',
        warning:  'bg-role-conserje-bg text-role-conserje-fg',
        success:  'bg-success-bg text-success-fg',
        danger:   'bg-danger-bg text-danger-fg',
        info:     'bg-info-bg text-info-fg',
      },
    },
    defaultVariants: { tone: 'brand' },
  }
);

export interface ActionCardProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconWrapStyles> {
  icon: ReactNode;
  title: string;
  description?: string;
}

export function ActionCard({
  icon,
  title,
  description,
  tone = 'brand',
  className = '',
  ...props
}: ActionCardProps) {
  return (
    <button
      className={`group flex items-center gap-3.5 w-full
        px-4 py-3.5
        bg-surface border border-subtle rounded-lg
        text-left font-sans
        transition-all duration-fast ease-out
        hover:bg-elevated hover:border-default hover:translate-x-1
        focus-visible:outline-none focus-visible:shadow-ring
        ${className}`}
      {...props}
    >
      <div className={iconWrapStyles({ tone })}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-primary mb-0.5">{title}</div>
        {description && <div className="text-xs text-tertiary">{description}</div>}
      </div>
      <ChevronRight
        className="w-[18px] h-[18px] text-tertiary transition-all duration-normal ease-out group-hover:translate-x-0.5 group-hover:text-secondary flex-shrink-0"
        strokeWidth={2}
      />
    </button>
  );
}
