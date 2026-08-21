/**
 * Mapeo de filas coco_cases / coco_case_events.
 * Lo usan MaintenanceService y CocoCasesService.
 */

import type { CocoCase, CocoCaseEvent } from '../types';
import { type DbRow, nullableText, textValue } from './db-row';

export function mapCocoCase(row: DbRow): CocoCase {
    return {
        id: textValue(row.id),
        title: textValue(row.title, "Caso operativo"),
        type: nullableText(row.type),
        category: textValue(row.category, "general"),
        urgency: (textValue(row.urgency, "media") as CocoCase["urgency"]),
        action: nullableText(row.action),
        status: (textValue(row.status, "open") as CocoCase["status"]),
        reason: nullableText(row.reason),
        source_message: textValue(row.source_message),
        assistant_reply: nullableText(row.assistant_reply),
        unit_label: nullableText(row.unit_label),
        created_at: textValue(row.created_at, new Date().toISOString()),
        updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
    };
}

export function mapCocoCaseEvent(row: DbRow): CocoCaseEvent {
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

export function uniqueCocoCases(cases: CocoCase[]) {
    return Array.from(new Map(cases.map(item => [item.id, item])).values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
