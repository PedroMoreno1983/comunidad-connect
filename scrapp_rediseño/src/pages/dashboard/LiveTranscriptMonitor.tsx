// frontend/src/pages/dashboard/LiveTranscriptMonitor.tsx

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pilotMentionsService } from '../../services/pilotMentionsService';
import {
  Play, Radio, Tv, TrendingUp, AlertCircle, Volume2, Zap, Pause,
  Youtube, Facebook, Twitter, Instagram, Linkedin, Globe, ExternalLink, X, FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import '../../styles/live-transcript.css';

// ─── Helpers de red ──────────────────────────────────────────────────────────
function getMentionNetwork(m: any): string {
  const sourceType = m.source?.type ?? '';
  const cb = m.contextBefore ?? '';

  if (cb.startsWith('[YOUTUBE]')   || sourceType === 'SOCIAL_YOUTUBE')   return 'youtube';
  if (cb.startsWith('[FACEBOOK]')  || sourceType === 'SOCIAL_FACEBOOK')  return 'facebook';
  if (cb.startsWith('[TWITTER]')   || sourceType === 'SOCIAL_TWITTER')   return 'twitter';
  if (cb.startsWith('[INSTAGRAM]') || sourceType === 'SOCIAL_INSTAGRAM') return 'instagram';
  if (cb.startsWith('[LINKEDIN]')  || sourceType === 'SOCIAL_LINKEDIN')  return 'linkedin';
  if (sourceType === 'LIVE_STREAM')  return 'tv';
  if (sourceType === 'RADIO_STREAM') return 'radio';
  return 'web';
}

function isSocial(network: string) {
  return ['youtube','facebook','twitter','instagram','linkedin'].includes(network);
}

function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

const NET_CFG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  tv:        { label: 'TV',        color: '#ec4899', bg: 'rgba(236,72,153,0.15)',  icon: Tv },
  radio:     { label: 'Radio',     color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)',  icon: Radio },
  web:       { label: 'Web',       color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  icon: Globe },
  youtube:   { label: 'YouTube',   color: '#ff0000', bg: 'rgba(255,0,0,0.12)',     icon: Youtube },
  facebook:  { label: 'Facebook',  color: '#1877f2', bg: 'rgba(24,119,242,0.12)', icon: Facebook },
  twitter:   { label: 'Twitter',   color: '#1da1f2', bg: 'rgba(29,161,242,0.12)', icon: Twitter },
  instagram: { label: 'Instagram', color: '#e1306c', bg: 'rgba(225,48,108,0.12)', icon: Instagram },
  linkedin:  { label: 'LinkedIn',  color: '#0a66c2', bg: 'rgba(10,102,194,0.12)', icon: Linkedin },
};

