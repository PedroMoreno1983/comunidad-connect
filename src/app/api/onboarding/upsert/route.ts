import { NextResponse } from 'next/server';
import { getRequestId, recordOperationEvent } from '@/lib/operations/audit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export const dynamic = 'force-dynamic';

type IncomingResident = {
    id?: string;
    name?: string;
    unit_id?: string;
    email?: string;
    phone?: string;
};

type NormalizedResident = {
    id: string;
    name: string;
    unit_id: string;
    email: string;
    phone: string;
};

type UnitInsertPayload = {
    community_id: string;
    number: string;
    unit_number?: string;
    tower: string;
    floor: number;
};

type SyncRowResult = {
    name: string;
    unit: string;
    status: 'synced' | 'unit_only' | 'failed';
    detail: string;
};

function cleanText(value: unknown) {
    return typeof value === 'string' || typeof value === 'number'
        ? String(value).replace(/\s+/g, ' ').trim()
        : '';
}

function normalizeResidents(value: unknown): NormalizedResident[] {
    const rows = Array.isArray(value) ? value : [];

    return rows
        .map((resident: IncomingResident) => ({
            id: cleanText(resident.id),
            name: cleanText(resident.name),
            unit_id: cleanText(resident.unit_id),
            email: cleanText(resident.email).toLowerCase(),
            phone: cleanText(resident.phone),
        }))
        .filter((resident) => resident.name && resident.unit_id);
}

function inferUnitDetails(unitLabel: string) {
    const normalized = unitLabel.trim();
    const towerMatch = normalized.match(/^(torre\s*)?([a-zA-Z])[-\s]?/);
    const numericPart = normalized.match(/\d+/)?.[0] || '';
    const numericValue = Number(numericPart);
    const tower = towerMatch?.[2]?.toUpperCase() || 'A';
    const floor = Number.isFinite(numericValue) && numericValue >= 100
        ? Math.max(1, Math.floor(numericValue / 100))
        : 1;

    return {
        number: normalized,
        unit_number: normalized,
        tower,
        floor,
    };
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object' && 'message' in error) {
        return String((error as { message?: unknown }).message || 'Unknown error');
    }
    return 'Unknown error';
}

function hasMissingColumnError(error: unknown, columnName: string) {
    return getErrorMessage(error).toLowerCase().includes(columnName.toLowerCase());
}

async function findUnit(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, communityId: string, unitNumber: string) {
    const byNumber = await supabaseAdmin
        .from('units')
        .select('id')
        .eq('community_id', communityId)
        .eq('number', unitNumber)
        .maybeSingle();

    if (byNumber.error) throw byNumber.error;
    if (byNumber.data) return String(byNumber.data.id);

    const byUnitNumber = await supabaseAdmin
        .from('units')
        .select('id')
        .eq('community_id', communityId)
        .eq('unit_number', unitNumber)
        .maybeSingle();

    if (byUnitNumber.error && !hasMissingColumnError(byUnitNumber.error, 'unit_number')) throw byUnitNumber.error;
    return byUnitNumber.data ? String(byUnitNumber.data.id) : null;
}

async function createUnit(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, payload: UnitInsertPayload) {
    const withUnitNumber = await supabaseAdmin
        .from('units')
        .insert(payload)
        .select('id')
        .single();

    if (!withUnitNumber.error && withUnitNumber.data) return String(withUnitNumber.data.id);
    if (!hasMissingColumnError(withUnitNumber.error, 'unit_number')) throw withUnitNumber.error;

    const fallbackPayload = {
        community_id: payload.community_id,
        number: payload.number,
        tower: payload.tower,
        floor: payload.floor,
    };
    const withoutUnitNumber = await supabaseAdmin
        .from('units')
        .insert(fallbackPayload)
        .select('id')
        .single();

    if (withoutUnitNumber.error || !withoutUnitNumber.data) throw withoutUnitNumber.error || new Error('unit-create-failed');
    return String(withoutUnitNumber.data.id);
}

