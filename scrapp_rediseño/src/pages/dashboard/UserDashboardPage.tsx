import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { brandService } from '../../services/brandService';
import { mentionService } from '../../services/mentionService';
import { Tag, MessageSquare, TrendingUp, ExternalLink, Video, Radio, Globe } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuthStore } from '../../store/authStore';
import ClipPlayerModal from '../../components/ClipPlayerModal';
import MetricsChart from '../../components/MetricsChart';
import wellcomeimage from '../../img/welcome.png';

export default function UserDashboardPage() {
  const [selectedMentionId, setSelectedMentionId] = useState<string | null>(null);
  const { user } = useAuthStore();

  // Cargar marcas asignadas al usuario
  const { data: brands, isLoading: brandsLoading } = useQuery({
    queryKey: ['user-brands'],
    queryFn: async () => {
      // Asume que existe un endpoint para obtener marcas del usuario
      const allBrands = await brandService.getAll();
      // Filtrar solo las marcas asignadas al usuario
      // En producción deberías tener un endpoint específico
      return allBrands;
    },
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['user-mention-stats'],
    queryFn: () => mentionService.getStats(),
  });

  const { data: recentMentions, isLoading: mentionsLoading } = useQuery({
    queryKey: ['user-recent-mentions'],
    queryFn: () => mentionService.getAll(),
  });
  
    /**
   * Obtener saludo contextual según la hora
   */
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Buenos días';
    if (hour >= 12 && hour < 20) return 'Buenas tardes';
    return 'Buenas noches';
  };
  

  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'POSITIVE':
        return 'badge-success';
      case 'NEGATIVE':
        return 'badge-danger';
      case 'NEUTRAL':
        return 'badge-info';
      default:
        return 'badge-info';
    }
  };

  const getSentimentLabel = (sentiment?: string) => {
    switch (sentiment) {
      case 'POSITIVE':
        return 'Positivo';
      case 'NEGATIVE':
        return 'Negativo';
      case 'NEUTRAL':
        return 'Neutral';
      default:
        return 'N/A';
    }
  };

  const getFirstName = () => {
    return user?.firstName || user?.email?.split('@')[0] || 'Usuario';
  };

  const formatDate = (date: any, formatStr: string = "d 'de' MMMM, yyyy") => {
    try {
      if (!date) return 'Fecha no disponible';
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) return 'Fecha inválida';
      return format(parsedDate, formatStr, { locale: es });
    } catch (error) {
      console.error('Error formateando fecha:', error, date);
      return 'Fecha inválida';
    }
  };

  const hasVideoClip = (mention: any): boolean => {
    return Boolean(
      mention?.clipExtract?.id || 
      mention?.clipExtractId ||
      mention?.clipExtract
    );
  };

  const isLiveStream = (mention: any): boolean => {
    return mention?.source?.type === 'LIVE_STREAM';
  };
  
  const isRadio = (mention: any): boolean => {
    return mention?.source?.type === 'RADIO_STREAM';
  };

  const hasAudioClip = (mention: any): boolean => {
    return Boolean(mention?.clipUrl || mention?.clipExtract?.id);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Banner */}
      <div className="card" style={{ 
        background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
        color: 'white',
        border: 'none'
      }}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="mb-6">
            <img 
              src={wellcomeimage} 
              alt="Monitoreo en tiempo real"
              className="w-80 h-auto mx-auto"
            />
          </div>
          <div className="w-full">
           <h1 className="text-3xl font-bold mb-2">
              {getGreeting()}, {getFirstName()}
            </h1>
            <p className="text-white text-opacity-90">
              Monitoreo de tus marcas asignadas
            </p>
            <div className="flex items-center gap-6 mt-4 text-sm">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                <span>{stats?.total || 0} menciones totales</span>
              </div>
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                <span>{brands?.length || 0} marcas monitoreadas</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Métricas y Gráficos */}
      <MetricsChart />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card card-hover">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                Total Menciones
              </p>
              <h3 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                {statsLoading ? '...' : stats?.total || 0}
              </h3>
            </div>
            <div className="stat-icon stat-icon-primary">
              <MessageSquare className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="card card-hover">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                Menciones Positivas
              </p>
              <h3 className="text-3xl font-bold mb-2" style={{ color: 'var(--success)' }}>
                {statsLoading ? '...' : stats?.positive || 0}
              </h3>
            </div>
            <div className="stat-icon stat-icon-success">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="card card-hover">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                Menciones Negativas
              </p>
              <h3 className="text-3xl font-bold mb-2" style={{ color: 'var(--danger)' }}>
                {statsLoading ? '...' : stats?.negative || 0}
              </h3>
            </div>
            <div className="stat-icon stat-icon-danger">
              <MessageSquare className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Mis Marcas */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="stat-icon stat-icon-primary">
              <Tag className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Mis Marcas
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Marcas que estás monitoreando
              </p>
            </div>
          </div>
          <Link 
            to="/dashboard/brands"
            className="text-sm font-semibold hover:underline"
            style={{ color: 'var(--primary)' }}
          >
            Ver todas
          </Link>
        </div>

        <div className="space-y-3">
          {brandsLoading ? (
            <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
              Cargando...
            </div>
          ) : brands && brands.length > 0 ? (
            brands.slice(0, 5).map((brand) => (
              <div 
                key={brand.id} 
                className="flex items-center justify-between p-4 rounded-lg transition-all hover:shadow-sm"
                style={{ backgroundColor: 'var(--bg-body)', border: '1px solid var(--border-color)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)' }}>
                    <Tag className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {brand.name}
                    </h4>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {brand.keywords.length} palabras clave
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {brand._count?.mentions || 0}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>menciones</p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <Tag className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
              <p style={{ color: 'var(--text-muted)' }}>
                No tienes marcas asignadas aún
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Mentions */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="stat-icon stat-icon-primary">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Menciones Recientes
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Últimas menciones encontradas
              </p>
            </div>
          </div>
          <Link 
            to="/dashboard/mentions"
            className="text-sm font-semibold hover:underline"
            style={{ color: 'var(--primary)' }}
          >
            Ver todas
          </Link>
        </div>

        <div className="space-y-4">
          {mentionsLoading ? (
            <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>Cargando menciones...</div>
          ) : recentMentions && recentMentions.length > 0 ? (
            recentMentions.slice(0, 5).map((mention) => (
              <div key={mention.id} className="p-4 rounded-lg transition-all hover:shadow-sm" style={{ 
                backgroundColor: 'var(--bg-body)', 
                borderLeft: `4px solid ${
                  isRadio(mention) ? '#8B5CF6' : 
                  isLiveStream(mention) ? '#EF4444' : 
                  'var(--primary)'
                }` 
              }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold line-clamp-2 flex-1" style={{ color: 'var(--text-primary)' }}>
                        {mention.title}
                      </h3>
                      {mention.sentiment && (
                        <span className={`badge ${getSentimentColor(mention.sentiment)} flex-shrink-0`}>
                          {getSentimentLabel(mention.sentiment)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm line-clamp-2 mb-3" style={{ color: 'var(--text-secondary)' }}>
                      {mention.excerpt}
                    </p>
                    <div className="flex flex-wrap gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        {mention.brand?.name || "Sin marca"}
                      </span>
                      <span className="flex items-center gap-1">
                        {isRadio(mention) ? (
                          <>
                            <Radio className="h-3 w-3" style={{ color: '#8B5CF6' }} />
                            <span style={{ color: '#8B5CF6' }}>📻 {mention.source?.name || "Sin fuente"}</span>
                          </>
                        ) : (
                          <>
                            <Globe className="h-3 w-3" />
                            {mention.source?.name || "Sin fuente"}
                          </>
                        )}
                      </span>
                      <span>
                        {formatDate(mention.publishedAt)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Botones de acción */}
                  <div className="flex-shrink-0 flex gap-2">
                    {/* Botón de audio - Radios */}
                    {isRadio(mention) && hasAudioClip(mention) && (
                      <button
                        onClick={() => setSelectedMentionId(mention.id)}
                        className="p-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                        style={{ color: '#8B5CF6' }}
                        title="Escuchar audio"
                      >
                        <Radio className="h-5 w-5" />
                      </button>
                    )}
                  
                    {/* Botón de video - TV */}
                    {isLiveStream(mention) && hasVideoClip(mention) && (
                      <button
                        onClick={() => setSelectedMentionId(mention.id)}
                        className="p-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                        style={{ color: 'var(--danger)' }}
                        title="Ver clip de video"
                      >
                        <Video className="h-5 w-5" />
                      </button>
                    )}
                    
                    {/* Botón de enlace externo - Web */}
                    {!isLiveStream(mention) && !isRadio(mention) && (
                      <a
                        href={mention.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                        style={{ color: 'var(--text-muted)' }}
                        title="Ver artículo original"
                      >
                        <ExternalLink className="h-5 w-5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
              <p style={{ color: 'var(--text-muted)' }}>
                No hay menciones aún
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de video */}
      {selectedMentionId && (
        <ClipPlayerModal 
          mentionId={selectedMentionId} 
          onClose={() => setSelectedMentionId(null)} 
        />
      )}
    </div>
  );
}