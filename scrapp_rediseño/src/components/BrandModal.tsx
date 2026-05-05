import { useState } from 'react';
import { Save, XCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { brandService } from '../services/brandService';
import toast from 'react-hot-toast';

interface BrandModalProps {
  brand?: any;
  onClose: () => void;
}

export default function BrandModal({ brand, onClose }: BrandModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(brand?.name || '');
  const [keywords, setKeywords] = useState(brand?.keywords?.join(', ') || '');
  const [excludeKeywords, setExcludeKeywords] = useState(
    brand?.excludeKeywords?.join(', ') || '',
  );

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (brand) {
        return brandService.update(brand.id, data);
      } else {
        return brandService.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      queryClient.invalidateQueries({ queryKey: ['brands-panel'] });
      toast.success(brand ? 'Marca actualizada' : 'Marca creada');
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Error al guardar marca');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    const keywordsArray = keywords
      .split(',')
      .map((k: string) => k.trim())
      .filter((k: string) => k.length > 0);

    if (keywordsArray.length === 0) {
      toast.error('Añade al menos una palabra clave');
      return;
    }

    const excludeKeywordsArray = excludeKeywords
      .split(',')
      .map((k: string) => k.trim())
      .filter((k: string) => k.length > 0);

    mutation.mutate({
      name: name.trim(),
      keywords: keywordsArray,
      excludeKeywords: excludeKeywordsArray,
      isActive: true,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"></div>

        <form onSubmit={handleSubmit} className="modal-body space-y-4">
          {/* Nombre */}
          <div>
            <label className="label">Nombre de la marca</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Ej: Feedback Consultora"
              required
            />
          </div>

          {/* Palabras clave a buscar */}
          <div>
            <label className="label">Palabras clave (separadas por comas)</label>
            <textarea
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="input"
              rows={3}
              placeholder="Ej: feedback, feedback chile, feedback consultora"
              required
            />
            <p className="text-xs text-muted mt-1">
              Estas palabras se buscarán en las fuentes configuradas
            </p>
          </div>

          {/* Palabras a EXCLUIR */}
          <div>
            <label
              className="label"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <XCircle size={14} style={{ color: '#ef4444' }} />
              Palabras a excluir (separadas por comas)
            </label>
            <textarea
              value={excludeKeywords}
              onChange={(e) => setExcludeKeywords(e.target.value)}
              className="input"
              rows={2}
              placeholder="Ej: retroalimentación, comentario, opinión"
            />
            <p className="text-xs text-muted mt-1">
              Si el contexto de una mención contiene estas palabras, la mención será ignorada.
              Útil para evitar resultados no relacionados.
            </p>
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={mutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={mutation.isPending}
            >
              <Save className="h-4 w-4" />
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
