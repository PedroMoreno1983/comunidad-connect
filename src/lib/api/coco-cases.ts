import { supabase } from '../supabase';
import { CocoCase, CocoCaseEvent, ResidentCasesSummary, User } from '../types';
import { DbRow, nullableText, textValue, mapCocoCase } from './_shared';

function mapCocoCaseEvent(row: DbRow): CocoCaseEvent {
    return {
        id: textValue(row.id),
        case_id: textValue(row.case_id),
        event_type: (textValue(row.event_type, "system") as CocoCaseEvent["event_type"]),
        from_status: nullableText(row.from_status),
        to_status: nullableText(row.to_status),
        body: nullableText(row.body),
        actor_role: nullableText(row.actor_role),
        created_at: textValue(row.created_at, new Date().toISOString()),
    };
}

function uniqueCocoCases(cases: CocoCase[]) {
    return Array.from(new Map(cases.map(item => [item.id, item])).values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export const CocoCasesService = {
    async updateStatus(id: string, status: "open" | "in_progress" | "resolved" | "closed" | "cancelled") {
        const response = await fetch(`/api/coco/cases/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(typeof payload.error === "string" ? payload.error : "No se pudo actualizar el caso.");
        }
        return payload;
    },

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

// ==========================================
// Water Consumption API
// ==========================================
