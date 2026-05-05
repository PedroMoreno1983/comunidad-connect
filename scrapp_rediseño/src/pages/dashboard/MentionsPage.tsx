// src/pages/mentions/MentionsPage.tsx
import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { pilotMentionsService } from '../../services/pilotMentionsService';
import { brandService } from '../../services/brandService';
import {
  Search, Download, Filter, Play, Tv, Radio, Globe, MessageSquare,
  Youtube, Facebook, Twitter, Instagram, Linkedin, ExternalLink, X, FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import '../../styles/mentions.css';
import PageHeader from '../../components/PageHeader';

type MediaFilter = 'all' | 'tv' | 'radio' | 'web' | 'youtube' | 'facebook' | 'twitter' | 'instagram' | 'linkedin';
type SentimentFilter = 'all' | 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

// ─── Helpers para detectar tipo de mención ──────────────────────────────────
function getMentionNetwork(mention: any): string {
  const sourceType = mention.source?.type ?? '';
  const cb = mention.contextBefore ?? '';

  if (cb.startsWith('[YOUTUBE]') || sourceType === 'SOCIAL_YOUTUBE')   return 'youtube';
  if (cb.startsWith('[FACEBOOK]') || sourceType === 'SOCIAL_FACEBOOK')  return 'facebook';
  if (cb.startsWith('[TWITTER]') || sourceType === 'SOCIAL_TWITTER')    return 'twitter';
  if (cb.startsWith('[INSTAGRAM]') || sourceType === 'SOCIAL_INSTAGRAM') return 'instagram';
  if (cb.startsWith('[LINKEDIN]') || sourceType === 'SOCIAL_LINKEDIN')   return 'linkedin';
  if (sourceType === 'LIVE_STREAM')  return 'tv';
  if (sourceType === 'RADIO_STREAM') return 'radio';
  return 'web';
}

function isSocialNetwork(network: string): boolean {
  return ['youtube','facebook','twitter','instagram','linkedin'].includes(network);
}

// Extrae YouTube video ID de la URL
function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

const NETWORK_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  tv:        { label: 'TV',        color: '#ec4899', bg: 'rgba(236,72,153,0.15)',  icon: Tv },
  radio:     { label: 'Radio',     color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)',  icon: Radio },
  web:       { label: 'Web',       color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  icon: Globe },
  youtube:   { label: 'YouTube',   color: '#ff0000', bg: 'rgba(255,0,0,0.12)',     icon: Youtube },
  facebook:  { label: 'Facebook',  color: '#1877f2', bg: 'rgba(24,119,242,0.12)', icon: Facebook },
  twitter:   { label: 'Twitter',   color: '#1da1f2', bg: 'rgba(29,161,242,0.12)', icon: Twitter },
  instagram: { label: 'Instagram', color: '#e1306c', bg: 'rgba(225,48,108,0.12)', icon: Instagram },
  linkedin:  { label: 'LinkedIn',  color: '#0a66c2', bg: 'rgba(10,102,194,0.12)', icon: Linkedin },
};

