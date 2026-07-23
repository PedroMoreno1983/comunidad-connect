import { NextRequest, NextResponse } from 'next/server';
import { getRequestId, recordOperationEvent } from '@/lib/operations/audit';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import {
  compareSupermarketGroupOrder,
  createSupermarketGroupOrder,
  joinSupermarketGroupOrder,
  listSupermarketGroupOrders,
  lockSupermarketGroupOrder,
  parseGroupShoppingList,
} from '@/lib/supermarketGroupOrders';

export const runtime = 'nodejs';

function clean(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function statusFor(error: unknown): number {
  const message = error instanceof Error ? error.message : '';
  if (/no autorizado/i.test(message)) return 401;
  if (/solo quien|tu comunidad|no existe/i.test(message)) return 403;
  if (/vigente|catálogo|catalogo/i.test(message)) return 409;
  return 400;
}

export async function GET(request: NextRequest) {
  const limited = await enforceDistributedRateLimit(request, 'supermarket.group.read', { limit: 80, windowMs: 60_000 });
  if (limited) return limited;
  const profile = await getAuthenticatedAgentProfile();
  if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    return NextResponse.json({ orders: await listSupermarketGroupOrders(profile) });
  } catch (error) {
    console.error('[supermarket-group] list failed', error);
    return NextResponse.json({ error: 'No se pudieron cargar las compras grupales.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const limited = await enforceDistributedRateLimit(request, 'supermarket.group.write', { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const profile = await getAuthenticatedAgentProfile();
  if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = clean(body.action, 20);
  const orderId = clean(body.orderId, 80);

  try {
    if (action === 'compare') {
      return NextResponse.json({ comparisons: await compareSupermarketGroupOrder(profile, orderId) });
    }

    let order;
    if (action === 'create') {
      order = await createSupermarketGroupOrder(profile, {
        title: clean(body.title, 120),
        closesAt: clean(body.closesAt, 10),
        items: parseGroupShoppingList(clean(body.shoppingList, 1_500)),
      });
    } else if (action === 'join') {
      order = await joinSupermarketGroupOrder(
        profile,
        orderId,
        parseGroupShoppingList(clean(body.shoppingList, 1_500)),
      );
    } else if (action === 'lock') {
      order = await lockSupermarketGroupOrder(profile, orderId);
    } else {
      return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });
    }

    const audit = await recordOperationEvent({
      communityId: profile.community_id,
      actorId: profile.id,
      actorRole: profile.role,
      action: `supermarket.group.${action}`,
      entityType: 'supermarket_group_order',
      entityId: order.id,
      severity: 'success',
      status: 'success',
      summary: action === 'create'
        ? 'Compra grupal creada'
        : action === 'join'
          ? 'Aporte agregado a compra grupal'
          : 'Compra grupal preparada para el supermercado',
      metadata: {
        title: order.title,
        members: order.members.length,
        items: order.items.length,
        selectedStore: order.selectedStore || null,
        selectedTotal: order.selectedTotal || null,
      },
      requestId: getRequestId(request),
    });
    if (!audit.ok) {
      console.error('[supermarket-group] audit failed', audit.reason);
      return NextResponse.json({ error: 'La acción se guardó, pero no pudo certificarse en auditoría.' }, { status: 500 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo completar la acción.';
    console.warn('[supermarket-group] action failed', { action, message });
    return NextResponse.json({ error: message }, { status: statusFor(error) });
  }
}
