# Webhook Twilio de CoCo WhatsApp

Documento interno para configurar el canal. **No publicar esta URL en páginas de marketing, soporte público ni onboarding.** El contacto público es `soporte@conviveconnect.com`.

Producción: `https://conviveconnect.com`

## Endpoint

En Twilio (sandbox o número aprobado), configura el webhook de mensajes entrantes:

```text
https://conviveconnect.com/api/coco/whatsapp
```

- Método: `POST`
- Content type: `application/x-www-form-urlencoded`

## Variables

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `WHATSAPP_WEBHOOK_SECRET`

Ver también `docs/comercial/production-launch-checklist.md`.

## Número compartido con Norma (el que se usa)

Desde 2026-10-25, CoCo vive en **+56 9 9947 4056**, el número de Norma, que también comparte
AgroSilvestre. El Twilio es el de DataWise, no el de la vía directa de arriba.

1. Twilio entrega el mensaje al backend de Scrapp en el VPS de Hostinger (`whatsapp-norma.ts`).
2. Si la persona escribe "Hola CoCo", o tuvo una conversación con CoCo en las últimas 24 h,
   Scrapp reenvía a `/api/coco/whatsapp` con `X-CoCo-Shared-Number: 1`, firmado con el token de
   DataWise (`COCO_TWILIO_AUTH_TOKEN` en Vercel).
3. CoCo responde JSON (`{ reply }`), no TwiML, y Scrapp lo manda por la API de Twilio. Espera
   hasta 90 s, así que esta vía no tiene el corte de 15 s del TwiML directo.
4. Escribir "Norma" devuelve la conversación a Norma. Si CoCo responde 204, atiende Norma.

El enrutador está en `integracion-scrapp/backend/src/modules/agent/whatsapp-norma.ts` del repo
Plataforma-Compliance (master).
