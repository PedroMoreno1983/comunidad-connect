import { describe, expect, it } from 'vitest';
import {
    PLATFORM_SCREENS,
    buildPlatformContext,
    findScreen,
    platformGuide,
    searchPlatformMap,
} from '@/lib/coco/platformMap';
import { getSafeCoCoNavigation } from '@/lib/coco/navigation';
import { TOOL_DEFINITIONS, MUTATING_TOOLS, isToolAllowedForRole, executeTool } from '@/lib/coco/tools';
import { FALLBACK_READ_ONLY_TOOLS } from '@/lib/ai/toolBridge';
import { isDashboardPathAllowedForRole } from '@/lib/roleAccess';

const routes = (screens: { route: string }[]) => screens.map(s => s.route);

describe('mapa de la plataforma de CoCo', () => {
    it('encuentra la pantalla actual, con alias, query y segmentos dinámicos', () => {
        expect(findScreen('/expenses')?.title).toBe('Mis Gastos');
        expect(findScreen('/resident/finances?mes=2026-10')?.route).toBe('/expenses');
        expect(findScreen('/estacionamientos?tab=admin')?.route).toBe('/estacionamientos');
        expect(findScreen('/services/provider/123')?.route).toBe('/services/provider/[id]');
        expect(findScreen('/no-existe')).toBeUndefined();
    });

    it('responde "¿cómo hago X?" con la pantalla correcta según el rol', () => {
        expect(searchPlatformMap('¿Cómo reservo el quincho?', 'resident')[0]?.route).toBe('/amenities');
        expect(searchPlatformMap('¿cómo invito a una visita?', 'resident')[0]?.route).toBe('/resident/invitations');
        expect(searchPlatformMap('¿Dónde registro una encomienda?', 'concierge')[0]?.route).toBe('/concierge/packages');
        expect(searchPlatformMap('¿cómo emito el gasto común del mes?', 'admin')[0]?.route).toBe('/admin/finanzas/egresos');
        expect(searchPlatformMap('¿cómo pago mis gastos comunes?', 'resident')[0]?.route).toBe('/expenses');
    });

    it('no ofrece pantallas que el rol no ve', () => {
        expect(routes(searchPlatformMap('emitir gasto común egresos prorrateo', 'resident'))).not.toContain('/admin/finanzas/egresos');
        expect(routes(searchPlatformMap('registrar visita', 'admin'))).not.toContain('/concierge');
        expect(routes(searchPlatformMap('supermercado jumbo', 'concierge'))).toEqual([]);
    });

    it('cada pantalla mapeada para un rol de cuenta es accesible para ese rol', () => {
        const accountRoles = ['resident', 'admin', 'concierge'] as const;
        for (const screen of PLATFORM_SCREENS) {
            if (screen.route.includes('[')) continue;
            for (const role of accountRoles) {
                if (!screen.roles.includes(role)) continue;
                expect(isDashboardPathAllowedForRole(screen.route, role), `${screen.route} para ${role}`).toBe(true);
            }
        }
    });

    it('marca las pantallas del comité al residente', () => {
        const guide = platformGuide('revisión del comité aprobar cobro', 'resident', '/expenses', 'https://conviveconnect.com');
        const hit = guide.resultados.find(r => r.ruta === '/expenses/committee-review');
        expect(hit?.solo_comite).toBe(true);
        expect(hit?.url).toBe('https://conviveconnect.com/expenses/committee-review');
        expect(guide.pantalla_actual).toBe('Mis Gastos (/expenses)');
    });

    it('el fragmento del prompt trae solo la pantalla actual y es corto', () => {
        const ctx = buildPlatformContext('/amenities', 'resident');
        expect(ctx).toContain('Espacios Comunes (/amenities)');
        expect(ctx).not.toContain('/admin/finanzas');
        expect(ctx.length).toBeLessThan(900);
    });

    it('las pantallas del mapa son destinos de navegación válidos; las ocultas no', () => {
        expect(getSafeCoCoNavigation('/estacionamientos')).toBe('/estacionamientos');
        expect(getSafeCoCoNavigation('/admin/finanzas/comite')).toBe('/admin/finanzas/comite');
        expect(getSafeCoCoNavigation('/showcase')).toBeUndefined();
        expect(getSafeCoCoNavigation('/superadmin')).toBeUndefined();
        expect(getSafeCoCoNavigation('/login')).toBeUndefined();
    });
});

describe('herramienta get_platform_guide', () => {
    it('existe, es de solo lectura y la ven todos los perfiles humanos', () => {
        expect((TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(t => t.name)).toContain('get_platform_guide');
        expect(MUTATING_TOOLS.has('get_platform_guide')).toBe(false);
        expect(FALLBACK_READ_ONLY_TOOLS).toContain('get_platform_guide');
        for (const role of ['resident', 'admin', 'concierge']) expect(isToolAllowedForRole('get_platform_guide', role)).toBe(true);
        expect(isToolAllowedForRole('get_platform_guide', 'system')).toBe(false);
    });

    it('devuelve pasos y enlace sin tocar la base', async () => {
        const result = await executeTool('get_platform_guide', { query: 'reservar el quincho' }, { role: 'resident', currentPage: '/home' }) as {
            resultados: { ruta: string; pasos: readonly string[] }[];
        };
        expect(result.resultados[0]?.ruta).toBe('/amenities');
        expect(result.resultados[0]?.pasos.length).toBeGreaterThan(0);
    });
});
