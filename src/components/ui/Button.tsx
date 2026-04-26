import { ButtonHTMLAttributes, CSSProperties, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

/**
 * Button — ComunidadConnect design system
 *
 * Variants: primary, secondary, ghost, danger, outline
 * Sizes:    sm, md (default), lg
 */

const buttonStyles = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'font-sans font-medium',
    'rounded-md leading-none',
    'transition-all duration-150 ease-out',
    'cursor-pointer select-none',
    'focus-visible:outline-none',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
  ],
  {
    variants: {
      variant: {
        primary: [
          'text-white',
          // Background set via style prop below — using !important to ensure override
        ],
        secondary: [
          'border',
        ],
        outline: [
          'border',
        ],
        ghost: [
          'bg-transparent',
        ],
        danger: [
          'border',
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

const variantStyles: Record<string, CSSProperties> = {
  primary: {
    backgroundColor: 'var(--cc-brand-500)',
    color: '#ffffff',
    boxShadow: 'var(--cc-glow-brand)',
  },
  secondary: {
    backgroundColor: 'var(--cc-bg-elevated)',
    color: 'var(--cc-text-primary)',
    borderColor: 'var(--cc-border-default)',
  },
  outline: {
    backgroundColor: 'var(--cc-bg-elevated)',
    color: 'var(--cc-text-primary)',
    borderColor: 'var(--cc-border-default)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--cc-text-primary)',
  },
  danger: {
    backgroundColor: 'var(--cc-danger-bg)',
    color: 'var(--cc-danger-fg)',
    borderColor: 'var(--cc-danger-border)',
  },
};

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size, leadingIcon, trailingIcon, children, style, ...props }, ref) => {
    const variantKey = variant ?? 'primary';
    const inlineStyle: CSSProperties = {
      ...variantStyles[variantKey],
      ...style,
    };

    return (
      <button
        ref={ref}
        className={`${buttonStyles({ variant, size })} ${className}`}
        style={inlineStyle}
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
