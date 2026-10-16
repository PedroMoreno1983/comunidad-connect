import type { IntercomCall, IntercomVisitKind } from '../types';
import { financeWrite, readApi } from './_shared';

export const IntercomService = {
    getCalls() {
        return readApi<{ calls: IntercomCall[] }>('/api/intercom/calls', 'No se pudieron cargar las llamadas.');
    },

    getCall(id: string) {
        return readApi<{ call: IntercomCall }>(`/api/intercom/calls/${id}`, 'No se pudo cargar la llamada.');
    },

    call(input: { unitId: string; visitorName: string; visitKind: IntercomVisitKind; note?: string }) {
        return readApi<{ call: IntercomCall; reachableInApp: number; phones: { name: string; phone: string }[] }>(
            '/api/intercom/calls',
            'No se pudo llamar a la unidad.',
            financeWrite(input),
        );
    },

    act(id: string, action: 'approve' | 'reject' | 'cancel' | 'admit') {
        return readApi<{ call: IntercomCall }>(
            `/api/intercom/calls/${id}`,
            'No se pudo responder la llamada.',
            financeWrite({ action }),
        );
    },
};

/** Portón o barrera que abre al aprobar una visita. */
export const AccessGateService = {
    get() {
        return readApi<{ url: string | null }>('/api/admin/access-gate', 'No se pudo cargar el portón.');
    },

    save(url: string | null) {
        return readApi<{ url: string | null; secret: string | null }>(
            '/api/admin/access-gate',
            'No se pudo guardar el portón.',
            financeWrite({ url }),
        );
    },
};

/** Claves de la API pública de la comunidad. */
