import { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

/**
 * EmptyState — the most important component in the current codebase.
 *
 * Every list, table, or section that could be empty needs one. Never show
 * "0" as a bare number when the cause is "no data yet" — use this instead.
 *
 * Structure: icon + title + description (what will go here when there IS data)
 * + primary action (the most likely next step).
 */

const iconWrapStyles = cva(
  'w-14 h-14 rounded-xl grid place-items-center mx-auto mb-5',
  {
    variants: {
      tone: {
        brand:    'bg-role-admin-bg text-role-admin-fg',
        success:  'bg-success-bg text-success-fg',
        warning:  'bg-warning-bg text-warning-fg',
        info:     'bg-info-bg text-info-fg',
        neutral:  'bg-elevated text-tertiary',
      },
    },
    defaultVariants: { tone: 'neutral' },
  }
);

export interface EmptyStateProps extends VariantProps<typeof iconWrapStyles> {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  /** Use dashed border (true, default) for "nothing here yet"; solid for "positive empty" like "all caught up" */
  dashed?: boolean;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
  dashed = true,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`
        py-12 px-8 text-center
        bg-surface rounded-xl
        ${dashed ? 'border border-dashed border-default' : 'border border-subtle'}
        ${className}
      `}
    >
      <div className={iconWrapStyles({ tone })}>{icon}</div>
      <h4 className="font-display text-xl font-semibold tracking-tight mb-2 text-primary">
        {title}
      </h4>
      <p className="text-sm text-secondary max-w-sm mx-auto mb-6 leading-relaxed">
        {description}
      </p>
      {action}
    </div>
  );
}
