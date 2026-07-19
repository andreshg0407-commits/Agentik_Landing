# Operational Inventory Reconciliation

**Sprint:** AGENTIK-OPERATIONAL-INVENTORY-RECONCILIATION-01
**Date:** 2026-05-26

---

## Why this exists

Once Agentik starts moving inventory operationally (creating reservations, consuming them when orders progress, releasing them when orders cancel), the operational state can drift from the underlying sources. Drift causes:

- Pressure signals that trigger production unnecessarily
- Sales Portfolio pressure on references that are actually available
- David / Copilot reasoning on stale or contradictory data
- Negative availability that makes no sense
- Orphan reservations holding units that have been freed at CRM level

The reconciliation engine audits all of this without touching anything. It is a read-only diagnostic layer.

---

## What it validates

| Check | Severity | Description |
|---|---|---|
| `inventory_formula_mismatch` | warning | `physicalQty − reservedQty − salesAssigned − pendingTransfers ≠ operationalAvailableQty` |
| `negative_operational_available` | critical | `operationalAvailableQty < 0` — impossible state |
| `over_reserved_reference` | critical | Sum of active reservations > `physicalQty − salesAssignedQty` |
| `missing_inventory_reference` | warning | Reservation references a product not in the inventory snapshot |
| `cancelled_order_still_reserved` | critical | CRM order is cancelled but still holds an active reservation |
| `confirmed_order_without_reservation` | warning | CRM order is reserved/confirmed but has no active Agentik reservation |
| `order_line_qty_mismatch` | warning | Order line total ≠ reservation qty for that reference |
| `duplicate_reservation` | critical | More than one active reservation for same order + reference |
| `stale_reservation` | info | Active reservation whose `expiresAt` has elapsed |
| `sales_assignment_exceeds_inventory` | critical | Portfolio assignment total > physical inventory |
| `stale_inventory_snapshot` | warning | SAG snapshot older than configured threshold |

---

## What it does NOT do

- Does NOT write to SAG
- Does NOT fix anything (V1)
- Does NOT create fiscal documents
- Does NOT send orders to ERP
- Does NOT modify reservations
- Does NOT modify Sales Portfolio assignments

---

## Why V1 does not auto-repair

Inventory is the foundation of operational intelligence. Incorrect automatic repairs can:
- Free units that are legitimately reserved
- Create phantom reservations
- Corrupt the pressure signal pipeline
- Cause cascading errors in Sales Portfolio and Production Pressure

In V1, all repairs require human review. The repair planner produces a `proposedPayload` with every action pre-described — a coordinator can verify it and execute it manually or via a future approval UI.

---

## Health score

The report includes a `healthScore` (0–100) computed as:

```
healthScore = 100 − (critical × 15) − (warning × 5) − (info × 1)
```

`isHealthy = true` means zero critical issues (warnings may still exist).

---

## How this protects Sales Portfolio and Production Pressure

1. CRM order line sync → `syncOrderReservations()` creates reservations
2. Reservations deduct from `operationalAvailableQty`
3. If data is corrupted (orphans, duplicates, over-reserves):
   - Pressure signals may fire on references with phantom pressure
   - Production suggestions may be wrong
   - Sales Portfolio may show depleted refs that are actually available

Reconciliation detects this before it reaches agents.

**Future:** When the runtime approval center is ready, critical reconciliation issues will:
- Suppress production pressure signals for affected references
- Surface a coordinator alert
- Prevent new portfolio assignments for over-reserved refs
- Generate an ActionTask for the coordinator to approve the fix

---

## API

### GET `/api/orgs/:orgSlug/operational-inventory/reconciliation`

Returns summary + issues + plan overview. Use for dashboard health panels.

Query: `includeOrders=true|false` (default true), `includeSalesPortfolio=true|false` (default false)

### POST `/api/orgs/:orgSlug/operational-inventory/reconciliation/plan`

Returns full report + full repair plan (with per-action payloads).
Use before executing any manual fix.

---

## Files

| File | Role |
|---|---|
| `lib/operational-inventory/operational-reconciliation-types.ts` | All types: Issue, Report, RepairPlan, FixSuggestion |
| `lib/operational-inventory/operational-reconciliation-engine.ts` | Pure engine: 11 checks, builds report |
| `lib/operational-inventory/operational-reconciliation-repair-planner.ts` | Pure planner: issues → repair actions |
| `lib/operational-inventory/operational-reconciliation-service.ts` | Assembles inputs from Prisma + CRM, calls engine + planner |
| `app/api/orgs/[orgSlug]/operational-inventory/reconciliation/route.ts` | GET endpoint |
| `app/api/orgs/[orgSlug]/operational-inventory/reconciliation/plan/route.ts` | POST endpoint |

---

## Future runtime integration points

The following events are ready to be emitted once the runtime is wired:

```typescript
// Event: inventory.reconciliation_issue_detected
// Event: reservation.repair_suggested
// Copilot alert: "Se detectaron X inconsistencias operacionales — revisar"
// David insight: "N referencias con presión potencialmente falsa"
// Production pressure suppression: refs with 'critical' issues excluded from signals
// ActionTask: coordinator approval required before fix execution
```
