import { X, Tag, Globe, Calendar, ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Mention, Sentiment } from '../types';

interface MentionDetailModalProps {
  mention: Mention;
  onClose: () => void;
}

export default function MentionDetailModal({ mention, onClose }: MentionDetailModalProps) {
  const getSentimentColor = (sentiment: Sentiment | null): string => {
    if (!sentiment) return 'badge-info';
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

  const getSentimentLabel = (sentiment: Sentiment | null): string => {
    if (!sentiment) return 'Sin analizar';
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

  const getSentimentIcon = (sentiment: Sentiment | null) => {
    if (!sentiment) return <Minus className="h-5 w-5" />;
    switch (sentiment) {
      case 'POSITIVE':
        return <TrendingUp className="h-5 w-5" />;
      case 'NEGATIVE':
        return <TrendingDown className="h-5 w-5" />;
      case 'NEUTRAL':
        return <Minus className="h-5 w-5" />;
      default:
        return <Minus className="h-5 w-5" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="max-w-3xl w-full max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl animate-fade-in"
        style={{ backgroundColor: 'var(--bg-card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-6" style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Detalle de la MenciÃ³n
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Sentiment Badge */}
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getSentimentColor(mention.sentiment)}`}>
              {getSentimentIcon(mention.sentiment)}
            </div>
            <span className={`badge ${getSentimentColor(mention.sentiment)} text-base px-4 py-2`}>
              {getSentimentLabel(mention.sentiment)}
            </span>
          </div>

          {/* Title */}
          <div>
            <h3 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              {mention.title}
            </h3>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-body)' }}>
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5" style={{ color: 'var(--primary)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Marca</p>
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {mention.brand?.name || "Sin marca"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5" style={{ color: 'var(--success)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Fuente</p>
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {mention.source?.name || "Sin fuente"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" style={{ color: 'var(--info)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Fecha</p>
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {mention.publishedAt && !isNaN(new Date(mention.publishedAt).getTime())
                    ? format(new Date(mention.publishedAt), "d 'de' MMMM, yyyy", { locale: es })
                    : 'Fecha no disponible'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" style={{ color: 'var(--warning)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Hora</p>
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {mention.publishedAt && !isNaN(new Date(mention.publishedAt).getTime())
                    ? format(new Date(mention.publishedAt), 'HH:mm:ss', { locale: es })
                    : 'Hora no disponible'}
                </p>
              </div>
            </div>
          </div>

          {/* Excerpt */}
            <div>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                Contenido
              </h4>
              <div className="p-4 rounded-lg max-h-96 overflow-y-auto" style={{ backgroundColor: 'var(--bg-body)' }}>
                <p className="text-base leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--text-secondary)' }}>
                  {mention.excerpt}
                </p>
              </div>
            </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
            <a            
              href={mention.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <ExternalLink className="h-5 w-5" />
              Ver artÃ­culo completo
            </a>
            <button
              onClick={onClose}
              className="btn btn-secondary px-6"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}