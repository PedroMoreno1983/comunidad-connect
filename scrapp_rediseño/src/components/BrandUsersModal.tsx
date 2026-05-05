import { useState } from 'react';
import { X, UserPlus, Trash2, Save } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import toast from 'react-hot-toast';

interface BrandUsersModalProps {
  brandId: string;
  brandName: string;
  onClose: () => void;
}

export default function BrandUsersModal({ brandId, brandName, onClose }: BrandUsersModalProps) {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  // Obtener brand con usuarios asignados
  const { data: brand } = useQuery({
    queryKey: ['brand', brandId],
    queryFn: async () => {
      const { data } = await api.get(`/brands/${brandId}`);
      return data;
    },
  });

  // Obtener todos los usuarios disponibles
  const { data: availableUsers } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/brands/users');
      return data;
    },
  });

  // Mutation para asignar usuario
  const assignUser = useMutation({
    mutationFn: async (data: { userId: string; canEdit: boolean; canDelete: boolean }) => {
      return api.post(`/brands/${brandId}/users`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand', brandId] });
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      toast.success('Usuario asignado correctamente');
      setSelectedUserId('');
      setCanEdit(false);
      setCanDelete(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Error al asignar usuario');
    },
  });

  // Mutation para remover usuario
  const removeUser = useMutation({
    mutationFn: async (userId: string) => {
      return api.delete(`/brands/${brandId}/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand', brandId] });
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      toast.success('Usuario removido correctamente');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Error al remover usuario');
    },
  });

  const handleAssign = () => {
    if (!selectedUserId) {
      toast.error('Selecciona un usuario');
      return;
    }

    assignUser.mutate({
      userId: selectedUserId,
      canEdit,
      canDelete,
    });
  };

  const assignedUserIds = brand?.brandUsers?.map((bu: any) => bu.userId) || [];
  const unassignedUsers = availableUsers?.filter(
    (u: any) => !assignedUserIds.includes(u.id)
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between top-0 z-10" style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
          <h2 className="text-xl font-bold">Gestionar Accesos</h2>
          <button onClick={onClose} className="modal-close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="modal-body space-y-6">
          {/* Info de la marca */}
          <div className="p-4 rounded-lg bg-primary bg-opacity-10">
            <p className="text-sm text-muted">Marca:<span className="badge badge-primary">{brandName}</span> </p>
           </div>

          {/* Usuarios asignados */}
          <div>
            <h3 className="font-semibold mb-3">Usuarios con acceso</h3>
            {brand?.brandUsers && brand.brandUsers.length > 0 ? (
              <div className="space-y-2">
                {brand.brandUsers.map((bu: any) => (
                  <div
                    key={bu.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div>
                      <p className="font-medium">{bu.user.email}</p>
                      <div className="flex gap-2 mt-1">
                        {bu.canEdit && (
                          <span className="badge badge-success text-xs">Puede editar</span>
                        )}
                        {bu.canDelete && (
                          <span className="badge badge-danger text-xs">Puede eliminar</span>
                        )}
                        {!bu.canEdit && !bu.canDelete && (
                          <span className="badge badge-info text-xs">Solo lectura</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeUser.mutate(bu.userId)}
                      className="p-2 text-danger hover:bg-danger hover:bg-opacity-10 rounded-lg"
                      title="Remover acceso"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted text-sm">No hay usuarios asignados</p>
            )}
          </div>

          {/* Asignar nuevo usuario */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Asignar usuario
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="label">Usuario</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="input"
                >
                  <option value="">Seleccionar usuario...</option>
                  {unassignedUsers?.map((user: any) => (
                    <option key={user.id} value={user.id}>
                      {user.email} {user.name && `(${user.name})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canEdit}
                    onChange={(e) => setCanEdit(e.target.checked)}
                    className="checkbox"
                  />
                  <span className="text-sm">Puede editar la marca</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canDelete}
                    onChange={(e) => setCanDelete(e.target.checked)}
                    className="checkbox"
                  />
                  <span className="text-sm">Puede eliminar la marca</span>
                </label>
              </div>

              <button
                onClick={handleAssign}
                disabled={!selectedUserId || assignUser.isPending}
                className="btn btn-primary w-full"
              >
                <Save className="h-4 w-4" />
                {assignUser.isPending ? 'Asignando...' : 'Asignar usuario'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}