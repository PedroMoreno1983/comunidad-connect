// src/components/KPICards.tsx — Rediseño Premium
import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, MessageSquare, Users, DollarSign, Activity } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface KPICardsProps {
  mentions: any[];
}

type TrendType = 'up' | 'down' | 'neutral';

export default function KPICards({ mentions }: KPICardsProps) {
  const stats = useMemo(() => {
    if (!mentions || mentions.length === 0) {
      return {
        total: 0, monthlyAvg: 0, reach: 0, value: 0, change: 0,
        sparklineData: Array.from({ length: 14 }, () => ({ value: 0 })),
        reachSparkline: Array.from({ length: 14 }, () => ({ value: 0 })),
      };
    }

    const total = mentions.length;
    const monthlyAvg = Math.round(total / 12);
    const reach = total * 100;
    const change = monthlyAvg > 0 ? Math.round(((total - monthlyAvg) / monthlyAvg) * 100) : 0;

    const sparklineData = Array.from({ length: 14 }, (_, i) => {
      const daysAgo = 13 - i;
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      date.setHours(0, 0, 0, 0);
      const count = mentions.filter(m => {
        const ts = m.timestamp || m.detectedAt || m.publishedAt || m.createdAt;
        if (!ts) return false;
        const d = new Date(ts); d.setHours(0, 0, 0, 0);
        return d.getTime() === date.getTime();
      }).length;
      return { value: count };
    });

    const reachSparkline = sparklineData.map(d => ({ value: d.value * 100 }));

    return { total, monthlyAvg, reach, value: 0, change, sparklineData, reachSparkline };
  }, [mentions]);

  const kpis = [
    {
      title: 'Menciones',
      value: stats.total.toLocaleString(),
      subvalue: `Promedio mensual: ${stats.monthlyAvg}`,
      change: `${stats.change >= 0 ? '+' : ''}${stats.change}%`,
      trend: (stats.change > 0 ? 'up' : stats.change < 0 ? 'down' : 'neutral') as TrendType,
      icon: MessageSquare,
      color: '#f97316',
      bgColor: 'rgba(249, 115, 22, 0.08)',
      sparkline: stats.sparklineData,
    },
    {
      title: 'Alcance Estimado',
      value: stats.reach >= 1000 ? `${(stats.reach / 1000).toFixed(1)}K` : stats.reach.toLocaleString(),
      subvalue: '~100 personas por mención',
      change: `${stats.change >= 0 ? '+' : ''}${stats.change}%`,
      trend: (stats.change > 0 ? 'up' : stats.change < 0 ? 'down' : 'neutral') as TrendType,
      icon: Users,
      color: '#10b981',
      bgColor: 'rgba(16, 185, 129, 0.08)',
      sparkline: stats.reachSparkline,
    },
    {
      title: 'Valorización',
      value: '$0',
      subvalue: 'Pendiente de cálculo',
      change: '+0%',
      trend: 'neutral' as TrendType,
      icon: DollarSign,
      color: '#6366f1',
      bgColor: 'rgba(99, 102, 241, 0.08)',
      sparkline: null,
    },
  ];

  const trendConfig = {
    up:      { icon: TrendingUp,   bg: 'rgba(16,185,129,0.1)',  text: '#10b981' },
    down:    { icon: TrendingDown, bg: 'rgba(239,68,68,0.1)',   text: '#ef4444' },
    neutral: { icon: Minus,        bg: 'rgba(107,114,128,0.1)', text: '#6b7280' },
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
      {kpis.map((kpi, index) => {
        const TrendIcon = trendConfig[kpi.trend].icon;
        return (
          <div
            key={kpi.title}
            className="group relative overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-gray-100 dark:hover:shadow-none"
          >
            {/* Subtle gradient accent top-right */}
            <div
              className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-50 blur-3xl pointer-events-none transition-opacity duration-500 group-hover:opacity-80"
              style={{ backgroundColor: kpi.color }}
            />

            {/* Header Row */}
            <div className="relative flex items-start justify-between mb-5">
              {/* Icon */}
              <div
                className="flex items-center justify-center w-12 h-12 rounded-2xl shadow-sm"
                style={{ backgroundColor: kpi.bgColor }}
              >
                <kpi.icon size={20} style={{ color: kpi.color }} />
              </div>

              {/* Trend Badge */}
              <div
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: trendConfig[kpi.trend].bg, color: trendConfig[kpi.trend].text }}
              >
                <TrendIcon size={11} />
                {kpi.change}
              </div>
            </div>

            {/* Main Value */}
            <div className="relative mb-1">
              <span className="text-4xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {kpi.value}
              </span>
            </div>
            <p className="relative text-sm font-medium mb-4" style={{ color: 'var(--text-muted)' }}>
              {kpi.title}
            </p>

            {/* Sparkline */}
            {kpi.sparkline ? (
              <div className="relative h-14 -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={kpi.sparkline} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`kpi-gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={kpi.color} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={kpi.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={kpi.color}
                      strokeWidth={2}
                      fill={`url(#kpi-gradient-${index})`}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div
                className="h-14 rounded-xl flex items-center justify-center gap-2"
                style={{ backgroundColor: kpi.bgColor }}
              >
                <Activity size={14} style={{ color: kpi.color, opacity: 0.5 }} />
                <span className="text-xs" style={{ color: kpi.color, opacity: 0.6 }}>Sin datos históricos</span>
              </div>
            )}

            {/* Footer */}
            <p className="relative text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
              {kpi.subvalue}
            </p>
          </div>
        );
      })}
    </div>
  );
}