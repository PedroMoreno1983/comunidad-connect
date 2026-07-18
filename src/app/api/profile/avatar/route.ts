import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
]);

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'profile.avatar', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('avatar');
    if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Archivo no recibido.' }, { status: 400 });
    }

    const ext = ALLOWED_TYPES.get(file.type);
    if (!ext) {
        return NextResponse.json({ error: 'Formato no soportado. Usa JPG, PNG, WEBP o GIF.' }, { status: 400 });
    }

    if (file.size > MAX_AVATAR_BYTES) {
        return NextResponse.json({ error: 'La foto no puede superar 5 MB.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const path = `${user.id}/avatar.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
        .from('avatars')
        .upload(path, buffer, {
            contentType: file.type,
            upsert: true,
        });

    if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = admin.storage
        .from('avatars')
        .getPublicUrl(path);

    const { error: profileError } = await admin
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

    if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ avatarUrl: publicUrl });
}
