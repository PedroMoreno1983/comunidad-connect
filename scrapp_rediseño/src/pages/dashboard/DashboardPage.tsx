// frontend/src/pages/dashboard/DashboardPage.tsx - ACTUALIZAR

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { pilotMentionsService } from '../../services/pilotMentionsService';
import { brandService } from '../../services/brandService';
import { useFilterStore } from '../../store/useFilterStore';
import DashboardFilters from '../../components/DashboardFilters';
import BrandOverviewCards from '../../components/BrandOverviewCards';
import {
  MessageSquare, Bot, ArrowRight, LayoutDashboard, TrendingUp, TrendingDown, Newspaper, Signal
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import ClipPlayerModal from '../../components/ClipPlayerModal';
import KPICards from '../../components/KPICards';
import MentionsChart from '../../components/MentionsChart';
import SentimentChart from '../../components/SentimentChart';
import MediaTypeChart from '../../components/MediaTypeChart';
import TopMentions from '../../components/TopMentions';
import MediaDistribution from '../../components/MediaDistribution';
import '../../styles/dashboard.css';
import '../../components/DashboardFilters.css';

export default function DashboardPage() {
  const [selectedMentionId, setSelectedMentionId] = useState<string | null>(null);
  const [insightGenerating, setInsightGenerating] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { period, selectedBrandId, setSelectedBrand, getDateRange } = useFilterStore();

  // Pasamos brandId al backend Ã¢â€ â€™ filtra en BD por marca
  // LÃƒÂ­mite 2000 para cubrir perÃƒÂ­odos amplios sin truncar
  const { data: allMentions, isLoading, error } = useQuery({
    queryKey: ['pilot-mentions', selectedBrandId],
    queryFn: () => pilotMentionsService.getAll(
      selectedBrandId && selectedBrandId !== 'all' ? selectedBrandId : undefined,
      2000,
    ),
  });

  // Query separada para el Brand Panel Ã¢â‚¬â€ siempre todas las marcas, sin filtro
  const { data: panelMentionsRaw, isFetching: panelFetching, refetch: refetchPanel } = useQuery({
    queryKey: ['pilot-mentions-panel'],
    queryFn: () => pilotMentionsService.getAll(undefined, 500),
    staleTime: 0,
    refetchInterval: 120_000,
  });

  // Marcas para el panel
  const { data: brands } = useQuery({
    queryKey: ['brands-panel'],
    queryFn: () => brandService.getAll(),
    staleTime: 60_000,
  });

  // Filtrar menciones del panel a los ÃƒÂºltimos 7 dÃƒÂ­as
  const panelMentions = useMemo(() => {
    if (!panelMentionsRaw) return [];
    const from = subDays(new Date(), 7);
    return panelMentionsRaw.filter((m: any) => {
      const date = new Date(m.timestamp || m.detectedAt || 0);
      return date >= from;
    });
  }, [panelMentionsRaw]);

  // Insight IA Ã¢â‚¬â€ polling dinÃƒÂ¡mico: cada 3s mientras genera, cada 5min en reposo
  const { data: insightData, refetch: refetchInsight } = useQuery({
    queryKey: ['pilot-insight'],
    queryFn: () => pilotMentionsService.getInsight(),
    refetchInterval: (query: any) =>
      query.state.data?.generating ? 3_000 : 5 * 60 * 1000,
    staleTime: 0,
  });

  // Sincronizar estado local con el flag del backend:
  // cuando el backend termina (generating Ã¢â€ â€™ false), limpiar spinner
  // y mostrar error si la generaciÃƒÂ³n fallÃƒÂ³
  useEffect(() => {
    if (!insightData) return;
    if (!insightData.generating && insightGenerating) {
      setInsightGenerating(false);
      if (insightData.lastError) {
        setInsightError(insightData.lastError);
      }
    }
  }, [insightData?.generating]);

  const handleGenerateInsight = async () => {
    setInsightGenerating(true);
    setInsightError(null);
    // Dispara en background Ã¢â‚¬â€ retorna de inmediato (no espera la inferencia)
    await pilotMentionsService.generateInsight();
    // Refetch para obtener generating=true del backend de inmediato
    await refetchInsight();
  };

  // Combinar estado local (feedback inmediato al click) con estado del backend
  const isGenerating = insightGenerating || insightData?.generating;
  
  const getWeekRange = () => {
    const now = new Date();
    const weekStart = startOfWeek(now, { locale: es });
    const weekEnd = endOfWeek(now, { locale: es });
    
    return `${format(weekStart, "d 'de' MMMM", { locale: es })} - ${format(weekEnd, "d 'de' MMMM 'de' yyyy", { locale: es })}`;
  };

  // El backend ya filtra por brandId. AquÃƒÂ­ solo aplicamos el filtro de periodo.
  const recentMentions = useMemo(() => {
    if (!allMentions || allMentions.length === 0) return [];

    const { from } = getDateRange();

    return allMentions.filter((m: any) => {
      const date = new Date(m.timestamp || m.detectedAt || 0);
      return date >= from;
    });
  }, [allMentions, period, getDateRange]);


  // Temas mÃƒÂ¡s mencionados:
  // 1. Primero agrupa por keyword (puede haber varias keywords distintas)
  // 2. Si todas las menciones tienen la misma keyword, extrae bigramas/trigramas
  //    frecuentes del campo `context` para mostrar temas reales
  const topTopics = useMemo(() => {
    if (!recentMentions || recentMentions.length === 0) return [];

    const keywordCount = new Map<string, number>();

    recentMentions.forEach((m: any) => {
      const keyword = (m.keyword || '').trim().toLowerCase();
      if (keyword) {
        keywordCount.set(keyword, (keywordCount.get(keyword) || 0) + 1);
      }
    });

    // Si hay solo 1 keyword ÃƒÂºnica Ã¢â€ â€™ extraer frases del context
    if (keywordCount.size <= 1) {
      const phraseCount = new Map<string, number>();

      // Palabras vacÃƒÂ­as en espaÃƒÂ±ol a ignorar
      const stopWords = new Set([
        'de','la','el','en','y','a','que','los','las','del','un','una',
        'por','con','para','es','se','al','lo','su','le','mÃƒÂ¡s','ha',
        'este','esta','no','pero','como','su','sus','si','fue','han',
        'son','ya','sobre','tambiÃƒÂ©n','entre','cuando','hasta','donde',
        'sido','estar','ser','tiene','hay','todo','asÃƒÂ­','bien','muy',
        'me','te','nos','les','mi','tu','yo','ÃƒÂ©l','she','the','and','of',
        'to','in','is','it','that','was','for','on','are','as','with',
      ]);

      recentMentions.forEach((m: any) => {
        const text = (m.context || m.contextBefore || '').toLowerCase();
        if (!text) return;

        // Extraer bigramas significativos
        const words = text
          .replace(/[^a-zÃƒÂ¡ÃƒÂ©ÃƒÂ­ÃƒÂ³ÃƒÂºÃƒÂ¼ÃƒÂ±\s]/gi, ' ')
          .split(/\s+/)
          .filter((w: string) => w.length > 3 && !stopWords.has(w));

        for (let i = 0; i < words.length - 1; i++) {
          const bigram = `${words[i]} ${words[i + 1]}`;
          phraseCount.set(bigram, (phraseCount.get(bigram) || 0) + 1);
        }
      });

      // Retornar los bigramas mÃƒÂ¡s frecuentes (mÃƒÂ­nimo 2 apariciones)
      const phrases = Array.from(phraseCount.entries())
        .filter(([, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([topic, count]) => ({
          topic: topic.charAt(0).toUpperCase() + topic.slice(1),
          count,
        }));

      if (phrases.length > 0) return phrases;
    }

    // Caso normal: mÃƒÂºltiples keywords Ã¢â€ â€™ agrupar por keyword
    return Array.from(keywordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([topic, count]) => ({
        topic: topic.charAt(0).toUpperCase() + topic.slice(1),
        count,
      }));
  }, [recentMentions]);


  const negPct = recentMentions?.length > 0
    ? Math.round((recentMentions.filter((m: any) => m.sentiment === 'NEGATIVE').length / recentMentions.length) * 100)
    : 0;

  const positivePct = recentMentions?.length > 0
    ? Math.round((recentMentions.filter((m: any) => m.sentiment === 'POSITIVE').length / recentMentions.length) * 100)
    : 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-body)' }}>

      {/* ═══════════════════════════════════════════════════════
          PAGE HEADER — full-bleed white bar with stats strip
      ═══════════════════════════════════════════════════════ */}
      <div style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-color)',
        marginLeft: '-32px',
        marginRight: '-32px',
        marginBottom: '32px',
      }}>
        {/* Title row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 32px 18px', gap: '16px', flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Icon */}
            <div style={{
              width: '46px', height: '46px', borderRadius: '13px', flexShrink: 0,
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
            }}>
              <LayoutDashboard size={22} color="white" />
            </div>
            {/* Title */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '3px' }}>
                <h1 style={{ margin: 0, fontSize: '21px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.4px', lineHeight: 1 }}>
                  Centro de Inteligencia
                </h1>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  fontSize: '11px', fontWeight: 700, padding: '3px 10px',
                  borderRadius: '20px', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e',
                  border: '1px solid rgba(34, 197, 94, 0.2)', letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 2s ease-in-out infinite' }} />
                  En vivo
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>
                {getWeekRange()} · Monitoreo en tiempo real de medios
              </p>
            </div>
          </div>

          {/* Filters */}
          <DashboardFilters />
        </div>

        {/* ── Metrics strip ── */}
        <div style={{
          display: 'flex',
          borderTop: '1px solid var(--border-color)',
          overflowX: 'auto',
        }}>
          {[
            {
              label: 'Menciones',
              value: (recentMentions?.length || 0).toLocaleString(),
              color: '#818cf8', bg: 'rgba(99, 102, 241, 0.1)', border: 'rgba(99, 102, 241, 0.2)',
            },
            {
              label: 'Alcance est.',
              value: `${((recentMentions?.length || 0) * 100).toLocaleString()}`,
              color: '#38bdf8', bg: 'rgba(14, 165, 233, 0.1)', border: 'rgba(14, 165, 233, 0.2)',
            },
            {
              label: 'Tono positivo',
              value: `${positivePct}%`,
              color: '#34d399', bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.2)',
            },
            {
              label: 'Tono negativo',
              value: `${negPct}%`,
              color: '#f87171', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.2)',
            },
          ].map((stat, i) => {
            const icons = [
              <Newspaper size={17} color={stat.color} />,
              <Signal size={17} color={stat.color} />,
              <TrendingUp size={17} color={stat.color} />,
              <TrendingDown size={17} color={stat.color} />
            ];
            
            return (
              <div key={i} style={{
                padding: '14px 28px',
                borderRight: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', gap: '12px',
                flexShrink: 0,
              }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: stat.bg, border: `1px solid ${stat.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {icons[i]}
                </div>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.5px' }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', fontWeight: 600, letterSpacing: '0.02em' }}>
                    {stat.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── BRAND PANEL ── */}
      {brands && brands.length > 0 && (
        <BrandOverviewCards
          brands={brands}
          mentions={panelMentions}
          activeBrandId={selectedBrandId}
          onBrandFilter={(brandId) => setSelectedBrand(brandId)}
          onRefresh={() => {
            refetchPanel();
            queryClient.invalidateQueries({ queryKey: ['pilot-mentions', selectedBrandId] });
          }}
          isRefreshing={panelFetching}
        />
      )}

      {/* ── LOADING ── */}
      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '16px',
              margin: '0 auto 16px',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              <MessageSquare size={26} color="#818cf8" />
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 500 }}>Cargando inteligencia de medios...</p>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          borderRadius: '16px', border: '1px solid #fecaca',
          background: '#fef2f2', padding: '24px', textAlign: 'center', marginBottom: '24px',
        }}>
          <p style={{ color: '#dc2626', fontWeight: 600 }}>Error: {String(error)}</p>
        </div>
      )}

      {!isLoading && !error && (!allMentions || allMentions.length === 0) && (
        <div style={{
          borderRadius: '20px', border: '2px dashed var(--border-color)',
          background: 'var(--bg-card)', padding: '64px 40px', textAlign: 'center', marginBottom: '24px',
        }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '20px', margin: '0 auto 20px',
            background: 'rgba(59, 130, 246, 0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MessageSquare size={32} color="#3b82f6" />
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Sistema escuchando</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '380px', margin: '0 auto' }}>
            El monitor está activo. Las menciones aparecerán aquí tan pronto sean detectadas.
          </p>
        </div>
      )}

      {!isLoading && !error && allMentions && allMentions.length > 0 && recentMentions.length === 0 && (
        <div style={{
          borderRadius: '16px', border: '1px solid rgba(245, 158, 11, 0.2)',
          background: 'rgba(245, 158, 11, 0.05)', padding: '24px', textAlign: 'center', marginBottom: '24px',
        }}>
          <p style={{ color: '#f59e0b', fontWeight: 500 }}>No hay menciones para el período seleccionado.</p>
        </div>
      )}

      {/* ── ANALYTICS ── */}
      {recentMentions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          <KPICards mentions={recentMentions} />

          {/* ── AI INSIGHT ── */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            border: '1px solid var(--border-color)',
            padding: '24px',
            display: 'flex', alignItems: 'flex-start', gap: '20px',
            boxShadow: 'var(--shadow-sm)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Subtle gradient accent top-left */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899)',
            }} />

            <div style={{
              width: '48px', height: '48px', borderRadius: '14px', flexShrink: 0,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 20px rgba(99,102,241,0.3)',
            }}>
              <Bot size={22} color="white" />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Scrapi — Análisis IA
                </span>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: insightError ? '#ef4444' : isGenerating ? '#f59e0b' : insightData?.text ? '#22c55e' : '#cbd5e1',
                  display: 'inline-block',
                  animation: isGenerating ? 'pulse 1s ease-in-out infinite' : 'none',
                }} />
                {isGenerating && <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 600 }}>Analizando menciones...</span>}
                {!isGenerating && insightData?.generatedAt && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {format(new Date(insightData.generatedAt), "HH:mm 'del' d MMM", { locale: es })}
                  </span>
                )}
              </div>
              <p style={{
                fontSize: '14px', lineHeight: 1.6, margin: 0,
                fontStyle: !insightData?.text && !isGenerating ? 'italic' : 'normal',
                color: insightError ? '#dc2626' : isGenerating ? 'var(--text-muted)' : insightData?.text ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
                {insightError
                  ?? (isGenerating
                    ? (insightData?.text ?? 'Analizando el contexto de las menciones...')
                    : (insightData?.text ?? 'Presiona "Generar análisis" para obtener un resumen ejecutivo inteligente del período.')
                  )}
              </p>
            </div>

            <button
              onClick={handleGenerateInsight}
              disabled={isGenerating}
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 20px', borderRadius: '12px', border: 'none',
                fontSize: '14px', fontWeight: 700, color: 'white',
                background: isGenerating ? 'rgba(99,102,241,0.5)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                boxShadow: isGenerating ? 'none' : '0 4px 14px rgba(99,102,241,0.4)',
                cursor: isGenerating ? 'wait' : 'pointer',
                opacity: isGenerating ? 0.7 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              {isGenerating ? 'Generando...' : <><ArrowRight size={15} />Generar análisis</>}
            </button>
          </div>

          {/* ── CHARTS ROW ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
            <MentionsChart mentions={recentMentions} period={period} />
            <SentimentChart mentions={recentMentions} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            <MediaTypeChart mentions={recentMentions} />
            <TopMentions mentions={recentMentions} onMentionClick={(id) => setSelectedMentionId(id)} />
            <MediaDistribution mentions={recentMentions} />
          </div>

          {/* ── TOPICS ── */}
          {topTopics.length > 0 && (
            <div style={{
              background: 'var(--bg-card)', borderRadius: '16px',
              border: '1px solid var(--border-color)', padding: '24px',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Temas más mencionados</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '3px 0 0' }}>Palabras clave con mayor frecuencia</p>
                </div>
                <span style={{
                  fontSize: '12px', fontWeight: 700, padding: '4px 12px',
                  borderRadius: '20px', background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.2)',
                }}>
                  {topTopics.length} temas
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {topTopics.map((topic, index) => {
                  const palette = [
                    { bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9' },
                    { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
                    { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
                    { bg: '#fdf4ff', border: '#f5d0fe', text: '#9333ea' },
                    { bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1' },
                    { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' },
                  ];
                  const c = palette[index % palette.length];
                  return (
                    <div key={index} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 14px', borderRadius: '10px',
                      background: c.bg, border: `1px solid ${c.border}`,
                      cursor: 'default',
                    }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: c.text, opacity: 0.4 }}>#{index + 1}</span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: c.text }}>{topic.topic}</span>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '2px 7px',
                        borderRadius: '6px', background: c.border, color: c.text,
                      }}>
                        {topic.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}

      {selectedMentionId && (
        <ClipPlayerModal mentionId={selectedMentionId} onClose={() => setSelectedMentionId(null)} />
      )}
    </div>
  );
}
