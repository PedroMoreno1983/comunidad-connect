import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { recordOperationEvent } from '@/lib/operations/audit';
import type { FinanceCommitteeMember, FinanceCommitteeResidentOption } from '@/lib/types';
import { BillingError } from './billingService';
import { todayInChile } from './chileDates';

export async function listCommitteeMembers(communityId: string): Promise<FinanceCommitteeMember[]> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('finance_committee_members')
        .select('id, resident_id, appointed_at, starts_on, ended_at, profiles!finance_committee_members_resident_id_fkey(name, email)')
        .eq('community_id', communityId).order('appointed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(row => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        return {
            id: String(row.id), residentId: String(row.resident_id),
            name: String(profile?.name || profile?.email || 'Residente'),
            email: String(profile?.email || ''), appointedAt: String(row.appointed_at),
            startsOn: String(row.starts_on), endedAt: row.ended_at ? String(row.ended_at) : null,
        };
    });
}

export async function activeCommitteeMembers(communityId: string): Promise<FinanceCommitteeResidentOption[]> {
    const today = todayInChile();
    const { data, error } = await getSupabaseAdmin().from('finance_committee_members')
        .select('resident_id, profiles!finance_committee_members_resident_id_fkey(id, name, email, role, community_id)')
        .eq('community_id', communityId).is('ended_at', null).lte('starts_on', today);
    if (error) throw error;
    return (data ?? []).flatMap(row => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        if (!profile || profile.role !== 'resident' || profile.community_id !== communityId) return [];
        return [{ id: String(profile.id), name: String(profile.name || profile.email || 'Residente'), email: String(profile.email || '') }];
    });
}

export async function requireActiveCommitteeMember(communityId: string, residentId: string) {
    const members = await activeCommitteeMembers(communityId);
    if (!members.some(member => member.id === residentId)) {
        throw new BillingError('not_committee_member', 'Esta decisión requiere un integrante vigente del comité.', 403);
    }
}

export async function appointCommitteeMember(communityId: string, adminId: string, residentId: string) {
    const admin = getSupabaseAdmin();
    const { data: resident, error: residentError } = await admin.from('profiles')
        .select('id, role').eq('id', residentId).eq('community_id', communityId).maybeSingle();
    if (residentError) throw residentError;
    if (!resident || resident.role !== 'resident') throw new BillingError('bad_member', 'Selecciona un residente de esta comunidad.', 403);
    const { data, error } = await admin.from('finance_committee_members').insert({
        community_id: communityId, resident_id: residentId, appointed_by: adminId, starts_on: todayInChile(),
    }).select('id').single();
    if (error?.code === '23505') throw new BillingError('already_member', 'Este residente ya integra el comité.', 409);
    if (error || !data) throw error || new Error('No se pudo designar al integrante.');
    await recordOperationEvent({ communityId, actorId: adminId, actorRole: 'admin',
        action: 'finance.committee_member_appointed', entityType: 'finance_committee_member', entityId: String(data.id),
        summary: 'Integrante del comité designado', metadata: { residentId },
    });
    return data;
}

export async function endCommitteeMembership(communityId: string, adminId: string, membershipId: string) {
    const { data, error } = await getSupabaseAdmin().from('finance_committee_members')
        .update({ ended_at: new Date().toISOString(), ended_by: adminId })
        .eq('id', membershipId).eq('community_id', communityId).is('ended_at', null)
        .select('id, resident_id').maybeSingle();
    if (error) throw error;
    if (!data) throw new BillingError('member_not_found', 'La designación ya no está vigente.', 404);
    await recordOperationEvent({ communityId, actorId: adminId, actorRole: 'admin',
        action: 'finance.committee_member_ended', entityType: 'finance_committee_member', entityId: membershipId,
        summary: 'Integrante del comité retirado', metadata: { residentId: data.resident_id },
    });
    return data;
}
