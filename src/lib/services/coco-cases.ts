/**
 * CocoCasesService: casos abiertos por CoCo.
 *
 * Extraído de `src/lib/api.ts`, que reexporta estos servicios para no
 * romper a quienes los importan desde `@/lib/api`.
 * Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';
import type {
    CocoCaseEvent,
    ResidentCasesSummary,
    User,
} from '../types';
import { mapCocoCase, mapCocoCaseEvent, uniqueCocoCases } from './coco-mappers';
import type { DbRow } from './db-row';

export const CocoCasesService = {
    async getResidentCases(user: Pick<User, "id" | "unitId">): Promise<ResidentCasesSummary> {
        const select = "id, title, type, category, urgency, action, status, reason, source_message, assistant_reply, unit_label, created_at, updated_at";
        const queries = [
            supabase
                .from("coco_cases")
                .select(select)
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .limit(30),
        ];

        if (user.unitId) {
            queries.push(
                supabase
                    .from("coco_cases")
                    .select(select)
                    .eq("unit_id", user.unitId)
                    .order("created_at", { ascending: false })
                    .limit(30)
            );
        }

        const results = await Promise.all(queries);
        for (const result of results) {
            if (result.error) throw result.error;
        }

        const cases = uniqueCocoCases(results.flatMap(result => ((result.data || []) as DbRow[]).map(mapCocoCase)));
        if (cases.length === 0) return { cases, eventsByCase: {} };

        const { data: events, error } = await supabase
            .from("coco_case_events")
            .select("id, case_id, event_type, from_status, to_status, body, actor_role, created_at")
            .in("case_id", cases.map(item => item.id))
            .order("created_at", { ascending: false });

        if (error) throw error;

        const eventsByCase = ((events || []) as DbRow[]).map(mapCocoCaseEvent).reduce<Record<string, CocoCaseEvent[]>>((acc, event) => {
            acc[event.case_id] ||= [];
            acc[event.case_id].push(event);
            return acc;
        }, {});

        return { cases, eventsByCase };
    },
};
