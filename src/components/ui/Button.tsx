import { ButtonHTMLAttributes, CSSProperties, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

/**
 * Button — ComunidadConnect design system
 *
 * Variants: primary, secondary, ghost, danger, outline
 * Sizes:    sm, md (default), lg
 *
 * Uses hardcoded RGBA colors so buttons always render correctly
 * regardless of CSS variable resolution timing.
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

// Inline styles per variant — immune to CSS variable resolution issues
const variantStyles: Record<string, CSSProperties> = {
  primary: {
    backgroundColor: '#7C3AED',
    color: '#ffffff',
    boxShadow: '0 2px 8px rgba(124, 58, 237, 0.30)',
  },
  secondary: {
    backgroundColor: 'rgba(128, 128, 128, 0.08)',
    color: 'inherit',
    borderColor: 'rgba(128, 128, 128, 0.20)',
  },
  outline: {
    backgroundColor: 'rgba(128, 128, 128, 0.08)',
    color: 'inherit',
    borderColor: 'rgba(128, 128, 128, 0.20)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'inherit',
  },
  danger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    color: '#F87171',
    borderColor: 'rgba(239, 68, 68, 0.30)',
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
