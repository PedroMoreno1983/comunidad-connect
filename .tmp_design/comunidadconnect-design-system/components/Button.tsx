import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

/**
 * Button — ComunidadConnect design system
 *
 * Variants: primary, secondary, ghost, danger
 * Sizes:    sm, md (default), lg
 *
 * Rule: use `primary` max once per screen. If you need two CTAs on the
 * same view, promote one to secondary.
 */
const buttonStyles = cva(
  // Base
  [
    'inline-flex items-center justify-center gap-2',
    'font-sans font-medium',
    'rounded-md leading-none',
    'transition-all duration-fast ease-out',
    'cursor-pointer select-none',
    'focus-visible:outline-none focus-visible:shadow-ring',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-brand-500 text-white',
          'shadow-sm',
          'hover:bg-brand-400 hover:shadow-glow-brand hover:-translate-y-px',
          'active:translate-y-0 active:bg-brand-600',
        ],
        secondary: [
          'bg-elevated text-primary border border-default',
          'hover:bg-overlay hover:border-strong',
        ],
        ghost: [
          'bg-transparent text-secondary',
          'hover:bg-elevated hover:text-primary',
        ],
        danger: [
          'bg-danger-bg text-danger-fg border border-danger-border',
          'hover:bg-[rgba(239,68,68,0.20)]',
        ],
      },
      size: {
        sm: 'px-3 py-1.5 text-[13px]',
        md: 'px-4 py-2.5 text-sm',
        lg: 'px-5 py-3 text-[15px]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant, size, leadingIcon, trailingIcon, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`${buttonStyles({ variant, size })} ${className}`}
        {...props}
      >
        {leadingIcon}
        {children}
        {trailingIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
