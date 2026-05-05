import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Radio, Wifi, WifiOff, Video, Loader } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface LiveStream {
  id: string;
  streamUrl: string;
  isActive: boolean;
  lastProcessedAt: string;
  source: {
    id: string;
    name: string;
    url: string;
    type: string;
  };
}

export default function LiveStreamMonitor() {
  const queryClient = useQueryClient();
  const [selectedStream, setSelectedStream] = useState<LiveStream | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');

  const { data: streams, isLoading } = useQuery({
    queryKey: ['live-streams'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/sources?type=LIVE_STREAM`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data.filter((s: any) => s.liveStream);
    },
    refetchInterval: 10000,
  });

  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/brands`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    },
  });

  const captureMutation = useMutation({
    mutationFn: async ({ sourceId, brandId }: { sourceId: string; brandId: string }) => {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/stream-capture/capture-demo`,
        { sourceId, brandId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    },
    onSuccess: () => {
      toast.success('¡Clip de demostración capturado exitosamente!');
      queryClient.invalidateQueries({ queryKey: ['clips'] });
      setSelectedStream(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Error capturando clip');
    },
  });

  const handleCapture = () => {
    if (!selectedStream) {
      toast.error('Selecciona un stream primero');
      return;
    }
    if (!selectedBrandId) {
      toast.error('Selecciona una marca');
      return;
    }

    toast.loading('Capturando clip de 30 segundos...', { duration: 35000 });
    
    captureMutation.mutate({
      sourceId: selectedStream.source.id,
      brandId: selectedBrandId,
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'var(--danger)' }}
          >
            <Radio className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Monitor en Vivo
            </h1>
            <p style={{ color: 'var(--text-muted)' }}>
              Streams de TV/Radio en tiempo real
            </p>
          </div>
        </div>

        {/* Botón de Captura Demo */}
        <button
          onClick={handleCapture}
          disabled={!selectedStream || !selectedBrandId || captureMutation.isPending}
          className="btn btn-primary flex items-center gap-2"
        >
          {captureMutation.isPending ? (
            <>
              <Loader className="h-5 w-5 animate-spin" />
              Capturando...
            </>
          ) : (
            <>
              <Video className="h-5 w-5" />
              Capturar Clip Demo
            </>
          )}
        </button>
      </div>

      {/* Selector de Marca */}
      <div className="card p-4 mb-6">
        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
          Selecciona Marca para Demo:
        </label>
        <select
          value={selectedBrandId}
          onChange={(e) => setSelectedBrandId(e.target.value)}
          className="input-field w-full"
        >
          <option value="">-- Seleccionar Marca --</option>
          {brands?.map((brand: any) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </div>

      {/* Lista de Streams */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: 'var(--primary)' }}></div>
          <p className="mt-4" style={{ color: 'var(--text-muted)' }}>
            Cargando streams...
          </p>
        </div>
      ) : streams?.length === 0 ? (
        <div className="card p-12 text-center">
          <Radio className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <p className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>
            No hay streams configurados
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {streams?.map((stream: any) => (
            <div
              key={stream.source.id}
              onClick={() => setSelectedStream(stream)}
              className={`card p-6 cursor-pointer transition-all ${
                selectedStream?.source.id === stream.source.id
                  ? 'ring-2 ring-primary shadow-lg'
                  : 'hover:shadow-md'
              }`}
            >
              {/* Status Badge */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {stream.isActive ? (
                    <>
                      <Wifi className="h-5 w-5 text-green-500" />
                      <span className="text-sm font-semibold text-green-600">EN VIVO</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-5 w-5 text-gray-400" />
                      <span className="text-sm text-gray-500">Offline</span>
                    </>
                  )}
                </div>
                <Radio className="h-6 w-6" style={{ color: 'var(--primary)' }} />
              </div>

              {/* Stream Info */}
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                {stream.source.name}
              </h3>
              
              <p className="text-sm mb-4 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                {stream.streamUrl}
              </p>

              {/* Video Preview */}
              <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden mb-3">
                <video
                  src={stream.streamUrl}
                  className="w-full h-full object-cover"
                  muted
                  autoPlay
                  playsInline
                />
              </div>

              {/* Action */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedStream(stream);
                }}
                className="btn btn-secondary w-full flex items-center justify-center gap-2 text-sm"
              >
                <Play className="h-4 w-4" />
                Seleccionar para Demo
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Instrucciones */}
      <div className="card p-6 mt-6" style={{ backgroundColor: 'var(--info-light)' }}>
        <h3 className="font-semibold mb-2" style={{ color: 'var(--info)' }}>
          💡 Cómo Generar Clip Demo:
        </h3>
        <ol className="list-decimal list-inside space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <li>Selecciona una marca del selector arriba</li>
          <li>Haz click en el stream que quieres capturar</li>
          <li>Presiona "Capturar Clip Demo"</li>
          <li>Espera 30-40 segundos mientras se procesa</li>
          <li>El clip aparecerá en la sección de Transcripciones</li>
        </ol>
      </div>
    </div>
  );
}
