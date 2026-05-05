// src/components/LastScrapingInfo.tsx
import { useQuery } from '@tanstack/react-query';
import { Clock, RefreshCw, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '../services/api';

export default function LastScrapingInfo() {
  const { data: scrapingInfo, isLoading } = useQuery({
    queryKey: ['last-scraping-info'],
    queryFn: async () => {
      const response = await api.get('/scraper/last-run');
      return response.data;
    },
    refetchInterval: 60000, // Actualizar cada minuto
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Clock className="h-4 w-4 animate-spin" />
        <span>Cargando...</span>
      </div>
    );
  }

  if (!scrapingInfo || !scrapingInfo.lastScrapedAt) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
        <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            No se ha ejecutado scraping aún
          </p>
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            Ejecuta el primer scraping para comenzar a monitorear
          </p>
        </div>
      </div>
    );
  }

  const lastRun = new Date(scrapingInfo.lastScrapedAt);
  const timeAgo = formatDistanceToNow(lastRun, { addSuffix: true, locale: es });
  const isStale = Date.now() - lastRun.getTime() > 30 * 60 * 1000; // Más de 30 minutos

  return (
    <div 
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
        isStale 
          ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' 
          : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
      }`}
    >
      <div className={`p-2 rounded-full ${
        isStale
          ? 'bg-orange-100 dark:bg-orange-800'
          : 'bg-green-100 dark:bg-green-800'
      }`}>
        {isStale ? (
          <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        ) : (
          <Clock className="h-5 w-5 text-green-600 dark:text-green-400" />
        )}
      </div>

      <div className="flex-1">
        <p className={`text-sm font-semibold ${
          isStale
            ? 'text-orange-800 dark:text-orange-200'
            : 'text-green-800 dark:text-green-200'
        }`}>
          Último scraping: {timeAgo}
        </p>
        <p className={`text-xs ${
          isStale
            ? 'text-orange-600 dark:text-orange-400'
            : 'text-green-600 dark:text-green-400'
        }`}>
          {lastRun.toLocaleString('es-CL', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </p>
        {scrapingInfo.totalMentions !== undefined && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {scrapingInfo.totalMentions} menciones encontradas • {scrapingInfo.sourcesProcessed || 0} fuentes procesadas
          </p>
        )}
      </div>

      {scrapingInfo.isRunning && (
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900">
          <RefreshCw className="h-3 w-3 animate-spin text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
            En ejecución...
          </span>
        </div>
      )}
    </div>
  );
}