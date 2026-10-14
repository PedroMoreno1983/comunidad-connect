import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { ApiKeyScope, CommunityApiKey } from '@/lib/types';

// Las claves se ven como "cc_live_<prefijo>_<secreto>". El prefijo identifica la
// clave en pantalla sin revelarla; la base guarda solo el SHA-256 completo.
const KEY_PATTERN = /^cc_live_([a-z0-9]{8})_([A-Za-z0-9_-]{32,})$/;
export const API_KEY_SCOPES: ApiKeyScope[] = ['units', 'finance', 'access'];
const MAX_ACTIVE_KEYS = 10;

export class ApiKeyError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}

export function hashSecret(value: string) {
    return createHash('sha256').update(value).digest('hex');
}

export function generateApiKey() {
    const prefix = randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(8, '0').slice(0, 8);
    const key = `cc_live_${prefix}_${randomBytes(32).toString('base64url')}`;
    return { key, prefix, hash: hashSecret(key) };
}

const KEY_COLUMNS = 'id, name, key_prefix, scopes, created_at, last_used_at, revoked_at';

function toKey(row: Record<string, unknown>): CommunityApiKey {
    return {
        id: String(row.id),
        name: String(row.name),
        prefix: String(row.key_prefix),
        scopes: row.scopes as ApiKeyScope[],
        createdAt: String(row.created_at),
        lastUsedAt: (row.last_used_at as string | null) ?? null,
        revokedAt: (row.revoked_at as string | null) ?? null,
    };
}

export async function listApiKeys(communityId: string) {
    const { data, error } = await getSupabaseAdmin()
        .from('community_api_keys').select(KEY_COLUMNS)
        .eq('community_id', communityId).order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(toKey);
}

export async function createApiKey(communityId: string, createdBy: string, input: { name: string; scopes: string[] }) {
    const name = input.name.trim().slice(0, 80);
    if (name.length < 2) throw new ApiKeyError('Ponle un nombre a la clave, por ejemplo el sistema que la usará.');
    const scopes = API_KEY_SCOPES.filter(scope => input.scopes.includes(scope));
    if (!scopes.length) throw new ApiKeyError('Elige al menos un permiso.');

    const admin = getSupabaseAdmin();
    const { count } = await admin.from('community_api_keys')
        .select('id', { count: 'exact', head: true })
        .eq('community_id', communityId).is('revoked_at', null);
    if ((count || 0) >= MAX_ACTIVE_KEYS) throw new ApiKeyError('Ya hay 10 claves activas. Revoca alguna antes de crear otra.');

    const generated = generateApiKey();
    const { data, error } = await admin.from('community_api_keys').insert({
        community_id: communityId,
        name,
        key_prefix: generated.prefix,
        key_hash: generated.hash,
        scopes,
        created_by: createdBy,
    }).select(KEY_COLUMNS).single();
    if (error) throw error;
    return { apiKey: toKey(data), secret: generated.key };
}

export async function revokeApiKey(communityId: string, keyId: string) {
    const { error } = await getSupabaseAdmin().from('community_api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', keyId).eq('community_id', communityId).is('revoked_at', null);
    if (error) throw error;
}

/** Resuelve la cabecera Authorization a la comunidad dueña de la clave, o null. */
export async function authenticateApiKey(authorization: string | null, scope: ApiKeyScope) {
    const key = authorization?.replace(/^Bearer\s+/i, '').trim() || '';
    if (!KEY_PATTERN.test(key)) return { ok: false as const, status: 401, error: 'Falta una clave de API válida en Authorization: Bearer.' };
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('community_api_keys')
        .select('id, community_id, scopes, revoked_at')
        .eq('key_hash', hashSecret(key)).maybeSingle();
    if (error) throw error;
    if (!data || data.revoked_at) return { ok: false as const, status: 401, error: 'La clave no existe o fue revocada.' };
    if (!(data.scopes as string[]).includes(scope)) {
        return { ok: false as const, status: 403, error: `La clave no tiene el permiso "${scope}".` };
    }
    // Registrar el uso no debe frenar la respuesta.
    void admin.from('community_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
    return { ok: true as const, communityId: String(data.community_id), keyId: String(data.id) };
}
