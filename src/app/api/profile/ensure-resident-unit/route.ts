import { NextResponse } from 'next/server';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

function cleanText(value: unknown, max = 120) {
    return typeof value === 'string' || typeof value === 'number'
        ? String(value).replace(/\s+/g, ' ').trim().slice(0, max)
        : '';
}

function inferUnitDetails(unitLabel: string) {
    const normalized = cleanText(unitLabel, 40);
    const towerMatch = normalized.match(/^(?:torre\s*)?([a-zA-Z])[-\s]?/);
    const numericPart = normalized.match(/\d+/)?.[0] || '';
    const numericValue = Number(numericPart);

    return {
        number: normalized,
        tower: towerMatch?.[1]?.toUpperCase() || 'A',
        floor: Number.isFinite(numericValue) && numericValue >= 100
            ? Math.max(1, Math.floor(numericValue / 100))
            : 1,
    };
}

export async function POST() {
    try {
        const supabaseUser = await getSupabaseUserClient();
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const admin = getSupabaseAdmin();
        const { data: profile, error: profileError } = await admin
            .from('profiles')
            .select('id, role, community_id, unit_id, department_number')
            .eq('id', user.id)
            .maybeSingle();

        if (profileError) throw profileError;
        if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 });
        if (profile.role !== 'resident') {
            return NextResponse.json({ ok: true, skipped: 'not_resident' });
        }

        const currentUnitId = cleanText(profile.unit_id, 80);
        if (currentUnitId) {
            const { data: currentUnit } = await admin
                .from('units')
                .select('id, number, tower')
                .eq('id', currentUnitId)
                .maybeSingle();
            if (currentUnit) {
                const unitNumber = cleanText(currentUnit.number, 40);
                const tower = cleanText(currentUnit.tower, 20);
                return NextResponse.json({
                    ok: true,
                    unitId: currentUnit.id,
                    unitName: unitNumber ? `Depto ${tower && tower !== 'A' ? `${tower}-` : ''}${unitNumber}` : undefined,
                });
            }
        }

        const communityId = cleanText(profile.community_id, 80);
        const unitLabel = cleanText(profile.department_number, 40)
            || cleanText(user.user_metadata?.department_number, 40)
            || cleanText(user.user_metadata?.unit_number, 40);

        if (!communityId || !unitLabel) {
            return NextResponse.json({ ok: true, skipped: 'missing_unit_context' });
        }

        const unitDetails = inferUnitDetails(unitLabel);
        const { data: existingUnit, error: existingUnitError } = await admin
            .from('units')
            .select('id, number, tower')
            .eq('community_id', communityId)
            .eq('number', unitDetails.number)
            .maybeSingle();

        if (existingUnitError) throw existingUnitError;

        let unitId = cleanText(existingUnit?.id, 80);
        if (!unitId) {
            const { data: createdUnit, error: createError } = await admin
                .from('units')
                .insert({
                    community_id: communityId,
                    number: unitDetails.number,
                    tower: unitDetails.tower,
                    floor: unitDetails.floor,
                    type: 'apartment',
                    owner_id: user.id,
                    resident_profile_id: user.id,
                })
                .select('id')
                .single();

            if (createError) throw createError;
            unitId = cleanText(createdUnit?.id, 80);
        }

        if (!unitId) throw new Error('No se pudo resolver la unidad del residente.');

        const { error: profileUpdateError } = await admin
            .from('profiles')
            .update({
                unit_id: unitId,
                department_number: unitDetails.number,
            })
            .eq('id', user.id);
        if (profileUpdateError) throw profileUpdateError;

        const { error: unitUpdateError } = await admin
            .from('units')
            .update({
                owner_id: user.id,
                resident_profile_id: user.id,
            })
            .eq('id', unitId);
        if (unitUpdateError) throw unitUpdateError;

        return NextResponse.json({
            ok: true,
            unitId,
            unitName: `Depto ${unitDetails.tower !== 'A' ? `${unitDetails.tower}-` : ''}${unitDetails.number}`,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo vincular la unidad.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
