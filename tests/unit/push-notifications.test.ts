import { describe, expect, it } from 'vitest';
import { pushLinkFor } from '@/lib/push/links';
import { fcmMessageBody, readServiceAccount } from '@/lib/push/fcm';
import { isFreshEnough, PUSH_MAX_AGE_MS } from '@/lib/push/dispatch';

describe('notificaciones push', () => {
  it('solo deja abrir rutas internas al tocar el aviso', () => {
    expect(pushLinkFor('/expenses?unit=1')).toBe('/expenses?unit=1');
    expect(pushLinkFor('https://evil.com')).toBeNull();
    expect(pushLinkFor('//evil.com')).toBeNull();
    expect(pushLinkFor('/\\evil.com')).toBeNull();
    expect(pushLinkFor(null)).toBeNull();
  });

  it('arma el mensaje de FCM con canal, ícono y ruta', () => {
    const body = fcmMessageBody('tok', { notificationId: 'n1', title: 'Pago recibido', body: 'Gracias', link: '/expenses' });
    expect(body.message.token).toBe('tok');
    expect(body.message.notification).toEqual({ title: 'Pago recibido', body: 'Gracias' });
    expect(body.message.data).toEqual({ link: '/expenses', notificationId: 'n1' });
    expect(body.message.android.notification.channel_id).toBe('avisos');
  });

  it('sin enlace manda link vacío (FCM exige strings en data)', () => {
    expect(fcmMessageBody('t', { notificationId: 'n', title: 'a', body: 'b' }).message.data.link).toBe('');
  });

  it('lee la cuenta de servicio aunque Vercel guarde los saltos como \n', () => {
    const raw = JSON.stringify({ project_id: 'p', client_email: 'x@p.iam.gserviceaccount.com', private_key: 'A\\nB' });
    expect(readServiceAccount(raw)?.private_key).toBe('A\nB');
    expect(readServiceAccount(undefined)).toBeNull();
    expect(readServiceAccount('no json')).toBeNull();
    expect(readServiceAccount(JSON.stringify({ project_id: 'p' }))).toBeNull();
  });

  it('no envía avisos viejos', () => {
    const now = Date.parse('2026-11-15T12:00:00Z');
    expect(isFreshEnough('2026-11-15T11:55:00Z', now)).toBe(true);
    expect(isFreshEnough(new Date(now - PUSH_MAX_AGE_MS - 1).toISOString(), now)).toBe(false);
    expect(isFreshEnough('basura', now)).toBe(false);
  });
});
