import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { brandService } from '../services/brandService';
import BrandOwnerSelect from './BrandOwnerSelect';
import toast from 'react-hot-toast';
import { Save, Plus, X } from 'lucide-react';

interface BrandFormExampleProps {
  brand?: any; // Marca existente para editar
  onClose: () => void;
}

export default function BrandFormExample({ brand, onClose }: BrandFormExampleProps) {
  const [name, setName] = useState(brand?.name || '');
  const [keywords, setKeywords] = useState<string[]>(brand?.keywords || []);
  const [keywordInput, setKeywordInput] = useState('');
  const [ownerId, setOwnerId] = useState<string | null>(brand?.ownerId || null);
  const [isActive, setIsActive] = useState(brand?.isActive ?? true);

  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: any) => brandService.create(data),
    onSuccess: () => {
      toast.success('Marca creada exitosamente');
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Error al crear marca');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => brandService.update(brand.id, data),
    onSuccess: () => {
      toast.success('Marca actualizada exitosamente');
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Error al actualizar marca');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    if (keywords.length === 0) {
      toast.error('Debes agregar al menos una palabra clave');
      return;
    }

    const data = {
      name: name.trim(),
      keywords,
      ownerId,
      isActive,
    };

    if (brand) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const addKeyword = () => {
    const trimmed = keywordInput.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords([...keywords, trimmed]);
      setKeywordInput('');
    }
  };

  const removeKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
          {brand ? 'Editar Marca' : 'Nueva Marca'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Nombre de la Marca
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Ej: Coca-Cola"
              required
            />
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Palabras Clave
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                className="input flex-1"
                placeholder="Agregar palabra clave..."
              />
              <button
                type="button"
                onClick={addKeyword}
                className="btn btn-secondary"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="badge badge-primary flex items-center gap-2"
                >
                  {keyword}
                  <button
                    type="button"
                    onClick={() => removeKeyword(keyword)}
                    className="hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Owner Select */}
          <BrandOwnerSelect
            value={ownerId}
            onChange={setOwnerId}
            disabled={createMutation.isPending || updateMutation.isPending}
          />

          {/* Is Active */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="isActive" className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Marca activa
            </label>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary flex items-center gap-2"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {brand ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
