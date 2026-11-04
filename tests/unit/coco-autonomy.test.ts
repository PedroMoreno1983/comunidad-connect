import { describe, expect, it } from 'vitest';
import { canUndoCoCoEvent, cocoWriteLimit, cocoWritesAllowed } from '@/lib/coco/autonomy';

describe('límites y deshacer de CoCo', () => {
    it('el residente tiene un tope más bajo que el administrador', () => {
        expect(cocoWriteLimit('resident')).toBe(20);
        expect(cocoWriteLimit('concierge')).toBe(40);
        expect(cocoWriteLimit('admin')).toBe(80);
        expect(cocoWritesAllowed(19, 'resident')).toBe(true);
        expect(cocoWritesAllowed(20, 'resident')).toBe(false);
        expect(cocoWritesAllowed(20, 'admin')).toBe(true);
    });

    it('solo un recordatorio creado por CoCo se puede deshacer desde la pantalla', () => {
        expect(canUndoCoCoEvent('coco.tool.create_reminder', { result: { reminder_id: 'abc' } })).toEqual({
            kind: 'cancel_reminder',
            reminderId: 'abc',
        });
        expect(canUndoCoCoEvent('coco.tool.issue_billing', { result: { month: '2026-11' } })).toBeNull();
        expect(canUndoCoCoEvent('coco.tool.create_reminder', {})).toBeNull();
    });
});
