import type { Config } from 'tailwindcss';

/**
 * ComunidadConnect — Tailwind config v1.0
 *
 * This extends your tokens.css as Tailwind utilities so you can write
 * className="bg-surface text-primary border-subtle rounded-lg" instead of
 * inline styles.
 *
 * Keep tokens.css as the source of truth. If you update a token,
 * update here too — the CSS var is what actually gets applied.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--cc-font-display)'],
        sans:    ['var(--cc-font-sans)'],
        mono:    ['var(--cc-font-mono)'],
      },
      colors: {
        /* Surfaces */
        canvas:   'var(--cc-bg-canvas)',
        surface:  'var(--cc-bg-surface)',
        elevated: 'var(--cc-bg-elevated)',
        overlay:  'var(--cc-bg-overlay)',

        /* Text tokens (use as text-primary, text-secondary, etc.) */
        primary:   'var(--cc-text-primary)',
        secondary: 'var(--cc-text-secondary)',
        tertiary:  'var(--cc-text-tertiary)',
        disabled:  'var(--cc-text-disabled)',

        /* Brand palette (accessible as bg-brand-500, text-brand-300, etc.) */
        brand: {
          50:  'var(--cc-brand-50)',
          100: 'var(--cc-brand-100)',
          200: 'var(--cc-brand-200)',
          300: 'var(--cc-brand-300)',
          400: 'var(--cc-brand-400)',
          500: 'var(--cc-brand-500)',
          600: 'var(--cc-brand-600)',
          700: 'var(--cc-brand-700)',
          800: 'var(--cc-brand-800)',
          900: 'var(--cc-brand-900)',
        },

        /* Role colors — role-admin, role-conserje, role-residente */
        'role-admin': {
          DEFAULT: 'var(--cc-brand-500)',
          fg:      'var(--cc-role-admin-fg)',
          bg:      'var(--cc-role-admin-bg)',
          border:  'var(--cc-role-admin-border)',
        },
        'role-conserje': {
          DEFAULT: 'var(--cc-role-conserje-500)',
          fg:      'var(--cc-role-conserje-fg)',
          bg:      'var(--cc-role-conserje-bg)',
          border:  'var(--cc-role-conserje-border)',
        },
        'role-residente': {
          DEFAULT: 'var(--cc-role-residente-500)',
          fg:      'var(--cc-role-residente-fg)',
          bg:      'var(--cc-role-residente-bg)',
          border:  'var(--cc-role-residente-border)',
        },

        /* Semantic */
        success: {
          fg:     'var(--cc-success-fg)',
          bg:     'var(--cc-success-bg)',
          border: 'var(--cc-success-border)',
          solid:  'var(--cc-success-solid)',
        },
        warning: {
          fg:     'var(--cc-warning-fg)',
          bg:     'var(--cc-warning-bg)',
          border: 'var(--cc-warning-border)',
          solid:  'var(--cc-warning-solid)',
        },
        danger: {
          fg:     'var(--cc-danger-fg)',
          bg:     'var(--cc-danger-bg)',
          border: 'var(--cc-danger-border)',
          solid:  'var(--cc-danger-solid)',
        },
        info: {
          fg:     'var(--cc-info-fg)',
          bg:     'var(--cc-info-bg)',
          border: 'var(--cc-info-border)',
          solid:  'var(--cc-info-solid)',
        },
      },
      borderColor: {
        DEFAULT: 'var(--cc-border-default)',
        subtle:  'var(--cc-border-subtle)',
        default: 'var(--cc-border-default)',
        strong:  'var(--cc-border-strong)',
        focus:   'var(--cc-border-focus)',
      },
      borderRadius: {
        sm:  'var(--cc-radius-sm)',
        md:  'var(--cc-radius-md)',
        lg:  'var(--cc-radius-lg)',
        xl:  'var(--cc-radius-xl)',
        '2xl': 'var(--cc-radius-2xl)',
      },
      boxShadow: {
        sm:          'var(--cc-shadow-sm)',
        md:          'var(--cc-shadow-md)',
        lg:          'var(--cc-shadow-lg)',
        xl:          'var(--cc-shadow-xl)',
        'glow-brand':   'var(--cc-glow-brand)',
        'glow-success': 'var(--cc-glow-success)',
        'glow-warning': 'var(--cc-glow-warning)',
        'glow-danger':  'var(--cc-glow-danger)',
        ring:        'var(--cc-ring-default)',
      },
      transitionDuration: {
        instant: '80ms',
        fast:    '120ms',
        normal:  '200ms',
        slow:    '320ms',
      },
      transitionTimingFunction: {
        out:    'cubic-bezier(0.16, 1, 0.3, 1)',
        inOut:  'cubic-bezier(0.4, 0, 0.2, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
