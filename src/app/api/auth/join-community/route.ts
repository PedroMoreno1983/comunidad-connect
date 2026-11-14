import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { findOrCreateCommunityUnit } from '@/lib/units/resolveCommunityUnit';
import { createUnmanagedCommunity, findBuildingForAddress, parseBuildingAddress } from '@/lib/onboarding/residentBuilding';
import { noteResidentThreshold } from '@/lib/onboarding/neighborBuildings';
import { recordInviteUse, resolveInvite } from '@/lib/onboarding/neighborInvites';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '@/lib/privacy';
import { logApiError } from '@/lib/observability/logger';
import type { UserRole } from '@/lib/types';

export const runtime = 'nodejs';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Quien entró con Google todavía no tiene edificio (handle_new_user lo crea
 * sin comunidad). Aquí lo elige: con el código de su administración o con la
 * dirección, como en el registro por correo (entrada por residente).
 *
 * Orden: validar todo, guardar los consentimientos, asignar el perfil (solo si
 * sigue sin edificio) y recién entonces tomar la unidad.
 */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'auth.join_community', { limit: 10, windowMs: 15 * 60_000 });
    if (limited) return limited;
    const admin = getSupabaseAdmin();
    let createdCommunityId: string | null = null;
    const dropCreatedCommunity = async () => {
        if (createdCommunityId) await admin.from('communities').delete().eq('id', createdCommunityId).eq('managed', false);
    };
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Inicia sesión primero.' }, { status: 401 });

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const byAddress = body.mode === 'address';
        const byInvite = body.mode === 'invite';
        const inviteCode = cleanText(body.inviteCode, 16).toUpperCase();
        let invite: Awaited<ReturnType<typeof resolveInvite>> = null;
        const accessCode = cleanText(body.accessCode, 40).toUpperCase();
        const departmentNumber = cleanText(body.departmentNumber, 40);
        const buildingName = cleanText(body.buildingName, 120);
        if (body.acceptTerms !== true || body.acceptPrivacy !== true) {
            return NextResponse.json({ error: 'Debes aceptar los términos y confirmar que leíste la política de privacidad.' }, { status: 400 });
        }

        const { data: profile } = await admin.from('profiles').select('id, community_id').eq('id', user.id).maybeSingle();
        if (!profile) return NextResponse.json({ error: 'Perfil no encontrado.' }, { status: 404 });
        if (profile.community_id) return NextResponse.json({ error: 'Tu cuenta ya tiene un edificio.' }, { status: 409 });

        let community: { id: string; name: string; managed: boolean } | null = null;
        let role: UserRole = 'resident';

        if (byInvite) {
            invite = await resolveInvite(inviteCode);
            if (!invite) return NextResponse.json({ error: 'Esta invitación ya no es válida. Pide a tu vecino que te la mande de nuevo.', code: 'INVITE_INVALID' }, { status: 400 });
            if (!departmentNumber) return NextResponse.json({ error: 'Ingresa tu departamento o unidad.' }, { status: 400 });
            community = { id: invite.community.id, name: invite.community.name, managed: invite.community.managed };
        } else if (byAddress) {
            const address = parseBuildingAddress(body.address);
            if (!address) return NextResponse.json({ error: 'Elige la dirección de tu edificio de la lista.' }, { status: 400 });
            // Antes de crear nada: sin departamento no se crea un edificio que quedaría huérfano.
            if (!departmentNumber) return NextResponse.json({ error: 'Ingresa tu departamento o unidad.' }, { status: 400 });
            let building = await findBuildingForAddress(admin, address);
            if (building?.managed) {
                return NextResponse.json({ error: `${building.name} ya usa Convive. Pide el código de residentes a tu administración.`, code: 'BUILDING_MANAGED' }, { status: 409 });
            }
            if (!building) {
                if (buildingName.length < 3) {
                    return NextResponse.json({ error: 'Tu edificio todavía no está en Convive: escribe su nombre para crearlo.', code: 'BUILDING_NAME_REQUIRED' }, { status: 400 });
                }
                building = await createUnmanagedCommunity(admin, buildingName, address);
                createdCommunityId = building.id;
            }
            community = { id: building.id, name: building.name, managed: false };
        } else {
            if (!/^[A-Z0-9_-]{4,40}$/.test(accessCode)) return NextResponse.json({ error: 'Código de invitación inválido.' }, { status: 400 });
            const { data: rows } = await admin.from('communities').select('id, name, managed, resident_code, concierge_code, admin_code')
                .or(`resident_code.eq.${accessCode},concierge_code.eq.${accessCode},admin_code.eq.${accessCode}`).limit(1);
            const row = rows?.[0];
            const codeRole: UserRole | null = !row ? null
                : row.resident_code === accessCode ? 'resident'
                    : row.concierge_code === accessCode ? 'concierge'
                        : row.admin_code === accessCode ? 'admin' : null;
            if (!row || !codeRole || (row.managed === false && codeRole !== 'resident')) {
                return NextResponse.json({ error: 'El código de invitación no es válido.' }, { status: 403 });
            }
            role = codeRole;
            community = { id: String(row.id), name: String(row.name), managed: row.managed !== false };
            if (role === 'resident' && !departmentNumber) return NextResponse.json({ error: 'Ingresa tu departamento o unidad.' }, { status: 400 });
        }

        // Unidad: nadie se liga a una que ya es de otra persona. En un edificio
        // administrado eso es un error (la administración asigna); en uno sin
        // administrar, el vecino entra igual pero sin unidad.
        let unitId: string | null = null;
        if (role === 'resident' && !(byInvite && community.managed)) {
            const candidate = await findOrCreateCommunityUnit(admin, community.id, departmentNumber);
            const { data: unit } = await admin.from('units').select('id, owner_id, resident_profile_id').eq('id', candidate).maybeSingle();
            const takenBySomeoneElse = [unit?.owner_id, unit?.resident_profile_id].some(id => id && id !== user.id);
            if (takenBySomeoneElse && community.managed) {
                await dropCreatedCommunity();
                return NextResponse.json({ error: `El departamento ${departmentNumber} ya tiene un residente en Convive. Pide a tu administración que te asigne.`, code: 'UNIT_TAKEN' }, { status: 409 });
            }
            unitId = takenBySomeoneElse ? null : candidate;
        }

        // Consentimientos primero: si no quedan guardados, no se completa nada.
        const { error: consentError } = await admin.from('privacy_consent_events').insert([
            { consent_type: 'terms', policy_version: TERMS_VERSION },
            { consent_type: 'privacy_notice', policy_version: PRIVACY_POLICY_VERSION },
            ...(body.whatsappOptIn === true ? [{ consent_type: 'whatsapp', policy_version: PRIVACY_POLICY_VERSION }] : []),
        ].map(item => ({
            ...item, user_id: user.id, community_id: community.id, action: 'granted', channel: 'oauth_onboarding',
            subject_email: user.email, evidence: { explicit_checkbox: true },
        })));
        if (consentError) {
            await dropCreatedCommunity();
            throw consentError;
        }

        // Solo si sigue sin edificio: si otra solicitud ganó, esta se detiene
        // antes de tomar ninguna unidad.
        const { data: assigned, error: profileError } = await admin.from('profiles').update({
            community_id: community.id,
            role,
            department_number: role === 'resident' ? departmentNumber : null,
            unit_id: unitId,
            // Con código de un edificio administrado queda validado; por dirección, no.
            residence_verified: community.managed && !byAddress && !byInvite,
            invited_by: invite?.inviterId ?? null,
            whatsapp_enabled: body.whatsappOptIn === true,
        }).eq('id', user.id).is('community_id', null).select('id').maybeSingle();
        if (profileError) {
            await dropCreatedCommunity();
            throw profileError;
        }
        if (!assigned) {
            await dropCreatedCommunity();
            return NextResponse.json({ error: 'Tu cuenta ya tiene un edificio.' }, { status: 409 });
        }

        if (unitId) {
            await admin.from('units').update({ resident_profile_id: user.id }).eq('id', unitId).is('resident_profile_id', null);
            await admin.from('units').update({ owner_id: user.id }).eq('id', unitId).is('owner_id', null);
        }
        if (createdCommunityId) await admin.from('communities').update({ created_by_resident: user.id }).eq('id', createdCommunityId);
        if (invite) await recordInviteUse(invite.code, invite.uses).catch(() => undefined);
        if (!community.managed) await noteResidentThreshold(community.id, community.name).catch(() => undefined);

        return NextResponse.json({ ok: true, role, communityManaged: community.managed, communityCreated: Boolean(createdCommunityId) });
    } catch (error) {
        await dropCreatedCommunity().catch(() => undefined);
        logApiError(req, '/api/auth/join-community', error);
        return NextResponse.json({ error: 'No se pudo completar. Intenta de nuevo.' }, { status: 500 });
    }
}
