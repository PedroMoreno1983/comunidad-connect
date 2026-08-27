import { describe, expect, it } from 'vitest';
import { TOOL_DEFINITIONS, isToolAllowedForRole, MUTATING_TOOLS, describePendingAction } from '../../src/lib/coco/tools';

/**
 * CoCo no sabía nada de estacionamientos: tenía 35 herramientas y ninguna
 * del módulo, y el system prompt no lo mencionaba. Un residente que
 * preguntara por su estacionamiento no obtenía respuesta útil.
 *
 * Definir la herramienta no basta: si no está en RESIDENT_TOOLS,
 * isToolAllowedForRole la rechaza y CoCo la ignora en silencio. Ese es el
 * modo de fallo que estos tests vigilan.
 */
const HERRAMIENTAS_PARKING = ['get_my_parking', 'search_parking', 'book_parking'] as const;
const SOLO_LECTURA = ['get_my_parking', 'search_parking'] as const;

describe('CoCo conoce el módulo de estacionamientos', () => {
    const nombres = (TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(t => t.name);

    it.each(HERRAMIENTAS_PARKING)('%s está definida', (herramienta) => {
        expect(nombres).toContain(herramienta);
    });

    it.each(HERRAMIENTAS_PARKING)('%s es alcanzable por un residente', (herramienta) => {
        // Sin esto la herramienta existe pero CoCo nunca la ejecuta.
        expect(isToolAllowedForRole(herramienta, 'resident')).toBe(true);
    });

    it.each(HERRAMIENTAS_PARKING)('%s también sirve a staff', (herramienta) => {
        expect(isToolAllowedForRole(herramienta, 'admin')).toBe(true);
        expect(isToolAllowedForRole(herramienta, 'concierge')).toBe(true);
    });

    it('las de consulta no piden confirmación', () => {
        for (const herramienta of SOLO_LECTURA) {
            expect(MUTATING_TOOLS.has(herramienta)).toBe(false);
        }
    });

    it('reservar SÍ pide confirmación: compromete dinero', () => {
        // Si dejara de estar aquí, CoCo cobraría sin que el residente confirme.
        expect(MUTATING_TOOLS.has('book_parking')).toBe(true);
    });

    it('la confirmación de reserva muestra fechas legibles, no ISO', () => {
        const { title, summary } = describePendingAction('book_parking', {
            spot_id: 'abc',
            starts_at: '2026-09-14T09:00:00-03:00',
            ends_at: '2026-09-14T18:00:00-03:00',
        });
        expect(title).toMatch(/estacionamiento/i);
        expect(summary).not.toContain('T09:00:00');
        expect(summary).toMatch(/septiembre/i);
    });

    it('describen cuándo usarlas, para que el modelo las elija', () => {
        const definiciones = TOOL_DEFINITIONS as ReadonlyArray<{ name: string; description: string }>;
        for (const herramienta of HERRAMIENTAS_PARKING) {
            const def = definiciones.find(d => d.name === herramienta);
            expect(def?.description ?? '').toMatch(/estacionamiento/i);
        }
    });
});

describe('requiredMutationTool no confunde parking con amenidad', () => {
    it('no fuerza create_reservation cuando el mensaje es de estacionamiento', async () => {
        const { requiredMutationTool } = await import('../../src/lib/coco/agent');
        expect(requiredMutationTool('reservame un estacionamiento el viernes')).toBeUndefined();
        expect(requiredMutationTool('¿tengo estacionamiento? y hay alguno libre el viernes?')).toBeUndefined();
    });

    it('sigue forzando create_reservation para quincho/piscina', async () => {
        const { requiredMutationTool } = await import('../../src/lib/coco/agent');
        expect(requiredMutationTool('quiero reservar el quincho el sábado')).toBe('create_reservation');
    });
});
