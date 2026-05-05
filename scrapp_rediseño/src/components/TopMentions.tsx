// src/components/TopMentions.tsx — Rediseño Premium
import { useMemo } from 'react';
import { ExternalLink, Tv, Radio, Globe, Twitter, Instagram, Youtube } from 'lucide-react';

interface TopMentionsProps {
  mentions: any[];
  onMentionClick?: (mentionId: string) => void;
}

const sourceConfig: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  LIVE_STREAM: { icon: Tv,        label: 'TV',       color: '#2563eb', bg: 'rgba(37,99,235,0.1)' },
  RADIO_STREAM: { icon: Radio,     label: 'Radio',    color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  WEB_SCRAPE:   { icon: Globe,     label: 'Web',      color: '#0891b2', bg: 'rgba(8,145,178,0.1)' },
  RSS_FEED:     { icon: Globe,     label: 'RSS',      color: '#0d9488', bg: 'rgba(13,148,136,0.1)' },
  TWITTER:      { icon: Twitter,   label: 'Twitter',  color: '#1d9bf0', bg: 'rgba(29,155,240,0.1)' },
  INSTAGRAM:    { icon: Instagram, label: 'Instagram',color: '#e1306c', bg: 'rgba(225,48,108,0.1)' },
  YOUTUBE:      { icon: Youtube,   label: 'YouTube',  color: '#ff0000', bg: 'rgba(255,0,0,0.1)' },
  SOCIAL:       { icon: Globe,     label: 'Social',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
};

const sentimentConfig = {
  POSITIVE: { label: 'Positiva', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  NEGATIVE: { label: 'Negativa', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  NEUTRAL:  { label: 'Neutral',  color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
};

export default function TopMentions({ mentions, onMentionClick }: TopMentionsProps) {
  const topMentions = useMemo(() => {
    if (!mentions || mentions.length === 0) return [];
    return mentions.slice(0, 7).map((mention, index) => {
      const sourceType = mention.source?.type || 'WEB_SCRAPE';
      const sentiment = (mention.sentiment as keyof typeof sentimentConfig) || 'NEUTRAL';
      return {
        id: mention.id,
        rank: index + 1,
        title: mention.title || mention.keyword || mention.context?.substring(0, 60) || 'Sin título',
        sourceName: mention.source?.name || 'Desconocido',
        type: sourceType,
        sentiment,
      };
    });
  }, [mentions]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm h-full flex flex-col">
      {/* Header */}
      <div className="mb-5">
        <h3 className="text-base font-bold text-gray-900 dark:text-white">Notas Destacadas</h3>
        <p className="text-xs text-gray-400 mt-0.5">Mayor alcance en el período</p>
      </div>

      {/* List */}
      <div className="flex-1 space-y-2">
        {topMentions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-300">
            <Globe size={32} className="mb-3 opacity-30" />
            <p className="text-sm">Sin menciones aún</p>
          </div>
        ) : (
          topMentions.map((mention) => {
            const src = sourceConfig[mention.type] ?? sourceConfig.WEB_SCRAPE;
            const sent = sentimentConfig[mention.sentiment as keyof typeof sentimentConfig] ?? sentimentConfig.NEUTRAL;
            const SrcIcon = src.icon;

            return (
              <div
                key={mention.id}
                className="group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                onClick={() => onMentionClick?.(mention.id)}
              >
                {/* Rank watermark */}
                <span
                  className="text-2xl font-black shrink-0 leading-none select-none"
                  style={{ color: 'rgba(0,0,0,0.06)', width: 28, textAlign: 'right' }}
                >
                  {mention.rank}
                </span>

                {/* Source icon */}
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0"
                  style={{ backgroundColor: src.bg }}
                >
                  <SrcIcon size={14} style={{ color: src.color }} />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate leading-tight"
                  >
                    {mention.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{mention.sourceName}</p>
                </div>

                {/* Sentiment pill */}
                <span
                  className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: sent.bg, color: sent.color }}
                >
                  {sent.label}
                </span>

                {/* Arrow — visible on hover */}
                <ExternalLink
                  size={14}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400"
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}