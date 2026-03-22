import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            )
                        } catch {
                            // The `setAll` method was called from a Server Component.
                            // This can be ignored if you have middleware refreshing
                            // user sessions.
                        }
                    },
                },
            }
        );

        // Validar ADMIN
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
        const residents = body.residents; // Array of { name, unit_id, email, phone }

        if (!Array.isArray(residents) || residents.length === 0) {
            return NextResponse.json({ error: 'Payload vacío o inválido.' }, { status: 400 });
        }

        const communityId = profile.community_id;
        let successCount = 0;
        let errorCount = 0;

        // Cliente bypass de RLS
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Por cada residente extraído
        // Nota: en un sistema empresarial masivo real, esto se hace con bulk upserts,
        // pero dado que necesitamos crear/asegurar Unidades primero, se hace iterativo.
        for (const res of residents) {
            try {
                // 1. Asegurar Unit (Unidad/Departamento) usando Service Role
                let finalUnitId = null;
                if (res.unit_id && res.unit_id.trim() !== '') {
                    // Buscar si existe
                    const { data: existingUnit } = await supabaseAdmin
                        .from('units')
                        .select('id')
                        .eq('community_id', communityId)
                        .eq('unit_number', res.unit_id.trim())
                        .single();

                    if (existingUnit) {
                        finalUnitId = existingUnit.id;
                    } else {
                        // Crear unidad
                        const { data: newUnit, error: unitError } = await supabaseAdmin
                            .from('units')
                            .insert({
                                community_id: communityId,
                                unit_number: res.unit_id.trim(),
                                created_by: user.id
                            })
                            .select()
                            .single();
                        
                        if (!unitError && newUnit) finalUnitId = newUnit.id;
                    }
                }

                // 2. Upsert del Residente en Supabase Auth via Edge/Admin Bypass
                // Lo guardamos directamente como perfil usando el Service Role.
                const { error: profileError } = await supabaseAdmin
                    .from('profiles')
                    .insert({
                        id: crypto.randomUUID(), // ID Autogenerado para cuentas Offline
                        full_name: res.name.trim(),
                        role: 'resident',
                        community_id: communityId,
                    });
                
                if (profileError) {
                    throw profileError;
                }
                
                successCount++;
            } catch (err) {
                errorCount++;
                console.error("Error injectando fila:", err);
            }
        }

        return NextResponse.json({ 
            message: 'Sincronización completada',
            processed: residents.length,
            success: successCount,
            errors: errorCount
        });

    } catch (error: any) {
        console.error('Upsert Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
