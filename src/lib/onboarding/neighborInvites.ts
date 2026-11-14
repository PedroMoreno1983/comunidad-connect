import 'server-only';

import { randomInt } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { CANONICAL_SITE_URL } from '@/lib/config';
import type { NeighborInvitePreview, NeighborInviteShare } from '@/lib/types';

/**
 * Invitaciones entre vecinos por WhatsApp: cada residente tiene un enlace
 * personal (/unirse/<código>) que ya trae su edificio. Quien entra por él queda
 * como vecino SIN validar: en modo vecino hasta que la administración lo
 * confirme, y en un edificio administrado sin unidad.
 */

/** Sin 0/O ni 1/I/L, para que se pueda dictar o copiar a mano. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE = /^[A-Z2-9]{8}$/;

export function newInviteCode() {
    return Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

export function inviteUrl(code: string) {
    return `${CANONICAL_SITE_URL}/unirse/${code}`;
}

export function inviteMessage(buildingName: string, url: string) {
    return `¡Hola vecino! Estoy usando Convive en ${buildingName} para el supermercado, el marketplace entre vecinos y maestros de confianza. `
        + `Súmate aquí, toma un minuto: ${url}`;
}

/** El enlace de esta persona para su edificio (se crea la primera vez). */
export async function getOrCreateInvite(userId: string): Promise<NeighborInviteShare | null> {
    const admin = getSupabaseAdmin();
    const { data: profile } = await admin.from('profiles')
        .select('id, role, community_id, communities!profiles_community_id_fkey(name)')
        .eq('id', userId).maybeSingle();
    if (!profile?.community_id || profile.role !== 'resident') return null;
    const joined = profile.communities as { name?: string } | { name?: string }[] | null;
    const buildingName = String((Array.isArray(joined) ? joined[0]?.name : joined?.name) || 'mi edificio');

    const { data: existing } = await admin.from('neighbor_invites').select('code')
        .eq('community_id', profile.community_id).eq('inviter_id', userId).maybeSingle();
    let code = existing?.code ? String(existing.code) : null;
    for (let attempt = 0; !code && attempt < 5; attempt += 1) {
        const candidate = newInviteCode();
        const { error } = await admin.from('neighbor_invites').insert({ code: candidate, community_id: profile.community_id, inviter_id: userId });
        if (!error) code = candidate;
        else {
            // Otra pestaña lo creó al mismo tiempo: usar ese.
            const { data: raced } = await admin.from('neighbor_invites').select('code')
                .eq('community_id', profile.community_id).eq('inviter_id', userId).maybeSingle();
            if (raced?.code) code = String(raced.code);
        }
    }
    if (!code) return null;
    const url = inviteUrl(code);
    const message = inviteMessage(buildingName, url);
    return { code, url, message, whatsappUrl: `https://wa.me/?text=${encodeURIComponent(message)}`, buildingName };
}

/** Lo mínimo para la página de invitación: edificio y nombre de pila de quien invita. */
export async function previewInvite(code: string): Promise<NeighborInvitePreview | null> {
    const normalized = code.trim().toUpperCase();
    if (!INVITE_CODE.test(normalized)) return null;
    const admin = getSupabaseAdmin();
    const { data: invite } = await admin.from('neighbor_invites').select('code, community_id, inviter_id').eq('code', normalized).maybeSingle();
    if (!invite) return null;
    const [{ data: community }, { data: inviter }] = await Promise.all([
        admin.from('communities').select('name').eq('id', invite.community_id).maybeSingle(),
        admin.from('profiles').select('name, community_id').eq('id', invite.inviter_id).maybeSingle(),
    ]);
    // Si quien invitó ya no está en ese edificio, el enlace deja de servir.
    if (!community || inviter?.community_id !== invite.community_id) return null;
    return {
        code: normalized,
        buildingName: String(community.name),
        inviterFirstName: String(inviter?.name || 'Un vecino').split(' ')[0],
    };
}

/** Comunidad e invitador de un código válido, para el registro. */
export async function resolveInvite(code: string) {
    const normalized = code.trim().toUpperCase();
    if (!INVITE_CODE.test(normalized)) return null;
    const admin = getSupabaseAdmin();
    const { data: invite } = await admin.from('neighbor_invites').select('code, community_id, inviter_id, uses').eq('code', normalized).maybeSingle();
    if (!invite) return null;
    const [{ data: community }, { data: inviter }] = await Promise.all([
        admin.from('communities').select('id, name, managed, resident_code').eq('id', invite.community_id).maybeSingle(),
        admin.from('profiles').select('community_id').eq('id', invite.inviter_id).maybeSingle(),
    ]);
    if (!community || inviter?.community_id !== invite.community_id) return null;
    return {
        code: normalized,
        inviterId: String(invite.inviter_id),
        uses: Number(invite.uses || 0),
        community: { id: String(community.id), name: String(community.name), managed: community.managed !== false, residentCode: String(community.resident_code) },
    };
}

export async function recordInviteUse(code: string, uses: number) {
    await getSupabaseAdmin().from('neighbor_invites').update({ uses: uses + 1 }).eq('code', code);
}
