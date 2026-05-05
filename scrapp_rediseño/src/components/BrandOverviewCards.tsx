// frontend/src/components/BrandOverviewCards.tsx — Premium redesign
import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Tag, Tv, Radio, Globe, ArrowRight, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Brand } from '../services/brandService';

interface BrandStats {
  brand: Brand;
  total: number;
  recentCount: number;
  positive: number;
  neutral: number;
  negative: number;
  tvCount: number;
  radioCount: number;
  webCount: number;
  socialCount: number;
  latestMention: any | null;
}

interface Props {
  brands: Brand[];
  mentions: any[];
  activeBrandId?: string | null;
  onBrandFilter?: (brandId: string | null) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const BRAND_COLORS = [
  { from: '#6366f1', to: '#8b5cf6' },
  { from: '#0ea5e9', to: '#6366f1' },
  { from: '#10b981', to: '#0ea5e9' },
  { from: '#f59e0b', to: '#ef4444' },
  { from: '#ec4899', to: '#8b5cf6' },
  { from: '#14b8a6', to: '#6366f1' },
];

export default function BrandOverviewCards({
  brands, mentions, activeBrandId, onBrandFilter, onRefresh, isRefreshing,
}: Props) {
  const brandStats = useMemo<BrandStats[]>(() => {
    return brands
      .filter((b) => b.isActive)
      .map((brand) => {
        const bm = mentions.filter((m) => m.brand?.id === brand.id);
        const positive = bm.filter((m) => m.sentiment === 'POSITIVE').length;
        const negative = bm.filter((m) => m.sentiment === 'NEGATIVE').length;
        const neutral = bm.length - positive - negative;
        const tvCount = bm.filter((m) => m.source?.type === 'LIVE_STREAM').length;
        const radioCount = bm.filter((m) => m.source?.type === 'RADIO_STREAM').length;
        const webCount = bm.filter((m) => ['WEB_SCRAPE', 'RSS_FEED', 'API'].includes(m.source?.type || '')).length;
        const socialCount = bm.filter((m) => (m.source?.type || '').startsWith('SOCIAL')).length;
        const sorted = [...bm].sort((a, b) => {
          return new Date(b.timestamp || b.detectedAt || 0).getTime() -
                 new Date(a.timestamp || a.detectedAt || 0).getTime();
        });
        return {
          brand,
          total: brand._count?.mentions ?? bm.length,
          recentCount: bm.length,
          positive, neutral, negative,
          tvCount, radioCount, webCount, socialCount,
          latestMention: sorted[0] ?? null,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [brands, mentions]);

  if (brandStats.length === 0) return null;

  return (
    <div style={{ marginBottom: '32px' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            MARCAS MONITOREADAS
          </p>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.3px' }}>
            Panel de Marcas
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Últimos 7 días · {brandStats.length} marcas activas
            {activeBrandId && <span style={{ color: '#6366f1', marginLeft: '8px' }}>· filtrando análisis</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {activeBrandId && (
            <button
              onClick={() => onBrandFilter?.(null)}
              style={{
                fontSize: '13px', color: '#6366f1', background: '#f5f3ff',
                border: '1px solid #ddd6fe', borderRadius: '8px',
                padding: '7px 14px', cursor: 'pointer', fontWeight: 600,
              }}
            >
              Ver todas
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '13px', color: 'var(--text-muted)', background: 'var(--bg-card)',
              border: '1px solid var(--border-color)', borderRadius: '8px',
              padding: '7px 14px', cursor: 'pointer',
              opacity: isRefreshing ? 0.5 : 1,
            }}
          >
            <RefreshCw size={13} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            Actualizar
          </button>
          <Link
            to="/dashboard/brands"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '13px', color: '#6366f1', textDecoration: 'none', fontWeight: 700,
              background: '#f5f3ff', border: '1px solid #ddd6fe',
              borderRadius: '8px', padding: '7px 14px',
            }}
          >
            Gestionar <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* Cards grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px',
      }}>
        {brandStats.map(({ brand, total, recentCount, positive, neutral, negative, tvCount, radioCount, webCount, socialCount, latestMention }, index) => {
          const isActive = activeBrandId === brand.id;
          const base = recentCount > 0 ? recentCount : 1;
          const posP = recentCount > 0 ? Math.round((positive / base) * 100) : 0;
          const negP = recentCount > 0 ? Math.round((negative / base) * 100) : 0;
          const neuP = 100 - posP - negP;
          const colors = BRAND_COLORS[index % BRAND_COLORS.length];
          const dominantSentiment = positive >= negative ? 'positive' : 'negative';

          return (
            <div
              key={brand.id}
              onClick={() => onBrandFilter?.(isActive ? null : brand.id)}
              style={{
                background: 'var(--bg-card)',
                border: isActive ? '2px solid #6366f1' : '2px solid var(--border-color)',
                borderRadius: '16px',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isActive ? '0 0 0 4px rgba(99,102,241,0.12)' : 'var(--shadow-sm)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = '#c7d2fe';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.12)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              {/* Color bar */}
              <div style={{ height: '3px', background: `linear-gradient(90deg, ${colors.from}, ${colors.to})` }} />

              {/* Card body */}
              <div style={{ padding: '16px' }}>
                {/* Brand name + icon */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
                    background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 4px 12px ${colors.from}40`,
                  }}>
                    <Tag size={16} color="white" />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{
                      fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)',
                      margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {brand.name}
                    </p>
                    <p style={{ fontSize: '12px', margin: 0, color: total > 0 ? '#6366f1' : 'var(--text-muted)', fontWeight: 600 }}>
                      {total > 0 ? `${total.toLocaleString()} menciones totales` : 'Sin menciones'}
                    </p>
                  </div>
                  {/* Sentiment icon */}
                  {recentCount > 0 && (
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                      background: dominantSentiment === 'positive' ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {dominantSentiment === 'positive'
                        ? <TrendingUp size={14} color="#16a34a" />
                        : <TrendingDown size={14} color="#dc2626" />
                      }
                    </div>
                  )}
                </div>

                {recentCount > 0 ? (
                  <>
                    {/* Sentiment bar */}
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{
                        display: 'flex', height: '5px', borderRadius: '4px',
                        overflow: 'hidden', background: 'var(--border-color)',
                      }}>
                        {posP > 0 && <div style={{ width: `${posP}%`, background: '#22c55e' }} title={`${positive} positivas`} />}
                        {neuP > 0 && <div style={{ width: `${neuP}%`, background: '#94a3b8' }} title={`${neutral} neutrales`} />}
                        {negP > 0 && <div style={{ width: `${negP}%`, background: '#ef4444' }} title={`${negative} negativas`} />}
                      </div>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                        <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>↑ {positive}</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>● {neutral}</span>
                        <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 600 }}>↓ {negative}</span>
                      </div>
                    </div>

                    {/* Media badges */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
                      {tvCount > 0 && (
                        <span style={{
                          display: 'flex', alignItems: 'center', gap: '3px',
                          padding: '2px 8px', borderRadius: '20px',
                          background: '#fef2f2', border: '1px solid #fecaca',
                          fontSize: '11px', color: '#dc2626', fontWeight: 700,
                        }}>
                          <Tv size={9} /> {tvCount} TV
                        </span>
                      )}
                      {radioCount > 0 && (
                        <span style={{
                          display: 'flex', alignItems: 'center', gap: '3px',
                          padding: '2px 8px', borderRadius: '20px',
                          background: '#faf5ff', border: '1px solid #e9d5ff',
                          fontSize: '11px', color: '#7c3aed', fontWeight: 700,
                        }}>
                          <Radio size={9} /> {radioCount} Radio
                        </span>
                      )}
                      {webCount > 0 && (
                        <span style={{
                          display: 'flex', alignItems: 'center', gap: '3px',
                          padding: '2px 8px', borderRadius: '20px',
                          background: '#f0fdf4', border: '1px solid #bbf7d0',
                          fontSize: '11px', color: '#15803d', fontWeight: 700,
                        }}>
                          <Globe size={9} /> {webCount} Web
                        </span>
                      )}
                      {socialCount > 0 && (
                        <span style={{
                          display: 'flex', alignItems: 'center', gap: '3px',
                          padding: '2px 8px', borderRadius: '20px',
                          background: '#eff6ff', border: '1px solid #bfdbfe',
                          fontSize: '11px', color: '#1d4ed8', fontWeight: 700,
                        }}>
                          📱 {socialCount}
                        </span>
                      )}
                    </div>

                    {/* Latest mention */}
                    {latestMention && (
                      <div style={{
                        padding: '10px 12px', borderRadius: '10px',
                        background: 'var(--bg-body)', border: '1px solid var(--border-color)',
                      }}>
                        <p style={{
                          fontSize: '10px', fontWeight: 700, color: '#94a3b8',
                          marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>
                          Última mención
                        </p>
                        <p style={{
                          fontSize: '12px', color: 'var(--text-primary)', margin: '0 0 5px',
                          lineHeight: 1.4,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        } as CSSProperties}>
                          {latestMention.title || latestMention.context || 'Sin título'}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500 }}>
                            {latestMention.source?.name || '—'}
                          </span>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                            {latestMention.timestamp || latestMention.detectedAt
                              ? formatDistanceToNow(new Date(latestMention.timestamp || latestMention.detectedAt), { addSuffix: true, locale: es })
                              : '—'}
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{
                    padding: '16px', borderRadius: '10px', textAlign: 'center',
                    background: 'var(--bg-body)', border: '1px dashed var(--border-color)',
                  }}>
                    <Minus size={16} color="#cbd5e1" style={{ marginBottom: '4px' }} />
                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, fontWeight: 500 }}>
                      Sin menciones recientes
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