async function ensureResidentProfile(
    supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
    resident: NormalizedResident,
    communityId: string,
    unitId: string,
    residentInviteCode: string,
) {
    const existingByEmail = resident.email
        ? await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('community_id', communityId)
            .eq('email', resident.email)
            .maybeSingle()
        : { data: null, error: null };

    if (existingByEmail.error) throw existingByEmail.error;

    let existingProfile: { id: string; name?: string | null; full_name?: string | null; email?: string | null } | null = existingByEmail.data;
    if (!existingProfile) {
        const residentsInUnit = await supabaseAdmin.from('profiles').select('id, name, full_name, email')
            .eq('community_id', communityId).eq('role', 'resident').eq('unit_id', unitId).limit(20);
        if (residentsInUnit.error) throw residentsInUnit.error;
        const normalizedName = resident.name.toLocaleLowerCase('es-CL');
        existingProfile = (residentsInUnit.data || []).find(candidate =>
            cleanText(candidate.full_name || candidate.name).toLocaleLowerCase('es-CL') === normalizedName
        ) || null;
    }

    const baseProfile = {
        name: resident.name,
        full_name: resident.name,
        role: 'resident',
        community_id: communityId,
        unit_id: unitId,
        department_number: resident.unit_id,
        phone: resident.phone || null,
        // A phone number is contact data, not consent to receive WhatsApp messages.
        whatsapp_enabled: false,
    };

    if (existingProfile) {
        const updatePayload = resident.email ? { ...baseProfile, email: resident.email } : baseProfile;
        const { error } = await supabaseAdmin
            .from('profiles')
            .update(updatePayload)
            .eq('id', String(existingProfile.id));

        if (error) throw error;
        return String(existingProfile.id);
    }

    if (!resident.email) return null;

    const authResult = await supabaseAdmin.auth.admin.createUser({
        email: resident.email,
        email_confirm: false,
        user_metadata: {
            full_name: resident.name,
            invite_code: residentInviteCode,
            unit_number: resident.unit_id,
        },
    });

    if (authResult.error || !authResult.data.user) throw authResult.error || new Error('auth-user-create-failed');

    const profilePayload = {
        id: authResult.data.user.id,
        email: resident.email,
        ...baseProfile,
    };

    const { error } = await supabaseAdmin.from('profiles').upsert(profilePayload, { onConflict: 'id' });
    if (error) {
        await supabaseAdmin.auth.admin.deleteUser(authResult.data.user.id).catch(() => undefined);
        throw error;
    }
    return authResult.data.user.id;
}

