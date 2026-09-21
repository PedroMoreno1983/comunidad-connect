import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

// Solo se usa `.from()`: aceptar el cliente completo obliga a tipar cada query
// contra el esquema, y el cliente admin de estas rutas no lleva generics.
type AdminClient = Pick<SupabaseClient, 'from'>;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Unknown error');
  }
  return 'Unknown error';
}

function hasMissingColumnError(error: unknown, columnName: string) {
  return getErrorMessage(error).toLowerCase().includes(columnName.toLowerCase());
}

export function inferUnitDetails(rawNumber: string) {
  const normalized = rawNumber.trim().replace(/\s+/g, ' ');
  const towerMatch = normalized.match(/^(torre\s*)?([a-zA-Z])[-\s]?/i);
  const numericPart = normalized.match(/\d+/)?.[0] || '';
  const numericValue = Number(numericPart);
  const tower = towerMatch?.[2]?.toUpperCase() || 'A';
  const floor = Number.isFinite(numericValue) && numericValue >= 100
    ? Math.max(1, Math.floor(numericValue / 100))
    : 1;

  return {
    number: normalized,
    unit_number: normalized,
    tower,
    floor,
  };
}

export async function findCommunityUnit(
  supabaseAdmin: AdminClient,
  communityId: string,
  unitNumber: string,
): Promise<string | null> {
  const normalized = unitNumber.trim();
  if (!normalized) return null;

  const byNumber = await supabaseAdmin
    .from('units')
    .select('id')
    .eq('community_id', communityId)
    .eq('number', normalized)
    .maybeSingle();

  if (byNumber.error) throw byNumber.error;
  if (byNumber.data) return String(byNumber.data.id);

  const byUnitNumber = await supabaseAdmin
    .from('units')
    .select('id')
    .eq('community_id', communityId)
    .eq('unit_number', normalized)
    .maybeSingle();

  if (byUnitNumber.error && !hasMissingColumnError(byUnitNumber.error, 'unit_number')) {
    throw byUnitNumber.error;
  }
  return byUnitNumber.data ? String(byUnitNumber.data.id) : null;
}

export async function findOrCreateCommunityUnit(
  supabaseAdmin: AdminClient,
  communityId: string,
  unitNumber: string,
): Promise<string> {
  const existing = await findCommunityUnit(supabaseAdmin, communityId, unitNumber);
  if (existing) return existing;

  const details = inferUnitDetails(unitNumber);
  const payload = {
    community_id: communityId,
    number: details.number,
    unit_number: details.unit_number,
    tower: details.tower,
    floor: details.floor,
  };

  const withUnitNumber = await supabaseAdmin
    .from('units')
    .insert(payload)
    .select('id')
    .single();

  if (!withUnitNumber.error && withUnitNumber.data) return String(withUnitNumber.data.id);
  if (!hasMissingColumnError(withUnitNumber.error, 'unit_number')) throw withUnitNumber.error;

  const withoutUnitNumber = await supabaseAdmin
    .from('units')
    .insert({
      community_id: communityId,
      number: details.number,
      tower: details.tower,
      floor: details.floor,
    })
    .select('id')
    .single();

  if (withoutUnitNumber.error || !withoutUnitNumber.data) {
    throw withoutUnitNumber.error || new Error('unit-create-failed');
  }
  return String(withoutUnitNumber.data.id);
}
