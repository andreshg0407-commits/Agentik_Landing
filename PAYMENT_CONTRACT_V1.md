# PAYMENT_CONTRACT_V1.md
## Sprint S2 — Phase B: Canonical Payment Contract Design
_Generated: 2026-05-05 | Status: DESIGN PROPOSAL — No migrations yet_

---

## 1. Contract Purpose

This document defines the canonical payment contract for Agentik: the single source of truth for what constitutes a "confirmed payment" and how it flows from SAG source data through to CustomerReceivable balance updates and Customer 360 visibility.

The contract resolves the three-way collision between:
- **CollectionRecord** (SAG-synced, authoritative external source)
- **PaymentRecord** (manually registered via Agentik UI)
- **cobros-breakdown.ts** (finance UI reads SaleRecord.comprobanteCode — a third parallel path)

---

## 2. Canonical Payment Definition

A **confirmed payment** is:

> A financial event where a customer has transferred funds that SAG has processed and assigned a final-state comprobanteCode (R1, R2, RS, RC, RG, RA, SI, AN). It is NOT confirmed until SAG issues the final document — pending consignaciones (CP, B1, B2, H1, H2) do not qualify.

### 2.1 Finality Rules by comprobanteCode

| Code | Category | Final? | Include in reconciliation |
|------|----------|--------|--------------------------|
| R1 | Cobros empresa Fuente 1 | YES | YES — primary |
| R2 | Cobros empresa Fuente 2/remisiones | YES | YES — secondary |
| RS | Almacén (POS) | YES | YES |
| RC | Almacén (POS) | YES | YES |
| RG | Almacén (POS) | YES | YES |
| RA | Almacén (POS) | YES | YES |
| SI | Retail financiero (Sistecredit) | YES | YES |
| AN | Retail financiero (Addi) | YES | YES |
| CP | Consignación pendiente | NO | EXCLUDE — pending |
| B1 | Banco 1 consignación | NO | EXCLUDE — pending |
| B2 | Banco 2 consignación | NO | EXCLUDE — pending |
| H1 | Huella 1 consignación | NO | EXCLUDE — pending |
| H2 | Huella 2 consignación | NO | EXCLUDE — pending |

**Implementation constant (to be added to a shared finance constants file):**
```typescript
export const FINAL_COBRO_CODES = new Set(["R1","R2","RS","RC","RG","RA","SI","AN"]);
export const PENDING_COBRO_CODES = new Set(["CP","B1","B2","H1","H2"]);
```

---

## 3. Authoritative Payment Source Hierarchy

When the same payment event appears in multiple sources, the following hierarchy applies:

```
Priority 1: CollectionRecord (SAG sync) — AUTHORITATIVE
  └── Condition: comprobanteCode IN FINAL_COBRO_CODES

Priority 2: PaymentRecord (UI) — SUPPLEMENTARY
  └── Use when: no matching CollectionRecord exists for the same date + amount + customer
  └── Risk: manual entry, unconfirmed by SAG

Priority 3: SaleRecord.comprobanteCode (cobros-breakdown) — READ-ONLY REPORTING
  └── Use for: finance dashboard aggregate totals only
  └── NEVER use for: individual receivable allocation
```

---

## 4. Canonical Payment Flow (Target Architecture)

```
SAG PYA SOAP
    │
    ▼
CollectionRecord (sync)
    │
    ├── comprobanteCode IN PENDING_COBRO_CODES → status = PENDING_CONSIGNACION
    │                                             No receivable update
    │
    └── comprobanteCode IN FINAL_COBRO_CODES → status = CONFIRMED
              │
              ▼
        [AUTO-RECONCILE ENGINE] ← Sprint S3
              │
              ├── Match to CustomerReceivable via:
              │     1. sagDocumentId (strongest)
              │     2. customerId + amount + date window (fuzzy)
              │     3. appliedFacts JSONB invoiceRef (SAG-provided)
              │
              ├── Create PaymentAllocation record
              │     (allocatedAmount, balanceBefore, balanceAfter)
              │
              └── Update CustomerReceivable
                    (paidAmount += allocatedAmount, balanceDue -= allocatedAmount)
                    (status → PARTIAL / PAID / OVERDUE)
              │
              └── Create or link PaymentRecord
                    (status = RECONCILED, paymentRecordId bridge set on CollectionRecord)
```

