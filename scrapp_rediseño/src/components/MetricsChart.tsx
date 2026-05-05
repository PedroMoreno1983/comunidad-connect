import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  LineChart, 
  Line, 
  AreaChart,
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { BarChart3, Sparkles, FileText } from 'lucide-react';
import { brandService } from '../services/brandService';
import { mentionService } from '../services/mentionService';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../services/api';
import AiChatModal from './AiChatModal';
import { es } from 'date-fns/locale';

type PeriodType = 'days' | 'weeks' | 'months';
type TimeRange = '7days' | '30days' | '90days' | 'custom';
type ChartTab = 'mentions' | 'sentiment';

interface Brand {
  id: string;
  name: string;
  keywords: string[];
  _count?: { mentions: number };
}

interface Mention {
  id: string;
  title: string;
  excerpt?: string;
  url?: string;
  publishedAt?: string | Date;
  createdAt: string | Date;
  sentiment?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  brand?: {
    id: string;
    name: string;
  };
  source?: {
    id: string;
    name: string;
    type: string;
  };
}

interface GetMentionsParams {
  brandId?: string;
  startDate?: string;
  endDate?: string;
  [key: string]: any;
}

interface MetricsChartProps {
  defaultBrandId?: string;
}

export default function MetricsChart({ defaultBrandId }: MetricsChartProps) {
  const [selectedBrandId, setSelectedBrandId] = useState<string>(defaultBrandId || 'all');
  const [periodType, setPeriodType] = useState<PeriodType>('days');
  const [timeRange, setTimeRange] = useState<TimeRange>('30days');
  const [activeTab, setActiveTab] = useState<ChartTab>('mentions');
  
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Cargar marcas
  const { data: brands } = useQuery<Brand[]>({
    queryKey: ['brands'],
    queryFn: brandService.getAll,
  });

  // Calcular rango de fechas
  const dateRange = useMemo(() => {
    const now = new Date();
    let startDate: Date;

    switch (timeRange) {
      case '7days':
        startDate = subDays(now, 7);
        break;
      case '30days':
        startDate = subDays(now, 30);
        break;
      case '90days':
        startDate = subDays(now, 90);
        break;
      default:
        startDate = subDays(now, 30);
    }

    return { startDate: startOfDay(startDate), endDate: endOfDay(now) };
  }, [timeRange]);

  // Cargar datos de menciones
  const { data: mentionsData, isLoading } = useQuery<Mention[]>({
    queryKey: ['mentions-metrics', selectedBrandId, dateRange, periodType],
    queryFn: async () => {
      const params: GetMentionsParams = {
        brandId: selectedBrandId === 'all' ? undefined : selectedBrandId,
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      };
      const mentions = await mentionService.getAll(params as any);
      return mentions || [];
    },
  });

  // Procesar datos para el gráfico
  const chartData = useMemo(() => {
    if (!mentionsData) return [];

    const groupedData = new Map<string, { mentions: number; positive: number; negative: number; neutral: number }>();

    mentionsData.forEach((mention: Mention) => {
      // ✅ VALIDAR FECHA ANTES DE USAR
      const timestamp = mention.publishedAt || mention.createdAt;
      if (!timestamp) {
        console.warn('⚠️ Mención sin fecha:', mention.id);
        return; // Skip si no hay fecha
      }
      
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        console.warn('⚠️ Fecha inválida en mención:', mention.id, timestamp);
        return; // Skip si fecha inválida
      }
      
      let key: string;

      switch (periodType) {
        case 'weeks':
          const weekStart = startOfDay(subDays(date, date.getDay()));
          key = format(weekStart, 'dd MMM', { locale: es });
          break;
        case 'months':
          key = format(date, 'MMM yyyy', { locale: es });
          break;
        default: // days
          key = format(date, 'dd MMM', { locale: es });
      }

      const existing = groupedData.get(key) || { mentions: 0, positive: 0, negative: 0, neutral: 0 };
      existing.mentions += 1;

      if (mention.sentiment === 'POSITIVE') existing.positive += 1;
      else if (mention.sentiment === 'NEGATIVE') existing.negative += 1;
      else existing.neutral += 1;

      groupedData.set(key, existing);
    });

    return Array.from(groupedData.entries()).map(([date, data]) => ({
      date,
      menciones: data.mentions,
      alcance: data.mentions * 1000,
      positivo: data.positive,
      negativo: data.negative,
      neutral: data.neutral,
    }));
  }, [mentionsData, periodType]);

  // Datos para gráfico de sentimiento (pie)
  const sentimentData = useMemo(() => {
    if (!mentionsData) return [];

    const counts = mentionsData.reduce(
      (acc: { positive: number; negative: number; neutral: number }, m: Mention) => {
        if (m.sentiment === 'POSITIVE') acc.positive += 1;
        else if (m.sentiment === 'NEGATIVE') acc.negative += 1;
        else acc.neutral += 1;
        return acc;
      },
      { positive: 0, negative: 0, neutral: 0 }
    );

    return [
      { name: 'Positivo', value: counts.positive, color: '#10b981' },
      { name: 'Neutral', value: counts.neutral, color: '#6b7280' },
      { name: 'Negativo', value: counts.negative, color: '#ef4444' },
    ];
  }, [mentionsData]);

  
  /**
   * Generar resumen con IA usando Ollama
   */
  const handleAISummary = async () => {
    setSummaryLoading(true);
    const toastId = toast.loading('🤖 Generando resumen con IA...');

    try {
      const response = await api.post('/ai/summarize', {
        brandId: selectedBrandId === 'all' ? undefined : selectedBrandId,
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      });

      setAiSummary(response.data.summary);
      toast.success('✅ Resumen generado', { id: toastId });
    } catch (error: any) {
      console.error('Error generando resumen:', error);
      const message = error.response?.data?.message || 'Error al generar resumen con IA';
      toast.error(message, { id: toastId });
    } finally {
      setSummaryLoading(false);
    }
  };

  /**
   * Generar informe PDF
   */
  const handleGenerateReport = async () => {
    const toastId = toast.loading('📄 Generando informe PDF...');

    try {
      const params = new URLSearchParams();
      if (selectedBrandId !== 'all') {
        params.append('brandId', selectedBrandId);
      }
      params.append('startDate', dateRange.startDate.toISOString());
      params.append('endDate', dateRange.endDate.toISOString());

      const response = await api.get(`/reports/generate?${params.toString()}`, {
        responseType: 'blob',
      });

      // Descargar archivo
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `reporte_${selectedBrandId}_${new Date().toISOString().slice(0, 10)}.pdf`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success('✅ Informe descargado', { id: toastId });
    } catch (error: any) {
      console.error('Error generando informe:', error);
      const message = error.response?.data?.message || 'Error al generar el informe';
      toast.error(message, { id: toastId });
    }
  };

  return (
    <div className="rounded-lg shadow-lg p-6" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <BarChart3 className="h-6 w-6" style={{ color: 'var(--primary)' }} />
            Análisis de Menciones
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Seguimiento de menciones y análisis de sentimiento
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleAISummary}
            disabled={summaryLoading || !mentionsData || mentionsData.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ 
              backgroundColor: 'var(--primary)', 
              color: 'white',
            }}
          >
            <Sparkles className="h-4 w-4" />
            {summaryLoading ? 'Generando...' : 'Resumen IA'}
          </button>
          <button
            onClick={handleGenerateReport}
            disabled={!mentionsData || mentionsData.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ 
              backgroundColor: 'var(--secondary)', 
              color: 'white',
            }}
          >
            <FileText className="h-4 w-4" />
            Generar PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col sm:flex-row gap-4">
        {/* Brand selector */}
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            Marca
          </label>
          <select
            value={selectedBrandId}
            onChange={(e) => setSelectedBrandId(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-primary-500 transition-all"
            style={{ 
              backgroundColor: 'var(--bg-body)', 
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)'
            }}
          >
            <option value="all">Todas las marcas</option>
            {brands?.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name} {brand._count?.mentions ? `(${brand._count.mentions})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Time range selector */}
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            Período
          </label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-primary-500 transition-all"
            style={{ 
              backgroundColor: 'var(--bg-body)', 
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)'
            }}
          >
            <option value="7days">Últimos 7 días</option>
            <option value="30days">Últimos 30 días</option>
            <option value="90days">Últimos 90 días</option>
          </select>
        </div>
      </div>

      {/* Tabs and Period Type */}
      <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-color)' }}>
          <button
            onClick={() => setActiveTab('mentions')}
            className={`px-4 py-2 font-medium transition-all ${
              activeTab === 'mentions'
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                : 'text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
            style={{ borderColor: 'var(--border-color)' }}
          >
            Menciones
          </button>
          <button
            onClick={() => setActiveTab('sentiment')}
            className={`px-4 py-2 font-medium transition-all border-l ${
              activeTab === 'sentiment'
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                : 'text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
            style={{ borderColor: 'var(--border-color)' }}
          >
            Sentimiento
          </button>
        </div>

        {/* Period type buttons */}
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-color)' }}>
          <button
            onClick={() => setPeriodType('days')}
            className={`px-4 py-2 font-medium transition-all ${
              periodType === 'days'
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                : 'text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
            style={{ borderColor: 'var(--border-color)' }}
          >
            Días
          </button>
          <button
            onClick={() => setPeriodType('weeks')}
            className={`px-4 py-2 font-medium transition-all border-l ${
              periodType === 'weeks'
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                : 'text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
            style={{ borderColor: 'var(--border-color)' }}
          >
            Semanas
          </button>
          <button
            onClick={() => setPeriodType('months')}
            className={`px-4 py-2 font-medium transition-all border-l ${
              periodType === 'months'
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                : 'text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
            style={{ borderColor: 'var(--border-color)' }}
          >
            Meses
          </button>
        </div>
      </div>

      {/* Gráfico */}
      <div className="mt-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-96" style={{ color: 'var(--text-muted)' }}>
            <div className="text-center">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 animate-pulse" />
              <p>Cargando datos...</p>
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-96" style={{ color: 'var(--text-muted)' }}>
            <div className="text-center">
              <BarChart3 className="h-12 w-12 mx-auto mb-4" />
              <p className="font-semibold mb-2">No hay datos para este período</p>
              <p className="text-sm">Intenta seleccionar un rango de fechas diferente</p>
            </div>
          </div>
        ) : activeTab === 'mentions' ? (
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorMenciones" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorAlcance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis 
                dataKey="date" 
                stroke="var(--text-muted)"
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="var(--text-muted)"
                style={{ fontSize: '12px' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'var(--bg-card)', 
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)'
                }}
              />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="menciones" 
                stroke="#3b82f6" 
                strokeWidth={2}
                fill="url(#colorMenciones)" 
                name="Menciones"
              />
              <Area 
                type="monotone" 
                dataKey="alcance" 
                stroke="#10b981" 
                strokeWidth={2}
                fill="url(#colorAlcance)" 
                name="Alcance"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico de pie */}
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={sentimentData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) => {
                    const { name, percent } = entry;
                    return `${name}: ${percent ? (percent * 100).toFixed(0) : 0}%`;
                  }}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {sentimentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>

            {/* Gráfico de líneas por sentimiento */}
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis 
                  dataKey="date" 
                  stroke="var(--text-muted)"
                  style={{ fontSize: '12px' }}
                />
                <YAxis 
                  stroke="var(--text-muted)"
                  style={{ fontSize: '12px' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--bg-card)', 
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="positivo" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  name="Positivo"
                />
                <Line 
                  type="monotone" 
                  dataKey="neutral" 
                  stroke="#6b7280" 
                  strokeWidth={2}
                  name="Neutral"
                />
                <Line 
                  type="monotone" 
                  dataKey="negativo" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  name="Negativo"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      
      {/* Resumen IA */}
      {aiSummary && (
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h4 className="font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Sparkles className="h-4 w-4 text-blue-500" />
                Resumen generado por IA
              </h4>
              <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                {aiSummary}
              </div>
            </div>
            <button
              onClick={() => setAiSummary(null)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Cerrar"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <div className="text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Total Menciones</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
            {mentionsData?.length || 0}
          </p>
        </div>
        <div className="text-center">
          <p className="text-sm text-green-600">Positivas</p>
          <p className="text-2xl font-bold mt-1 text-green-600">
            {sentimentData.find(s => s.name === 'Positivo')?.value || 0}
          </p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-600">Neutrales</p>
          <p className="text-2xl font-bold mt-1 text-gray-600">
            {sentimentData.find(s => s.name === 'Neutral')?.value || 0}
          </p>
        </div>
        <div className="text-center">
          <p className="text-sm text-red-600">Negativas</p>
          <p className="text-2xl font-bold mt-1 text-red-600">
            {sentimentData.find(s => s.name === 'Negativo')?.value || 0}
          </p>
        </div>
      </div>
      
      {/* Modal de Chat IA */}
      <AiChatModal
        isOpen={aiChatOpen}
        onClose={() => setAiChatOpen(false)}
        brandId={selectedBrandId === 'all' ? undefined : selectedBrandId}
        brandName={brands?.find(b => b.id === selectedBrandId)?.name}
      />
    </div>
  );
}