// ─── Modal para reproducir / ver mención ─────────────────────────────────────
function MentionViewModal({ mention, onClose }: { mention: any; onClose: () => void }) {
  const network = getMentionNetwork(mention);
  const cfg = NETWORK_CONFIG[network] ?? NETWORK_CONFIG.web;
  const Icon = cfg.icon;

  // URL de la mención social (guardada en clipUrl o contextAfter)
  const socialUrl = mention.clipUrl || mention.contextAfter || '';
  const youtubeId = network === 'youtube' ? extractYoutubeId(socialUrl) : null;

  // Para TV/Radio: pedir el clip de video
  const isTraditional = network === 'tv' || network === 'radio';
  const clipApiUrl = isTraditional
    ? `${import.meta.env.VITE_API_URL || 'https://datawiseconsultoria.com/api'}/pilot/clips/mention/${mention.id}`
    : null;

  const token = localStorage.getItem('token');

  return (
    <div
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-card, #1a1a24)', borderRadius: '16px',
          maxWidth: '820px', width: '100%', maxHeight: '90vh',
          overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.1))',
          display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: cfg.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={18} style={{ color: cfg.color }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {cfg.label} — {mention.keyword}
            </p>
            {mention.contextBefore && (
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                {mention.contextBefore.replace(/^\[.*?\]\s*/, '')}
              </p>
            )}
          </div>
          <button onClick={onClose} style={{
            width: '32px', height: '32px', borderRadius: '8px', border: 'none',
            background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Contenido */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>

          {/* YouTube embed */}
          {youtubeId && (
            <div style={{ marginBottom: '16px', borderRadius: '10px', overflow: 'hidden', background: '#000' }}>
              <iframe
                width="100%"
                height="380"
                src={`https://www.youtube.com/embed/${youtubeId}?autoplay=0&rel=0`}
                title="YouTube"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ display: 'block' }}
              />
            </div>
          )}

          {/* TV / Radio: video/audio clip */}
          {isTraditional && clipApiUrl && (
            <video controls autoPlay style={{
              width: '100%', maxHeight: '400px', borderRadius: '10px', background: '#000', marginBottom: '16px'
            }}>
              <source src={`${clipApiUrl}?token=${token}`} type="video/mp4" />
              Tu navegador no soporta video HTML5.
            </video>
          )}

          {/* Texto de la mención (todas las redes) */}
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)',
            borderRadius: '10px', padding: '16px', marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <FileText size={14} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Contenido
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
              {mention.context || 'Sin contenido disponible'}
            </p>
          </div>

          {/* Link externo para RRSS que no son YouTube */}
          {isSocialNetwork(network) && !youtubeId && socialUrl && (
            <a href={socialUrl} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
              background: cfg.bg, border: `1px solid ${cfg.color}40`, borderRadius: '8px',
              color: cfg.color, fontSize: '14px', fontWeight: 500, textDecoration: 'none',
              transition: 'opacity 0.2s'
            }}>
              <ExternalLink size={15} />
              Ver publicación original en {cfg.label}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function MentionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Pre-rellena el buscador si llega ?search= desde el navbar global
  const initialSearch = searchParams.get('search') ?? '';
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('all');
  const [selectedMention, setSelectedMention] = useState<any | null>(null);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Limpia el param ?search= de la URL una vez leído (para que no persista)
  useEffect(() => {
    if (searchParams.has('search')) {
      setSearchParams({}, { replace: true });
    }
  }, []);

  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: brandService.getAll,
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    // brandId en queryKey → refetch automático al cambiar marca
    queryKey: ['pilot-mentions-paginated', selectedBrandId],
    queryFn: ({ pageParam }) =>
      pilotMentionsService.getAllPaginated(
        selectedBrandId || undefined,  // filtra en BD, no client-side
        100,
        pageParam,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined,
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allMentions = useMemo(() =>
    data?.pages.flatMap(page => page.mentions) || [],
    [data]
  );

  const filteredMentions = useMemo(() => {
    let filtered = [...allMentions];

    filtered.sort((a, b) => {
      const dateA = new Date(a.timestamp || a.detectedAt || 0).getTime();
      const dateB = new Date(b.timestamp || b.detectedAt || 0).getTime();
      return dateB - dateA;
    });

    // El filtro por marca ya lo aplica el backend (brandId en queryKey)
    // Solo aplicamos filtros client-side: búsqueda de texto, tipo de medio y sentimiento

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m =>
        m.keyword?.toLowerCase().includes(query) ||
        m.context?.toLowerCase().includes(query) ||
        m.source?.name?.toLowerCase().includes(query)
      );
    }

    if (mediaFilter !== 'all') {
      filtered = filtered.filter(m => getMentionNetwork(m) === mediaFilter);
    }

    if (sentimentFilter !== 'all') {
      filtered = filtered.filter(m => m.sentiment === sentimentFilter);
    }

    return filtered;
  }, [allMentions, searchQuery, mediaFilter, sentimentFilter]);

  const formatDate = (date: any) => {
    try {
      if (!date) return 'Sin fecha';
      return format(new Date(date), "d 'de' MMM 'de' yyyy 'a las' HH:mm", { locale: es });
    } catch {
      return 'Fecha inválida';
    }
  };

  const generateTitle = (mention: any): string => {
    if (mention.title) return mention.title;
    if (mention.context) {
      const keyword = mention.keyword || '';
      const context = mention.context.trim();
      const sentences = context.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
      const relevantSentence = sentences.find((s: string) =>
        s.toLowerCase().includes(keyword.toLowerCase())
      );
      if (relevantSentence) {
        const cleaned = relevantSentence.trim();
        const title = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        return title.length > 80 ? title.substring(0, 77) + '...' : title;
      }
      const words = context.split(' ').slice(0, 12).join(' ');
      return words.length > 80 ? words.substring(0, 77) + '...' : words;
    }
    return mention.keyword || 'Sin título';
  };

  const getSentimentColor = (sentiment: string) => {
    if (sentiment === 'POSITIVE') return '#10b981';
    if (sentiment === 'NEGATIVE') return '#ef4444';
    return '#6b7280';
  };

  const getSentimentLabel = (sentiment: string) => {
    if (sentiment === 'POSITIVE') return 'Positivo';
    if (sentiment === 'NEGATIVE') return 'Negativo';
    return 'Neutral';
  };

  // Botones de filtro de canal (incluye RRSS)
  const MEDIA_TABS: { key: MediaFilter; label: string; icon: any }[] = [
    { key: 'all',       label: 'Todas',     icon: Filter },
    { key: 'tv',        label: 'TV',        icon: Tv },
    { key: 'radio',     label: 'Radio',     icon: Radio },
    { key: 'web',       label: 'Web',       icon: Globe },
    { key: 'youtube',   label: 'YouTube',   icon: Youtube },
    { key: 'facebook',  label: 'Facebook',  icon: Facebook },
    { key: 'twitter',   label: 'Twitter',   icon: Twitter },
    { key: 'instagram', label: 'Instagram', icon: Instagram },
    { key: 'linkedin',  label: 'LinkedIn',  icon: Linkedin },
  ];

  if (isLoading) {
    return (
      <div className="mentions-page">
        <div className="mentions-loading">
          <div className="spinner"></div>
          <p>Cargando menciones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mentions-page">
      <PageHeader
        icon={<MessageSquare size={24} />}
        title="Menciones"
        subtitle={`${filteredMentions.length} menciones encontradas en todos los medios`}
        badgeColor="blue"
        action={
          <div className="flex items-center gap-2">
            <div className="mentions-header-actions">
              <div className="search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Buscar menciones..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
              <div className="select-wrapper">
                <span className="select-label">Marca:</span>
                <select
                  value={selectedBrandId || 'all'}
                  onChange={(e) => setSelectedBrandId(e.target.value === 'all' ? null : e.target.value)}
                  className="header-select"
                >
                  <option value="all">Todas</option>
                  {brands?.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <button className="btn-primary">
                <Download size={18} />
                Exportar
              </button>
            </div>
          </div>
        }
      />

      <div className="mentions-content">
        <div className="mentions-content-header">
          <div>
            <h2 className="content-title">
              {selectedBrandId
                ? `Menciones: ${brands?.find(b => String(b.id) === selectedBrandId)?.name}`
                : 'Todas las Menciones'}
            </h2>
            <p className="content-subtitle">
              {filteredMentions.length} menciones encontradas
            </p>
          </div>
        </div>

        {/* Barra de filtros */}
        <div className="mentions-filters-bar">
          <div className="search-filters-wrapper">
            <Search size={16} className="search-icon-inline" />
            <input
              type="text"
              placeholder="Buscar en menciones..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input-inline"
            />
          </div>

          {/* Tabs de canal/red: scrollable */}
          <div className="filter-tabs" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
            {MEDIA_TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                className={`filter-tab ${mediaFilter === key ? 'active' : ''}`}
                onClick={() => setMediaFilter(key)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          <div className="sentiment-filters">
            {(['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as SentimentFilter[]).map(s => (
              <button
                key={s}
                className={`sentiment-btn ${s.toLowerCase()} ${sentimentFilter === s ? 'active' : ''}`}
                onClick={() => setSentimentFilter(sentimentFilter === s ? 'all' : s)}
              >
                {getSentimentLabel(s)}
              </button>
            ))}
          </div>
        </div>

        {filteredMentions.length === 0 && !isLoading && (
          <div className="mentions-empty">
            <p>No se encontraron menciones</p>
          </div>
        )}

        {filteredMentions.length > 0 && (
          <div className="mentions-list">
            {filteredMentions.map((mention) => {
              const network = getMentionNetwork(mention);
              const cfg = NETWORK_CONFIG[network] ?? NETWORK_CONFIG.web;
              const Icon = cfg.icon;
              const sentimentColor = getSentimentColor(mention.sentiment);
              const social = isSocialNetwork(network);
              const socialUrl = mention.clipUrl || mention.contextAfter || '';
              const author = mention.contextBefore?.replace(/^\[.*?\]\s*/, '') || mention.source?.name || 'Fuente desconocida';

              return (
                <div key={mention.id} className="mention-card-compact">
                  <div
                    className="mention-icon-compact"
                    style={{ backgroundColor: cfg.bg, color: cfg.color }}
                  >
                    <Icon size={20} />
                  </div>

                  <div className="mention-content-compact">
                    <div className="mention-row-1">
                      <h3 className="mention-title-compact">{generateTitle(mention)}</h3>
                      <span className="mention-media-badge-compact" style={{ color: cfg.color }}>
                        {cfg.label}
                      </span>
                      <span
                        className="mention-sentiment-compact"
                        style={{ backgroundColor: `${sentimentColor}20`, color: sentimentColor }}
                      >
                        {getSentimentLabel(mention.sentiment)}
                      </span>
                    </div>

                    <div className="mention-row-2">
                      <span className="mention-source-compact">{author}</span>
                      <span className="mention-separator">•</span>
                      <span className="mention-date-compact">{formatDate(mention.timestamp || mention.detectedAt)}</span>
                      {!social && (
                        <>
                          <span className="mention-separator">•</span>
                          <span className="mention-duration-compact">3:45</span>
                        </>
                      )}
                    </div>

                    <p className="mention-description-compact">
                      {mention.context?.substring(0, 150) || 'Sin descripción disponible'}
                      {mention.context && mention.context.length > 150 && '...'}
                    </p>

                    <div className="mention-footer-row">
                      {mention.keyword && (
                        <div className="mention-tags-compact">
                          <span className="mention-tag-compact">{mention.keyword}</span>
                        </div>
                      )}
                      <div className="mention-actions-inline">
                        {!social && (
                          <span className="mention-reach-inline">
                            Alcance: {(mention.reach || 100).toLocaleString()}
                          </span>
                        )}

                        {/* Botón según tipo de mención */}
                        {social ? (
                          // RRSS: ver publicación o abrir modal con texto
                          <button
                            className="mention-btn-play-inline"
                            onClick={() => setSelectedMention(mention)}
                          >
                            {network === 'youtube' ? <Play size={14} /> : <ExternalLink size={14} />}
                            {network === 'youtube' ? 'Ver video' : 'Ver publicación'}
                          </button>
                        ) : (
                          // TV/Radio: reproducir clip
                          <button
                            className="mention-btn-play-inline"
                            onClick={() => setSelectedMention(mention)}
                          >
                            <Play size={14} />
                            Reproducir
                          </button>
                        )}

                        {social && socialUrl && (
                          <a
                            href={socialUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              fontSize: '12px', color: cfg.color, textDecoration: 'none',
                              marginLeft: '6px'
                            }}
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div ref={observerTarget} style={{ height: '20px' }} />
            {isFetchingNextPage && (
              <div className="mentions-loading">
                <div className="spinner"></div>
                <p>Cargando más menciones...</p>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedMention && (
        <MentionViewModal
          mention={selectedMention}
          onClose={() => setSelectedMention(null)}
        />
      )}
    </div>
  );
}
