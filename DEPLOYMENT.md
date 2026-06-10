# ComunidadConnect Deployment

## Production Project

- Vercel workspace: `pedropedrofelipemoreno-7255`
- Vercel project: `comunidad-connect`
- Production URL: `https://conviveconnect.com`
- GitHub repository: `PedroMoreno1983/comunidad-connect`
- Production branch: `master`

## Important CLI Note

Do not deploy from a Vercel CLI session that only shows `homadropi-9167s-projects`.
That scope is not the production workspace for this app.

Before using CLI deployment, confirm:

```powershell
npx vercel teams ls
```

The output must include `pedropedrofelipemoreno-7255`. If it does not, use the
Vercel dashboard deployment flow instead.

## Required Environment Variables

Commercial production requires:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
GEMINI_API_KEY
OPENAI_API_KEY
RESEND_API_KEY
NEXT_PUBLIC_SITE_URL=https://conviveconnect.com
```

WhatsApp production delivery requires:

```txt
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_FROM
```

Paid production hardening should also configure:

```txt
HAULMER_ACCOUNT_ID
HAULMER_SECRET_KEY
SUPERADMIN_EMAIL or SUPERADMIN_EMAILS
AI_HEALTH_TOKEN
IOT_WEBHOOK_SECRET
WHATSAPP_WEBHOOK_SECRET
VOYAGE_API_KEY
```

## QA Before Production Review

Run local checks:

```powershell
npm run lint
npx tsc --noEmit
npm run build
npm run qa:readiness
```

Run QA against production:

```powershell
$env:QA_BASE_URL='https://conviveconnect.com'
npm run qa:production-mode
npm run qa:production-hardening
npm run qa:security-headers
```

Expected current status:

- Commercial readiness: `READY`
- Paid production readiness: `NEEDS CONFIG` until payment, superadmin, and monitoring secrets are added.

## Public Health Check

```powershell
Invoke-WebRequest -Uri "https://conviveconnect.com/api/ai/health" -UseBasicParsing
```

Healthy production should report `gemini`, `openai`, `anthropic`, and `supabase`
as available. Image generation should show the configured OpenAI image model.
