/**
 * PollsService: votaciones comunitarias.
 *
 * Extraído de `src/lib/api.ts`, que reexporta estos servicios para no
 * romper a quienes los importan desde `@/lib/api`.
 * Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';
import type {
    PollVoteRecord,
} from '../types';

// ==========================================
// POLLS & VOTING
// ==========================================
export const PollsService = {
    /**
     * Todas las votaciones, sin filtrar. Es la vista de administración: quien
     * las gestiona necesita ver también las cerradas y las vencidas.
     *
     * Los residentes deben usar getActivePolls/getClosedPolls, que aplican el
     * filtro de plazo.
     */
    async getAllPolls() {
        const { data: polls, error } = await supabase
            .from('polls')
            .select(`
                *,
                options:poll_options(*)
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching all polls:', error);
            throw error;
        }

        return polls;
    },

    /**
     * Votaciones abiertas de verdad: status 'active' Y con plazo vigente.
     *
     * Sin la condición de fecha, una votación cuyo plazo venció seguía contando
     * como activa porque nada en el sistema cambia su status al cerrarse. El
     * centro de votación mostraba "6 consultas activas, cierran pronto" mientras
     * cada tarjeta decía "Finalizada" (la tarjeta sí calculaba por fecha), y CoCo
     * las ofrecía para votar. El filtro va acá para que valga en todos los
     * consumidores, no solo en la página.
     */
    async getActivePolls() {
        const { data: polls, error } = await supabase
            .from('polls')
            .select(`
                *,
                options:poll_options(*),
                votes:poll_votes(option_id)
            `)
            .eq('status', 'active')
            .gte('end_date', new Date().toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error fetching polls:", error);
            throw error;
        }

        return polls;
    },

    /**
     * Cerradas: las marcadas 'closed' más las que quedaron 'active' con el plazo
     * vencido. Sin la segunda mitad esas votaciones desaparecían de la pantalla
     * al arreglar getActivePolls, en vez de pasar al historial.
     */
    async getClosedPolls() {
        const { data: polls, error } = await supabase
            .from('polls')
            .select(`
                *,
                options:poll_options(*),
                votes:poll_votes(option_id)
            `)
            .or(`status.eq.closed,and(status.eq.active,end_date.lt.${new Date().toISOString()})`)
            .order('end_date', { ascending: false });

        if (error) {
            console.error("Error fetching closed polls:", error);
            throw error;
        }

        return polls;
    },

    async submitVote(pollId: string, optionId: string, userId: string) {
        // Compatibilidad legacy: algunos votos antiguos llegan con UUID local.
        const { data, error } = await supabase
            .from('poll_votes')
            .insert({
                poll_id: pollId,
                option_id: optionId,
                user_id: userId
            })
            .select()
            .single();

        if (error) {
            console.error("Error submitting vote:", error);
            throw error;
        }

        return data;
    },

    async hasUserVoted(pollId: string, userId: string) {
        const { data, error } = await supabase
            .from('poll_votes')
            .select('id, option_id')
            .eq('poll_id', pollId)
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            console.error("Error checking vote status:", error);
            return null; // Asumir no votado en caso de error para no bloquear UI brutalmente
        }
        return data;
    },

    async getUserVotes(pollIds: string[], userId: string): Promise<PollVoteRecord[]> {
        if (pollIds.length === 0) return [];
        const { data, error } = await supabase
            .from('poll_votes')
            .select('poll_id, option_id')
            .eq('user_id', userId)
            .in('poll_id', pollIds);
        if (error) {
            console.error('Error loading user votes:', error);
            throw error;
        }
        return (data || []) as PollVoteRecord[];
    }
};
