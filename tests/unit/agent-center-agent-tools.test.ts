/**
 * Herramientas nuevas del ciclo agentico (agentTools.ts): roles y aislamiento
 * por community_id. Corren contra un Supabase en memoria que aplica los
 * filtros de verdad y tiene datos de DOS comunidades: si una consulta olvida
 * acotar por comunidad, el test ve filas ajenas y falla.
 *
 * Las herramientas delegan en el executor de CoCo (estacionamientos,
 * votaciones), el ciclo de vida de tickets y las lecturas de communityResearch:
 * se ejecutan las piezas reales, no copias.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, fakeClient, type FakeDb } from '../fixtures/fakeSupabase';

const mocks = vi.hoisted(() => ({ db: null as unknown as FakeDb }));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => fakeClient(mocks.db),
    supabaseAdmin: new Proxy({}, { get: (_target, property) => (fakeClient(mocks.db) as Record<string | symbol, unknown>)[property] }),
}));

import { executeAgentTool, isAgentToolAllowedForRole, validateAgentToolArgs } from '@/lib/agent-center/agentTools';
import { loadLoopTask } from '@/lib/agent-center/agentLoopStore';
import type { AgentProfile } from '@/lib/agent-center/domain';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TICKET_A = id(1);
const TICKET_B = id(2);
const PROVIDER_A = id(3);
const PROVIDER_B = id(4);
const SPOT_A = id(5);
const SPOT_B = id(6);
const RESIDENT_B = id(7);
const POLL_A = id(8);
const POLL_B = id(9);

const adminA: AgentProfile = { id: id(10), name: 'Admin A', role: 'admin', community_id: A };
const conciergeA: AgentProfile = { id: id(11), name: 'Conserje A', role: 'concierge', community_id: A };
const residentA: AgentProfile = { id: id(12), name: 'Vecina A', role: 'resident', community_id: A };

const future = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const past = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

function seed() {
    return createFakeDb({
        service_requests: [
            { id: TICKET_A, community_id: A, status: 'pending', provider_id: null, user_id: residentA.id, description: 'Filtracion en bodega', preferred_date: '2020-01-01', created_at: past(40) },
            { id: TICKET_B, community_id: B, status: 'pending', provider_id: null, user_id: RESIDENT_B, description: 'Ticket de otra comunidad', preferred_date: null, created_at: past(90) },
        ],
        service_providers: [
            { id: PROVIDER_A, community_id: A, name: 'Gasfiter A', verified: true },
            { id: PROVIDER_B, community_id: B, name: 'Gasfiter B', verified: true },
        ],
        profiles: [
            { id: RESIDENT_B, community_id: B, role: 'resident', name: 'Residente B' },
            { id: residentA.id, community_id: A, role: 'resident', name: 'Vecina A', email: 'vecina@a.cl' },
        ],
        units: [
            { id: id(20), community_id: A, number: '101', tower: 'A' },
            { id: id(21), community_id: B, number: '101', tower: 'B' },
        ],
        parking_spots: [
            { id: SPOT_A, community_id: A, status: 'published', label: 'E-01' },
            { id: SPOT_B, community_id: B, status: 'published', label: 'Otro-01' },
        ],
        parking_bookings: [
            { id: id(30), community_id: A, spot_id: SPOT_A, status: 'confirmed', starts_at: future(30), ends_at: future(32), total_amount: 4000 },
            { id: id(31), community_id: B, spot_id: SPOT_B, status: 'confirmed', starts_at: future(30), ends_at: future(32), total_amount: 9000 },
        ],
        polls: [
            { id: POLL_A, community_id: A, status: 'active', title: 'Pintura', end_date: future(48), options: [{ id: id(40), text: 'Si' }] },
            { id: POLL_B, community_id: B, status: 'active', title: 'Votacion ajena', end_date: future(48), options: [] },
        ],
        poll_options: [
            { id: id(40), poll_id: POLL_A, text: 'Si', votes: 5 },
            { id: id(41), poll_id: POLL_B, text: 'No', votes: 99 },
        ],
    });
}

describe('Agent Center: herramientas del ciclo agentico', () => {
    beforeEach(() => {
        mocks.db = seed();
    });

    describe('permisos por rol', () => {
        it('un residente no puede usar herramientas de administracion ni de staff', async () => {
            for (const tool of ['create_poll', 'get_maintenance_backlog', 'update_maintenance_ticket', 'find_resident_or_unit']) {
                expect(isAgentToolAllowedForRole(tool, 'resident')).toBe(false);
                await expect(executeAgentTool(tool, {}, residentA)).rejects.toThrow('Tu rol no permite');
            }
            expect(mocks.db.updates.filter(update => update.table === 'service_requests')).toHaveLength(0);
        });

        it('conserjeria gestiona tickets pero no crea votaciones', () => {
            expect(isAgentToolAllowedForRole('update_maintenance_ticket', 'concierge')).toBe(true);
            expect(isAgentToolAllowedForRole('create_poll', 'concierge')).toBe(false);
        });

        it('un residente solo puede reservar estacionamiento para si mismo', () => {
            expect(() => validateAgentToolArgs('create_parking_booking', {
                spotId: SPOT_A, startsAt: future(2), endsAt: future(4), residentId: RESIDENT_B,
            }, residentA)).toThrow('Solo puedes reservar estacionamiento para ti');
        });
    });

    describe('nada cruza de community_id', () => {
        it('el backlog de mantencion solo trae tickets de la comunidad del perfil', async () => {
            const result = await executeAgentTool('get_maintenance_backlog', {}, adminA);
            const data = result.data as { oldest: Array<{ ticketId: string; ageDays: number; overdue: boolean }> };
            expect(data.oldest.map(ticket => ticket.ticketId)).toEqual([TICKET_A]);
            expect(data.oldest[0].ageDays).toBeGreaterThanOrEqual(40);
            expect(data.oldest[0].overdue).toBe(true);
        });

        it('no actualiza un ticket de otra comunidad', async () => {
            await expect(executeAgentTool('update_maintenance_ticket', { ticketId: TICKET_B, status: 'accepted' }, adminA))
                .rejects.toThrow('no existe en tu comunidad');
            expect(mocks.db.tables.service_requests.find(row => row.id === TICKET_B)?.status).toBe('pending');
        });

        it('no asigna un proveedor de otra comunidad', async () => {
            await expect(executeAgentTool('update_maintenance_ticket', { ticketId: TICKET_A, providerId: PROVIDER_B }, conciergeA))
                .rejects.toThrow('proveedor no existe en tu comunidad');
            expect(mocks.db.tables.service_requests.find(row => row.id === TICKET_A)?.provider_id).toBeNull();
        });

        it('asigna un proveedor verificado propio respetando el ciclo de vida del ticket', async () => {
            const result = await executeAgentTool('update_maintenance_ticket', { ticketId: TICKET_A, providerId: PROVIDER_A, status: 'accepted' }, conciergeA);
            expect(result.message).toContain('Gasfiter A');
            expect(mocks.db.tables.service_requests.find(row => row.id === TICKET_A)).toMatchObject({ provider_id: PROVIDER_A, status: 'accepted' });
            expect(mocks.db.tables.service_requests.find(row => row.id === TICKET_B)?.provider_id).toBeNull();
            // Un salto que requestLifecycle no permite se rechaza.
            await expect(executeAgentTool('update_maintenance_ticket', { ticketId: TICKET_A, status: 'pending' }, adminA))
                .rejects.toThrow();
        });

        it('estacionamientos: disponibilidad y reservas solo de la comunidad propia', async () => {
            const result = await executeAgentTool('get_parking_status', { startsAt: future(1), endsAt: future(3) }, adminA);
            const data = result.data as { available: Array<{ id: string }>; bookings: Array<{ bookingId: string; totalAmount: number }> };
            expect(data.available.map(spot => spot.id)).toEqual([SPOT_A]);
            expect(data.bookings.map(booking => booking.bookingId)).toEqual([id(30)]);
        });

        it('no reserva estacionamiento a nombre de un residente de otra comunidad', async () => {
            await expect(executeAgentTool('create_parking_booking', {
                spotId: SPOT_A, startsAt: future(2), endsAt: future(4), residentId: RESIDENT_B,
            }, conciergeA)).rejects.toThrow('no pertenece a tu comunidad');
            expect(mocks.db.rpcCalls).toHaveLength(0);
        });

        it('reserva estacionamiento reutilizando la RPC de CoCo con el conductor correcto', async () => {
            mocks.db.rpc = async () => ({ data: id(50), error: null });
            mocks.db.tables.parking_bookings.push({ id: id(50), community_id: A, spot_id: SPOT_A, status: 'confirmed', starts_at: future(2), ends_at: future(4), total_amount: 3000, access_code: 'X1' });
            const result = await executeAgentTool('create_parking_booking', { spotId: SPOT_A, startsAt: future(2), endsAt: future(4) }, residentA);
            expect(mocks.db.rpcCalls).toEqual([expect.objectContaining({ name: 'coco_create_parking_booking', args: expect.objectContaining({ p_user_id: residentA.id, p_spot_id: SPOT_A }) })]);
            expect(result.entityId).toBe(id(50));
        });

        it('votaciones activas: solo las de la comunidad, con votos acumulados', async () => {
            const result = await executeAgentTool('get_active_polls', {}, residentA);
            const data = result.data as { polls: Array<{ pollId: string; totalVotes: number; leading: string }> };
            expect(data.polls).toEqual([expect.objectContaining({ pollId: POLL_A, totalVotes: 5, leading: 'Si' })]);
        });

        it('una tarea agentica de otra comunidad no existe para el perfil', async () => {
            mocks.db.tables.agent_tasks = [{
                id: id(60), community_id: B, playbook_key: 'agentic_loop', agent_key: 'maintenance', status: 'waiting_human', updated_at: past(0),
                context: { loop: { messages: [], stepsUsed: 1, nextPosition: 1, trace: [], pending: null, runId: null, goal: 'x' } },
            }];
            expect(await loadLoopTask(adminA, id(60))).toBeNull();
            expect(await loadLoopTask({ ...adminA, community_id: B }, id(60))).not.toBeNull();
        });
    });
});
