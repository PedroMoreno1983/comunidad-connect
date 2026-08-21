/**
 * Conserjería: invitaciones QR, visitas, encomiendas y resumen del turno.
 *
 * Extraído de `src/lib/services/supabaseServices.ts`. Se importa desde
 * `@/lib/api`. Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';
import type {
    ConciergeCaseRow,
    ConciergePackageRow,
    ConciergeVisitorRow,
    CreatePackageInput,
    Package as CommunityPackage,
    PackageDatabaseRow,
    PackageUnitLookupRow,
    VisitorLogDatabaseRow,
} from '../types';

export const InvitationService = {
    async getByResident(residentId: string) {
        const { data, error } = await supabase
            .from('qr_invitations')
            .select('*')
            .eq('resident_id', residentId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async create(invitation: {
        resident_id: string;
        unit_id?: string;
        guest_name: string;
        guest_dni?: string;
        qr_code: string;
        valid_from: string;
        valid_to: string;
    }) {
        const { data, error } = await supabase
            .from('qr_invitations')
            .insert(invitation)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async cancel(invitationId: string) {
        const { error } = await supabase
            .from('qr_invitations')
            .update({ status: 'cancelled' })
            .eq('id', invitationId);

        if (error) throw error;
    },
};

export const VisitorService = {
    async getAll(): Promise<VisitorLogDatabaseRow[]> {
        const { data, error } = await supabase
            .from('visitor_logs')
            .select(`
        *,
        units:unit_id (number)
      `)
            .order('entry_time', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    async register(visitor: {
        visitor_name: string;
        unit_id?: string;
        purpose?: string;
        registered_by: string;
        is_qr?: boolean;
    }) {
        const { data, error } = await supabase
            .from('visitor_logs')
            .insert(visitor)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async redeemInvitation(qrCode: string, registeredBy: string) {
        const normalizedCode = qrCode.trim().toUpperCase();
        if (!normalizedCode) return null;
        const now = new Date().toISOString();
        const { data: invitation, error: invitationError } = await supabase
            .from('qr_invitations')
            .select('id, guest_name, guest_dni, unit_id, valid_to, units:unit_id (number)')
            .eq('qr_code', normalizedCode)
            .eq('status', 'active')
            .lte('valid_from', now)
            .gte('valid_to', now)
            .maybeSingle();
        if (invitationError) throw invitationError;
        if (!invitation) return null;
        const { data: consumed, error: consumeError } = await supabase
            .from('qr_invitations')
            .update({ status: 'used', used_at: now })
            .eq('id', invitation.id)
            .eq('status', 'active')
            .select('id')
            .maybeSingle();
        if (consumeError) throw consumeError;
        if (!consumed) return null;
        try {
            const log = await this.register({
                visitor_name: invitation.guest_name,
                unit_id: invitation.unit_id || undefined,
                registered_by: registeredBy,
                is_qr: true,
            });
            return { invitation, log };
        } catch (error) {
            await supabase.from('qr_invitations').update({ status: 'active', used_at: null }).eq('id', invitation.id).eq('status', 'used');
            throw error;
        }
    },
    async registerExit(visitorId: string) {
        const { error } = await supabase
            .from('visitor_logs')
            .update({ exit_time: new Date().toISOString() })
            .eq('id', visitorId);

        if (error) throw error;
    },
};

function mapPackage(row: PackageDatabaseRow): CommunityPackage {
    return {
        id: row.id,
        recipientUnitId: row.recipient_unit_id,
        recipientUnitNumber: row.units?.number || undefined,
        description: row.description || 'Encomienda sin descripcion',
        receivedAt: row.received_at || new Date().toISOString(),
        pickedUpAt: row.picked_up_at || undefined,
        status: row.status === 'picked-up' ? 'picked-up' : 'pending',
    };
}

async function loadPackagesForUnit(unitId?: string): Promise<CommunityPackage[]> {
    let query = supabase
        .from('packages')
        .select('id, recipient_unit_id, description, received_at, picked_up_at, status, community_id')
        .order('received_at', { ascending: false });

    if (unitId) query = query.eq('recipient_unit_id', unitId);
    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []) as PackageDatabaseRow[];
    const unitIds = Array.from(new Set(rows.map(row => row.recipient_unit_id).filter(Boolean)));
    if (unitIds.length === 0) return rows.map(mapPackage);

    const { data: units, error: unitsError } = await supabase
        .from('units')
        .select('id, number')
        .in('id', unitIds);
    if (unitsError) throw unitsError;

    const unitNumberById = new Map(
        ((units || []) as PackageUnitLookupRow[]).map(unit => [unit.id, unit.number || undefined])
    );
    return rows.map(row => mapPackage({
        ...row,
        units: { number: unitNumberById.get(row.recipient_unit_id) },
    }));
}

export const PackageService = {
    async getAll(): Promise<CommunityPackage[]> {
        return loadPackagesForUnit();
    },

    async getMine(unitId: string): Promise<CommunityPackage[]> {
        return loadPackagesForUnit(unitId);
    },

    async register(input: CreatePackageInput): Promise<CommunityPackage> {
        const { data, error } = await supabase
            .from('packages')
            .insert({
                recipient_unit_id: input.recipientUnitId,
                description: input.description,
                community_id: input.communityId,
            })
            .select('id, recipient_unit_id, description, received_at, picked_up_at, status, community_id')
            .single();

        if (error) throw error;

        const unit = await supabase.from('units').select('id, number').eq('id', input.recipientUnitId).maybeSingle();
        if (unit.error) throw unit.error;
        return mapPackage({
            ...(data as unknown as PackageDatabaseRow),
            units: { number: unit.data?.number || undefined },
        });
    },

    async markPickedUp(packageId: string) {
        const { error } = await supabase
            .from('packages')
            .update({
                status: 'picked-up',
                picked_up_at: new Date().toISOString(),
            })
            .eq('id', packageId);

        if (error) throw error;
    },
};

export const ConciergeService = {
    async getDashboardOverview(): Promise<{
        visitors: ConciergeVisitorRow[];
        packages: ConciergePackageRow[];
        cases: ConciergeCaseRow[];
    }> {
        const [visitorsRes, packages, casesRes] = await Promise.all([
            supabase
                .from('visitor_logs')
                .select('id, visitor_name, unit_id, entry_time, exit_time, is_qr, units:unit_id (number)')
                .order('entry_time', { ascending: false })
                .limit(20),
            PackageService.getAll(),
            supabase
                .from('coco_cases')
                .select('id, title, category, urgency, status, created_at')
                .in('status', ['open', 'in_progress'])
                .order('created_at', { ascending: false })
                .limit(10),
        ]);

        if (visitorsRes.error) throw visitorsRes.error;
        if (casesRes.error) throw casesRes.error;

        return {
            visitors: (visitorsRes.data || []) as unknown as ConciergeVisitorRow[],
            packages: packages.slice(0, 20).map(item => ({
                id: item.id,
                recipient_unit_id: item.recipientUnitId,
                description: item.description,
                received_at: item.receivedAt,
                status: item.status,
                picked_up_at: item.pickedUpAt || null,
                units: { number: item.recipientUnitNumber || null },
            })),
            cases: casesRes.data || [],
        };
    },
};
