import { useQuery } from '@tanstack/react-query';
import { userService } from '../services/userService';
import { User } from 'lucide-react';

interface BrandOwnerSelectProps {
  value: string | null;
  onChange: (ownerId: string | null) => void;
  disabled?: boolean;
}

export default function BrandOwnerSelect({
  value,
  onChange,
  disabled = false,
}: BrandOwnerSelectProps) {
  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: userService.getAll,
  });

  return (
    <div>
      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
        <div className="flex items-center gap-2">
          <User className="h-4 w-4" />
          Asignar a Usuario
        </div>
      </label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled || isLoading}
        className="input"
      >
        <option value="">Sin asignar</option>
        {users?.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name || user.email}
            {user.brands && user.brands.length > 0 && 
              ` (${user.brands.length} marca${user.brands.length > 1 ? 's' : ''})`
            }
          </option>
        ))}
      </select>
      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
        {isLoading
          ? 'Cargando usuarios...'
          : 'Selecciona un usuario para darle acceso a esta marca'}
      </p>
    </div>
  );
}
