// frontend/src/pages/dashboard/ReportsPage.tsx
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts';
import { pilotMentionsService } from '../../services/pilotMentionsService';
import { brandService } from '../../services/brandService';
import {
  FileDown, FileText, Mail, Download, Search,
  Tag, Radio, Globe, Filter,
  BarChart2, PieChart as PieChartIcon, Activity, Hash,
  ThumbsUp, ThumbsDown, Minus, ChevronDown, ChevronUp, Eye,
  Tv, Clock, ArrowUpRight, ArrowDownRight,
  LayoutGrid, List, RefreshCw,
  Facebook, Twitter, Instagram, Linkedin, Youtube
} from 'lucide-react';
import { format, isValid, parseISO, subDays, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import '../../styles/reports.css';

// ─── Types ────────────────────────────────────────────────────────────────────
type ColumnKey = 'date' | 'brand' | 'source' | 'title' | 'sentiment' | 'type' | 'network' | 'url';
type SentimentFilter = 'ALL' | 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
type NetworkFilter = 'ALL' | 'FACEBOOK' | 'TWITTER' | 'INSTAGRAM' | 'LINKEDIN' | 'YOUTUBE' | 'TV' | 'RADIO' | 'WEB';
type ViewMode = 'table' | 'grid';
type ChartView = 'overview' | 'sentiment' | 'timeline' | 'sources';

// ─── Constants ────────────────────────────────────────────────────────────────
const AVAILABLE_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'date',      label: 'Fecha' },
  { key: 'brand',     label: 'Marca' },
  { key: 'source',    label: 'Fuente' },
  { key: 'network',   label: 'Canal' },
  { key: 'title',     label: 'Contenido' },
  { key: 'sentiment', label: 'Sentimiento' },
  { key: 'type',      label: 'Tipo' },
  { key: 'url',       label: 'Acciones' },
];

