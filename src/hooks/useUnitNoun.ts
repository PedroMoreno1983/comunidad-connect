import { useAuth } from '@/lib/authContext';

/** "Casa" o "Depto" según el condominio de la sesión. Por defecto "Depto". */
export function useUnitNoun(): string {
    const { user } = useAuth();
    return user?.unitNoun ?? 'Depto';
}
