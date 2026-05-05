import { X, Download, Tag, Radio, Calendar, Clock } from 'lucide-react';
import { clipService } from '../services/clipService';  // 🆕 Importar servicio

interface ClipModalProps {
  clip: any;
  onClose: () => void;
}

export default function ClipModal({ clip, onClose }: ClipModalProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div
          className="relative w-full max-w-4xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
          style={{ backgroundColor: 'var(--bg-card)' }}
        >
          {/* Header */}
          <div
            className="sticky top-0 z-10 flex items-center justify-between p-6 border-b"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-color)',
            }}
          >
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Clip Extraído
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Video Player */}
          <div className="p-6">
            <video
              src={clipService.getVideoUrl(clip)}
              controls
              autoPlay
              className="w-full rounded-lg shadow-lg"
              style={{ backgroundColor: '#000' }}
            />
          </div>

          {/* Info */}
          <div className="px-6 pb-6 space-y-4">
            {/* Meta */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4" style={{ color: 'var(--primary)' }} />
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Marca
                  </p>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {clip.brand.name}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4" style={{ color: 'var(--success)' }} />
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Fuente
                  </p>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {clip.source.name}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" style={{ color: 'var(--warning)' }} />
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Duración
                  </p>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {formatDuration(clip.duration)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" style={{ color: 'var(--info)' }} />
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Fecha
                  </p>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {new Date(clip.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Transcription */}
            <div
              className="p-4 rounded-lg"
              style={{ backgroundColor: 'var(--bg-body)' }}
            >
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                Transcripción:
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                {clip.transcription}
              </p>
            </div>

            {/* Keywords */}
            {clip.keywords?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Palabras clave detectadas:
                </h3>
                <div className="flex flex-wrap gap-2">
                  {clip.keywords.map((keyword: string, i: number) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-full text-sm font-medium"
                      style={{
                        backgroundColor: 'var(--primary)',
                        color: '#ffffff',
                      }}
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <a
                href={clipService.getVideoUrl(clip)}
                download
                className="btn btn-primary flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Descargar Video
              </a>
              <a
                href={clipService.getAudioUrl(clip)}
                download
                className="btn btn-secondary flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Descargar Audio
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}