const SENTIMENT_CONFIG = {
  POSITIVE: { label: 'Positivo', color: '#10b981', bg: 'rgba(16,185,129,0.12)',  Icon: ThumbsUp },
  NEGATIVE: { label: 'Negativo', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   Icon: ThumbsDown },
  NEUTRAL:  { label: 'Neutral',  color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', Icon: Minus },
} as const;

const NETWORK_CONFIG: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  FACEBOOK:  { label: 'Facebook',    color: '#1877F2', bg: 'rgba(24,119,242,0.12)',  Icon: Facebook  },
  TWITTER:   { label: 'X / Twitter', color: '#64748b', bg: 'rgba(100,116,139,0.12)', Icon: Twitter   },
  INSTAGRAM: { label: 'Instagram',   color: '#E1306C', bg: 'rgba(225,48,108,0.12)',  Icon: Instagram },
  LINKEDIN:  { label: 'LinkedIn',    color: '#0A66C2', bg: 'rgba(10,102,194,0.12)',  Icon: Linkedin  },
  YOUTUBE:   { label: 'YouTube',     color: '#FF0000', bg: 'rgba(255,0,0,0.12)',     Icon: Youtube   },
  TV:        { label: 'TV',          color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   Icon: Tv        },
  RADIO:     { label: 'Radio',       color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', Icon: Radio     },
  WEB:       { label: 'Web',         color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', Icon: Globe     },
};

const CHART_COLORS = ['#f093fb', '#f5576c', '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Detecta la red/canal usando contextBefore (marcador RRSS) primero,
// luego URL, y finalmente type de source. Evita que source.name de TV
// se use para clasificar menciones de RRSS.
function detectNetwork(mention: any): string {
  const cb   = (mention.contextBefore || '').toUpperCase();
  const url  = (mention.url || mention.clipUrl || '').toLowerCase();
  const type = mention.source?.type || '';

  // RRSS: marcador en contextBefore es la fuente de verdad
  if (cb.startsWith('[YOUTUBE]')  || url.includes('youtube')   || url.includes('youtu.be')) return 'YOUTUBE';
  if (cb.startsWith('[FACEBOOK]') || url.includes('facebook'))                              return 'FACEBOOK';
  if (cb.startsWith('[TWITTER]')  || url.includes('twitter')   || url.includes('x.com'))   return 'TWITTER';
  if (cb.startsWith('[INSTAGRAM]')|| url.includes('instagram'))                             return 'INSTAGRAM';
  if (cb.startsWith('[LINKEDIN]') || url.includes('linkedin'))                              return 'LINKEDIN';

  // Medios tradicionales: usar type del source
  if (type === 'LIVE_STREAM')  return 'TV';
  if (type === 'RADIO_STREAM') return 'RADIO';
  return 'WEB';
}

// Nombre de fuente correcto según tipo de mención:
// - RRSS: autor extraído de contextBefore (e.g. "[YOUTUBE] Canal Tal" → "Canal Tal")
// - TV/Radio/Web: source.name del canal real
function getMentionSourceName(mention: any): string {
  const cb = mention.contextBefore || '';
  if (/^\[(YOUTUBE|FACEBOOK|TWITTER|INSTAGRAM|LINKEDIN)\]/i.test(cb)) {
    // Extraer el autor quitando el prefijo [RED]
    const author = cb.replace(/^\[.*?\]\s*/, '').trim();
    return author || 'Red social';
  }
  return mention.source?.name || '—';
}

function formatDate(date: any, fmt = 'd MMM, HH:mm'): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? parseISO(date) : new Date(date);
  return isValid(d) ? format(d, fmt, { locale: es }) : '—';
}

function getDateObj(mention: any): Date {
  const raw = mention.timestamp || mention.detectedAt || mention.publishedAt;
  if (!raw) return new Date(0);
  const d = typeof raw === 'string' ? parseISO(raw) : new Date(raw);
  return isValid(d) ? d : new Date(0);
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, Icon, trend }: {
  label: string; value: string | number; sub?: string;
  color: string; Icon: React.ElementType; trend?: 'up' | 'down';
}) {
  return (
    <div className="rp-kpi-card">
      <div className="rp-kpi-icon" style={{ background: color + '22', color }}>
        <Icon size={20} />
      </div>
      <div className="rp-kpi-body">
        <span className="rp-kpi-value">{value}</span>
        <span className="rp-kpi-label">{label}</span>
        {sub && (
          <span className="rp-kpi-sub" style={{
            color: trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : '#94a3b8'
          }}>
            {trend === 'up'   && <ArrowUpRight size={12} />}
            {trend === 'down' && <ArrowDownRight size={12} />}
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────
function NetworkBadge({ network }: { network: string }) {
  const cfg  = NETWORK_CONFIG[network] || NETWORK_CONFIG.WEB;
  const Icon = cfg.Icon as React.ElementType;
  return (
    <span className="rp-network-badge" style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.color + '44' }}>
      <Icon size={12} />
      {cfg.label}
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment?: string }) {
  const key = (sentiment || 'NEUTRAL') as keyof typeof SENTIMENT_CONFIG;
  const cfg = SENTIMENT_CONFIG[key] ?? SENTIMENT_CONFIG.NEUTRAL;
  const SIcon = cfg.Icon as React.ElementType;
  return (
    <span className="rp-sentiment-badge" style={{ background: cfg.bg, color: cfg.color }}>
      <SIcon size={12} />
      {cfg.label}
    </span>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rp-tooltip">
      <p className="rp-tooltip-label">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color ?? p.fill }} className="rp-tooltip-item">
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  // ── Brand filter: estado LOCAL (no persiste entre páginas) ─────────────────
  // MentionsPage también usa estado local — evita que el filtro del Dashboard
  // oculte menciones de TV/Radio al cambiar de página.
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: brandService.getAll,
  });

  const [searchTerm,      setSearchTerm]      = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('ALL');
  const [networkFilter,   setNetworkFilter]   = useState<NetworkFilter>('ALL');
  const [dateRange,       setDateRange]       = useState<7 | 14 | 30 | 90>(30);
  const [viewMode,        setViewMode]        = useState<ViewMode>('table');
  const [chartView,       setChartView]       = useState<ChartView>('overview');
  const [expandedRow,     setExpandedRow]     = useState<string | null>(null);
  const [showColPicker,   setShowColPicker]   = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<ColumnKey[]>(
    ['date', 'brand', 'source', 'network', 'title', 'sentiment']
  );

  // ── Data ────────────────────────────────────────────────────────────────────
  const { data: mentions = [], isLoading, refetch } = useQuery({
    queryKey: ['mentions-report', selectedBrandId],
    queryFn:  () => pilotMentionsService.getAll(selectedBrandId || undefined, 1000),
    staleTime: 0,          // siempre refetch al navegar a esta página
    refetchInterval: 120_000, // auto-refetch cada 2 minutos
  });

  const enriched = useMemo(() =>
    (mentions as any[]).map(m => ({ ...m, _network: detectNetwork(m) })),
    [mentions]
  );

  const minDate = useMemo(() => startOfDay(subDays(new Date(), dateRange)), [dateRange]);

  const filtered = useMemo(() => {
    let list = enriched;
    list = list.filter(m => getDateObj(m) >= minDate);
    if (networkFilter   !== 'ALL') list = list.filter(m => m._network === networkFilter);
    if (sentimentFilter !== 'ALL') list = list.filter(m => (m.sentiment || 'NEUTRAL') === sentimentFilter);
    if (searchTerm.trim()) {
      const t = searchTerm.toLowerCase();
      list = list.filter(m =>
        (m.keyword || '').toLowerCase().includes(t) ||
        (m.context  || '').toLowerCase().includes(t) ||
        (m.source?.name || '').toLowerCase().includes(t) ||
        (m.title    || '').toLowerCase().includes(t) ||
        (m.excerpt  || '').toLowerCase().includes(t)
      );
    }
    return list.sort((a, b) => getDateObj(b).getTime() - getDateObj(a).getTime());
  }, [enriched, minDate, networkFilter, sentimentFilter, searchTerm]);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total    = filtered.length;
    const positive = filtered.filter(m => m.sentiment === 'POSITIVE').length;
    const negative = filtered.filter(m => m.sentiment === 'NEGATIVE').length;
    const neutral  = filtered.filter(m => !m.sentiment || m.sentiment === 'NEUTRAL').length;
    const networks = new Set(filtered.map(m => m._network)).size;
    const brands   = new Set(filtered.map(m => m.keyword || m.brand?.name || '—')).size;
    return {
      total, positive, negative, neutral, networks, brands,
      posPct: total ? Math.round((positive / total) * 100) : 0,
      negPct: total ? Math.round((negative / total) * 100) : 0,
    };
  }, [filtered]);

  // ── Chart data ──────────────────────────────────────────────────────────────
  const timelineData = useMemo(() => {
    const map: Record<string, { date: string; total: number; positive: number; negative: number; neutral: number }> = {};
    filtered.forEach(m => {
      const d = getDateObj(m);
      if (!d.getTime()) return;
      const key = format(d, 'yyyy-MM-dd');
      if (!map[key]) map[key] = { date: format(d, 'd MMM', { locale: es }), total: 0, positive: 0, negative: 0, neutral: 0 };
      map[key].total++;
      const s = ((m.sentiment || 'NEUTRAL') as string).toLowerCase() as 'positive' | 'negative' | 'neutral';
      if (s === 'positive' || s === 'negative' || s === 'neutral') map[key][s]++;
    });
    return Object.values(map);
  }, [filtered]);

  const sentimentData = useMemo(() => [
    { name: 'Positivo', value: kpis.positive, color: '#10b981' },
    { name: 'Neutral',  value: kpis.neutral,  color: '#94a3b8' },
    { name: 'Negativo', value: kpis.negative, color: '#ef4444' },
  ], [kpis]);

  const networkData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(m => { map[m._network] = (map[m._network] || 0) + 1; });
    return Object.entries(map)
      .map(([key, count]) => ({ name: NETWORK_CONFIG[key]?.label || key, count, color: NETWORK_CONFIG[key]?.color || '#94a3b8' }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const topKeywords = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(m => { const k = m.keyword || m.brand?.name || '—'; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).map(([kw, count]) => ({ kw, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [filtered]);

  // Menciones por medio (fuente/nombre) — top 8
  const medioData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(m => {
      const key = getMentionSourceName(m) || m._network || 'Desconocido';
      map[key] = (map[key] || 0) + 1;
    });
    const sorted = Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const max = sorted[0]?.count || 1;
    return sorted.map(d => ({ ...d, pct: Math.round((d.count / max) * 100) }));
  }, [filtered]);

  // Alcance estimado por canal a lo largo del tiempo (área apilada)
  // Alcance = menciones * factor estimado por canal
  const REACH_FACTOR: Record<string, number> = {
    YOUTUBE: 5000, FACEBOOK: 3500, INSTAGRAM: 2800, TWITTER: 1800,
    LINKEDIN: 1200, TV: 8000, RADIO: 4000, WEB: 600,
  };
  const reachData = useMemo(() => {
    const map: Record<string, Record<string, number> & { date: string }> = {};
    filtered.forEach(m => {
      const d = getDateObj(m);
      if (!d.getTime()) return;
      const key = format(d, 'yyyy-MM-dd');
      if (!map[key]) map[key] = { date: format(d, 'd MMM', { locale: es }) } as any;
      const net = m._network as string;
      map[key][net] = ((map[key][net] as number) || 0) + (REACH_FACTOR[net] || 500);
    });
    return Object.values(map);
  }, [filtered]);

  // ── Export ──────────────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (!filtered.length) return;
    const headers = ['Fecha', 'Marca', 'Fuente', 'Canal', 'Contenido', 'Sentimiento', 'Tipo', 'URL'];
    const rows = filtered.map(m => [
      formatDate(m.timestamp || m.detectedAt, 'dd/MM/yyyy HH:mm'),
      m.keyword || m.brand?.name || '—',
      getMentionSourceName(m),
      NETWORK_CONFIG[m._network]?.label || m._network,
      `"${((m.context || m.title || m.excerpt || '').substring(0, 150)).replace(/"/g, '""')}"`,
      m.sentiment || 'NEUTRAL',
      m.source?.type || '—',
      m.clipUrl || m.url || '—',
    ].join(','));
    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `reporte_menciones_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const toggleColumn = (key: ColumnKey) =>
    setSelectedColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="rp-container">

      {/* ── Header ── */}
      <div className="rp-header">
        <div className="rp-header-left">
          <div className="rp-header-icon">
            <BarChart2 size={22} />
          </div>
          <div>
            <h1 className="rp-title">Reportes de Menciones</h1>
            <p className="rp-subtitle">
              Análisis interactivo · <strong>{filtered.length}</strong> menciones · últimos <strong>{dateRange}</strong> días
            </p>
          </div>
        </div>
        <div className="rp-header-actions">
          <button className="rp-btn-icon" onClick={() => refetch()} title="Actualizar datos">
            <RefreshCw size={15} />
          </button>
          <button className="rp-btn-secondary" onClick={exportCSV}>
            <FileDown size={15} /> CSV
          </button>
          <button className="rp-btn-secondary" onClick={() => alert('PDF — Próximamente')}>
            <FileText size={15} /> PDF
          </button>
          <button className="rp-btn-primary" onClick={() => alert('Enviar — Próximamente')}>
            <Mail size={15} /> Enviar
          </button>
        </div>
      </div>

      {/* ── Top filters ── */}
      <div className="rp-filters-row">
        {/* Brand selector */}
        <div className="rp-brand-select-wrap">
          <Filter size={13} className="rp-brand-select-icon" />
          <select
            className="rp-brand-select"
            value={selectedBrandId || 'all'}
            onChange={e => setSelectedBrandId(e.target.value === 'all' ? null : e.target.value)}
          >
            <option value="all">Todas las marcas</option>
            {(brands as any[]).map((b: any) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="rp-date-tabs">
          {([7, 14, 30, 90] as const).map(d => (
            <button key={d} className={`rp-date-tab${dateRange === d ? ' active' : ''}`} onClick={() => setDateRange(d)}>
              {d}d
            </button>
          ))}
        </div>
        <div className="rp-search">
          <Search size={14} />
          <input
            type="text" placeholder="Buscar menciones..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} className="rp-search-input"
          />
        </div>
      </div>

      {/* ── Canal + Sentimiento en una sola fila ── */}
      <div className="rp-filter-double-row">
        <div className="rp-filter-bar">
          <span className="rp-filter-bar-label"><Globe size={13} /> Canal:</span>
          <div className="rp-filter-bar-chips">
            {(['ALL', 'FACEBOOK', 'TWITTER', 'INSTAGRAM', 'LINKEDIN', 'YOUTUBE', 'TV', 'RADIO', 'WEB'] as NetworkFilter[]).map(n => {
              const cfg  = n !== 'ALL' ? NETWORK_CONFIG[n] : null;
              const Icon = cfg?.Icon as React.ElementType | undefined;
              const active = networkFilter === n;
              return (
                <button key={n} className={`rp-chip${active ? ' active' : ''}`}
                  style={active && cfg ? { background: cfg.bg, color: cfg.color, borderColor: cfg.color + '66' } : {}}
                  onClick={() => setNetworkFilter(n)}>
                  {Icon && <Icon size={13} />}
                  {n === 'ALL' ? 'Todos' : cfg?.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rp-filter-divider" />

        <div className="rp-filter-bar">
          <span className="rp-filter-bar-label"><Activity size={13} /> Sentimiento:</span>
          <div className="rp-filter-bar-chips">
            {(['ALL', 'POSITIVE', 'NEUTRAL', 'NEGATIVE'] as SentimentFilter[]).map(s => {
              const cfg   = s !== 'ALL' ? SENTIMENT_CONFIG[s] : null;
              const SIcon = cfg?.Icon as React.ElementType | undefined;
              const active = sentimentFilter === s;
              const count  = s === 'POSITIVE' ? kpis.positive : s === 'NEGATIVE' ? kpis.negative : s === 'NEUTRAL' ? kpis.neutral : kpis.total;
              return (
                <button key={s} className={`rp-chip${active ? ' active' : ''}`}
                  style={active && cfg ? { background: cfg.bg, color: cfg.color, borderColor: cfg.color + '66' } : {}}
                  onClick={() => setSentimentFilter(s)}>
                  {SIcon && <SIcon size={13} />}
                  {s === 'ALL' ? 'Todos' : cfg?.label}
                  <span className="rp-chip-count">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="rp-kpi-grid">
        <KpiCard label="Total menciones"   value={kpis.total}    color="#f093fb" Icon={Hash}       sub={`últimos ${dateRange}d`} />
        <KpiCard label="Positivas"         value={kpis.positive} color="#10b981" Icon={ThumbsUp}   sub={`${kpis.posPct}%`} trend="up" />
        <KpiCard label="Negativas"         value={kpis.negative} color="#ef4444" Icon={ThumbsDown}  sub={`${kpis.negPct}%`} trend="down" />
        <KpiCard label="Neutras"           value={kpis.neutral}  color="#94a3b8" Icon={Minus}      />
        <KpiCard label="Canales activos"   value={kpis.networks} color="#3b82f6" Icon={Globe}      />
        <KpiCard label="Marcas / Keywords" value={kpis.brands}   color="#8b5cf6" Icon={Tag}        />
      </div>

      {/* ── Charts ── */}
      <div className="rp-charts-section">
        <div className="rp-chart-tabs">
          {([
            { key: 'overview',  label: 'Resumen',         Icon: BarChart2     },
            { key: 'timeline',  label: 'Línea de tiempo', Icon: Activity      },
            { key: 'sentiment', label: 'Sentimiento',     Icon: PieChartIcon  },
            { key: 'sources',   label: 'Canales',         Icon: Globe         },
          ] as { key: ChartView; label: string; Icon: React.ElementType }[]).map(tab => (
            <button key={tab.key} className={`rp-chart-tab${chartView === tab.key ? ' active' : ''}`}
              onClick={() => setChartView(tab.key)}>
              <tab.Icon size={14} /> {tab.label}
            </button>
          ))}
        </div>

        <div className="rp-chart-area">

          {/* Overview — 2 rows × 2 cols */}
          {chartView === 'overview' && (
            <div className="rp-overview-grid">

              {/* Fila 1 col 1 — Menciones por keyword */}
              <div className="rp-chart-card">
                <h4 className="rp-chart-title">Menciones por keyword</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topKeywords} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="kw" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis               tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Menciones" radius={[4, 4, 0, 0]}>
                      {topKeywords.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Fila 1 col 2 — Sentimiento global */}
              <div className="rp-chart-card">
                <h4 className="rp-chart-title">Sentimiento global</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={48} outerRadius={75}
                      dataKey="value" paddingAngle={3}>
                      {sentimentData.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconType="circle" iconSize={9}
                      formatter={v => <span style={{ fontSize: 11, color: '#94a3b8' }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Fila 2 col 1 — Menciones por medio */}
              <div className="rp-chart-card">
                <h4 className="rp-chart-title">Menciones por medio</h4>
                <div className="rp-medio-list">
                  {medioData.length === 0 && (
                    <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>Sin datos</p>
                  )}
                  {medioData.map((d, i) => (
                    <div key={d.name} className="rp-medio-item">
                      <div className="rp-medio-header">
                        <span className="rp-medio-name">{d.name}</span>
                        <span className="rp-medio-count">{d.count}</span>
                      </div>
                      <div className="rp-medio-track">
                        <div
                          className="rp-medio-bar"
                          style={{
                            width: `${d.pct}%`,
                            background: CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fila 2 col 2 — Alcance por canal */}
              <div className="rp-chart-card">
                <h4 className="rp-chart-title">Alcance estimado por canal</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={reachData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <defs>
                      {Object.entries(NETWORK_CONFIG).map(([key, cfg]) => (
                        <linearGradient key={key} id={`reach-${key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={cfg.color} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                    <Tooltip content={<ChartTooltip />} />
                    {networkData.map(n => {
                      const netKey = Object.entries(NETWORK_CONFIG).find(([, c]) => c.label === n.name)?.[0];
                      if (!netKey) return null;
                      return (
                        <Area key={netKey} type="monotone" dataKey={netKey}
                          name={n.name} stroke={n.color}
                          fill={`url(#reach-${netKey})`} strokeWidth={1.5} stackId="1" />
                      );
                    })}
                  </AreaChart>
                </ResponsiveContainer>
              </div>

            </div>
          )}

          {/* Timeline */}
          {chartView === 'timeline' && (
            <div className="rp-chart-card rp-chart-card--full">
              <h4 className="rp-chart-title">Menciones en el tiempo</h4>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={timelineData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                  <defs>
                    {[['gradTotal','#f093fb'],['gradPos','#10b981'],['gradNeg','#ef4444']].map(([id, c]) => (
                      <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={c} stopOpacity={0.28} />
                        <stop offset="95%" stopColor={c} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis                tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconSize={9} formatter={v => <span style={{ fontSize: 12, color: '#94a3b8' }}>{v}</span>} />
                  <Area type="monotone" dataKey="total"    name="Total"    stroke="#f093fb" fill="url(#gradTotal)" strokeWidth={2} />
                  <Area type="monotone" dataKey="positive" name="Positivo" stroke="#10b981" fill="url(#gradPos)"   strokeWidth={2} />
                  <Area type="monotone" dataKey="negative" name="Negativo" stroke="#ef4444" fill="url(#gradNeg)"   strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Sentiment breakdown */}
          {chartView === 'sentiment' && (
            <div className="rp-chart-row">
              <div className="rp-chart-card">
                <h4 className="rp-chart-title">Distribución</h4>
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                      dataKey="value" paddingAngle={4}
                      label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      labelLine={false}>
                      {sentimentData.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="rp-legend-row">
                  {sentimentData.map(s => (
                    <div key={s.name} className="rp-legend-item">
                      <span className="rp-legend-dot" style={{ background: s.color }} />
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>{s.name}</span>
                      <strong style={{ color: s.color }}>{s.value}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rp-chart-card rp-chart-card--wide">
                <h4 className="rp-chart-title">Sentimiento por día (apilado)</h4>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={timelineData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis                tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconSize={9} />
                    <Bar dataKey="positive" name="Positivo" stackId="a" fill="#10b981" />
                    <Bar dataKey="neutral"  name="Neutral"  stackId="a" fill="#94a3b8" />
                    <Bar dataKey="negative" name="Negativo" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Channels / Sources */}
          {chartView === 'sources' && (
            <div className="rp-chart-row">
              <div className="rp-chart-card rp-chart-card--wide">
                <h4 className="rp-chart-title">Menciones por canal</h4>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={networkData} layout="vertical" margin={{ top: 4, right: 20, left: 70, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" horizontal={false} />
                    <XAxis type="number"   tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} width={70} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Menciones" radius={[0, 4, 4, 0]}>
                      {networkData.map((n, i) => <Cell key={i} fill={n.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rp-chart-card">
                <h4 className="rp-chart-title">Distribución de canales</h4>
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie data={networkData} cx="50%" cy="50%" outerRadius={85}
                      dataKey="count" nameKey="name" paddingAngle={2}>
                      {networkData.map((n, i) => <Cell key={i} fill={n.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconType="circle" iconSize={9}
                      formatter={v => <span style={{ fontSize: 11, color: '#94a3b8' }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Table / Grid ── */}
      <div className="rp-table-section">

        {/* Top bar */}
        <div className="rp-table-topbar">
          <div className="rp-table-count">
            <Hash size={14} />
            <strong>{filtered.length}</strong> menciones
            {isLoading && <span className="rp-spinner" />}
          </div>
          <div className="rp-table-controls">

            {/* Column picker */}
            <div style={{ position: 'relative' }}>
              <button className="rp-btn-secondary rp-btn-sm" onClick={() => setShowColPicker(p => !p)}>
                <Filter size={13} /> Columnas
                <ChevronDown size={12} style={{ transform: showColPicker ? 'rotate(180deg)' : undefined, transition: '.2s' }} />
              </button>
              {showColPicker && (
                <div className="rp-col-dropdown">
                  {AVAILABLE_COLUMNS.map(col => (
                    <label key={col.key} className="rp-col-item">
                      <input type="checkbox" checked={selectedColumns.includes(col.key)}
                        onChange={() => toggleColumn(col.key)} />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* View toggle */}
            <div className="rp-view-toggle">
              <button className={`rp-view-btn${viewMode === 'table' ? ' active' : ''}`}
                onClick={() => setViewMode('table')} title="Tabla">
                <List size={14} />
              </button>
              <button className={`rp-view-btn${viewMode === 'grid' ? ' active' : ''}`}
                onClick={() => setViewMode('grid')} title="Tarjetas">
                <LayoutGrid size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="rp-loading">
            <div className="rp-loading-spinner" />
            <p>Cargando menciones…</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && filtered.length === 0 && (
          <div className="rp-empty">
            <Search size={38} />
            <p>Sin menciones para los filtros actuales</p>
            <span>Ajusta el rango de fechas, canal o sentimiento</span>
          </div>
        )}

        {/* Grid view */}
        {!isLoading && filtered.length > 0 && viewMode === 'grid' && (
          <div className="rp-grid">
            {filtered.map(m => (
              <div key={m.id} className="rp-grid-card">
                <div className="rp-grid-card-top">
                  <NetworkBadge network={m._network} />
                  <SentimentBadge sentiment={m.sentiment} />
                </div>
                <p className="rp-grid-card-text">
                  {(m.context || m.title || m.excerpt || '—').substring(0, 130)}
                  {(m.context || m.title || m.excerpt || '').length > 130 && '…'}
                </p>
                <div className="rp-grid-card-meta">
                  {(m.keyword || m.brand?.name) && (
                    <span className="rp-brand-badge"><Tag size={11} />{m.keyword || m.brand?.name}</span>
                  )}
                  <span className="rp-grid-date"><Clock size={11} />{formatDate(m.timestamp || m.detectedAt)}</span>
                </div>
                {getMentionSourceName(m) && <span className="rp-grid-source">{getMentionSourceName(m)}</span>}
                {(m.clipUrl || m.url) && (
                  <a href={m.clipUrl
                      ? m.clipUrl.startsWith('http') ? m.clipUrl : `/api/pilot${m.clipUrl}`
                      : m.url}
                    target="_blank" rel="noopener noreferrer" className="rp-grid-link">
                    <Eye size={12} /> Ver
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Table view */}
        {!isLoading && filtered.length > 0 && viewMode === 'table' && (
          <div className="rp-table-wrapper">
            <table className="rp-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }} />
                  {selectedColumns.includes('date')      && <th>Fecha</th>}
                  {selectedColumns.includes('brand')     && <th>Marca</th>}
                  {selectedColumns.includes('source')    && <th>Fuente</th>}
                  {selectedColumns.includes('network')   && <th>Canal</th>}
                  {selectedColumns.includes('title')     && <th>Contenido</th>}
                  {selectedColumns.includes('sentiment') && <th>Sentimiento</th>}
                  {selectedColumns.includes('type')      && <th>Tipo</th>}
                  {selectedColumns.includes('url')       && <th>Acc.</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <>
                    <tr key={m.id}
                      className={`rp-tr${expandedRow === m.id ? ' rp-tr--expanded' : ''}`}
                      onClick={() => setExpandedRow(expandedRow === m.id ? null : m.id)}>
                      <td className="rp-td-toggle">
                        {expandedRow === m.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </td>
                      {selectedColumns.includes('date') && (
                        <td className="rp-td-date">
                          <Clock size={11} />{formatDate(m.timestamp || m.detectedAt)}
                        </td>
                      )}
                      {selectedColumns.includes('brand') && (
                        <td><span className="rp-brand-badge"><Tag size={11} />{m.keyword || m.brand?.name || '—'}</span></td>
                      )}
                      {selectedColumns.includes('source') && (
                        <td className="rp-td-muted">{getMentionSourceName(m)}</td>
                      )}
                      {selectedColumns.includes('network') && (
                        <td><NetworkBadge network={m._network} /></td>
                      )}
                      {selectedColumns.includes('title') && (
                        <td className="rp-td-title">
                          {(m.context || m.title || m.excerpt || '—').substring(0, 95)}
                          {(m.context || m.title || m.excerpt || '').length > 95 && '…'}
                        </td>
                      )}
                      {selectedColumns.includes('sentiment') && (
                        <td><SentimentBadge sentiment={m.sentiment} /></td>
                      )}
                      {selectedColumns.includes('type') && (
                        <td>
                          <span className="rp-type-badge">
                            {m.source?.type === 'LIVE_STREAM'  ? 'TV'    :
                             m.source?.type === 'RADIO_STREAM' ? 'Radio' :
                             m.source?.type === 'RSS_FEED'     ? 'RSS'   :
                             m.source?.type === 'WEB_SCRAPE'   ? 'Web'   : m.source?.type || '—'}
                          </span>
                        </td>
                      )}
                      {selectedColumns.includes('url') && (
                        <td className="rp-td-actions" onClick={e => e.stopPropagation()}>
                          {(m.clipUrl || m.url) && (
                            <a href={m.clipUrl
                                ? m.clipUrl.startsWith('http') ? m.clipUrl : `/api/pilot${m.clipUrl}`
                                : m.url}
                              target="_blank" rel="noopener noreferrer"
                              className="rp-action-btn" title="Ver / Descargar">
                              <Download size={13} />
                            </a>
                          )}
                        </td>
                      )}
                    </tr>

                    {/* Expanded detail */}
                    {expandedRow === m.id && (
                      <tr key={`${m.id}-exp`} className="rp-tr-detail">
                        <td colSpan={selectedColumns.length + 2}>
                          <div className="rp-detail">
                            <div className="rp-detail-text-col">
                              <span className="rp-detail-label">Contenido completo</span>
                              <p className="rp-detail-text">{m.context || m.title || m.excerpt || '—'}</p>
                            </div>
                            <div className="rp-detail-meta-col">
                              {getMentionSourceName(m) && (
                                <div className="rp-detail-meta-item">
                                  <span className="rp-detail-label">Fuente</span>
                                  <span>{getMentionSourceName(m)}</span>
                                </div>
                              )}
                              {(m.url || m.clipUrl) && (
                                <div className="rp-detail-meta-item">
                                  <span className="rp-detail-label">URL / Clip</span>
                                  <a href={m.clipUrl
                                      ? m.clipUrl.startsWith('http') ? m.clipUrl : `/api/pilot${m.clipUrl}`
                                      : m.url}
                                    target="_blank" rel="noopener noreferrer"
                                    className="rp-detail-url" onClick={e => e.stopPropagation()}>
                                    {(m.url || m.clipUrl || '').substring(0, 60)}…
                                  </a>
                                </div>
                              )}
                              <div className="rp-detail-meta-item">
                                <span className="rp-detail-label">Fecha exacta</span>
                                <span>{formatDate(m.timestamp || m.detectedAt, 'dd/MM/yyyy HH:mm:ss')}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
