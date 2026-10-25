import { supabase } from '@/lib/supabase';
import type { PasskeyCredential } from '@/lib/types';
import type { PasskeyListItem } from '@supabase/auth-js';

export const PasskeyService = {
  async list(): Promise<PasskeyCredential[]> {
    const { data, error } = await supabase.auth.passkey.list();
    if (error) throw error;
    return (data || []).map((passkey: PasskeyListItem) => ({
      id: passkey.id,
      friendlyName: passkey.friendly_name || 'Llave de acceso',
      createdAt: passkey.created_at,
    }));
  },

  async register(): Promise<void> {
    const { error } = await supabase.auth.registerPasskey();
    if (error) throw error;
  },
};
