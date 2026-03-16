# DataWise People Analytics Platform

Current MVP for explainable people analytics based on the `datawise_codex_package_v2` spec package.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn-compatible UI primitives
- Prisma + PostgreSQL
- Zod

## Current Scope

- executive dashboard backed by persisted analytics
- department health workspace with trends and driver summaries
- governed CSV/XLSX ingestion for employees, absences, performance, promotions and surveys
- analytics pipeline for attrition risk, burnout risk and monthly team metrics
- Prisma schema, seed script and health endpoint

## Demo Data

`npm run db:seed` now creates three synthetic demo companies:

- `Northstar Software`
- `Andes Logistics`
- `Vertex Advisory`

Use [DEMO_PLAYBOOK.md](./DEMO_PLAYBOOK.md) for the recommended demo story and company-by-company talk track.

## Launch The Demo

### Option 1: Docker demo stack

1. Copy `.env.demo.example` to `.env.demo`.
2. Start the full demo stack:

```bash
docker compose --env-file .env.demo -f docker-compose.demo.yml up -d --build
```

3. Open `http://localhost:3001`.

This path starts PostgreSQL, applies the Prisma schema, seeds the synthetic demo companies and then serves the app.

### Option 2: Local app + your own PostgreSQL

1. Copy `.env.example` to `.env`.
2. Point `DATABASE_URL` to your PostgreSQL instance.
3. Run:

```bash
npm install
npm run db:migrate:dev
npm run db:seed
npm run dev
```

## Setup

1. Copy `.env.example` to `.env`.
2. Update `DATABASE_URL` for your PostgreSQL instance.
3. Install dependencies with `npm install`.
4. Run `npm run db:generate`.
5. Run `npm run db:migrate:dev`.
6. Run `npm run db:seed`.
7. Run `npm run dev`.

## Routes

- `/`
- `/dashboard`
- `/departments`
- `/people`
- `/upload`
- `/api/health`
- `/api/analytics/summary`
- `/api/analytics/departments`
- `/api/analytics/run`
- `/api/ingestion/preview`
- `/api/ingestion/import`
- `/api/ingestion/companies`
- `/api/ingestion/history`
- `/api/ingestion/template`

## Import Flow

1. Open `/upload`.
2. Choose a dataset and attach a CSV or XLSX file.
3. Generate a preview and confirm column mapping.
4. Import into Prisma.
5. The analytics pipeline reruns automatically for the imported company.

## Production

Production deployment files are in `deploy/DEPLOY.md`, `Dockerfile` and `docker-compose.production.yml`. The production stack now runs `prisma migrate deploy` before the app starts, and demo seed data is optional through the `demo-data` compose profile.
