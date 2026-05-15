import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getRequestId, recordOperationEvent } from '@/lib/operations/audit';

const VALID_STATUSES = ['available', 'reserved', 'sold', 'hidden'] as const;
type MarketplaceStatus = typeof VALID_STATUSES[number];

async function getSupabaseUserClient() {
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

async function getActorAndItem(id: string) {
    const supabaseUser = await getSupabaseUserClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !user) {
        return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    }

    const [{ data: actor, error: profileError }, { data: item, error: itemError }] = await Promise.all([
        supabaseAdmin
            .from('profiles')
            .select('id, role, community_id, name, email')
            .eq('id', user.id)
            .single(),
        supabaseAdmin
            .from('marketplace_items')
            .select('id, title, seller_id, status, community_id')
            .eq('id', id)
            .single(),
    ]);

    if (profileError || !actor) {
        return { error: NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 }) };
    }

    if (actor.email?.toLowerCase().endsWith('@demo.com')) {
        return {
            error: NextResponse.json(
                { error: 'Modo demo compartido: los cambios reales del marketplace estan deshabilitados.' },
                { status: 403 }
            ),
        };
    }

    if (itemError || !item) {
        return { error: NextResponse.json({ error: 'Publicacion no encontrada' }, { status: 404 }) };
    }

    if (item.community_id && actor.community_id && item.community_id !== actor.community_id) {
        return { error: NextResponse.json({ error: 'Publicacion pertenece a otra comunidad' }, { status: 403 }) };
    }

    const isOwner = item.seller_id === actor.id;
    const isAdmin = actor.role === 'admin';

    if (!isOwner && !isAdmin) {
        return { error: NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 }) };
    }

    return { actor, item, isAdmin };
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const body = await req.json();
        const status = body.status as MarketplaceStatus;

        if (!VALID_STATUSES.includes(status)) {
            return NextResponse.json({ error: 'Estado no valido' }, { status: 400 });
        }

        const context = await getActorAndItem(id);
        if (context.error) return context.error;

        if (status === 'hidden' && !context.isAdmin) {
            return NextResponse.json({ error: 'Solo administracion puede ocultar publicaciones' }, { status: 403 });
        }

        const { data: item, error } = await supabaseAdmin
            .from('marketplace_items')
            .update({ status })
            .eq('id', id)
            .select('*')
            .single();

        if (error || !item) {
            return NextResponse.json({ error: error?.message || 'No se pudo actualizar' }, { status: 500 });
        }

        if (context.isAdmin && context.item.seller_id && context.item.seller_id !== context.actor?.id) {
            await supabaseAdmin.from('notifications').insert({
                user_id: context.item.seller_id,
                type: status === 'hidden' ? 'warning' : 'info',
                category: 'marketplace',
                title: status === 'hidden' ? 'Publicacion ocultada' : 'Publicacion actualizada',
                body: `${context.item.title} ahora figura como ${status}.`,
                link: '/marketplace/my-listings',
                community_id: context.actor?.community_id,
            });
        }

        await recordOperationEvent({
            communityId: context.actor?.community_id,
            actorId: context.actor?.id,
            actorRole: context.actor?.role,
            action: 'marketplace_item.status_changed',
            entityType: 'marketplace_item',
            entityId: item.id,
            severity: status === 'hidden' ? 'warning' : 'success',
            status: status === 'hidden' ? 'blocked' : 'success',
            summary: `Publicacion ${context.item.title} cambiada a ${status}`,
            metadata: {
                previousStatus: context.item.status,
                nextStatus: status,
                sellerId: context.item.seller_id,
            },
            requestId: getRequestId(req),
        });

        return NextResponse.json({ item }, { status: 200 });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error desconocido' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const context = await getActorAndItem(id);
        if (context.error) return context.error;

        const { error } = await supabaseAdmin
            .from('marketplace_items')
            .delete()
            .eq('id', id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await recordOperationEvent({
            communityId: context.actor?.community_id,
            actorId: context.actor?.id,
            actorRole: context.actor?.role,
            action: 'marketplace_item.deleted',
            entityType: 'marketplace_item',
            entityId: id,
            severity: 'warning',
            status: 'success',
            summary: `Publicacion eliminada: ${context.item.title}`,
            metadata: {
                sellerId: context.item.seller_id,
                previousStatus: context.item.status,
            },
            requestId: getRequestId(req),
        });

        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error desconocido' },
            { status: 500 }
        );
    }
}
