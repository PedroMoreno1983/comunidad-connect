// src/components/PageHeader.tsx — Clean premium redesign
import { ReactNode } from 'react';

interface PageHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: 'blue' | 'green' | 'purple' | 'orange' | 'red';
  action?: ReactNode;
}

const accentColors = {
  blue:   { dot: '#3b82f6', badge: '#eff6ff', badgeText: '#2563eb', border: '#dbeafe' },
  green:  { dot: '#10b981', badge: '#f0fdf4', badgeText: '#059669', border: '#bbf7d0' },
  purple: { dot: '#8b5cf6', badge: '#f5f3ff', badgeText: '#7c3aed', border: '#ddd6fe' },
  orange: { dot: '#f97316', badge: '#fff7ed', badgeText: '#ea580c', border: '#fed7aa' },
  red:    { dot: '#ef4444', badge: '#fef2f2', badgeText: '#dc2626', border: '#fecaca' },
};

export default function PageHeader({
  icon,
  title,
  subtitle,
  badge,
  badgeColor = 'blue',
  action,
}: PageHeaderProps) {
  const c = accentColors[badgeColor];

  return (
    <div
      style={{
        background: 'white',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        padding: '24px 32px',
        marginBottom: '32px',
        marginLeft: '-32px',
        marginRight: '-32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '24px',
        flexWrap: 'wrap',
      }}
    >
      {/* Left: Icon + Text */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Icon */}
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '14px',
          background: c.badge,
          border: `1px solid ${c.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: c.dot,
        }}>
          {icon}
        </div>

        {/* Title + Subtitle */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
            <h1 style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.3px',
              lineHeight: 1.2,
            }}>
              {title}
            </h1>
            {badge && (
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: '20px',
                background: c.badge,
                color: c.badgeText,
                border: `1px solid ${c.border}`,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}>
                {badge}
              </span>
            )}
          </div>
          <p style={{
            margin: 0,
            fontSize: '13px',
            color: '#94a3b8',
            fontWeight: 500,
          }}>
            {subtitle}
          </p>
        </div>
      </div>

      {/* Right: Actions */}
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}
