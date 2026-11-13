import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { CANONICAL_SITE_URL } from '@/lib/config';
import { recordOperationEvent } from '@/lib/operations/audit';
import { ProviderPortalError, createProviderInvite } from '@/lib/services/providerPortal';

/**
 * Maestros externos para CoCo (solo administración): registrar a un maestro
 * sin cuenta y generarle el enlace de su portal. Hacen lo mismo que la pantalla
 * (/services/register con "Registrar Proveedor Externo" y "Enviar enlace al
 * maestro" en su perfil). CoCo no le escribe al maestro por su cuenta: devuelve
 * el enlace y un acceso a WhatsApp para que la administración lo envíe.
 */

type Row = Record<string, unknown>;

export const PROVIDER_CATEGORIES = ['plumbing', 'electrical', 'locksmith', 'cleaning', 'general'] as const;
type ProviderCategory = typeof PROVIDER_CATEGORIES[number];

const CATEGORY_ALIASES: Record<string, ProviderCategory> = {
    gasfiter: 'plumbing', gasfiteria: 'plumbing', plomero: 'plumbing', plomeria: 'plumbing', plumbing: 'plumbing',
    electricista: 'electrical', electricidad: 'electrical', electrico: 'electrical', electrical: 'electrical',
    cerrajero: 'locksmith', cerrajeria: 'locksmith', locksmith: 'locksmith',
    aseo: 'cleaning', limpieza: 'cleaning', cleaning: 'cleaning',
    general: 'general', maestro: 'general', mantencion: 'general', mantenimiento: 'general',
};

function normalize(value: string) {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function providerCategory(value: unknown): ProviderCategory {
    return CATEGORY_ALIASES[normalize(String(value ?? ''))] || 'general';
}

function text(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Especialidades como lista: acepta arreglo o texto separado por comas. */
function specialties(value: unknown): string[] {
    const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;\n]/) : [];
    return items.map(item => text(item, 80)).filter(Boolean).slice(0, 12);
}

/** Número para wa.me: un celular chileno de 9 u 8 dígitos se completa con 56 / 569. */
export function whatsappDigits(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 9 && digits.startsWith('9')) return `56${digits}`;
    if (digits.length === 8) return `569${digits}`;
    return digits.length >= 10 ? digits : '';
}

export function providerInviteMessage(providerName: string, url: string) {
    return `Hola ${providerName.split(' ')[0]}, este es tu enlace para gestionar tu perfil y responder las solicitudes de la comunidad: ${url}`;
}

export async function registerExternalProviderForAdmin(db: SupabaseClient, communityId: string, adminId: string, input: Row) {
    const name = text(input.name, 120);
    const contactPhone = text(input.contact_phone, 40);
    const email = text(input.email, 160);
    if (name.length < 2) return { error: 'Falta el nombre del maestro.' };
    if (contactPhone.replace(/\D/g, '').length < 8) return { error: 'Falta un teléfono de contacto válido del maestro.' };
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'El correo del maestro no es válido.' };

    // El mismo teléfono en la comunidad es el mismo maestro: no se duplica.
    const phoneDigits = contactPhone.replace(/\D/g, '').slice(-8);
    const { data: existing, error: lookupError } = await db.from('service_providers')
        .select('id, name, contact_phone, user_id').eq('community_id', communityId).limit(500);
    if (lookupError) return { error: 'No se pudo revisar el directorio de proveedores.' };
    const duplicate = (existing || []).find(row => String(row.contact_phone || '').replace(/\D/g, '').slice(-8) === phoneDigits);
    if (duplicate) {
        return {
            success: false,
            status: 'ALREADY_REGISTERED',
            provider: { id: String(duplicate.id), name: String(duplicate.name), external: !duplicate.user_id },
            message: `${duplicate.name} ya está registrado en la comunidad con ese teléfono. No lo dupliqué.`,
        };
    }

    const category = providerCategory(input.category);
    const { data: provider, error } = await db.from('service_providers').insert({
        name,
        category,
        contact_phone: contactPhone,
        email: email || null,
        bio: text(input.bio, 1200),
        specialties: specialties(input.specialties),
        certifications: [],
        years_experience: 0,
        hourly_rate: 0,
        availability: 'available',
        response_time: 'N/A',
        rating: 0,
        review_count: 0,
        completed_jobs: 0,
        verified: false,
        user_id: null,
        community_id: communityId,
    }).select('id, name, category').single();
    if (error || !provider) return { error: 'No se pudo registrar al maestro.' };

    await recordOperationEvent({
        communityId, actorId: adminId, actorRole: 'admin', action: 'provider.external_created',
        entityType: 'service_provider', entityId: String(provider.id), severity: 'success', status: 'pending',
        summary: `Proveedor externo registrado por administración vía CoCo: ${provider.name}`,
        metadata: { category, channel: 'coco' },
    });

    return {
        success: true,
        status: 'REGISTERED',
        provider: { id: String(provider.id), name: String(provider.name), category: String(provider.category), verified: false },
        profile_link: `/services/provider/${provider.id}`,
        message: `Registré a ${provider.name} como maestro externo (sin verificar). Para que gestione su perfil y responda solicitudes, envíale su enlace con send_provider_portal_link.`,
    };
}

