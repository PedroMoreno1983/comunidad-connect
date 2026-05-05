// src/components/MediaDistribution.tsx — Rediseño Premium
import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Radio } from 'lucide-react';

interface MediaDistributionProps {
  mentions: any[];
}

const channelPalette = [
  '#2563eb', '#10b981', '#f59e0b', '#ec4899',
  '#7c3aed', '#0891b2', '#ef4444', '#84cc16',
];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0];
    return (
      <div className="backdrop-blur-xl rounded-xl border px-3 py-2 shadow-lg"
        style={{ background: 'rgba(255,255,255,0.92)', borderColor: 'rgba(0,0,0,0.06)' }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.payload.color }} />
          <span className="text-xs font-bold text-gray-800">{d.name}</span>
          <span className="text-xs text-gray-500">({d.value})</span>
        </div>
      </div>
    );
  }
  return null;
};

export default function MediaDistribution({ mentions }: MediaDistributionProps) {
  const { byChannel, byType } = useMemo(() => {
    if (!mentions || mentions.length === 0) return { byChannel: [], byType: [] };

    const typeMap = new Map<string, number>();
    const channelMap = new Map<string, number>();

    mentions.forEach(m => {
      const sourceName = m.source?.name || 'Desconocido';
      const sourceType = m.source?.type;
      let type = 'Web';
      if (sourceType === 'LIVE_STREAM') type = 'TV';
      else if (sourceType === 'RADIO_STREAM') type = 'Radio';
      typeMap.set(type, (typeMap.get(type) || 0) + 1);
      channelMap.set(sourceName, (channelMap.get(sourceName) || 0) + 1);
    });

    const byType = [
      { name: 'TV',    value: typeMap.get('TV')    || 0, color: '#ec4899' },
      { name: 'Radio', value: typeMap.get('Radio') || 0, color: '#7c3aed' },
      { name: 'Web',   value: typeMap.get('Web')   || 0, color: '#2563eb' },
    ].filter(d => d.value > 0);

    const byChannel = Array.from(channelMap.entries())
      .map(([name, value], idx) => ({ name, value, color: channelPalette[idx % channelPalette.length] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    return { byChannel, byType };
  }, [mentions]);

  const total = mentions?.length ?? 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm h-full flex flex-col">
      {/* Header */}
      <div className="mb-5">
        <h3 className="text-base font-bold text-gray-900 dark:text-white">Distribución por Canal</h3>
        <p className="text-xs text-gray-400 mt-0.5">{byChannel.length} canales activos</p>
      </div>

      {total === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-300">
          <div className="text-center">
            <Radio size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Sin datos disponibles</p>
          </div>
        </div>
      ) : (
        <>
          {/* Donut dual ring */}
          <div className="flex items-center justify-center mb-5">
            <div className="relative" style={{ width: 180, height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byChannel}
                    cx="50%" cy="50%"
                    innerRadius={58} outerRadius={76}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                    startAngle={90} endAngle={-270}
                  >
                    {byChannel.map((entry, idx) => (
                      <Cell key={`ch-${idx}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Pie
                    data={byType}
                    cx="50%" cy="50%"
                    innerRadius={36} outerRadius={50}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                    startAngle={90} endAngle={-270}
                  >
                    {byType.map((entry, idx) => (
                      <Cell key={`type-${idx}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-gray-900 dark:text-white leading-none">{total}</span>
                <span className="text-xs text-gray-400 mt-0.5">menciones</span>
              </div>
            </div>
          </div>

          {/* Channel legend grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mt-auto">
            {byChannel.slice(0, 8).map(item => (
              <div key={item.name} className="flex items-center gap-2 min-w-0">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1">{item.name}</span>
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200 shrink-0">{item.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}