import { readApi } from './_shared';
import type { PushPlatform } from '../types';

export const PushService = {
    async registerDevice(token: string, platform: PushPlatform) {
        return readApi<{ ok: boolean }>('/api/push/devices', 'No se pudo activar los avisos en este teléfono', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, platform }),
        });
    },
    async unregisterDevice(token: string) {
        return readApi<{ ok: boolean }>('/api/push/devices', 'No se pudo desactivar los avisos', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        });
    },
};
