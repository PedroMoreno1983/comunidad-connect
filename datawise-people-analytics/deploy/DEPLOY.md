# DataWise People Analytics Deployment

This is the production deployment path for the MVP.

## What it deploys

- Next.js application
- PostgreSQL 16
- Caddy as HTTPS reverse proxy

## Prerequisites

- Docker
- Docker Compose
- A Linux VM or VPS with ports `80` and `443` open
- A domain pointing to the server

## Files

- `Dockerfile`
- `docker-compose.production.yml`
- `deploy/Caddyfile`
- `.env.production.example`

## Steps

1. Copy the project to the server.
2. Create `.env.production` from `.env.production.example`.
3. Update:
   - `DOMAIN_NAME`
   - `POSTGRES_PASSWORD`
   - `DATABASE_URL`
   - `BASIC_AUTH_USERNAME`
   - `BASIC_AUTH_PASSWORD`
4. Start the stack:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

This starts PostgreSQL, runs `prisma migrate deploy`, and only then serves the app behind Caddy.

5. Validate the migration job:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml logs migrate
```

6. Seed demo data only when you explicitly want a commercial demo environment:

```bash
docker compose --profile demo-data --env-file .env.production -f docker-compose.production.yml up -d seed-demo
```

7. Validate:

```bash
curl https://your-domain.com/api/health
curl -u demo:your-password https://your-domain.com/api/analytics/summary
```

## Notes

- Basic Auth is optional. If `BASIC_AUTH_USERNAME` and `BASIC_AUTH_PASSWORD` are empty, the protected routes remain open.
- Importing new data automatically triggers analytics recomputation for the affected company.
- For a real commercial deployment, use strong credentials and do not expose demo credentials publicly.
- For local or CI environments, use `npm run db:migrate:deploy` instead of `db:push`.
