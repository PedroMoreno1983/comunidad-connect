# Convive Connect - Checklist de Produccion Premium

Ultima actualizacion: 2026-06-02

## Estado actual

La app esta operativa, pero `https://conviveconnect.com/api/health` debe quedar en `status: "ready"` antes de vender como produccion completa.

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

- `HAULMER_API_KEY`
- `HAULMER_WEBHOOK_SECRET`

Despues de configurar, probar creacion de link de pago y retorno controlado.

### Webhooks y monitoring

- `IOT_WEBHOOK_SECRET`
- `AI_HEALTH_TOKEN`

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

devuelve:

```json
{
  "status": "ready",
  "runtime": {
    "productionReady": true
  }
}
```
