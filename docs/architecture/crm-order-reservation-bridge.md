# CRM Order → Operational Reservation Bridge

**Sprint:** AGENTIK-CRM-ORDER-RESERVATION-BRIDGE-01
**Tenant:** castillitos
**Date:** 2026-05-26

---

## What this is

The CRM Order Reservation Bridge converts CRM orders (AOS_Quotes + AOS_Products_Quotes) into Agentik operational reservations — soft holds on inventory units that exist *before* any ERP document is created.

---

## Position in architecture

```
SuiteCRM AOS_Quotes + AOS_Products_Quotes
      ↓ (CastillitosCrmAdapter connector sync)
Prisma: CRMQuote + CRMQuoteLine
      ↓ (CrmCommercialProvider)
OperationalOrder (with real .lines)
      ↓ (order-reservation-bridge.ts)
OperationalReservation (Prisma)
      ↓ (applyReservationsToInventory)
operationalAvailableQty (deducted from SAG physical snapshot)
      ↓
Sales Portfolio pressure → David / Diego / Copilot
```

---

## Why SAG does not participate here

SAG owns:
- Physical/fiscal inventory
- Legalized orders (PD — Pedidos de Distribución)
- F1/F2 documents
- Authoritative stock ledger

Agentik owns:
- Operational intent (pre-ERP)
- Soft holds on pending orders
- Availability intelligence
- Pressure signals and production suggestions

A CRM quote (AOS_Quotes) is the customer's commercial intent. It is NOT a SAG PD yet. Agentik reserves units operationally to prevent overcommit *before* the order reaches SAG. When the order is eventually legalized as a SAG PD, the reservation is consumed and SAG takes over inventory ownership.

**This bridge does not:**
- Create SAG PD records
- Send orders to ERP
- Touch fiscal documents
- Affect SAG's reported disponible directly

---

## Order lifecycle and reservation rules

| CRM Quote status | Operational status | Reservation action |
|---|---|---|
| DRAFT | `draft` | noop — not yet committed |
| SENT | `reserved` | create / update active reservation |
| ACCEPTED | `confirmed` | create / update active reservation |
| REJECTED | `cancelled` | release — free units back to pool |
| EXPIRED | `cancelled` | release — free units back to pool |
| — | `sent_to_erp` | consume — units committed to SAG |
| — | `fulfilled` | consume — units delivered |
| — | `returned` | release — safe fallback |

---

## Idempotency

Each reservation is uniquely identified by:

```
organizationId + sourceType="order" + sourceId (CRM order crmId) + reference (UPPERCASE)
```

This maps to the Prisma unique constraint:

```prisma
@@unique([organizationId, sourceType, sourceId, reference])
```

Running sync multiple times for the same order is safe:
- Same qty → noop
- Changed qty → update
- Order cancelled → release existing
- Order fulfilled → consume existing
- New line reference → create new reservation

---

## What "no lines" means

If `OperationalOrder.lines = []`, the bridge skips the order and emits a warning.
This happens when CRM quote line ingestion (AOS_Products_Quotes) has not yet run.

To populate lines: run `CastillitosCrmAdapter.pullQuoteLines()` then `upsertQuoteLines()`.

---

## How this feeds operational inventory

After sync:

```
operationalAvailableQty
  = physicalQty (from SAG snapshot)
  - reservedQty (Agentik reservations — includes CRM order reservations)
  - salesAssignedQty (Sales Portfolio assignments)
  - pendingTransfersQty
```

`applyReservationsToInventory()` in `operational-reservation-engine.ts` applies
all active reservations (regardless of sourceType) to the SAG snapshot.

Order-sourced reservations (`sourceType="order"`) flow through the same engine
as portfolio-sourced and manual reservations.

---

## How this feeds Sales Portfolio and Production Pressure

1. CRM order lines → `syncOrderReservations()` → `OperationalReservation` (active)
2. `applyReservationsToInventory()` → reduced `operationalAvailableQty` per reference
3. Reduced availability → `computePressureLevel()` may return `alta`/`media`
4. Pressure signals → Sales Portfolio pressure (depleted, overcommitted)
5. Pressure signals → Production suggestions (Diego agent)
6. David agent reads `OperationalDemandSignal[]` which includes `demand_from_crm_order`,
   `hot_reference`, `multi_vendor_demand`, `warehouse_pressure_candidate`

---

## Files

| File | Role |
|---|---|
| `lib/operational-inventory/order-reservation-bridge.ts` | Core bridge: intent computation + Prisma persistence |
| `lib/operational-inventory/crm-order-reservation-sync.ts` | Batch sync: all active CRM orders + diagnostics |
| `app/api/orgs/[orgSlug]/operational-inventory/reservations/sync-order/route.ts` | POST endpoint |
| `lib/operational-inventory/operational-reservation-engine.ts` | Pure engine (unchanged) |
| `lib/operational-inventory/operational-reservation-types.ts` | Types (unchanged) |
| `prisma/schema.prisma` | Added `@@unique([organizationId, sourceType, sourceId, reference])` |

---

## API

### POST `/api/orgs/:orgSlug/operational-inventory/reservations/sync-order`

**Single order:**
```json
{ "sourceId": "crm-uuid-of-quote", "dryRun": false }
```

**Batch (all active CRM orders):**
```json
{ "batchAll": true, "dryRun": false }
```

**Dry run (no persistence):**
```json
{ "batchAll": true, "dryRun": true }
```

Response includes: `reservationsCreated`, `reservationsUpdated`, `reservationsReleased`,
`reservationsConsumed`, `impacts`, `pressureSignals`, `warnings`, `errors`.

---

## Demand signal connection (Phase 2)

After reservations are synced, `commercial-demand-signals.ts` can correlate:

- `demand_from_crm_order` — references in active CRM orders
- `hot_reference` — references in ≥ 2 distinct orders
- `multi_vendor_demand` — references from ≥ 2 distinct sellers
- `warehouse_pressure_candidate` — demand concentrated in one warehouse

These signals do not require the bridge to run, but their urgency becomes actionable
when the reservation layer confirms that available qty is actually impacted.