export async function POST(request: Request) {
    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        if (profile.role !== 'admin') {
            return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
        }

        if (!profile.community_id) {
            return NextResponse.json({ error: 'El administrador no tiene comunidad asignada.' }, { status: 400 });
        }

        const body = await request.json();
        const residentsPayload = body && typeof body === 'object'
            ? (body as { residents?: unknown }).residents
            : undefined;
        const batchId = body && typeof body === 'object' ? cleanText((body as { batchId?: unknown }).batchId) : '';
        const residents = normalizeResidents(residentsPayload);

        if (residents.length === 0) {
            return NextResponse.json({ error: 'Payload vacio o invalido.' }, { status: 400 });
        }

        const communityId = profile.community_id;
        const supabaseAdmin = getSupabaseAdmin();
        if (batchId) {
            const { data: batch, error: batchError } = await supabaseAdmin.from('onboarding_import_batches')
                .select('id, status').eq('id', batchId).eq('community_id', communityId).maybeSingle();
            if (batchError || !batch) return NextResponse.json({ error: 'Lote no encontrado o pertenece a otra comunidad.' }, { status: 404 });
            await supabaseAdmin.from('onboarding_import_batches').update({ status: 'syncing', updated_at: new Date().toISOString() }).eq('id', batchId);
            const submittedIds = new Set(residents.map(resident => resident.id).filter(Boolean));
            const { data: stagedRows } = await supabaseAdmin.from('onboarding_import_rows').select('id').eq('batch_id', batchId).eq('community_id', communityId).eq('status', 'staged');
            for (const resident of residents) {
                if (!resident.id) continue;
                await supabaseAdmin.from('onboarding_import_rows').update({
                    name: resident.name, unit_number: resident.unit_id, email: resident.email, phone: resident.phone,
                    raw_data: { name: resident.name, unit_id: resident.unit_id, email: resident.email, phone: resident.phone },
                    updated_at: new Date().toISOString(),
                }).eq('id', resident.id).eq('batch_id', batchId);
            }
            const removedIds = (stagedRows || []).map(row => String(row.id)).filter(id => !submittedIds.has(id));
            if (removedIds.length) await supabaseAdmin.from('onboarding_import_rows').update({ status: 'skipped', updated_at: new Date().toISOString() }).in('id', removedIds).eq('batch_id', batchId);
        }
        const { data: community, error: communityError } = await supabaseAdmin
            .from('communities')
            .select('resident_code')
            .eq('id', communityId)
            .single();
        if (communityError || !community?.resident_code) {
            throw communityError || new Error('La comunidad no tiene código de residentes configurado.');
        }
        const rowResults: SyncRowResult[] = [];
        let successCount = 0;
        let unitOnlyCount = 0;
        let errorCount = 0;

        for (const resident of residents) {
            try {
                const unitDetails = inferUnitDetails(resident.unit_id);
                const existingUnitId = await findUnit(supabaseAdmin, communityId, resident.unit_id);
                const finalUnitId = existingUnitId || await createUnit(supabaseAdmin, {
                    community_id: communityId,
                    number: unitDetails.number,
                    unit_number: unitDetails.unit_number,
                    tower: unitDetails.tower,
                    floor: unitDetails.floor,
                });

                const residentProfileId = await ensureResidentProfile(
                    supabaseAdmin,
                    resident,
                    communityId,
                    finalUnitId,
                    community.resident_code,
                );

                if (residentProfileId) {
                    const { data: unitOwner, error: ownerReadError } = await supabaseAdmin.from('units').select('owner_id').eq('id', finalUnitId).maybeSingle();
                    if (ownerReadError) throw ownerReadError;
                    const { error: unitAssignError } = unitOwner?.owner_id
                        ? { error: null }
                        : await supabaseAdmin.from('units').update({ owner_id: residentProfileId }).eq('id', finalUnitId);

                    if (unitAssignError) throw unitAssignError;
                    successCount++;
                    rowResults.push({ name: resident.name, unit: resident.unit_id, status: 'synced', detail: 'Perfil residente y unidad sincronizados.' });
                    if (batchId && resident.id) await supabaseAdmin.from('onboarding_import_rows').update({ status: 'synced', error: null, updated_at: new Date().toISOString() }).eq('id', resident.id).eq('batch_id', batchId);
                } else {
                    unitOnlyCount++;
                    rowResults.push({ name: resident.name, unit: resident.unit_id, status: 'unit_only', detail: 'Unidad preparada; falta email para crear acceso del residente.' });
                    if (batchId && resident.id) await supabaseAdmin.from('onboarding_import_rows').update({ status: 'unit_only', error: null, updated_at: new Date().toISOString() }).eq('id', resident.id).eq('batch_id', batchId);
                }
            } catch (err) {
                errorCount++;
                rowResults.push({ name: resident.name, unit: resident.unit_id, status: 'failed', detail: getErrorMessage(err) });
                if (batchId && resident.id) await supabaseAdmin.from('onboarding_import_rows').update({ status: 'failed', error: getErrorMessage(err), updated_at: new Date().toISOString() }).eq('id', resident.id).eq('batch_id', batchId);
                console.error('[onboarding/upsert] row failed:', err);
            }
        }

        if (batchId) {
            await supabaseAdmin.from('onboarding_import_batches').update({
                status: errorCount > 0 || unitOnlyCount > 0 ? 'partial' : 'synced',
                updated_at: new Date().toISOString(),
            }).eq('id', batchId).eq('community_id', communityId);
        }

        await recordOperationEvent({
            communityId,
            actorId: profile.id,
            actorRole: profile.role,
            action: 'onboarding.roster_synced',
            entityType: 'resident_roster',
            severity: errorCount > 0 || unitOnlyCount > 0 ? 'warning' : 'success',
            status: errorCount > 0 || unitOnlyCount > 0 ? 'pending' : 'success',
            summary: `Nomina sincronizada: ${successCount} residentes activos, ${unitOnlyCount} unidades pendientes`,
            metadata: {
                processed: residents.length,
                success: successCount,
                unitOnly: unitOnlyCount,
                errors: errorCount,
                withEmail: residents.filter(resident => resident.email).length,
                withPhone: residents.filter(resident => resident.phone).length,
                destinations: ['profiles', 'units', 'auth.users'],
                rowResults: rowResults.slice(0, 30),
            },
            requestId: getRequestId(request),
        });

        return NextResponse.json({
            message: 'Sincronizacion completada',
            processed: residents.length,
            success: successCount,
            unitOnly: unitOnlyCount,
            errors: errorCount,
            destinations: ['profiles', 'units', 'auth.users'],
            rowResults,
        });
    } catch (error: unknown) {
        console.error('Upsert Error:', error);
        return NextResponse.json({ error: 'No se pudo sincronizar la nómina.' }, { status: 500 });
    }
}
