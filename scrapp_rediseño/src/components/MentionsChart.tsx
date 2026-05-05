// src/components/MentionsChart.tsx — Rediseño Premium
import { useMemo } from 'react';
import {
  Area, AreaChart, CartesianGrid, XAxis, YAxis,
  ResponsiveContainer, Tooltip
} from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface MentionsChartProps {
  mentions: any[];
  period: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="backdrop-blur-xl rounded-xl border px-4 py-3 shadow-lg"
        style={{
          background: 'rgba(255,255,255,0.85)',
          borderColor: 'rgba(0,0,0,0.06)',
        }}
      >
        <p className="text-xs font-semibold text-gray-500 mb-2">{label}</p>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-xs text-gray-600">{p.name}:</span>
            <span className="text-xs font-bold text-gray-900">{p.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function MentionsChart({ mentions, period }: MentionsChartProps) {
  const chartData = useMemo(() => {
    const daysCount = period === 'today' ? 1 : period === '7days' ? 7 : period === '1month' ? 30 : 90;
    const currentDate = new Date();
    const groupedByDay = new Map<string, number>();

    for (let i = daysCount - 1; i >= 0; i--) {
      const date = startOfDay(subDays(currentDate, i));
      const key = format(date, 'dd MMM', { locale: es });
      groupedByDay.set(key, 0);
    }

    mentions.forEach(m => {
      const timestamp = m.timestamp || m.detectedAt || m.publishedAt || m.createdAt;
      if (!timestamp) return;
      const date = startOfDay(new Date(timestamp));
      const key = format(date, 'dd MMM', { locale: es });
      if (groupedByDay.has(key)) {
        groupedByDay.set(key, (groupedByDay.get(key) || 0) + 1);
      }
    });

    return Array.from(groupedByDay.entries()).map(([date, count]) => ({
      date,
      Menciones: count,
      Alcance: count * 100,
    }));
  }, [mentions, period]);

  const stats = useMemo(() => {
    const total = mentions.length;
    const positive = mentions.filter(m => m.sentiment === 'POSITIVE').length;
    const neutral = mentions.filter(m => m.sentiment === 'NEUTRAL' || !m.sentiment).length;
    const negative = mentions.filter(m => m.sentiment === 'NEGATIVE').length;
    return { total, positive, neutral, negative };
  }, [mentions]);

  const miniStats = [
    { label: 'Total', value: stats.total, color: '#2563eb', bg: 'rgba(37,99,235,0.07)', icon: null },
    { label: 'Positivas', value: stats.positive, color: '#10b981', bg: 'rgba(16,185,129,0.07)', icon: ArrowUpRight },
    { label: 'Neutras', value: stats.neutral, color: '#6b7280', bg: 'rgba(107,114,128,0.07)', icon: Minus },
    { label: 'Negativas', value: stats.negative, color: '#ef4444', bg: 'rgba(239,68,68,0.07)', icon: ArrowDownRight },
  ];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
      {/* Card Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Menciones y Alcance</h3>
          <p className="text-xs text-gray-400 mt-0.5">Evolución en el período seleccionado</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-1 rounded-full bg-emerald-500"></div>
            <span className="text-xs text-gray-500">Menciones</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-1 rounded-full" style={{ background: 'linear-gradient(90deg, #818cf8, #6366f1)' }}></div>
            <span className="text-xs text-gray-500">Alcance</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: '260px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradMenciones" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradAlcance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="0" stroke="rgba(0,0,0,0.04)" horizontal={true} vertical={false} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(0,0,0,0.06)', strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="Alcance"
              stroke="#6366f1"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#gradAlcance)"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="Menciones"
              stroke="#10b981"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#gradMenciones)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Mini stats row */}
      <div className="grid grid-cols-4 gap-3 mt-6 pt-5 border-t border-gray-100 dark:border-gray-800">
        {miniStats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="flex flex-col items-center p-3 rounded-xl"
              style={{ backgroundColor: s.bg }}
            >
              <div className="flex items-center gap-1 mb-1">
                {Icon && <Icon size={12} style={{ color: s.color }} />}
                <span className="text-xs font-medium" style={{ color: s.color }}>{s.label}</span>
              </div>
              <span className="text-xl font-bold" style={{ color: s.color }}>{s.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}