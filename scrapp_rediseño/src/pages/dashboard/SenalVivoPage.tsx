// /var/www/datawiseconsultoria.com/app/frontend/src/pages/SenalVivoPage.tsx

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Hls from 'hls.js';
import { Loader, AlertCircle, Radio as RadioIcon, Tv, PlayCircle } from 'lucide-react';
import api from '../../services/api';

interface Channel {
  id: string;
  name: string;
  type: 'TV' | 'RADIO';
  streamUrl: string;
  region?: string;
  channelId: string;
}

export default function SenalVivoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const channelParam = searchParams.get('channel');
  const tabParam = searchParams.get('tab') as 'TV' | 'RADIO' | null;
  
  const [activeTab, setActiveTab] = useState<'TV' | 'RADIO'>(tabParam || 'TV');
  const [selectedChannel, setSelectedChannel] = useState<string | null>(channelParam);
  const [loading, setLoading] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const filteredChannels = channels.filter(ch => ch.type === activeTab);
  const selectedChannelData = channels.find(ch => ch.channelId === selectedChannel);

  useEffect(() => {
    loadChannels();
  }, []);

  useEffect(() => {
    if (selectedChannel && selectedChannelData) {
      loadStream(selectedChannelData.streamUrl);
    }
  }, [selectedChannel, selectedChannelData]);

  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, []);

  const loadChannels = async () => {
    try {
      setLoadingChannels(true);
      const { data } = await api.get('/sources');
      
      const mappedChannels: Channel[] = data
        .filter((s: any) => s.status === 'LIVE_STREAM' || s.status === 'RADIO_STREAM')
        .map((source: any) => ({
          id: source.id,
          channelId: source.channelId,
          name: source.name,
          type: source.mediaType === 'radio' ? 'RADIO' : 'TV',
          region: source.region || 'Nacional',
          streamUrl: source.captureUrl || source.url
        }));
      
      setChannels(mappedChannels);
    } catch (error: any) {
      console.error('Error cargando canales:', error);
      setError('Error cargando lista de canales');
    } finally {
      setLoadingChannels(false);
    }
  };

  const loadStream = async (streamUrl: string) => {
    setLoading(true);
    setError(null);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (!streamUrl) {
      setError('No hay URL de stream disponible');
      setLoading(false);
      return;
    }

    try {
      if (videoRef.current) {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
          });
          
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(videoRef.current);
          
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setLoading(false);
            videoRef.current?.play().catch(() => {});
          });
          
          hls.on(Hls.Events.ERROR, (_event, errorData) => {
            console.error('HLS Error:', errorData);
            if (errorData.fatal) {
              setError(`Error: ${errorData.type}`);
            }
          });
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
          videoRef.current.src = streamUrl;
          videoRef.current.play().catch(() => {});
          setLoading(false);
        } else {
          setError('Tu navegador no soporta HLS');
          setLoading(false);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error cargando stream');
      setLoading(false);
    }
  };

  const handleChannelSelect = (channelId: string) => {
    setSelectedChannel(channelId);
    setSearchParams({ tab: activeTab, channel: channelId });
  };

  const handleTabChange = (tab: 'TV' | 'RADIO') => {
    setActiveTab(tab);
    setSelectedChannel(null);
    setSearchParams({ tab });
  };

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ backgroundColor: 'var(--bg-body)' }}>
      <div className="max-w-7xl mx-auto">
        
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            📺 Señales en Vivo - Chile
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Transmisión en directo ({channels.length} canales activos)
          </p>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => handleTabChange('TV')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'TV'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Tv size={20} />
            Televisión ({channels.filter(c => c.type === 'TV').length})
          </button>
          <button
            onClick={() => handleTabChange('RADIO')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'RADIO'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <RadioIcon size={20} />
            Radios ({channels.filter(c => c.type === 'RADIO').length})
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Lista de canales */}
          <div className="lg:col-span-1">
            <div className="card p-4">
              <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                {activeTab === 'TV' ? '📺 Canales TV' : '📻 Emisoras'}
              </h3>
              
              {loadingChannels ? (
                <div className="flex items-center justify-center py-8">
                  <Loader className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : filteredChannels.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No hay {activeTab === 'TV' ? 'canales' : 'radios'} disponibles</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {filteredChannels.map((channel) => (
                    <button
                      key={channel.channelId}
                      onClick={() => handleChannelSelect(channel.channelId)}
                      className={`w-full text-left p-4 rounded-lg transition-all ${
                        selectedChannel === channel.channelId
                          ? activeTab === 'TV'
                            ? 'bg-blue-600 text-white'
                            : 'bg-purple-600 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{channel.name}</div>
                          {channel.region && (
                            <div className="text-xs opacity-75 mt-1">{channel.region}</div>
                          )}
                        </div>
                        {selectedChannel === channel.channelId && (
                          <PlayCircle size={20} className="animate-pulse" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Player */}
          <div className="lg:col-span-2">
            <div className="card p-0 overflow-hidden">
              
              {!selectedChannel ? (
                <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                  <div className="text-center p-8">
                    {activeTab === 'TV' ? (
                      <Tv size={64} className="mx-auto mb-4 text-gray-600" />
                    ) : (
                      <RadioIcon size={64} className="mx-auto mb-4 text-gray-600" />
                    )}
                    <h3 className="text-xl font-semibold text-gray-400 mb-2">
                      Selecciona {activeTab === 'TV' ? 'un canal' : 'una radio'}
                    </h3>
                    <p className="text-gray-500">
                      Haz clic en {activeTab === 'TV' ? 'un canal' : 'una emisora'} de la lista
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative aspect-video bg-black">
                  
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                      <div className="text-center">
                        <Loader className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-500" />
                        <p className="text-white">Cargando transmisión...</p>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                      <div className="text-center">
                        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
                        <p className="text-white mb-4">{error}</p>
                        <button
                          onClick={() => selectedChannelData && loadStream(selectedChannelData.streamUrl)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Reintentar
                        </button>
                      </div>
                    </div>
                  )}

                  {!loading && !error && (
                    <>
                      {activeTab === 'RADIO' ? (
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-purple-900 to-purple-600 flex flex-col items-center justify-center">
                          <div className="text-center mb-8">
                            <div className="w-32 h-32 rounded-full bg-white bg-opacity-20 backdrop-blur-sm flex items-center justify-center mx-auto mb-6 animate-pulse">
                              <RadioIcon className="h-16 w-16 text-white" />
                            </div>
                            <h2 className="text-3xl font-bold text-white mb-2">
                              {selectedChannelData?.name}
                            </h2>
                            <p className="text-white text-opacity-80">Transmisión en vivo</p>
                          </div>
                          <div className="w-full max-w-2xl px-8">
                            <audio
                              ref={videoRef as any}
                              className="w-full"
                              controls
                              autoPlay
                              style={{
                                width: '100%',
                                height: '54px',
                                borderRadius: '8px'
                              }}
                            />
                          </div>
                          <div className="mt-8 bg-purple-800 bg-opacity-50 backdrop-blur-sm px-4 py-2 rounded-full flex items-center gap-2">
                            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                            <span className="text-white text-sm font-medium">EN VIVO</span>
                          </div>
                        </div>
                      ) : (
                        <video
                          ref={videoRef}
                          className="absolute top-0 left-0 w-full h-full"
                          controls
                          autoPlay
                          playsInline
                          style={{ backgroundColor: '#000' }}
                        />
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {selectedChannel && selectedChannelData && (
              <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      🔴 <strong>Transmisión en vivo</strong> • Monitoreo automático activo
                    </p>
                    <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                      {selectedChannelData.region}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}