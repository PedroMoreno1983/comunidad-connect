# Cierre de produccion

Checklist para dejar el entorno listo para un cliente pagado.

## Variables obligatorias en Vercel

Configurar en Production y Preview cuando corresponda:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_IMAGE_MODEL=dall-e-3`
- `VOYAGE_API_KEY`
- `VOYAGE_EMBEDDING_MODEL=voyage-3.5-lite`
- `AI_HEALTH_TOKEN`
- `AI_BUDGET_ENFORCEMENT=on`
- `AI_DEFAULT_MONTHLY_TOKEN_LIMIT`
- `AI_DEFAULT_MONTHLY_IMAGE_LIMIT`
- `AI_DEFAULT_MONTHLY_COST_LIMIT_CENTS`
- `AI_RESIDENT_DAILY_TOKEN_LIMIT`
- `AI_STAFF_DAILY_TOKEN_LIMIT`
- `AI_HEAVY_DAILY_LIMIT`
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `SUPERADMIN_EMAILS`
- `WHATSAPP_WEBHOOK_SECRET`
- `communities.iot_webhook_secret` por comunidad + `iot_autonomous_actions_enabled`

Segun modulos contratados:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `HAULMER_ACCOUNT_ID`
- `HAULMER_SECRET_KEY`
- `HAULMER_PAYMENTS_REQUIRED=1` cuando el plan vendido incluye pago online real.
- `IOT_WEBHOOKS_REQUIRED=1` cuando la comunidad tiene sensores/gateway IoT operativo.
- `AI_HEALTH_TOKEN_REQUIRED=1` cuando el cierre exige monitoreo de IA con token.

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

## Control de gasto IA

Cada llamada a IA debe quedar registrada en `ai_usage_events`. Los limites por comunidad viven en `ai_budgets`.

Valores recomendados iniciales:

```text
AI_BUDGET_ENFORCEMENT=on
AI_DEFAULT_MONTHLY_TOKEN_LIMIT=1000000
AI_DEFAULT_MONTHLY_IMAGE_LIMIT=30
AI_DEFAULT_MONTHLY_COST_LIMIT_CENTS=2500
AI_RESIDENT_DAILY_TOKEN_LIMIT=8000
AI_STAFF_DAILY_TOKEN_LIMIT=50000
AI_HEAVY_DAILY_LIMIT=10
```

Si una comunidad requiere mas uso, se ajusta su fila en `ai_budgets`, no el codigo.

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

Los comandos `qa:workflows`, `qa:functional`, `qa:human-flows` y `qa:visual` son aliases de los checks existentes para mantener el cierre operativo en un solo bloque.

## Criterio de cierre

- `Commercial readiness: READY`.
- `Launch readiness: READY`.
- `Full paid production readiness: READY` solo cuando Haulmer/Tuu e IoT requerido tengan credenciales reales. Si Haulmer sigue pendiente, debe quedar documentado como integracion diferida en `runtime.deferredProduction`.
- Dominio final apuntado.
- Envios reales probados con destinatarios internos.
- Contrato, terminos y precios aprobados.
