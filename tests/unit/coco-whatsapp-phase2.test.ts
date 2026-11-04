import { describe, expect, it } from 'vitest';
import { interpretCoCoConfirmation, whatsappPendingReply } from '@/lib/coco/confirmation';
import { planCoCoWhatsAppDelivery } from '@/lib/coco/whatsappDelivery';
import { mediaPublicUrl, signMediaAccess, verifyMediaAccess } from '@/lib/coco/outboundMedia';

describe('confirmación desde WhatsApp', () => {
    it('acepta apruebo y confirmo, y rechaza con rechazo o cancelo', () => {
        expect(interpretCoCoConfirmation('Apruebo.')).toBe('approved');
        expect(interpretCoCoConfirmation('confirmo')).toBe('approved');
        expect(interpretCoCoConfirmation('APROBAR')).toBe('approved');
        expect(interpretCoCoConfirmation('rechazo')).toBe('rejected');
        expect(interpretCoCoConfirmation('cancelo')).toBe('rejected');
        expect(interpretCoCoConfirmation('RECHAZAR')).toBe('rejected');
        expect(interpretCoCoConfirmation('hola')).toBeUndefined();
    });

    it('el mensaje de WhatsApp pide esas palabras', () => {
        const text = whatsappPendingReply(['Registrar reclamo: hay una gotera']);
        expect(text).toContain('apruebo');
        expect(text).toContain('confirmo');
        expect(text).toContain('rechazo');
        expect(text).toContain('Registrar reclamo');
    });
});

describe('plantillas y ventana de 24 horas', () => {
    it('dentro de la ventana manda texto libre y, si hay archivo, su URL', () => {
        const plan = planCoCoWhatsAppDelivery({
            purpose: 'legal_draft',
            windowOpen: true,
            title: 'Borrador',
            body: 'Aquí va el borrador.',
            mediaUrl: 'https://conviveconnect.com/api/coco/media/x',
        });
        expect(plan).toEqual({
            mode: 'free',
            body: 'Aquí va el borrador.',
            mediaUrl: 'https://conviveconnect.com/api/coco/media/x',
        });
    });

    it('fuera de la ventana usa el aviso de comunidad, no texto libre', () => {
        const plan = planCoCoWhatsAppDelivery({
            purpose: 'community_notice',
            windowOpen: false,
            title: 'Corte de agua el martes',
        });
        expect(plan.mode).toBe('template');
        if (plan.mode !== 'template') return;
        expect(plan.templateKey).toBe('community_notice');
        expect(plan.variables['1']).toContain('Corte de agua');
    });

    it('el recordatorio de gasto común exige unidad y monto reales', () => {
        expect(planCoCoWhatsAppDelivery({
            purpose: 'payment_reminder',
            windowOpen: false,
            title: 'Gasto común',
        })).toEqual({ mode: 'skip', reason: 'missing_payment_facts' });
        const plan = planCoCoWhatsAppDelivery({
            purpose: 'payment_reminder',
            windowOpen: false,
            title: 'Gasto común',
            unitLabel: '302',
            amountLabel: '148.600 CLP',
        });
        expect(plan).toMatchObject({
            mode: 'template',
            templateKey: 'payment_reminder',
            variables: { '1': '302', '2': '148.600 CLP' },
        });
    });
});

describe('URL firmada del archivo', () => {
    const secret = 'secreto-de-prueba';
    const id = '11111111-1111-4111-8111-111111111111';
    const expires = Date.now() + 60_000;

    it('acepta la firma vigente y rechaza una vencida o alterada', () => {
        const signature = signMediaAccess(id, expires, secret);
        expect(verifyMediaAccess(id, expires, signature, expires - 1000, secret)).toBe(true);
        expect(verifyMediaAccess(id, expires, signature, expires + 1, secret)).toBe(false);
        expect(verifyMediaAccess(id, expires, `${signature}x`, expires - 1000, secret)).toBe(false);
        const url = mediaPublicUrl(id, expires, secret);
        expect(url).toContain(`/api/coco/media/${id}`);
        expect(url).not.toContain(secret);
    });
});
