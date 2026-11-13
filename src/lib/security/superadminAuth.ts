import 'server-only';

import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { hasSuperAdminConfig, isSuperAdminEmail } from '@/lib/security/superadmin';

/** Usuario superadmin de la sesión, o la respuesta de error para devolver. */
export async function requireSuperAdmin(): Promise<{ user: User; error?: undefined } | { user?: undefined; error: NextResponse }> {
    if (!hasSuperAdminConfig()) {
        return { error: NextResponse.json({ error: 'Superadmin no configurado' }, { status: 503 }) };
    }
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email || !isSuperAdminEmail(user.email)) {
        return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
    }
    return { user };
}
