import { describe, expect, it } from 'vitest';
import { slideTopic, splitComparison, splitLabeled } from '@/lib/training/slideVisual';

describe('training slide visuals', () => {
    it('picks a topic from the title first, then the lead', () => {
        expect(slideTopic('El turno se entrega por escrito')).toBe('logbook');
        expect(slideTopic('Filtración junto al tablero')).toBe('water');
        expect(slideTopic('Qué se dice en el pasillo')).toBe('communication');
        expect(slideTopic('Antes de soltar el puesto')).toBe('shift');
        expect(slideTopic('Introducción', 'Sin pistas aquí')).toBe('general');
    });

    it('splits "Label: text" bullets with short labels only', () => {
        expect(splitLabeled('Novedad: encomienda o visita.')).toEqual({ label: 'Novedad', text: 'encomienda o visita.' });
        expect(splitLabeled('No prometas hora de llegada.')).toEqual({ label: null, text: 'No prometas hora de llegada.' });
        expect(splitLabeled('Cuando llegues al edificio y veas que todo está en orden: anota.').label).toBeNull();
    });

    it('separates do and do-not bullets for comparison sections', () => {
        const result = splitComparison(['Indica el sector.', 'No comentes el origen.', 'Nunca des un plazo.', 'Repite el mismo dato.']);
        expect(result).toEqual({ doList: ['Indica el sector.', 'Repite el mismo dato.'], dont: ['No comentes el origen.', 'Nunca des un plazo.'], contrasted: true });
        expect(splitComparison(['Uno.', 'Dos.']).contrasted).toBe(false);
    });
});
