import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Servidor solo: asume que usas las variables del servidor para Supabase (ideal para backend)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
    try {
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

        if (modError) throw modError;

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
        const url = new URL(req.url);
        const id = url.searchParams.get('id');

        if (!id) return NextResponse.json({ error: "No ID provided" }, { status: 400 });

        const { error } = await supabase
            .from('training_modules')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Error deleting module:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
