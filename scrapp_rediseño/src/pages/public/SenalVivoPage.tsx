import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Hls from 'hls.js';
import { Loader, AlertCircle } from 'lucide-react';
import api from '../../services/api';

const CHANNELS = [
  { id: 'mega', name: 'Mega' },
  { id: 'chilevision', name: 'Chilevisión' },
  { id: 't13', name: 'T13' },
  { id: 'tvn', name: 'TVN 24 Horas' },
];

export default function SenalVivoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const channelParam = searchParams.get('channel');
  
  const [selectedChannel, setSelectedChannel] = useState(channelParam || 'mega');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Cargar stream cuando cambia el canal
  useEffect(() => {
    loadStream(selectedChannel);
  }, [selectedChannel]);

  // Limpiar HLS al desmontar
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, []);

  const loadStream = async (channelId: string) => {
    setLoading(true);
    setError(null);
    setStreamUrl(null);

    // Limpiar instancia anterior de HLS
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    try {
      // Obtener URL del backend
      const { data } = await api.get(`/stream-capture/stream-url/${channelId}`);
      
      if (!data.success || !data.url) {
        throw new Error(data.error || 'No se pudo obtener la URL del stream');
      }

      setStreamUrl(data.url);

      // Configurar HLS.js
      if (videoRef.current) {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90,
          });
          
          hlsRef.current = hls;
          
          hls.loadSource(data.url);
          hls.attachMedia(videoRef.current);
          
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            videoRef.current?.play();
          });
          
         hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              setError(`Error reproduciendo: ${data.type}`);
            }
          });
          
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari nativo
          videoRef.current.src = data.url;
          videoRef.current.play();
        } else {
          setError('Tu navegador no soporta reproducción de video en vivo');
        }
      }

    } catch (err: any) {
      setError(err.message || 'Error cargando el stream');
    } finally {
      setLoading(false);
    }
  };

  const handleChannelChange = (channelId: string) => {
    setSelectedChannel(channelId);
    setSearchParams({ channel: channelId });
  };

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ backgroundColor: 'var(--bg-body)' }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            📺 Señales en Vivo - Chile
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Transmisión en directo de los principales canales chilenos
          </p>
        </div>

        {/* Selector de canales */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {CHANNELS.map((channel) => (
            <button
              key={channel.id}
              onClick={() => handleChannelChange(channel.id)}
              disabled={loading}
              className={`px-6 py-3 rounded-lg font-semibold transition-all whitespace-nowrap ${
                selectedChannel === channel.id
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {channel.name}
            </button>
          ))}
        </div>

        {/* Player */}
        <div className="card p-0 overflow-hidden">
          <div className="relative" style={{ paddingTop: '56.25%', backgroundColor: '#000' }}>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Loader className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-500" />
                  <p className="text-white">Cargando transmisión...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="text-center">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
                  <p className="text-white mb-4">{error}</p>
                  <button
                    onClick={() => loadStream(selectedChannel)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Reintentar
                  </button>
                </div>
              </div>
            )}

            {!loading && !error && (
              <video
                ref={videoRef}
                className="absolute top-0 left-0 w-full h-full"
                controls
                autoPlay
                playsInline
                muted
              />
            )}
          </div>
        </div>

        {/* Info */}
        <div className="mt-6 p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            🔴 <strong>Transmisión en vivo</strong> • El sistema monitorea automáticamente las menciones de tus marcas
          </p>
          {streamUrl && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              Stream: {streamUrl.substring(0, 60)}...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}