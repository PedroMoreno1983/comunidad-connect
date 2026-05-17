# Cierre de produccion

Checklist para pasar de showcase a cliente pagado.

## Variables obligatorias en Vercel

Configurar en Production y Preview cuando corresponda:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_ENABLE_DEMO=false`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_IMAGE_MODEL=dall-e-3`
- `VOYAGE_API_KEY`
- `VOYAGE_EMBEDDING_MODEL=voyage-3.5-lite`
- `AI_HEALTH_TOKEN`
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `SUPERADMIN_EMAILS`
- `WHATSAPP_WEBHOOK_SECRET`
- `IOT_WEBHOOK_SECRET`

Segun modulos contratados:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `HAULMER_API_KEY`
- `HAULMER_WEBHOOK_SECRET`

## Token de monitoreo

Generar con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

No guardar el valor en Git. Debe quedar solo en Vercel como `AI_HEALTH_TOKEN`.

## Superadmin

Ejemplo:

```text
SUPERADMIN_EMAILS=pedro.moreno@tu-dominio.cl,admin@conviveconnect.cl
```

Usar correos reales y mantener la lista corta.

## Base de datos

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
npm run search:backfill
```

`search:backfill` genera embeddings Voyage para publicaciones de marketplace pendientes.

## QA final

```bash
npm run qa:readiness
npm run qa:production-hardening
npm run qa:coco-legal
npm run qa:operations
npm run qa:multitenant
npm run qa:workflows
npm run qa:functional
npm run qa:human-flows
npm run qa:visual
npm run qa:security-headers
npx tsc --noEmit
npm run lint
npm run build
```

## Criterio de cierre

- `Commercial demo readiness: READY`.
- `Paid production readiness: READY`.
- Dominio final apuntado.
- Envios reales probados con destinatarios internos.
- Contrato, terminos y precios aprobados.