// ─── Modal de reproducción/visualización ────────────────────────────────────
function MentionModal({ mention, onClose }: { mention: any; onClose: () => void }) {
  const network = getMentionNetwork(mention);
  const cfg = NET_CFG[network] ?? NET_CFG.web;
  const Icon = cfg.icon;
  const socialUrl = mention.clipUrl || mention.contextAfter || '';
  const youtubeId = network === 'youtube' ? extractYoutubeId(socialUrl) : null;
  const isTraditional = network === 'tv' || network === 'radio';
  const token = localStorage.getItem('token');
  const API = import.meta.env.VITE_API_URL || 'https://datawiseconsultoria.com/api';
  const author = mention.contextBefore?.replace(/^\[.*?\]\s*/, '') || mention.source?.name || '';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-card, #1a1a24)', borderRadius: '16px',
          maxWidth: '800px', width: '100%', maxHeight: '88vh',
          overflow: 'hidden', display: 'flex', flexDirection: 'column'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', gap: '10px'
        }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '8px', background: cfg.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <Icon size={17} style={{ color: cfg.color }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {cfg.label}{author && ` — ${author}`}
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
              {mention.keyword}
            </p>
          </div>
          <button onClick={onClose} style={{
            width: '30px', height: '30px', borderRadius: '6px', border: 'none',
            background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '18px', overflowY: 'auto' }}>
          {/* YouTube embed */}
          {youtubeId && (
            <div style={{ borderRadius: '10px', overflow: 'hidden', background: '#000', marginBottom: '14px' }}>
              <iframe
                width="100%" height="360"
                src={`https://www.youtube.com/embed/${youtubeId}?autoplay=0&rel=0`}
                title="YouTube" frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen style={{ display: 'block' }}
              />
            </div>
          )}

          {/* TV / Radio video clip */}
          {isTraditional && (
            <video controls autoPlay style={{
              width: '100%', maxHeight: '360px', borderRadius: '10px', background: '#000', marginBottom: '14px'
            }}>
              <source src={`${API}/pilot/clips/mention/${mention.id}?token=${token}`} type="video/mp4" />
            </video>
          )}

          {/* Texto */}
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)',
            borderRadius: '10px', padding: '14px'
          }}>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
              <FileText size={13} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Contenido detectado
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
              {mention.context || 'Sin contenido disponible'}
            </p>
          </div>

          {/* Link externo para RRSS no-YouTube */}
          {isSocial(network) && !youtubeId && socialUrl && (
            <a href={socialUrl} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '14px',
              padding: '10px 16px', background: cfg.bg, border: `1px solid ${cfg.color}40`,
              borderRadius: '8px', color: cfg.color, fontSize: '14px', textDecoration: 'none'
            }}>
              <ExternalLink size={14} />
              Ver en {cfg.label}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function LiveTranscriptMonitor() {
  const [selectedMention, setSelectedMention] = useState<any | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const { data: allMentions, isLoading } = useQuery({
    queryKey: ['live-monitor-mentions'],
    queryFn: () => pilotMentionsService.getAll(),
    refetchInterval: isPaused ? false : 10000,
  });

  // Incluye menciones con clipUrl (TV/Radio) Y menciones RRSS (tienen socialUrl en contextAfter)
  const mentionsToShow = useMemo(() => {
    if (!allMentions) return [];
    return allMentions
      .filter((m: any) => {
        const net = getMentionNetwork(m);
        // RRSS siempre se muestran; tradicionales solo si tienen clip
        return isSocial(net) || m.clipUrl;
      })
      .sort((a: any, b: any) => {
        const dateA = new Date(a.timestamp || a.detectedAt || 0).getTime();
        const dateB = new Date(b.timestamp || b.detectedAt || 0).getTime();
        return dateB - dateA;
      });
  }, [allMentions]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayMentions = mentionsToShow.filter((m: any) => {
      const date = new Date(m.timestamp || m.detectedAt);
      return date.toDateString() === today;
    }).length;

    // Canales únicos: para RRSS usar la red, para tradicionales usar source.name
    const activeChannels = new Set(
      mentionsToShow.map((m: any) => {
        const net = getMentionNetwork(m);
        return isSocial(net) ? NET_CFG[net]?.label : m.source?.name;
      }).filter(Boolean)
    ).size;

    const alerts = mentionsToShow.filter((m: any) => m.sentiment === 'NEGATIVE').length;

    return { activeChannels, todayMentions, alerts, monitoring: '24/7' };
  }, [mentionsToShow]);

  // Canales activos con tipo e icono correcto
  const activeChannels = useMemo(() => {
    const channelMap = new Map<string, any>();
    const today = new Date().toDateString();

    mentionsToShow.forEach((m: any) => {
      const net = getMentionNetwork(m);
      const key = isSocial(net) ? NET_CFG[net]?.label : (m.source?.name || 'Desconocido');
      if (!key) return;

      if (!channelMap.has(key)) {
        channelMap.set(key, {
          name: key,
          type: net,
          todayCount: 0,
          lastActivity: m.timestamp || m.detectedAt,
          isActive: true
        });
      }

      const date = new Date(m.timestamp || m.detectedAt);
      if (date.toDateString() === today) {
        channelMap.get(key).todayCount++;
      }
    });

    return Array.from(channelMap.values())
      .sort((a, b) => b.todayCount - a.todayCount)
      .slice(0, 7);
  }, [mentionsToShow]);

  const formatTimeAgo = (date: any) => {
    try {
      const now = new Date();
      const past = new Date(date);
      const diffMs = now.getTime() - past.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Hace un momento';
      if (diffMins === 1) return 'Hace 1 min';
      if (diffMins < 60) return `Hace ${diffMins} min`;

      const diffHours = Math.floor(diffMins / 60);
      if (diffHours === 1) return 'Hace 1 hora';
      if (diffHours < 24) return `Hace ${diffHours} horas`;

      return format(past, "d 'de' MMM", { locale: es });
    } catch {
      return 'Hace un momento';
    }
  };

  const getSentimentColor = (sentiment: string | null) => {
    switch (sentiment) {
      case 'POSITIVE': return { bg: 'rgba(34,197,94,0.1)',  color: '#22c55e', label: 'Positivo' };
      case 'NEGATIVE': return { bg: 'rgba(239,68,68,0.1)',  color: '#ef4444', label: 'Negativo' };
      default:         return { bg: 'rgba(251,146,60,0.1)', color: '#fb923c', label: 'Neutro' };
    }
  };

  const extractQuote = (context: string, maxLength = 80): string => {
    if (!context) return '';
    const trimmed = context.trim();
    return trimmed.length > maxLength ? trimmed.substring(0, maxLength) + '...' : trimmed;
  };

  if (isLoading) {
    return (
      <div className="live-monitor-page">
        <div className="live-monitor-loading">
          <div className="spinner-large"></div>
          <p>Iniciando monitoreo en vivo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="live-monitor-page">
      {/* Header */}
      <header className="live-monitor-header">
        <div className="live-monitor-header-left">
          <div className="live-icon-wrapper">
            <Radio size={24} color="white" />
          </div>
          <div>
            <h1 className="live-monitor-title">
              Monitor en Vivo
              <span className="live-badge">
                <span className="live-indicator"></span>
                EN VIVO
              </span>
            </h1>
            <p className="live-monitor-subtitle">
              TV, Radio, Web y Redes Sociales en tiempo real
            </p>
          </div>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="live-stats-grid">
        <div className="live-stat-card">
          <div className="live-stat-icon blue"><Zap size={24} /></div>
          <div className="live-stat-content">
            <p className="live-stat-value">{stats.activeChannels}</p>
            <p className="live-stat-label">Medios activos</p>
          </div>
        </div>
        <div className="live-stat-card">
          <div className="live-stat-icon green"><TrendingUp size={24} /></div>
          <div className="live-stat-content">
            <p className="live-stat-value">{stats.todayMentions}</p>
            <p className="live-stat-label">Menciones hoy</p>
          </div>
        </div>
        <div className="live-stat-card">
          <div className="live-stat-icon orange"><AlertCircle size={24} /></div>
          <div className="live-stat-content">
            <p className="live-stat-value">{stats.alerts}</p>
            <p className="live-stat-label">Alertas negativas</p>
          </div>
        </div>
        <div className="live-stat-card">
          <div className="live-stat-icon blue"><Volume2 size={24} /></div>
          <div className="live-stat-content">
            <p className="live-stat-value">{stats.monitoring}</p>
            <p className="live-stat-label">Monitoreo IA</p>
          </div>
        </div>
      </div>

      {/* Layout principal */}
      <div className="live-monitor-layout">
        {/* Feed */}
        <div className="live-feed-column">
          <div className="live-feed-header">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
              <h2 className="live-feed-title mb-0">Feed Central</h2>
            </div>
            <button className="btn-pause" onClick={() => setIsPaused(!isPaused)}>
              <Pause size={16} />
              {isPaused ? 'Reanudar' : 'Pausar'}
            </button>
          </div>

          {/* IMMERSIVE RADAR / MEDIA PLAYER ZONE */}
          <div className="relative w-full h-56 bg-gray-900 overflow-hidden flex items-center justify-center border-b border-gray-800 shrink-0">
             <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(37,99,235,0.15) 0%, #111827 70%)' }}></div>
             
             {/* Grid overlay */}
             <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>

             <div className="relative z-10 flex flex-col items-center">
                <Radio className="h-12 w-12 text-blue-500 mb-3" style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
                <span className="text-gray-300 text-sm font-semibold tracking-[0.2em] uppercase">Monitoreo Global Activo</span>
                <span className="text-gray-500 text-xs mt-2 font-mono">{stats.activeChannels} Fuentes sincronizadas</span>
             </div>
             
             {/* Scanning line animation */}
             <div className="absolute left-0 top-0 w-full h-0.5 bg-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.8)]" style={{ animation: 'scanLine 3s ease-in-out infinite alternate' }}></div>
          </div>

          <div className="live-feed-list">
            {mentionsToShow.slice(0, 15).map((mention: any) => {
              const network = getMentionNetwork(mention);
              const cfg = NET_CFG[network] ?? NET_CFG.web;
              const Icon = cfg.icon;
              const sentiment = getSentimentColor(mention.sentiment);
              const social = isSocial(network);
              const author = mention.contextBefore?.replace(/^\[.*?\]\s*/, '') || mention.source?.name || '';
              const socialUrl = mention.clipUrl || mention.contextAfter || '';

              return (
                <div key={mention.id} className="live-feed-item">
                  <div className="live-feed-item-icon" style={{ background: cfg.bg, color: cfg.color }}>
                    <Icon size={18} />
                  </div>

                  <div className="live-feed-item-content">
                    <div className="live-feed-item-header">
                      <div className="live-feed-item-channel">
                        <span className="channel-name" style={{ color: cfg.color }}>
                          {social ? cfg.label : (mention.source?.name || 'Canal')}
                        </span>
                        {author && social && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                            · {author}
                          </span>
                        )}
                        {!social && <span className="live-badge-small">LIVE</span>}
                      </div>
                      <span className="live-feed-time">
                        {formatTimeAgo(mention.timestamp || mention.detectedAt)}
                      </span>
                    </div>

                    <p className="live-feed-item-title">
                      {mention.keyword || 'Mención detectada'}
                    </p>

                    <p className="live-feed-item-quote">
                      "{extractQuote(mention.context)}"
                    </p>

                    <div className="live-feed-item-footer">
                      <span
                        className="sentiment-badge"
                        style={{ backgroundColor: sentiment.bg, color: sentiment.color }}
                      >
                        {sentiment.label}
                      </span>

                      {/* Acción según tipo */}
                      <button
                        className="btn-play-feed"
                        onClick={() => setSelectedMention(mention)}
                      >
                        {social && network !== 'youtube'
                          ? <><ExternalLink size={13} /> Ver</>
                          : <><Play size={13} /> {network === 'youtube' ? 'Video' : 'Clip'}</>}
                      </button>

                      {/* Link directo para RRSS */}
                      {social && socialUrl && (
                        <a href={socialUrl} target="_blank" rel="noopener noreferrer"
                          style={{ color: cfg.color, display: 'flex', alignItems: 'center' }}
                          title="Abrir en red social">
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {mentionsToShow.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Volume2 size={36} style={{ marginBottom: '12px', opacity: 0.4 }} />
                <p>Sin menciones recientes con clips o redes sociales</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="live-sidebar-column">
          <div className="live-sidebar-section">
            <h3 className="live-sidebar-title">Medios y Redes Activos</h3>

            <div className="active-channels-list">
              {activeChannels.map((channel, idx) => {
                const cfg = NET_CFG[channel.type] ?? NET_CFG.web;
                const Icon = cfg.icon;

                return (
                  <div key={idx} className="active-channel-item">
                    <div className="active-channel-icon" style={{ background: cfg.bg, color: cfg.color }}>
                      <Icon size={16} />
                    </div>
                    <div className="active-channel-info">
                      <p className="active-channel-name">{channel.name}</p>
                      <p className="active-channel-count">{channel.todayCount} menciones hoy</p>
                    </div>
                    <span className={`activity-indicator ${channel.isActive ? 'active' : ''}`}></span>
                  </div>
                );
              })}

              {activeChannels.length === 0 && (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px' }}>
                  Sin actividad registrada hoy
                </p>
              )}
            </div>
          </div>

          {/* Análisis IA */}
          <div className="live-sidebar-section analysis-section">
            <div className="analysis-header">
              <Zap size={18} />
              <h3 className="live-sidebar-title">Análisis IA</h3>
            </div>
            <div className="analysis-content">
              <p className="analysis-text">
                Monitoreo activo en TV, Radio, Web y Redes Sociales. Las menciones se detectan
                automáticamente y se analizan por sentimiento.
              </p>
              <button className="btn-analysis">Ver análisis completo</button>
            </div>
          </div>
        </div>
      </div>

      {selectedMention && (
        <MentionModal mention={selectedMention} onClose={() => setSelectedMention(null)} />
      )}
    </div>
  );
}
