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