---

## 5. Deduplication Key Design

To prevent double-counting when both a `CollectionRecord` and a `PaymentRecord` exist for the same event:

**Proposed deduplication key** (composite, not yet a DB constraint):
```
(organizationId, sagTerceroId, paymentDate, amount, comprobanteCode)
```

**Pre-Sprint S3 guard (query-level):**
```typescript
// When auto-reconcile processes a CollectionRecord:
// 1. Check if PaymentRecord already exists with same (customerId, amount, paymentDate ± 1 day)
// 2. If yes → link via paymentRecordId, do NOT create a new PaymentRecord
// 3. If no → create new PaymentRecord with status=RECONCILED
```

**Post-Sprint S3 (DB-level, future migration):**
```sql
-- Future: add unique index for dedup
CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_dedup
  ON "CollectionRecord"("organizationId", "sagTerceroId", "paymentDate"::date, "amount", "comprobanteCode")
  WHERE "comprobanteCode" IS NOT NULL;
```

---

## 6. CustomerReceivable Update Contract

`CustomerReceivable.balanceDue` MUST only be updated via controlled paths:

| Path | Status | Authority |
|------|--------|-----------|
| `payment-service.ts::allocatePayment()` | IMPLEMENTED | Authorized |
| `payment-service.ts::reversePayment()` | IMPLEMENTED | Authorized |
| Auto-reconcile engine (Sprint S3) | NOT YET | Authorized (future) |
| Direct SAG sync without PaymentAllocation | PROHIBITED | Unauthorized |
| Any other path | PROHIBITED | Unauthorized |

**Invariant (must hold after every write):**
```
balanceDue = originalAmount − paidAmount
paidAmount = SUM(PaymentAllocation.allocatedAmount) WHERE receivableId = this.id
```

---

## 7. CollectionRecord Status Taxonomy

Currently `CollectionRecord` has no status field. The contract proposes the following logical states (implemented at service layer, not yet as DB enum):

| Logical Status | Condition | Action |
|---------------|-----------|--------|
| PENDING_CONSIGNACION | comprobanteCode IN PENDING_COBRO_CODES | Display only, no allocation |
| CONFIRMED_UNMATCHED | comprobanteCode IN FINAL_COBRO_CODES, no PaymentAllocation | Needs auto-reconcile |
| CONFIRMED_MATCHED | comprobanteCode IN FINAL_COBRO_CODES, PaymentAllocation exists | Fully reconciled |
| BRIDGE_LINKED | paymentRecordId IS NOT NULL | Linked to manual PaymentRecord |

---

## 8. PaymentRecord Role Clarification

Under the canonical contract:

| Scenario | PaymentRecord role |
|----------|-------------------|
| SAG cobro auto-reconciled (Sprint S3) | Created automatically by reconcile engine, status=RECONCILED |
| Manual cobro entered by user | Created by UI, status=PENDING until confirmed by SAG |
| Manual cobro confirmed by SAG | status updated to RECONCILED, paymentRecordId set on CollectionRecord |
| Manual cobro with no SAG match | Remains PENDING — human must review |

---

## 9. Finance UI Cobros Display Contract

`cobros-breakdown.ts` currently reads `SaleRecord.comprobanteCode`. This is acceptable for aggregate dashboards (ventas por canal, cobros por periodo) but must NOT be used for:
- Individual receivable balance calculation
- Reconciliation status display
- Customer-level payment confirmation

**Short-term (Sprint S2.1):** Add `FINAL_COBRO_CODES` filter to `cobros-breakdown.ts` to exclude pending consignaciones from displayed totals.

**Medium-term (Sprint S3):** Finance UI cobros display should read `CollectionRecord` (status=CONFIRMED_MATCHED) for accuracy.

---

## 10. Non-Goals (Explicitly Out of Scope)

- Automated bank statement import (requires bank API integration)
- Electronic invoice (DIAN e-factura) reconciliation (requires DIAN API)
- Multi-currency support (all amounts assumed COP)
- Real-time SAG webhook events (SAG SOAP is pull-only)
- Write-back to SAG (SAG is read-only from Agentik perspective)
