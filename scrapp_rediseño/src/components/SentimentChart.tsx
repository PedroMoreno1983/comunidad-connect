// src/components/SentimentChart.tsx — Rediseño Premium
import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { SmilePlus, Meh, ThumbsDown } from 'lucide-react';

interface SentimentChartProps {
  mentions: any[];
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0];
    return (
      <div className="backdrop-blur-xl rounded-xl border px-3 py-2 shadow-lg"
        style={{ background: 'rgba(255,255,255,0.9)', borderColor: 'rgba(0,0,0,0.06)' }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.payload.color }} />
          <span className="text-xs font-semibold text-gray-800">{d.name}: {d.value}</span>
        </div>
      </div>
    );
  }
  return null;
};

export default function SentimentChart({ mentions }: SentimentChartProps) {
  const sentimentData = useMemo(() => {
    if (!mentions || mentions.length === 0) {
      return {
        data: [
          { name: 'Positiva', value: 1, color: '#10b981' },
          { name: 'Neutra', value: 1, color: '#d1d5db' },
          { name: 'Negativa', value: 1, color: '#f87171' },
        ],
        percentages: { positive: 0, neutral: 0, negative: 0 },
        total: 0,
      };
    }

    const positive = mentions.filter(m => m.sentiment === 'POSITIVE').length;
    const neutral = mentions.filter(m => m.sentiment === 'NEUTRAL' || !m.sentiment).length;
    const negative = mentions.filter(m => m.sentiment === 'NEGATIVE').length;
    const total = mentions.length;

    return {
      data: [
        { name: 'Positiva', value: positive, color: '#10b981' },
        { name: 'Neutra', value: neutral, color: '#d1d5db' },
        { name: 'Negativa', value: negative, color: '#f87171' },
      ],
      percentages: {
        positive: total > 0 ? Math.round((positive / total) * 100) : 0,
        neutral: total > 0 ? Math.round((neutral / total) * 100) : 0,
        negative: total > 0 ? Math.round((negative / total) * 100) : 0,
      },
      total,
    };
  }, [mentions]);

  const sentimentRows = [
    {
      label: 'Positiva',
      pct: sentimentData.percentages.positive,
      color: '#10b981',
      bg: 'rgba(16,185,129,0.08)',
      icon: SmilePlus,
    },
    {
      label: 'Neutra',
      pct: sentimentData.percentages.neutral,
      color: '#6b7280',
      bg: 'rgba(107,114,128,0.07)',
      icon: Meh,
    },
    {
      label: 'Negativa',
      pct: sentimentData.percentages.negative,
      color: '#ef4444',
      bg: 'rgba(239,68,68,0.08)',
      icon: ThumbsDown,
    },
  ];

  const dominantSentiment = sentimentData.percentages.positive >= sentimentData.percentages.negative
    ? { label: 'Positivo', color: '#10b981', pct: sentimentData.percentages.positive }
    : { label: 'Negativo', color: '#ef4444', pct: sentimentData.percentages.negative };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm h-full flex flex-col">
      {/* Header */}
      <div className="mb-5">
        <h3 className="text-base font-bold text-gray-900 dark:text-white">Tono de Noticias</h3>
        <p className="text-xs text-gray-400 mt-0.5">{sentimentData.total} menciones analizadas</p>
      </div>

      {/* Donut Chart */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative" style={{ width: 200, height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={sentimentData.data}
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={82}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
                startAngle={90}
                endAngle={-270}
              >
                {sentimentData.data.map((entry, idx) => (
                  <Cell key={`cell-${idx}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span
              className="text-3xl font-black leading-none"
              style={{ color: dominantSentiment.color }}
            >
              {dominantSentiment.pct}%
            </span>
            <span className="text-xs font-semibold text-gray-400 mt-1">
              {dominantSentiment.label}
            </span>
          </div>
        </div>
      </div>

      {/* Sentiment Rows — Progress-bar style */}
      <div className="mt-5 space-y-3">
        {sentimentRows.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex items-center gap-3">
              <div
                className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0"
                style={{ backgroundColor: s.bg }}
              >
                <Icon size={14} style={{ color: s.color }} />
              </div>
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{s.label}</span>
                  <span className="text-xs font-bold" style={{ color: s.color }}>{s.pct}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-1.5 rounded-full transition-all duration-700"
                    style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}