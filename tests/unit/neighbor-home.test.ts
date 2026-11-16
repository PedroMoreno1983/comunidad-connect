/**
 * El inicio de un residente en modo vecino mostraba gastos, reservas y visitas:
 * pantallas que en modo vecino son un muro. Los primeros residentes entraron
 * unos minutos y no volvieron. Este test fija que el inicio de modo vecino no
 * lleve a ninguna pantalla bloqueada y que ofrezca CoCo con preguntas listas.
 */

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('next/link', () => ({
    default: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement('a', { href, ...rest }, children as never),
}));

import { NeighborHome } from '@/components/home/NeighborHome';
import { neighborModeGateFor } from '@/lib/neighborMode';

function render(pendingValidation = false) {
    return renderToStaticMarkup(createElement(NeighborHome, {
        firstName: 'Ana', buildingName: 'Edificio Prueba', pendingValidation, initials: 'AP',
    }));
}

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1].replace(/&amp;/g, '&'));

describe('inicio en modo vecino', () => {
    it('ningún enlace lleva a una pantalla bloqueada en modo vecino', () => {
        const blocked = hrefs(render()).filter(href => neighborModeGateFor(href.split('?')[0]));
        expect(blocked).toEqual([]);
    });

    it('no menciona gastos comunes ni reservas', () => {
        const html = render();
        expect(html).not.toMatch(/Gasto común|Pagar ahora|reservas activas/);
    });

    it('ofrece CoCo con preguntas que abren el chat respondiendo', () => {
        const starters = hrefs(render()).filter(href => href.startsWith('/chat?q='));
        expect(starters.length).toBeGreaterThanOrEqual(3);
    });

    it('explica la situación según el caso', () => {
        expect(render(false)).toContain('todavía no tiene administración en Convive');
        expect(render(true)).toContain('confirma que vives ahí');
    });
});
