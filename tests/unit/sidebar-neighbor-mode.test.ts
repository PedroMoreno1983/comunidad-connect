import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { neighborModeGateFor } from '@/lib/neighborMode';

describe('menú en modo vecino', () => {
  it('oculta las pantallas que dependen de la administración', () => {
    const sidebar = readFileSync(path.join(process.cwd(), 'src/components/cc/Sidebar.tsx'), 'utf8');
    expect(sidebar).toContain('activeUser.communityManaged === false && neighborModeGateFor(link.href)');
  });

  it('bloquea gastos, agua, encomiendas, invitaciones y casos, pero no lo que funciona sin administración', () => {
    for (const href of ['/expenses', '/resident/consumo', '/resident/packages', '/resident/invitations', '/resident/cases', '/feed', '/amenities', '/votaciones/asambleas', '/estacionamientos', '/convivencia']) {
      expect(neighborModeGateFor(href), href).not.toBeNull();
    }
    for (const href of ['/home', '/chat', '/marketplace', '/marketplace?view=mine', '/resident/supermercado', '/services', '/directorio', '/profile', '/notifications']) {
      expect(neighborModeGateFor(href), href).toBeNull();
    }
  });
});
