import { describe, expect, it } from 'vitest';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';
import { backgroundTaskSummary, parseDelegateNotice } from '@/lib/coco/delegatedTasks';
import { isToolAllowedForRole, MUTATING_TOOLS } from '@/lib/coco/tools';

describe('tareas en segundo plano', () => {
    it('avisa sin montos ni nombres y no cambia el aviso por defecto', () => {
        expect(parseDelegateNotice(undefined)).toBe('app');
        expect(parseDelegateNotice('both')).toBe('both');
        const text = backgroundTaskSummary('revisar la semana del comité', { assemblies: 1, bookings: 2 });
        expect(text).toContain('1 asamblea próxima');
        expect(text).toContain('2 reservas');
        expect(text).toContain('No cambié datos');
        expect(text).not.toMatch(/\$|deudor|moros/i);
    });

    it('solo la administración puede dejarla, y pide confirmación', () => {
        expect(MUTATING_TOOLS.has('delegate_background_task')).toBe(true);
        expect(cocoToolRisk('delegate_background_task')).toBe('write_high');
        expect(isToolAllowedForRole('delegate_background_task', 'admin')).toBe(true);
        expect(isToolAllowedForRole('delegate_background_task', 'resident')).toBe(false);
    });
});
