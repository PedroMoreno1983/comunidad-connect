# Demo Playbook

This project now seeds three synthetic sales-demo companies. Each one tells a different story so you can adapt the pitch to the buyer.

## Demo Companies

### Northstar Software
- Industry: B2B SaaS
- Story: Revenue attrition is rising while Product & Engineering stays healthy.
- Use when: the prospect cares about commercial productivity, ramp risk and scaling pain.

### Andes Logistics
- Industry: Logistics
- Story: Fulfillment Operations is under burnout and absenteeism pressure.
- Use when: the prospect cares about frontline workload, operational continuity and retention.

### Vertex Advisory
- Industry: Professional Services
- Story: mostly healthy benchmark company with small pockets of risk.
- Use when: the prospect wants to see a more mature operating model and compare healthy vs at-risk patterns.

## Suggested Flow

1. Start in `/dashboard` with `Northstar Software`.
2. Show the KPI row and the department heat table.
3. Switch to `/departments` to explain where risk concentrates and which drivers repeat.
4. Change company to `Andes Logistics` and show how the same product adapts to a different operating reality.
5. Finish with `Vertex Advisory` to show the product also works as an early-warning system, not only as a crisis dashboard.

## Sales Talk Track

- "This is synthetic data, but the workflow is real: ingest HR data, normalize it, score risk, and surface action areas."
- "We can switch between industries without changing the product model."
- "The value is not only charts. It is explainable drivers, trend visibility and operational prioritization."

## Reset Demo Data

1. Configure `DATABASE_URL`.
2. Run `npm run db:seed`.
3. Open `/dashboard`.

## Fast Launch

For the fastest local launch, use the Docker demo stack:

```bash
docker compose --env-file .env.demo -f docker-compose.demo.yml up -d --build
```

Then open `http://localhost:3001`.
