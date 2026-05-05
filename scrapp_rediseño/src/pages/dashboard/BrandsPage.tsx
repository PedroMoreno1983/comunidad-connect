// frontend/src/pages/dashboard/BrandsPage.tsx

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { brandService } from '../../services/brandService';
import { Plus, Edit2, Trash2, Users, X, Tag, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import BrandModal from '../../components/BrandModal';
import BrandUsersModal from '../../components/BrandUsersModal';
import { useAuthStore } from '../../store/authStore';
import PageHeader from '../../components/PageHeader';
import '../../styles/brands.css';

export default function BrandsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<any>(null);
  const [selectedBrandForUsers, setSelectedBrandForUsers] = useState<any>(null);

  const { data: brands, isLoading } = useQuery({
    queryKey: ['brands'],
    queryFn: brandService.getAll,
  });

  const deleteMutation = useMutation({
    mutationFn: brandService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      toast.success('Marca eliminada correctamente');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Error al eliminar marca');
    },
  });

  const handleDelete = (id: string, name: string) => {
    if (!isAdmin) return;
    if (window.confirm(`¿Estás seguro de eliminar la marca "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleEdit = (brand: any) => {
    if (!isAdmin) return;
    setEditingBrand(brand);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingBrand(null);
  };

  if (isLoading) {
    return (
      <div className="brands-page">
        <div className="brands-loading">
          <div className="brands-spinner"></div>
          <p style={{ color: 'var(--brands-text-muted)' }}>Cargando marcas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="brands-page">
      <PageHeader
        icon={<Tag size={24} />}
        title="Marcas"
        subtitle={`${brands?.length || 0} marcas monitoreadas`}
        badgeColor="blue"
        action={
          <button onClick={() => setIsModalOpen(true)} className="brands-btn-primary">
            <Plus size={18} />
            Nueva Marca
          </button>
        }
      />

      {/* Brands List */}
      {brands && brands.length > 0 ? (
        <div className="brands-grid">
          {brands.map((brand) => (
            <div key={brand.id} className="brand-card">
              {/* Card header */}
              <div className="brand-card-header">
                <div className="brand-card-content">
                  <h3 className="brand-card-title">{brand.name}</h3>
                </div>
                {/* Actions - SOLO ADMIN */}
                {isAdmin && (
                  <div className="brand-card-actions">
                    <button onClick={() => setSelectedBrandForUsers(brand)} className="brand-action-btn" title="Gestionar accesos">
                      <Users size={15} />
                    </button>
                    <button onClick={() => handleEdit(brand)} className="brand-action-btn" title="Editar">
                      <Edit2 size={15} />
                    </button>
                    <button onClick={() => handleDelete(brand.id, brand.name)} className="brand-action-btn danger" title="Eliminar">
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>

              {/* Keywords */}
              <div className="brand-keywords">
                {brand.keywords.map((keyword: string, idx: number) => (
                  <span key={idx} className="brand-keyword-badge">{keyword}</span>
                ))}
                {brand.excludeKeywords && brand.excludeKeywords.map((kw: string, idx: number) => (
                  <span key={`ex-${idx}`} className="brand-keyword-badge" style={{
                    background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626',
                  }}>
                    <XCircle size={10} />{kw}
                  </span>
                ))}
              </div>

              {/* Footer */}
              <div className="brand-card-footer-row">
                <p className="brand-mentions-count">
                  <strong>{brand._count?.mentions || 0}</strong> menciones detectadas
                </p>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>
                  {brand.keywords.length} keyword{brand.keywords.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="brands-empty">
          <Tag className="brands-empty-icon" size={64} />
          <h3 className="brands-empty-title">
            No hay marcas configuradas
          </h3>
          <p className="brands-empty-subtitle">
            Crea tu primera marca para comenzar a monitorear
          </p>
          <button onClick={() => setIsModalOpen(true)} className="brands-btn-primary">
            <Plus size={18} />
            Crear primera marca
          </button>
        </div>
      )}

      {/* Modal Crear/Editar - SOLO ADMIN */}
      {isAdmin && isModalOpen && (
        <div className="brands-modal-overlay">
          <div className="brands-modal">
            <div className="brands-modal-header">
              <h2 className="brands-modal-title">
                {editingBrand ? 'Editar Marca' : 'Nueva Marca'}
              </h2>
              <button onClick={handleCloseModal} className="brands-modal-close">
                <X size={20} />
              </button>
            </div>
            
            <div className="brands-modal-body">
              <BrandModal
                brand={editingBrand}
                onClose={handleCloseModal}
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Modal Gestionar Accesos - SOLO ADMIN */}
      {isAdmin && !!selectedBrandForUsers && (
        <div className="brands-modal-overlay">
          <div className="brands-modal">
            <div className="brands-modal-header">
              <h2 className="brands-modal-title">
                Gestionar Accesos - {selectedBrandForUsers.name}
              </h2>
              <button 
                onClick={() => setSelectedBrandForUsers(null)} 
                className="brands-modal-close"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="brands-modal-body">
              <BrandUsersModal
                brandId={selectedBrandForUsers.id}
                brandName={selectedBrandForUsers.name}
                onClose={() => setSelectedBrandForUsers(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}