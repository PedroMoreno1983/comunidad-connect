/** Tope de escrituras de CoCo por persona y día, según el rol. */
export const COCO_DAILY_WRITE_LIMIT: Record<string, number> = {
    resident: 20,
    concierge: 40,
    admin: 80,
};

export function cocoWriteLimit(role?: string): number {
    return COCO_DAILY_WRITE_LIMIT[role || ''] ?? COCO_DAILY_WRITE_LIMIT.resident;
}

export function cocoWritesAllowed(countToday: number, role?: string): boolean {
    return countToday < cocoWriteLimit(role);
}

export function canUndoCoCoEvent(action: string, metadata: unknown): { kind: 'cancel_reminder'; reminderId: string } | null {
    if (action !== 'coco.tool.create_reminder' && action !== 'coco.tool.schedule_community_notice') return null;
    const result = metadata && typeof metadata === 'object' ? (metadata as { result?: { reminder_id?: string } }).result : undefined;
    const reminderId = result?.reminder_id;
    if (!reminderId) return null;
    return { kind: 'cancel_reminder', reminderId };
}
