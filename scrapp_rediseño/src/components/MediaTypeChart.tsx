// src/components/MediaTypeChart.tsx — Rediseño Premium
import { useMemo } from 'react';
import { Tv, Radio, Globe, Youtube, Facebook, Twitter, Instagram, Linkedin } from 'lucide-react';

interface MediaTypeChartProps {
  mentions: any[];
}

function detectMentionType(m: any): string {
  const sourceType = m.source?.type ?? '';
  const contextBefore = m.contextBefore ?? '';
  if (contextBefore.startsWith('[YOUTUBE]'))   return 'YouTube';
  if (contextBefore.startsWith('[FACEBOOK]'))  return 'Facebook';
  if (contextBefore.startsWith('[TWITTER]'))   return 'Twitter';
  if (contextBefore.startsWith('[INSTAGRAM]')) return 'Instagram';
  if (contextBefore.startsWith('[LINKEDIN]'))  return 'LinkedIn';
  if (sourceType === 'SOCIAL_YOUTUBE')   return 'YouTube';
  if (sourceType === 'SOCIAL_FACEBOOK')  return 'Facebook';
  if (sourceType === 'SOCIAL_TWITTER')   return 'Twitter';
  if (sourceType === 'SOCIAL_INSTAGRAM') return 'Instagram';
  if (sourceType === 'SOCIAL_LINKEDIN')  return 'LinkedIn';
  if (sourceType === 'LIVE_STREAM')  return 'TV';
  if (sourceType === 'RADIO_STREAM') return 'Radio';
  return 'Web';
}

const MEDIA_CONFIG: Record<string, { color: string; bg: string; icon: any }> = {
  TV:        { color: '#ec4899', bg: 'rgba(236,72,153,0.1)',  icon: Tv },
  Radio:     { color: '#7c3aed', bg: 'rgba(124,58,237,0.1)', icon: Radio },
  Web:       { color: '#0891b2', bg: 'rgba(8,145,178,0.1)',   icon: Globe },
  YouTube:   { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   icon: Youtube },
  Facebook:  { color: '#2563eb', bg: 'rgba(37,99,235,0.1)',   icon: Facebook },
  Twitter:   { color: '#1d9bf0', bg: 'rgba(29,155,240,0.1)',  icon: Twitter },
  Instagram: { color: '#e1306c', bg: 'rgba(225,48,108,0.1)',  icon: Instagram },
  LinkedIn:  { color: '#0a66c2', bg: 'rgba(10,102,194,0.1)',  icon: Linkedin },
};

export default function MediaTypeChart({ mentions }: MediaTypeChartProps) {
  const mediaData = useMemo(() => {
    const counts: Record<string, number> = {};
    (mentions ?? []).forEach(m => {
      const type = detectMentionType(m);
      counts[type] = (counts[type] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value, ...( MEDIA_CONFIG[name] ?? { color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: Globe }) }))
      .sort((a, b) => b.value - a.value);
  }, [mentions]);

  const total = mediaData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm h-full flex flex-col">
      {/* Header */}
      <div className="mb-5">
        <h3 className="text-base font-bold text-gray-900 dark:text-white">Cobertura por Medio</h3>
        <p className="text-xs text-gray-400 mt-0.5">{total} menciones totales</p>
      </div>

      {total === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-300">
          <div className="text-center">
            <Globe size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Sin datos disponibles</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-3">
          {mediaData.map(item => {
            const Icon = item.icon;
            const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
            return (
              <div key={item.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: item.bg }}
                    >
                      <Icon size={13} style={{ color: item.color }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{item.value}</span>
                    <span
                      className="text-xs font-semibold px-1.5 py-0.5 rounded-md"
                      style={{ backgroundColor: item.bg, color: item.color }}
                    >
                      {pct}%
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-2 rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
