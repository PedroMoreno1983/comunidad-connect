import { supabase } from '@/lib/supabase';
import type { PasskeyCredential } from '@/lib/types';
import type { PasskeyListItem } from '@supabase/auth-js';

const DEVICE_PASSKEY_READY_KEY = 'cc:web-passkey-ready';

function withPlatformAuthenticator<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof window === 'undefined' || !navigator.credentials?.create) {
    return fn();
  }
  const credentials = navigator.credentials;
  const originalCreate = credentials.create.bind(credentials);

  const patchedCreate: typeof credentials.create = (options?: CredentialCreationOptions) => {
    if (options?.publicKey) {
      return originalCreate({
        ...options,
        publicKey: {
          ...options.publicKey,
          authenticatorSelection: {
            ...options.publicKey.authenticatorSelection,
            authenticatorAttachment: 'platform',
            residentKey: 'required',
            userVerification: 'required',
          },
        },
      });
    }
    return originalCreate(options);
  };

  credentials.create = patchedCreate;
  return fn().finally(() => {
    credentials.create = originalCreate;
  });
}

export const PasskeyService = {
  isDeviceReady(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(DEVICE_PASSKEY_READY_KEY) === '1';
    } catch {
      return false;
    }
  },

  markDeviceReady(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(DEVICE_PASSKEY_READY_KEY, '1');
    } catch {
      // Storage may be unavailable in private browsing; passkey still works in Supabase.
    }
  },

  async list(): Promise<PasskeyCredential[]> {
    const { data, error } = await supabase.auth.passkey.list();
    if (error) throw error;
    const items = (data || []).map((passkey: PasskeyListItem) => ({
      id: passkey.id,
      friendlyName: passkey.friendly_name || 'Llave de acceso',
      createdAt: passkey.created_at,
    }));
    if (items.length > 0) {
      PasskeyService.markDeviceReady();
    }
    return items;
  },

  async register(): Promise<void> {
    const firstAttempt = await withPlatformAuthenticator(
      async (): Promise<{ error: Error | null }> => {
        const res = await supabase.auth.registerPasskey();
        return { error: res.error };
      },
    );
    if (!firstAttempt.error) {
      PasskeyService.markDeviceReady();
      return;
    }
    // Si el navegador rechaza el filtro estricto de plataforma, reintentar estándar.
    const msg = (firstAttempt.error.message || '').toLowerCase();
    if (msg.includes('cancel') || msg.includes('abort')) {
      throw firstAttempt.error;
    }
    const fallback = await supabase.auth.registerPasskey();
    if (fallback.error) throw fallback.error;
    PasskeyService.markDeviceReady();
  },
};
