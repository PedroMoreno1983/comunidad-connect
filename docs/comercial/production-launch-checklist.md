# Convive Connect - Checklist de Produccion Premium

Ultima actualizacion: 2026-06-02

## Estado actual

La app esta operativa. Antes de vender un plan con pago online real, `https://conviveconnect.com/api/health` debe quedar en `runtime.fullPaidProductionReady: true`.

Mientras Haulmer/Tuu no entregue credenciales, el health puede quedar en `status: "ready_with_deferred_integrations"` con `runtime.productionReady: true` y `runtime.deferredProduction` incluyendo `paidIntegrations.payments`. Eso permite vender/operar sin pago online embebido, sin fingir que Haulmer ya esta activo.

Comando de verificacion:

```bash
npm run qa:production-live
```

## Vercel - variables requeridas en Production

Configurar en el proyecto Vercel de `conviveconnect.com`, ambiente `Production`.

### WhatsApp / Twilio

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `WHATSAPP_WEBHOOK_SECRET`

Webhook entrante que debe pegarse en Twilio:

```text
https://conviveconnect.com/api/coco/whatsapp
```

Metodo: `POST`

Content type esperado: `application/x-www-form-urlencoded`

### Pagos / Haulmer

- `HAULMER_ACCOUNT_ID`
- `HAULMER_SECRET_KEY`
- `HAULMER_PAYMENTS_REQUIRED=1` solo cuando el cliente contratado exige pago online real.

Despues de configurar, probar creacion de link de pago y retorno controlado.

### Webhooks y monitoring

- `IOT_WEBHOOK_SECRET`
- `AI_HEALTH_TOKEN`
- `IOT_WEBHOOKS_REQUIRED=1` solo cuando el cliente tenga sensores/gateway IoT operativo.
- `AI_HEALTH_TOKEN_REQUIRED=1` para cierre estricto de monitoreo en produccion pagada completa.

### SEO / dominio

- `NEXT_PUBLIC_SITE_URL=https://conviveconnect.com`
- `NEXT_PUBLIC_CANONICAL_SITE_URL=https://conviveconnect.com`

## Supabase - migraciones

Aplicar migraciones pendientes en Supabase, especialmente:

- `027_community_collaboration.sql`

Esa migracion habilita:

- `neighbor_mediations`
- `time_bank_offers`
- `collective_purchase_campaigns`
- `community_projects`

Tambien deja RLS por comunidad para que cada edificio vea solo sus propios registros.

## QA logueado por rol

Despues del deploy y migraciones:

- Admin: crear un nuevo espacio comun en `/amenities`.
- Admin: revisar `/admin/whatsapp` y confirmar estado listo.
- Residente: crear mediacion CNV en `/convivencia`.
- Residente: publicar oferta en Banco de Tiempo.
- Residente: sumarse a compra colectiva.
- Residente: votar en `/votaciones` y confirmar que no hay textos corruptos.
- Conserje: revisar visitas, paquetes y notificaciones.

## Criterio de cierre

Convive queda comercialmente listo cuando:

```bash
npm run qa:production-live
```

sale con `passed: true` y el endpoint:

```text
https://conviveconnect.com/api/health
```

devuelve al menos:

```json
{
  "status": "ready_with_deferred_integrations",
  "runtime": {
    "productionReady": true
  }
}
```

Para cerrar produccion pagada completa, debe devolver `status: "ready"` y `runtime.fullPaidProductionReady: true`.
