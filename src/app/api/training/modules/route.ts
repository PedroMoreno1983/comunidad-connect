import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function getSupabase() {
    const cookieStore = await cookies();
    return createServerClient(
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
                        // Ignore headers error in Server Components
                    }
                },
            },
        }
    );
}

export async function GET() {
    try {
        const supabase = await getSupabase();
        const { data: modules, error } = await supabase
            .from('training_modules')
            .select(`
                *,
                training_lessons (
                    id, title, content
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json(modules);
    } catch (error: any) {
        console.error("Error fetching modules:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const supabase = await getSupabase();
        
        // Ensure user is authenticated
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        }

        // Obtener el community_id y verificar si es administrador
        const { data: profile } = await supabase
            .from('profiles')
            .select('role, community_id')
            .eq('id', user.id)
            .single();

        if (!profile || profile.role !== 'admin') {
            return NextResponse.json({ error: "Permisos insuficientes o no es administrador." }, { status: 403 });
        }

        const body = await req.json();
        const { title, description, target_audience, content } = body;

        if (!title || !content) {
            return NextResponse.json({ error: "Título y contenido son obligatorios" }, { status: 400 });
        }

        // 1. Crear el módulo
        const { data: modData, error: modError } = await supabase
            .from('training_modules')
            .insert({ 
                title, 
                description: description || '',
                target_audience: target_audience || 'all',
                is_active: true
            })
            .select()
            .single();

        if (modError) {
            console.error("Supabase Error Details:", modError);
            throw new Error(`DB Error: ${modError.message} | Details: ${modError.details || 'n/a'} | Hint: ${modError.hint || 'n/a'}`);
        }

        // 2. Crear la lección asociada
        const { error: lessonError } = await supabase
            .from('training_lessons')
            .insert({
                module_id: modData.id,
                title: "Lección Principal",
                content,
                order_index: 0
            });

        if (lessonError) throw lessonError;

        return NextResponse.json({ success: true, module: modData });

    } catch (error: any) {
        console.error("Error creating module:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const supabase = await getSupabase();
        const url = new URL(req.url);
        const id = url.searchParams.get('id');

        if (!id) return NextResponse.json({ error: "No ID provided" }, { status: 400 });

        const { data, error } = await supabase
            .from('training_modules')
            .delete()
            .eq('id', id)
            .select();

        if (error) throw error;
        
        if (!data || data.length === 0) {
            return NextResponse.json({ 
                error: "El motor de base de datos denegó la eliminación (No tienes una política RLS de DELETE). Igual que con el INSERT anterior, debes correr esto en el SQL Editor de Supabase:\n\nCREATE POLICY \"Enable Delete for Modules\" ON public.training_modules FOR DELETE TO authenticated USING (true);" 
            }, { status: 403 });
        }
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Error deleting module:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
