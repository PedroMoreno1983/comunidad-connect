import { describe, expect, it } from 'vitest';
import { classmateToneGuidance, practicePeersForRole, tutorToneGuidance } from '@/lib/training/tutorGuidance';

describe('tutor tone for the staff classroom', () => {
    it('keeps administración with committee peers, not the resident cast', () => {
        const names = practicePeersForRole('admin').map(peer => peer.name);
        expect(names).toEqual(['Jorge', 'Doña Marta']);
        const guidance = tutorToneGuidance('admin', { title: 'Recibir una encomienda', lead: '', bullets: [], notes: '' });
        expect(guidance).toContain('administración');
        expect(guidance).toContain('Recibir una encomienda');
        expect(guidance).toContain('ya está proyectada');
        expect(guidance).not.toMatch(/Camilo|María/);
    });

    it('keeps conserjería with the concierge peer', () => {
        expect(practicePeersForRole('concierge').map(peer => peer.name)).toEqual(['Don Carlos', 'Doña Marta']);
        expect(tutorToneGuidance('concierge')).toContain('conserjería');
        expect(classmateToneGuidance('Don Carlos', 'Turno de recepción')).toContain('Don Carlos');
        expect(classmateToneGuidance('Don Carlos', 'Turno de recepción')).toContain('Turno de recepción');
    });
});
