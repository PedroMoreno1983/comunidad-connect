import 'server-only';

import { PRIVACY_POLICY_VERSION } from '@/lib/privacy';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { CocoConsentState, PrivacyConsentAction, PrivacyConsentChannel } from '@/lib/types';

/**
 * Evidencia del aviso de privacidad de CoCo (ai_processing): qué decidió la
 * persona y con qué versión de la política. La administración nunca recibe
 * nada de las conversaciones de un residente; esto solo registra que vio el aviso.
 */

/** La última decisión del residente sobre CoCo, con la versión de la política que vio. */
export async function cocoConsentState(userId: string): Promise<{ state: CocoConsentState; policyVersion: string | null }> {
    const { data, error } = await getSupabaseAdmin()
        .from('privacy_consent_events')
        .select('action, policy_version')
        .eq('user_id', userId)
        .eq('consent_type', 'ai_processing')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error || !data) return { state: 'unknown', policyVersion: null };
    return { state: data.action === 'granted' ? 'granted' : 'withdrawn', policyVersion: String(data.policy_version) };
}

export async function recordCocoConsent(input: {
    userId: string;
    communityId: string | null;
    email: string | null;
    action: PrivacyConsentAction;
    channel: PrivacyConsentChannel;
}) {
    const { error } = await getSupabaseAdmin().from('privacy_consent_events').insert({
        user_id: input.userId,
        community_id: input.communityId,
        consent_type: 'ai_processing',
        action: input.action,
        policy_version: PRIVACY_POLICY_VERSION,
        channel: input.channel,
        subject_email: input.email,
        evidence: { explicit_choice: true, notice: 'coco_privacy_notice' },
    });
    if (error) throw error;
}
