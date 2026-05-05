// frontend/src/pages/UserMentionsPage.tsx
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { mentionService } from '../../services/mentionService';
import { brandService } from '../../services/brandService';
import ClipModal from '../../components/ClipModal';
import { clipService } from '../../services/clipService';
import toast from 'react-hot-toast';
import { safeFormatDate } from '../../utils/dateUtils';
import { 
  Search, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  ExternalLink,
  Tag,
  Globe,
  Calendar,
  ChevronLeft,
  ChevronRight, 
  Video
} from 'lucide-react';
import type { Sentiment, Mention } from '../../types';

export default function UserMentionsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [selectedSentiment, setSelectedSentiment] = useState<string>('all');
  const [selectedClip, setSelectedClip] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { data: mentions, isLoading: mentionsLoading } = useQuery({
    queryKey: ['mentions'],
    queryFn: () => mentionService.getAll(),
  });

  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: brandService.getAll,
  });

  const toModalClip = (clip: any, mention: any) => {
    const videoPath =
      clip?.videoPath ||
      (clip?.fileName && `/storage/clips/${clip.fileName}`) ||
      (clip?.file && `/storage/clips/${clip.file}`) ||
      '';

    if (!videoPath) throw new Error('no_video_path');

    return {
      ...clip,
      videoPath,
      audioPath:
        clip?.audioPath ||
        (clip?.audioFileName && `/storage/clips/${clip.audioFileName}`) ||
        '',
      brand: clip?.brand ?? mention?.brand,
      source: clip?.source ?? mention?.source,
      createdAt: clip?.createdAt ?? mention?.publishedAt ?? new Date().toISOString(),
      duration: clip?.duration ?? 60,
      transcription: clip?.transcription ?? mention?.excerpt ?? '',
      keywords: clip?.keywords ?? [],
    };
  };

  const isVideoMention = (m: any) => {
    const t = m?.source?.type ?? m?.type ?? m?.mediaType;
    if (typeof t === 'string' && t.toUpperCase() === 'LIVE_STREAM') return true;
    if (typeof t === 'string' && t.toLowerCase() === 'video') return true;
    return Boolean(
      m?.clip || m?.clipId || m?.videoPath || m?.clipFileName || m?.clipFile
    );
  };

  const openClipFromMention = async (mention: any) => {
    try {
      setSelectedClip(null);
      const clip = await clipService.getByMentionId(mention.id);
      setSelectedClip(toModalClip(clip, mention));
    } catch {
      toast.error('No encontramos el clip para esta mención');
    }
  };

  const filteredMentions = useMemo(() => {
    if (!mentions) return []; 

    return mentions.filter((mention: Mention) => {
      const title = (mention.title ?? '').toLowerCase();
      const excerpt = (mention.excerpt ?? '').toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = title.includes(q) || excerpt.includes(q);
     
      const brandId = mention.brandId ?? mention.brand?.id;
      const matchesBrand =
        selectedBrand === 'all' ||
        (brandId != null && String(brandId) === String(selectedBrand));
     
      const matchesSentiment = 
        selectedSentiment === 'all' || 
        (mention.sentiment === null && selectedSentiment === 'null') ||
        mention.sentiment === selectedSentiment;

      return matchesSearch && matchesBrand && matchesSentiment;
    });
  }, [mentions, searchQuery, selectedBrand, selectedSentiment]);

  const totalPages = Math.ceil(filteredMentions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedMentions = filteredMentions.slice(startIndex, startIndex + itemsPerPage);

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
    if (!sentiment) return <Minus className="h-4 w-4" />;
    switch (sentiment) {
      case 'POSITIVE':
        return <TrendingUp className="h-4 w-4" />;
      case 'NEGATIVE':
        return <TrendingDown className="h-4 w-4" />;
      case 'NEUTRAL':
        return <Minus className="h-4 w-4" />;
      default:
        return <Minus className="h-4 w-4" />;
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedBrand('all');
    setSelectedSentiment('all');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Monitor en Vivo
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Menciones de tus marcas en tiempo real
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Buscar menciones..."
                className="input pl-10"
              />
            </div>
          </div>

          {/* Brand Filter */}
          <div>
            <select
              value={selectedBrand}
              onChange={(e) => {
                setSelectedBrand(e.target.value);
                setCurrentPage(1);
              }}
              className="input"
            >
              <option value="all">Todas mis marcas</option>
              {brands?.map((brand) => (
                <option key={brand.id} value={String(brand.id)}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sentiment Filter */}
          <div>
            <select
              value={selectedSentiment}
              onChange={(e) => {
                setSelectedSentiment(e.target.value);
                setCurrentPage(1);
              }}
              className="input"
            >
              <option value="all">Todos los sentimientos</option>
              <option value="POSITIVE">Positivo</option>
              <option value="NEUTRAL">Neutral</option>
              <option value="NEGATIVE">Negativo</option>
              <option value="null">Sin analizar</option>
            </select>
          </div>
        </div>

        {/* Active Filters */}
        {(searchQuery || selectedBrand !== 'all' || selectedSentiment !== 'all') && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {filteredMentions.length} resultados
                </span>
              </div>
              <button
                onClick={resetFilters}
                className="text-sm font-medium hover:underline"
                style={{ color: 'var(--primary)' }}
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mentions List */}
      {mentionsLoading ? (
        <div className="card text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: 'var(--primary)' }}></div>
          <p style={{ color: 'var(--text-muted)' }}>Cargando menciones...</p>
        </div>
      ) : paginatedMentions.length > 0 ? (
        <>
          <div className="space-y-4">
            {paginatedMentions.map((mention: Mention) => (
              <div key={mention.id} className="card card-hover">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-12 h-12 rounded-lg border flex items-center justify-center ${getSentimentColor(mention.sentiment)}`}>
                        {getSentimentIcon(mention.sentiment)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-lg line-clamp-2 mb-2" style={{ color: 'var(--text-primary)' }}>
                          {mention.title}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          <span className={`badge ${getSentimentColor(mention.sentiment)}`}>
                            {getSentimentLabel(mention.sentiment)}
                          </span>
                          <span className="badge badge-primary flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            {mention.brand?.name || "Sin marca"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-sm line-clamp-3 mb-4" style={{ color: 'var(--text-secondary)' }}>
                      {mention.excerpt}
                    </p>

                    <div className="flex flex-wrap gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {mention.source?.name || "Sin fuente"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {safeFormatDate(mention.publishedAt, "d 'de' MMMM, yyyy • HH:mm")}
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex gap-2">
                    {mention.source?.type === 'LIVE_STREAM' && (
                      <button
                        onClick={() => openClipFromMention(mention)}
                        className="p-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                        style={{ color: 'var(--danger)' }}
                        title="Ver clip de video/audio"
                      >
                        <Video className="h-5 w-5" />
                      </button>
                    )}
                    {!isVideoMention(mention) && (
                     <a                      
                        href={mention.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                        style={{ color: 'var(--primary)' }}
                        title="Ver artículo original"
                      >
                        <ExternalLink className="h-5 w-5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="card">
              <div className="flex items-center justify-between">
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Mostrando {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredMentions.length)} de {filteredMentions.length}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="btn btn-secondary p-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-medium px-3" style={{ color: 'var(--text-primary)' }}>
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="btn btn-secondary p-2"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card text-center py-12">
          <Search className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <p className="mb-2" style={{ color: 'var(--text-muted)' }}>
            No se encontraron menciones
          </p>
          {(searchQuery || selectedBrand !== 'all' || selectedSentiment !== 'all') && (
            <button
              onClick={resetFilters}
              className="text-sm font-medium hover:underline"
              style={{ color: 'var(--primary)' }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}
      
      {/* Modal */}
      {selectedClip && (
        <ClipModal clip={selectedClip} onClose={() => setSelectedClip(null)} />
      )}
    </div>
  );
}