import { describe, expect, it } from 'vitest';
import { cronAccess } from '@/lib/cronAuth';

describe('cronAccess', () => {
  it('acepta el bearer que envía Vercel y el header manual', () => {
    expect(cronAccess('secreto', 'Bearer secreto', null)).toBe('ok');
    expect(cronAccess('secreto', null, 'secreto')).toBe('ok');
  });

  it('rechaza una llamada sin la clave y no abre el endpoint si la clave no existe', () => {
    expect(cronAccess('secreto', 'Bearer otra', null)).toBe('rejected');
    expect(cronAccess(undefined, null, null)).toBe('missing');
    expect(cronAccess('  ', 'Bearer ', null)).toBe('missing');
  });
});
