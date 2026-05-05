// frontend/src/pages/dashboard/SourcesPage.tsx

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { sourceService } from '../../services/sourceService';
import { Plus, Edit2, Trash2, Globe, X, Clock, CheckCircle, XCircle, Video, Radio,
  Youtube, Facebook, Twitter, Instagram, Linkedin } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import type { Source, SourceType } from '../../types';
import PageHeader from '../../components/PageHeader';
import '../../styles/sources.css';

interface FormData {
  name: string;
  url: string;
  type: SourceType;
  frequencyMins: number;
  keywords?: string; // Para fuentes RRSS: keywords separadas por coma
  config: {
    selectors: {
      title: string;
      content: string;
    };
  };
}

export default function SourcesPage() {
  const [showModal, setShowModal] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const [formData, setFormData] = useState<FormData>({
    name: '',
    url: '',
    type: 'WEB_SCRAPE',
    frequencyMins: 60,
    keywords: '',
    config: {
      selectors: {
        title: 'h1',
        content: 'p, .content, article',
      },
    },
  });

  const queryClient = useQueryClient();

  const { data: sources, isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: sourceService.getAll,
  });

  const createMutation = useMutation({
    mutationFn: sourceService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      closeModal();
      toast.success('✅ Fuente creada exitosamente');
    },
    onError: () => {
      toast.error('❌ Error al crear fuente');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => sourceService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      closeModal();
      toast.success('✅ Fuente actualizada');
    },
    onError: () => {
      toast.error('❌ Error al actualizar fuente');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: sourceService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      toast.success('✅ Fuente eliminada');
    },
    onError: () => {
      toast.error('❌ Error al eliminar fuente');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, status }: any) => sourceService.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
  });

  const openModal = (source?: Source) => {
    if (source) {
      setEditingSource(source);
      setFormData({
        name: source.name,
        url: source.url,
        type: source.type,
        frequencyMins: source.frequencyMins,
        keywords: (source as any).keywords ?? '',
        config: source.config || {
          selectors: { title: 'h1', content: 'p' },
        },
      });
    } else {
      setEditingSource(null);
      setFormData({
        name: '',
        url: '',
        type: 'WEB_SCRAPE',
        frequencyMins: 60,
        keywords: '',
        config: {
          selectors: { title: 'h1', content: 'p, .content, article' },
        },
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingSource(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: any = {
      ...formData,
      config: formData.type === 'WEB_SCRAPE' ? formData.config : null,
    };

    // Para fuentes RRSS, keywords es obligatorio
    if (isSocialType(formData.type)) {
      data.config = null;
      data.url = formData.url || 'https://social-media-api';
    }

    if (editingSource) {
      updateMutation.mutate({ id: editingSource.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`¿Eliminar la fuente "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleActive = (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    toggleActiveMutation.mutate({ id, status: newStatus });
  };

  const getTypeLabel = (type: SourceType) => {
    switch (type) {
      case 'WEB_SCRAPE':       return 'Web Scraping';
      case 'RSS_FEED':         return 'RSS Feed';
      case 'API':              return 'API';
      case 'LIVE_STREAM':      return 'Transmisión en Vivo (TV)';
      case 'RADIO_STREAM':     return 'Radio en Vivo';
      case 'SOCIAL_YOUTUBE':   return 'YouTube';
      case 'SOCIAL_FACEBOOK':  return 'Facebook';
      case 'SOCIAL_TWITTER':   return 'Twitter / X';
      case 'SOCIAL_INSTAGRAM': return 'Instagram';
      case 'SOCIAL_LINKEDIN':  return 'LinkedIn';
      default: return type;
    }
  };

  const getSourceIconClass = (type: SourceType) => {
    if (type === 'RADIO_STREAM')     return 'radio';
    if (type === 'LIVE_STREAM')      return 'tv';
    if (type === 'SOCIAL_YOUTUBE')   return 'youtube';
    if (type === 'SOCIAL_FACEBOOK')  return 'facebook';
    if (type === 'SOCIAL_TWITTER')   return 'twitter';
    if (type === 'SOCIAL_INSTAGRAM') return 'instagram';
    if (type === 'SOCIAL_LINKEDIN')  return 'linkedin';
    return 'web';
  };

  const getSourceIcon = (type: SourceType) => {
    if (type === 'RADIO_STREAM')     return Radio;
    if (type === 'LIVE_STREAM')      return Video;
    if (type === 'SOCIAL_YOUTUBE')   return Youtube;
    if (type === 'SOCIAL_FACEBOOK')  return Facebook;
    if (type === 'SOCIAL_TWITTER')   return Twitter;
    if (type === 'SOCIAL_INSTAGRAM') return Instagram;
    if (type === 'SOCIAL_LINKEDIN')  return Linkedin;
    return Globe;
  };

  const isSocialType = (type: SourceType) =>
    ['SOCIAL_YOUTUBE','SOCIAL_FACEBOOK','SOCIAL_TWITTER','SOCIAL_INSTAGRAM','SOCIAL_LINKEDIN'].includes(type);

  if (isLoading) {
    return (
      <div className="sources-page">
        <div className="sources-loading">
          <div className="sources-spinner"></div>
          <p style={{ color: 'var(--sources-text-muted)' }}>Cargando fuentes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sources-page">
      <PageHeader
        icon={<Globe size={24} />}
        title="Fuentes"
        subtitle={`${sources?.length ?? 0} fuentes monitoreadas — TV, Radio, Web y Redes Sociales`}
        badgeColor="purple"
        action={
          <button onClick={() => openModal()} className="sources-btn-primary">
            <Plus size={18} />
            Nueva Fuente
          </button>
        }
      />

      {/* Sources Grid */}
      {sources && sources.length > 0 ? (
        <div className="sources-grid">
          {sources.map((source) => {
            const SourceIcon = getSourceIcon(source.type);
            const iconClass = getSourceIconClass(source.type);

            return (
              <div key={source.id} className="source-card">
                <div className="source-card-header">
                  <div className={`source-icon-wrapper ${iconClass} ${source.status !== 'active' ? 'inactive' : ''}`}>
                    <SourceIcon size={20} />
                  </div>

                  <div className="source-card-content">
                    <h3 className="source-card-title">{source.name}</h3>
                   
                  </div>

                  {isAdmin && (
                    <div className="source-card-actions">
                      <button
                        onClick={() => handleToggleActive(source.id, source.status)}
                        className={`source-action-btn ${source.status === 'active' ? 'success' : ''}`}
                        title={source.status === 'active' ? 'Desactivar' : 'Activar'}
                      >
                        {source.status === 'active' ? (
                          <CheckCircle size={18} />
                        ) : (
                          <XCircle size={18} />
                        )}
                      </button>
                      
                      <button
                        onClick={() => openModal(source)}
                        className="source-action-btn"
                        title="Editar"
                      >
                        <Edit2 size={18} />
                      </button>
                      
                      <button
                        onClick={() => handleDelete(source.id, source.name)}
                        className="source-action-btn danger"
                        title="Eliminar"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="source-badges">
                  <span className={`source-badge ${iconClass}`}>
                    {getTypeLabel(source.type)}
                  </span>
                  
                  {source.type === 'RADIO_STREAM' && (
                    <span className="source-badge radio">
                      🎙️ Radio
                    </span>
                  )}
                  
                  {source.type === 'LIVE_STREAM' && (
                    <span className="source-badge tv">
                      📺 En Vivo
                    </span>
                  )}
                  
                  {source.type !== 'LIVE_STREAM' && source.type !== 'RADIO_STREAM' && (
                    <span className="source-badge info">
                      <Clock size={12} />
                      Cada {source.frequencyMins} min
                    </span>
                  )}
                </div>

                {source.type === 'RADIO_STREAM' && (
                  <div className="source-info-box radio">
                    <Radio className="source-info-icon" size={20} />
                    <div className="source-info-content">
                      <p className="source-info-title">Modo Radio en Vivo</p>
                      <p className="source-info-text">
                        Solo audio • Análisis continuo cada 30s • Limpieza automática
                      </p>
                    </div>
                  </div>
                )}

                {source.type === 'LIVE_STREAM' && (
                  <div className="source-info-box tv">
                    <Video className="source-info-icon" size={20} />
                    <div className="source-info-content">
                      <p className="source-info-title">Modo Transmisión en Vivo</p>
                      <p className="source-info-text">
                        Video + Audio • Análisis cada 30s • Limpieza automática
                      </p>
                    </div>
                  </div>
                )}

                {isSocialType(source.type) && (
                  <div className="source-info-box" style={{
                    background: 'rgba(99,102,241,0.08)',
                    border: '1px solid rgba(99,102,241,0.2)',
                    borderRadius: '8px', padding: '10px 14px',
                    display: 'flex', alignItems: 'flex-start', gap: '10px'
                  }}>
                    {(() => { const Icon = getSourceIcon(source.type); return <Icon size={18} style={{ color: '#6366f1', marginTop: '2px', flexShrink: 0 }} />; })()}
                    <div>
                      <p className="source-info-title">Búsqueda global en red social</p>
                      <p className="source-info-text">
                        Busca keywords de todas las marcas activas • Incremental cada 15 min • Solo menciones nuevas
                      </p>
                    </div>
                  </div>
                )}

                <div className="source-card-footer">
                  <span className="source-mentions">
                    {source._count?.mentions || 0} menciones
                  </span>
                  {source.lastScrapedAt && !isNaN(new Date(source.lastScrapedAt).getTime()) && (
                    <span className="source-last-update">
                      Último: {format(new Date(source.lastScrapedAt), "d MMM, HH:mm", { locale: es })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="sources-empty">
          <Globe className="sources-empty-icon" size={64} />
          <h3 className="sources-empty-title">No hay fuentes configuradas</h3>
          <p className="sources-empty-subtitle">
            Crea tu primera fuente para comenzar a monitorear
          </p>
          <button onClick={() => openModal()} className="sources-btn-primary">
            <Plus size={18} />
            Crear primera fuente
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="sources-modal-overlay">
          <div className="sources-modal">
            <div className="sources-modal-header">
              <h2 className="sources-modal-title">
                {editingSource ? 'Editar Fuente' : 'Nueva Fuente'}
              </h2>
              <button onClick={closeModal} className="sources-modal-close">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="sources-modal-body">
              <div className="sources-form">
                <div className="sources-form-grid">
                  <div className="sources-form-group">
                    <label className="sources-form-label">Nombre</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="sources-form-input"
                      placeholder="Ej: Conquistador FM"
                      required
                    />
                  </div>
                  
                  <div className="sources-form-group">
                    <label className="sources-form-label">Tipo</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as SourceType })}
                      className="sources-form-select"
                    >
                      <optgroup label="Medios Tradicionales">
                        <option value="WEB_SCRAPE">Web Scraping</option>
                        <option value="RSS_FEED">RSS Feed</option>
                        <option value="API">API</option>
                        <option value="LIVE_STREAM">Transmisión en Vivo (TV)</option>
                        <option value="RADIO_STREAM">Radio en Vivo</option>
                      </optgroup>
                      <optgroup label="Redes Sociales">
                        <option value="SOCIAL_YOUTUBE">YouTube</option>
                        <option value="SOCIAL_FACEBOOK">Facebook</option>
                        <option value="SOCIAL_TWITTER">Twitter / X</option>
                        <option value="SOCIAL_INSTAGRAM">Instagram</option>
                        <option value="SOCIAL_LINKEDIN">LinkedIn</option>
                      </optgroup>
                    </select>
                  </div>
                </div>

                {/* URL: no requerida para RRSS */}
                {!isSocialType(formData.type) && (
                  <div className="sources-form-group">
                    <label className="sources-form-label">URL</label>
                    <input
                      type="url"
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      className="sources-form-input"
                      placeholder={
                        formData.type === 'RADIO_STREAM'
                          ? 'https://www.conquistadorfm.net/'
                          : formData.type === 'LIVE_STREAM'
                          ? 'https://www.t13.cl/en-vivo'
                          : 'https://ejemplo.com'
                      }
                      required
                    />
                  </div>
                )}

                {/* Info RRSS: las keywords vienen de las marcas, no de la fuente */}
                {isSocialType(formData.type) && (
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(99,102,241,0.08)',
                    border: '1px solid rgba(99,102,241,0.2)',
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                    lineHeight: 1.5,
                  }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Fuente global de red social
                    </strong>
                    Esta fuente buscará automáticamente las keywords de <strong>todas las marcas activas</strong> en {getTypeLabel(formData.type)} cada 15 minutos.
                    Al crear o editar una marca, sus keywords se aplican en el siguiente ciclo de búsqueda.
                  </div>
                )}

                {formData.type !== 'LIVE_STREAM' && formData.type !== 'RADIO_STREAM' && (
                  <div className="sources-form-group">
                    <label className="sources-form-label">
                      Frecuencia de scraping (minutos)
                    </label>
                    <input
                      type="number"
                      value={formData.frequencyMins}
                      onChange={(e) => setFormData({ ...formData, frequencyMins: parseInt(e.target.value) })}
                      className="sources-form-input"
                      min="5"
                      max="1440"
                      required
                    />
                  </div>
                )}

                {formData.type === 'WEB_SCRAPE' && (
                  <>
                    <div className="sources-form-group">
                      <label className="sources-form-label">Selector de título</label>
                      <input
                        type="text"
                        value={formData.config.selectors.title}
                        onChange={(e) => setFormData({
                          ...formData,
                          config: {
                            ...formData.config,
                            selectors: {
                              ...formData.config.selectors,
                              title: e.target.value,
                            },
                          },
                        })}
                        className="sources-form-input"
                        placeholder="h1, .title, .headline"
                      />
                    </div>
                    
                    <div className="sources-form-group">
                      <label className="sources-form-label">Selector de contenido</label>
                      <input
                        type="text"
                        value={formData.config.selectors.content}
                        onChange={(e) => setFormData({
                          ...formData,
                          config: {
                            ...formData.config,
                            selectors: {
                              ...formData.config.selectors,
                              content: e.target.value,
                            },
                          },
                        })}
                        className="sources-form-input"
                        placeholder="p, .content, article"
                      />
                    </div>
                  </>
                )}

                <div className="sources-form-actions">
                  <button type="button" onClick={closeModal} className="sources-btn-secondary">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="sources-btn-primary"
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? 'Guardando...'
                      : editingSource
                      ? 'Actualizar'
                      : 'Crear'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}