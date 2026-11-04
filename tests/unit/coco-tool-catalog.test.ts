import { describe, expect, it } from 'vitest';
import { conflictingSharedTools, unifiedToolCatalog } from '@/lib/coco/toolCatalog';
import { isToolAllowedForRole, MUTATING_TOOLS } from '@/lib/coco/tools';

describe('catálogo único de herramientas', () => {
    it('no repite un nombre con riesgos distintos entre CoCo y el Agent Center', () => {
        expect(conflictingSharedTools()).toEqual([]);
    });

    it('incluye el chat y el Agent Center, y retomar una tarea es solo de administración', () => {
        const names = unifiedToolCatalog().map(entry => `${entry.source}:${entry.name}`);
        expect(names).toContain('coco:get_payment_status');
        expect(names).toContain('agent-center:run_playbook');
        expect(MUTATING_TOOLS.has('resume_agent_task')).toBe(true);
        expect(isToolAllowedForRole('resume_agent_task', 'admin')).toBe(true);
        expect(isToolAllowedForRole('resume_agent_task', 'resident')).toBe(false);
    });
});