async function findExternalProvider(db: SupabaseClient, communityId: string, input: Row) {
    const id = text(input.provider_id, 64);
    if (id) {
        const { data } = await db.from('service_providers')
            .select('id, name, contact_phone, user_id').eq('id', id).eq('community_id', communityId).maybeSingle();
        return data ? { matches: [data] } : { matches: [] };
    }
    const name = normalize(text(input.provider_name, 120));
    if (name.length < 2) return { matches: [] };
    const { data } = await db.from('service_providers')
        .select('id, name, contact_phone, user_id').eq('community_id', communityId).limit(500);
    const rows = (data || []).filter(row => normalize(String(row.name || '')).includes(name));
    const exact = rows.filter(row => normalize(String(row.name || '')) === name);
    return { matches: exact.length === 1 ? exact : rows };
}

export async function sendProviderPortalLinkForAdmin(db: SupabaseClient, communityId: string, adminId: string, input: Row) {
    const { matches } = await findExternalProvider(db, communityId, input);
    if (!matches.length) return { error: 'No encontré a ese maestro en la comunidad. Revisa el nombre o regístralo primero.' };
    if (matches.length > 1) {
        return {
            success: false,
            status: 'AMBIGUOUS',
            candidates: matches.slice(0, 5).map(row => ({ id: String(row.id), name: String(row.name), contact_phone: String(row.contact_phone || '') })),
            message: 'Hay más de un maestro con ese nombre. Pregunta a cuál enviarle el enlace. No generé ninguno.',
        };
    }
    const provider = matches[0];
    if (provider.user_id) {
        return { success: false, status: 'HAS_ACCOUNT', message: `${provider.name} tiene cuenta en Convive: gestiona su perfil y sus solicitudes desde su panel, no necesita enlace.` };
    }

    try {
        const invite = await createProviderInvite(communityId, adminId, String(provider.id));
        const url = `${CANONICAL_SITE_URL}/proveedor/${invite.token}`;
        const phone = whatsappDigits(String(provider.contact_phone || ''));
        const shareText = providerInviteMessage(invite.providerName, url);
        return {
            success: true,
            status: 'LINK_CREATED',
            provider_name: invite.providerName,
            url,
            expires_at: invite.expiresAt,
            whatsapp_link: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(shareText)}` : null,
            message: `Enlace personal de ${invite.providerName} (vence el ${invite.expiresAt.slice(0, 10)}; el anterior, si había, dejó de funcionar). `
                + (phone ? 'Entrega el enlace de WhatsApp para que la administración se lo envíe con un toque.' : 'No tiene un celular válido: entrega el enlace para copiarlo.')
                + ' CoCo no se lo envía directo al maestro.',
        };
    } catch (error) {
        if (error instanceof ProviderPortalError) return { error: error.message };
        return { error: 'No se pudo crear el enlace.' };
    }
}
