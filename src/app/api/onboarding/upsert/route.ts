import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type IncomingResident = {
    name?: string;
    unit_id?: string;
    email?: string;
    phone?: string;
};

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            );
                        } catch {
                            // Safe to ignore when called from server rendering paths.
                        }
                    },
                },
            }
        );

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role, community_id')
            .eq('id', user.id)
            .single();

        if (profile?.role !== 'admin') {
            return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
        }

        const body = await request.json();
        const rawResidents: IncomingResident[] = Array.isArray(body.residents) ? body.residents : [];
        const residents = rawResidents
            .map((resident: IncomingResident) => ({
                name: String(resident.name || '').trim(),
                unit_id: String(resident.unit_id || '').trim(),
                email: String(resident.email || '').trim(),
                phone: String(resident.phone || '').trim(),
            }))
            .filter((resident) => resident.name && resident.unit_id);

        if (residents.length === 0) {
            return NextResponse.json({ error: 'Payload vacio o invalido.' }, { status: 400 });
        }

        const communityId = profile.community_id;
        let successCount = 0;
        let errorCount = 0;

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        for (const resident of residents) {
            try {
                let finalUnitId: string | null = null;

                const { data: existingUnit } = await supabaseAdmin
                    .from('units')
                    .select('id')
                    .eq('community_id', communityId)
                    .eq('unit_number', resident.unit_id)
                    .maybeSingle();

                if (existingUnit) {
                    finalUnitId = existingUnit.id;
                } else {
                    const { data: newUnit, error: unitError } = await supabaseAdmin
                        .from('units')
                        .insert({
                            community_id: communityId,
                            unit_number: resident.unit_id,
                            created_by: user.id,
                        })
                        .select('id')
                        .single();

                    if (unitError || !newUnit) throw unitError || new Error('unit-create-failed');
                    finalUnitId = newUnit.id;
                }

                const profilePayload = {
                    full_name: resident.name,
                    role: 'resident',
                    community_id: communityId,
                    unit_id: finalUnitId,
                };

                const { data: existingProfile } = await supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .eq('community_id', communityId)
                    .eq('role', 'resident')
                    .eq('unit_id', finalUnitId)
                    .maybeSingle();

                const { error: profileError } = existingProfile
                    ? await supabaseAdmin
                        .from('profiles')
                        .update(profilePayload)
                        .eq('id', existingProfile.id)
                    : await supabaseAdmin
                        .from('profiles')
                        .insert({
                            id: crypto.randomUUID(),
                            ...profilePayload,
                        });

                if (profileError) throw profileError;
                successCount++;
            } catch (err) {
                errorCount++;
                console.error('[onboarding/upsert] row failed:', err);
            }
        }

        return NextResponse.json({
            message: 'Sincronizacion completada',
            processed: residents.length,
            success: successCount,
            errors: errorCount,
            destinations: ['profiles', 'units'],
        });
    } catch (error: unknown) {
        console.error('Upsert Error:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
