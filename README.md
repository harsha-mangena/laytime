# Laytime

OSRA 2022 demurrage and detention reconciliation for mid-tier freight forwarders and 3PLs.

Carrier and MTO invoices that omit required fields under [46 CFR Part 541](https://www.ecfr.gov/current/title-46/chapter-IV/subchapter-B/part-541) are voidable. Laytime ingests terminal gate records and carrier invoices, scores them against 541.6 / 541.7 / 545.5, flags non-compliant bills, and builds dispute packs inside the 30-day clock.

## What it does

- Scan invoices against OSRA required contents and the 30-day issue clock
- Compare carrier availability dates to terminal gate tape (TMS lag)
- Generate dispute letters with cited grounds
- Connect CargoWise, Tango, MSC, Maersk, CMA, APM, Maher, PNCT through native parsers
- Store **vendor keys per signed-in account** (never in the browser) and pull live over HTTPS
- Pull public NY Harbor evidence: NOAA tides/currents/air-gap, NWS marine forecast, PNCT vessel board, OSM terminals

Catalog sandbox credentials still load the Northbridge sample book through the same adapters. Live keys are a separate path — a failed vendor pull is never replaced with sample invoices.

## Stack

- TanStack Start (React 19) + Tailwind v4
- Postgres via Neon in production, PGLite in local preview
- Better Auth (Google / X)
- OSRA engine in `src/lib/osra.ts`

## Run locally

```bash
npm install
npm run dev
```

Sign-in is on. Google and X go through the configured auth broker. Vendor keys are stored in Postgres (`connections.api_key`) and never returned to the client.

Live connector pulls are HTTPS-only. Loopback, RFC1918, link-local, and metadata addresses are blocked. EDI mailbox URLs cannot be pulled live — drop a 310 / CODECO on Ingest, or point at an HTTPS gateway.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/scan` | Scan a Laytime-shaped invoice |
| POST | `/api/v1/ingest` | Auto-detect native formats and scan |
| GET | `/api/v1/connectors` | Adapter catalog |
| GET | `/api/v1/rules` | 46 CFR 541 required fields |
| GET | `/api/v1/sources/:id` | Live public harbor feeds (no key) |

Vendor keys are **not** accepted on those public routes. Connect live from the signed-in Connectors desk.

## Sample book

The desk ships a frozen Northbridge Logistics LLC book (Port of NY/NJ, as-of 3 September 2026) so the OSRA engine is inspectable without a carrier login. It is labeled as sample. Public NOAA / NWS / PNCT pulls are live.
