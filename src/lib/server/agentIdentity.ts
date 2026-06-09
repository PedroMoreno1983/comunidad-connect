import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { UserRole } from '@/lib/types';

export type ServerAgentProfile = {
    id: string;
    name?: string | null;
    email?: string | null;
    role: UserRole;
    unit_id?: string | null;
    community_id?: string | null;
};

export async function getSupabaseUserClient() {
    const cookieStore = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => cookieStore.getAll(),
                setAll: () => {},
            },
        }
    );
}

function normalizeRole(value?: string | null): UserRole {
    return value === 'admin' || value === 'concierge' ? value : 'resident';
}

export async function getAuthenticatedAgentProfile(): Promise<ServerAgentProfile | null> {
    const supabaseUser = await getSupabaseUserClient();
    const { data: { user }, error } = await supabaseUser.auth.getUser();
    if (error || !user) return null;

    const { data: profile } = await getSupabaseAdmin()
        .from('profiles')
        .select('id, name, email, role, unit_id, community_id')
        .eq('id', user.id)
        .maybeSingle();

    if (!profile) return null;

    return {
        id: String(profile.id),
        name: typeof profile.name === 'string' ? profile.name : null,
        email: typeof profile.email === 'string' ? profile.email : user.email ?? null,
        role: normalizeRole(typeof profile.role === 'string' ? profile.role : null),
        unit_id: typeof profile.unit_id === 'string' ? profile.unit_id : null,
        community_id: typeof profile.community_id === 'string' ? profile.community_id : null,
    };
}

