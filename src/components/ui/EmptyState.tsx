"use client";

import { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';

/**
 * EmptyState — the most important component in the current codebase.
 *
 * Every list, table, or section that could be empty needs one. Never show
 * "0" as a bare number when the cause is "no data yet" — use this instead.
 *
 * Structure: icon + title + description (what will go here when there IS data)
 * + primary action (the most likely next step).
 *
 * Uses CSS custom properties directly (via style={}) so styles are always
 * resolved regardless of Tailwind JIT purge settings in production.
 */

const iconToneStyles: Record<string, CSSProperties> = {
  brand:   { backgroundColor: 'var(--cc-role-admin-bg)',  color: 'var(--cc-role-admin-fg)' },
  success: { backgroundColor: 'var(--cc-success-bg)',     color: 'var(--cc-success-fg)' },
  warning: { backgroundColor: 'var(--cc-warning-bg)',     color: 'var(--cc-warning-fg)' },
  info:    { backgroundColor: 'var(--cc-info-bg)',        color: 'var(--cc-info-fg)' },
  neutral: { backgroundColor: 'var(--cc-bg-elevated)',    color: 'var(--cc-text-tertiary)' },
};

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: 'brand' | 'success' | 'warning' | 'info' | 'neutral';
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
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ scale: 1.005, y: -2 }}
      className={`py-12 px-8 text-center rounded-2xl shadow-sm border transition-all duration-300 ${className}`}
      style={{
        backgroundColor: 'var(--cc-bg-surface)',
        backdropFilter: 'blur(8px)',
        borderStyle: dashed ? 'dashed' : 'solid',
        borderColor: dashed ? 'var(--cc-border-default)' : 'var(--cc-border-subtle)',
      }}
    >
      <motion.div
        whileHover={{ scale: 1.1, rotate: [0, -5, 5, 0] }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          display: 'grid',
          placeItems: 'center',
          margin: '0 auto 20px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
          ...(iconToneStyles[tone ?? 'neutral'] || iconToneStyles.neutral),
        }}
      >
        <span className="scale-110">{icon}</span>
      </motion.div>
      <h4
        style={{
          fontFamily: 'var(--cc-font-display)',
          fontSize: '20px',
          fontWeight: 600,
          letterSpacing: '-0.01em',
          marginBottom: '8px',
          color: 'var(--cc-text-primary)',
        }}
      >
        {title}
      </h4>
      <p
        style={{
          fontSize: '14px',
          color: 'var(--cc-text-secondary)',
          maxWidth: '384px',
          margin: '0 auto 24px',
          lineHeight: 1.7,
        }}
      >
        {description}
      </p>
      {action && (
        <motion.div 
          whileTap={{ scale: 0.98 }}
          className="inline-block"
        >
          {action}
        </motion.div>
      )}
    </motion.div>
  );
}
