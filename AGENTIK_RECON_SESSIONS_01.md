# AGENTIK-RECON-SESSIONS-01
## Reconciliation Sessions Foundation

**Sprint:** AGENTIK-RECON-SESSIONS-01
**Branch:** demo/foto-estudio
**Status:** COMPLETE — all 12 tasks delivered
**TypeScript:** 162 pre-existing errors, 0 regressions introduced

---

## What Was Built

This sprint evolves "Conciliación Inteligente" from a catalog of reconciliation flows into a **real operations layer based on auditable sessions**. A session is the durable unit of a reconciliation operation:

```
RC-2026-00041 · Banco Bogotá vs Cobros SAG · Abril 2026
```

Sessions have a lifecycle, an audit trail, run history, and a summary snapshot. They are persisted to the database and displayed in the UI.

---

## Architecture

```
lib/reconciliation/
  session-types.ts          ← Pure domain types (zero Prisma imports)
  source-contract.ts        ← Source registry + readiness contracts
  canonical-record.ts       ← Universal CanonicalReconRecord format
  audit-trail.ts            ← Immutable event emitter
  session-service.ts        ← Session CRUD (create, list, get)
  run-service.ts            ← Run lifecycle + engine dispatch
  adapters/
    orders-vs-sales.ts      ← UNCHANGED — Pedidos vs Ventas adapter
  engine.ts                 ← UNCHANGED — source-agnostic matching engine

prisma/
  schema.prisma             ← +3 models, +1 enum
  migrations/
    20260510000000_reconciliation_sessions/migration.sql

app/(app)/[orgSlug]/reconciliation/
  page.tsx                  ← +getRecentSessions() fetch + prop pass
  recon-client.tsx          ← +RecentSessionsSection + session status chips
```

---

## Task Delivery

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Domain types | `session-types.ts` | DONE |
| 2 | Source contract registry | `source-contract.ts` | DONE |
| 3 | CanonicalReconRecord | `canonical-record.ts` | DONE |
| 4 | Prisma models + migration | `schema.prisma` + SQL | DONE |
| 5 | createReconciliationSession() | `session-service.ts` | DONE |
| 6 | startReconciliationRun() | `run-service.ts` | DONE |
| 7 | Audit trail | `audit-trail.ts` | DONE |
| 8 | "Sesiones recientes" UI | `recon-client.tsx` + `page.tsx` | DONE |
| 9 | Builder creates session conceptually | `recon-client.tsx` (FlowRow onSelect) | DONE |
| 10 | Results become session results | Preserved in `selectedFlow` branch | DONE |
| 11 | Future-ready contracts | `session-types.ts` (RECON_COPILOT_READINESS, ReconciliationException, ReconciliationMatchResult) | DONE |
| 12 | Documentation | This file | DONE |

---

## Key Contracts

### ReconciliationSessionStatus lifecycle
```
draft → ready → running → needs_review → reconciled → closed
                        ↘ partially_reconciled → closed
              ↘ failed
              ↘ cancelled
```

### ReconciliationSourceType (11 sources)
```typescript
"sag_sales" | "sag_payments" | "sag_receivables" | "sag_orders"   // SAG — live
"dian_xml" | "dian_invoice"                                         // DIAN — pending integration
"bank_statement"                                                    // Banco — requires integration
"payment_gateway"                                                   // PayCo/MercadoPago — pending
"manual_upload" | "spreadsheet" | "erp_external"                   // Upload/external — future
```

### Engine dispatch rules (run-service.ts)
- `sag_orders` + `sag_sales` (different) → `runOrdersVsSalesRecon()` — live
- Any other combination → `status: "unsupported"`, session reverts to DRAFT

### Session code format
```
RC-{YEAR}-{5-digit-padded-count}   →   RC-2026-00041
```
- Org-scoped (unique constraint: `[organizationId, sessionCode]`)
- Sequential count from DB; unique constraint handles rare races

---

## Database Schema (3 new models)

### ReconciliationSession
- Primary record for one auditable reconciliation operation
- Fields: sessionCode, title, sourceAType/Label, sourceBType/Label, period, status (enum), createdBy, assignedTo, startedAt, completedAt, closedAt, summaryJson, metadataJson
- Indexes: (org, status), (org, period), (org, createdAt)
- Unique: (organizationId, sessionCode)

### ReconciliationRun
- One execution within a session (supports multiple runs / retries)
- Fields: sessionId, runNumber, status (text), sourceAKey, sourceBKey, period, summaryJson, errorJson, startedAt, completedAt
- FK: ReconciliationSession (CASCADE), Organization (CASCADE)

### ReconciliationEvent
- Immutable audit event (never update/delete)
- Fields: sessionId, actorType, actorId, eventType, message, metadataJson
- 12 event types: session_created, session_updated, session_closed, session_cancelled, run_started, run_completed, run_failed, exception_detected, manual_review_required, user_note_added, export_generated, status_changed
- FK: ReconciliationSession (CASCADE), Organization (CASCADE)

---

## UI Changes

### Sesiones recientes section (recon-client.tsx)
- Position: Landing view, after Reconciliation Builder, before Results Workbench
- Columns: Código · Conciliación · Período · Estado · Coincide % · Diferencias · Última actividad
- Empty state: "Sin sesiones registradas" dashed box
- Status chips: color-coded per lifecycle state (draft=gray, needs_review=amber, reconciled=green, failed=red, etc.)
- Data: fetched server-side via `getRecentSessions(org, 8)` in page.tsx

---

## Critical Invariants

1. **organizationId on everything** — every model, every query includes org isolation
2. **Pedidos vs Ventas unchanged** — `orders-vs-sales.ts` and `engine.ts` not touched
3. **No SAG writes** — run-service only reads SAG data via existing adapter
4. **No DIAN calls** — DIAN sources are "unsupported" until future sprint
5. **Audit never throws** — `emitReconEvent` catches all errors, logs to stderr, never rethrows
6. **Pure type layer** — session-types.ts, source-contract.ts, canonical-record.ts have zero Prisma imports

---

## Migration Instructions

Run after merging to apply the new schema to your database:

```bash
npx prisma migrate deploy
# or for dev:
npx prisma migrate dev --name reconciliation_sessions
```

The Prisma client was already regenerated (`npx prisma generate` v7.4.2).

---

## Future Sprints

- **AGENTIK-RECON-SESSIONS-02**: Session creation UI — operator creates sessions from the Builder panel
- **AGENTIK-RECON-SESSIONS-03**: Exception resolution — per-exception review/approve/ignore workflow
- **AGENTIK-RECON-BANK-01**: Bank statement source — PDF/CSV upload adapter for `bank_statement` source
- **AGENTIK-RECON-DIAN-01**: DIAN XML source — CUFE matching, rejection detection
- **AGENTIK-RECON-COPILOT-01**: Copilot slot wired — AI anomaly detection on ReconciliationSummarySnapshot[]
