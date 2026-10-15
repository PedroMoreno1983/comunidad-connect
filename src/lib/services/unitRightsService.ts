import type { UnitRightsView } from '@/lib/assemblies/types';

/**
 * Cliente de "Derechos de cada unidad (‰)" (Ley 21.442, arts. 3 y 15). Módulo
 * aparte de `src/lib/api.ts` (ese archivo supera el tamaño publicable); mismo
 * patrón de Service: la página llama a `/api/assemblies/unit-rights`.
 */
async function request<T>(init?: RequestInit): Promise<T> {
    const response = await fetch('/api/assemblies/unit-rights', { cache: 'no-store', ...init });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error((data as { error?: string }).error || 'No se pudo completar la solicitud.') as Error & { status?: number };
        error.status = response.status;
        throw error;
    }
    return data as T;
}

const post = (body: Record<string, unknown>) => request<UnitRightsView>({
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

export const UnitRightsService = {
    get: () => request<UnitRightsView>(),
    save: (values: Record<string, number | null>, method: 'manual' | 'csv' | 'expense_prorate', sourceNote: string) =>
        post({ action: 'save', values, method, sourceNote }),
    verify: (sourceNote: string) => post({ action: 'verify', sourceNote }),
};
