# PAYMENT_ARCHITECTURE_AUDIT.md
## Sprint S2 — Phase A: Current State Inventory
_Generated: 2026-05-05 | Status: AUTHORITATIVE_

---

## 1. Financial Entity Inventory

### 1.1 PaymentRecord
**Location:** `prisma/schema.prisma` · **Service:** `lib/finance/payment-service.ts`

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | PK |
| organizationId | String | FK → Organization |
| customerId | String? | FK → CustomerProfile (NULLABLE) |
| amount | Decimal | Total payment amount |
| allocatedAmount | Decimal | Sum of PaymentAllocation rows |
| unallocatedAmount | Decimal | amount − allocatedAmount |
| status | PaymentStatus | DRAFT / PENDING / RECONCILED / PARTIALLY_RECONCILED / REVERSED |
| documentType | String | PAGO / ND / AJUSTE |
| documentRef | String? | Internal reference |
| paymentDate | DateTime | User-entered date |
| paymentMethod | String? | cash / transfer / check / etc. |
| notes | String? | Free text |
| createdAt | DateTime | |
| updatedAt | DateTime | |

**Lifecycle (implemented):**
```
DRAFT → PENDING → RECONCILED
                → PARTIALLY_RECONCILED
         → REVERSED (via reversePayment)
```

**Service invariants:**
- `allocatedAmount` = SUM of all linked `PaymentAllocation.allocatedAmount`
- `unallocatedAmount` = `amount − allocatedAmount` (maintained by `allocatePayment()`)
- Reversal requires `status !== REVERSED` and cascades to all allocations

**Dead risk:** No DB constraint prevents creating both a `PaymentRecord` and a `CollectionRecord` for the same payment event. No deduplication key exists.

---

### 1.2 PaymentAllocation
**Location:** `prisma/schema.prisma`

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | PK |
| paymentId | String | FK → PaymentRecord (cascade delete) |
| receivableId | String | FK → CustomerReceivable |
| allocatedAmount | Decimal | Portion applied to this receivable |
| balanceBefore | Decimal | Snapshot of balanceDue before |
| balanceAfter | Decimal | Snapshot of balanceDue after |
| allocatedAt | DateTime | |

**Purpose:** Normalized relational bridge between a payment and one or more open invoices/receivables. Enables partial allocation (one payment → many receivables) and audit trail via balance snapshots.

**Risk:** `balanceBefore`/`balanceAfter` are snapshots — they can desync from `CustomerReceivable.balanceDue` if receivables are updated outside of the `payment-service.ts` path (e.g., direct SAG sync).

---

### 1.3 CustomerReceivable
**Location:** `prisma/schema.prisma` · **Service:** `lib/finance/payment-service.ts`, `lib/finance/cartera-kpis.ts`

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | PK |
| organizationId | String | FK → Organization |
| customerId | String? | FK → CustomerProfile (NULLABLE — LEGACY_NIT_JOIN risk) |
| sagDocumentId | String? | SAG invoice identifier |
| documentNumber | String? | Human-readable doc number |
| originalAmount | Decimal | Invoice face value |
| paidAmount | Decimal | Cumulative paid (from PaymentAllocation) |
| balanceDue | Decimal | originalAmount − paidAmount |
| dueDate | DateTime? | |
| daysOverdue | Int? | Updated by SAG sync |
| agingBucket | String? | 0-30 / 31-60 / 61-90 / 90+ |
| status | ReceivableStatus | OPEN / PARTIAL / OVERDUE / PAID / WRITTEN_OFF / CANCELLED |
| issueDate | DateTime? | |
| createdAt | DateTime | |
| updatedAt | DateTime | |

**Critical gap:** `CustomerReceivable` has NO direct relation to `CollectionRecord`. When a SAG cobro (CollectionRecord) arrives, there is no automated path to update `CustomerReceivable.paidAmount` or `balanceDue`. These remain stale until a human registers a `PaymentRecord` via the UI.

---

### 1.4 CollectionRecord
**Location:** `prisma/schema.prisma` · **Sync:** `lib/connectors/adapters/sag-pya-soap/storage.ts`

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | PK |
| organizationId | String | FK → Organization |
| sagTerceroId | Int? | SAG customer PK |
| customerNit | String? | Real NIT (customer-facing) |
| amount | Decimal | Payment amount (positive) |
| paymentDate | DateTime | SAG cobro date |
| comprobanteCode | String? | SAG document type prefix (R1, R2, RS, etc.) |
| comprobante | String? | Full SAG document reference |
| appliedFacts | Json? | JSONB array of informal invoice associations |
| paymentRecordId | String? | Optional FK → PaymentRecord (bridge, NOT enforced) |
| sagSourceType | String? | OFICIAL / REMISION |
| createdAt | DateTime | |
| updatedAt | DateTime | |

**`appliedFacts` structure (informal, no schema enforcement):**
```json
[
  { "invoiceRef": "FAC-2024-001", "amount": 150000, "documentDate": "2024-01-15" }
]
```

**comprobanteCode taxonomy (from `cobros-breakdown.ts`):**
| Code | Category | Meaning |
|------|----------|---------|
| R1 | empresa | Cobros empresa (Fuente 1 / OFICIAL) |
| R2 | empresa | Cobros F2/remisiones |
| RS / RC / RG / RA | almacenes | POS almacenes |
| SI / AN | retailFinanciero | Addi / Sistecredit fintech |
| CP / B1 / B2 / H1 / H2 | consignacionesPendientes | Bank consignaciones — PENDING, not final cobros |

**WARNING:** CP/B1/B2/H1/H2 records represent pending consignaciones that SAG has NOT yet confirmed as final payments. Including them in receivables reconciliation produces premature closure.

---

### 1.5 SaleRecord
**Location:** `prisma/schema.prisma`

Relevant reconciliation fields:
- `comprobanteCode` — document family (used by `cobros-breakdown.ts` to read SAG cobros)
- `customerNit` — stores `String(ka_nl_tercero)` (sagTerceroId) for PYA SOAP, NOT real NIT
- `sagSourceType` — OFICIAL (Fuente 1) vs REMISION (Fuente 2)
- `sagDocumentFamily` — grouping across document families
- `sourceDocumentStage` — pipeline stage indicator

**Key architectural fact:** `cobros-breakdown.ts` reads cobros from `SaleRecord` by `comprobanteCode` — it does NOT read `CollectionRecord`. This means cobro amounts in the finance UI come from the SaleRecord pipeline (SAG movement sync), not from the payment capture UI (PaymentRecord). These two flows are completely parallel and can diverge.

---

### 1.6 SourceMatchRecord
**Location:** `prisma/schema.prisma`

| Field | Type | Notes |
|-------|------|-------|
| f2RecordId | String | FK → SaleRecord (Fuente 2 / remision) |
| f1RecordId | String? | FK → SaleRecord (Fuente 1 / cobro match) |
| isOrphan | Boolean | True when no F1 match found |
| matchSignal | String? | How match was found |
| confidence | Float? | 0.0–1.0 |

**Purpose:** F2→F1 source reconciliation within SAG data (not payment reconciliation). Tracks whether a Fuente 2 demand record was satisfied by a Fuente 1 revenue record.

---

## 2. Relationship Map

```
CustomerProfile
  │
  ├── CustomerReceivable (customerId FK, NULLABLE)
  │     │
  │     └── PaymentAllocation (receivableId FK)
  │               │
  │               └── PaymentRecord (paymentId FK, customerId FK, NULLABLE)
  │
  └── CollectionRecord (sagTerceroId + customerNit — no FK to CustomerReceivable)
        │
        └── PaymentRecord (paymentRecordId FK, OPTIONAL, not enforced)

SaleRecord (comprobanteCode)
  └── read by cobros-breakdown.ts for finance UI cobros display
      (PARALLEL path — no join to CollectionRecord or PaymentRecord)

SourceMatchRecord
  └── F2 SaleRecord ←→ F1 SaleRecord (SAG-internal reconciliation only)
```

---

## 3. Duplicated Concepts

| Concept | Implementation A | Implementation B | Risk |
|---------|-----------------|-----------------|------|
| Payment capture | `PaymentRecord` (UI) | `CollectionRecord` (SAG sync) | Double-counting |
| Invoice association | `PaymentAllocation` (normalized) | `CollectionRecord.appliedFacts` (JSONB) | Inconsistent |
| Cobro amounts in UI | `cobros-breakdown.ts` via `SaleRecord` | `CollectionRecord` (not used in UI) | Divergence |
| Customer NIT | `CustomerProfile.nit` | `CustomerProfile.nitNormalized` | Identity gaps |
| SAG customer key | `CustomerProfile.sagTerceroId` | `SaleRecord.customerNit` (= sagTerceroId string) | Silent zero-row queries |

---

## 4. Dead / Orphaned Models

| Model/Field | Status | Risk |
|------------|--------|------|
| `CollectionRecord.paymentRecordId` | EXISTS but not enforced — never written by service layer | Phantom bridge |
| `CollectionRecord.appliedFacts` | Written by SAG sync but NEVER read by any service | Dead JSONB |
| `CustomerReceivable.customerId` | NULLABLE — many rows likely NULL after SAG sync | Silent 0-balance query results |
| `PaymentRecord.customerId` | NULLABLE — UI can create payments without customer link | Orphaned payments |

---

## 5. Service Layer Coverage

| Operation | Service | Status |
|-----------|---------|--------|
| Register manual payment | `payment-service.ts::registerPayment` | IMPLEMENTED |
| Allocate payment to receivable | `payment-service.ts::allocatePayment` | IMPLEMENTED |
| Reverse payment | `payment-service.ts::reversePayment` | IMPLEMENTED |
| Sync SAG cobros → CollectionRecord | `sag-pya-soap/storage.ts` | IMPLEMENTED |
| Sync SAG receivables → CustomerReceivable | `sag-pya-soap/storage.ts` | IMPLEMENTED |
| Auto-reconcile CollectionRecord → PaymentAllocation | MISSING | NOT IMPLEMENTED |
| Update CustomerReceivable from CollectionRecord | MISSING | NOT IMPLEMENTED |
| Dedup PaymentRecord vs CollectionRecord | MISSING | NOT IMPLEMENTED |
| Validate CP/B1/B2 as pending (not final cobros) | MISSING | NOT IMPLEMENTED |

---

## 6. Data Trust Assessment

| Data Source | Trustworthiness | Reason |
|------------|----------------|--------|
| `CustomerReceivable.originalAmount` | HIGH | Sourced directly from SAG invoice sync |
| `CustomerReceivable.balanceDue` | LOW | Only updated via `PaymentAllocation`, never via `CollectionRecord` |
| `CollectionRecord` amounts | MEDIUM | SAG-authoritative but pending codes (CP/B1/B2) inflate totals |
| `PaymentRecord` amounts | MEDIUM | Manual UI entry — no SAG confirmation loop |
| `cobros-breakdown.ts` totals | MEDIUM | Reads SaleRecord.comprobanteCode — correct taxonomy but parallel to CollectionRecord |
| `PaymentAllocation.balanceBefore/After` | LOW | Snapshots — desync risk from parallel SAG updates |

---

## 7. Immediate Risks

### RISK-PAY-01 (CRITICAL): Double-counting cobros
A SAG payment arriving via `CollectionRecord` sync AND a manually registered `PaymentRecord` for the same event will both be counted. No deduplication key exists.

### RISK-PAY-02 (CRITICAL): CustomerReceivable.balanceDue never reflects SAG payments
Only `PaymentAllocation` (manual UI flow) updates `balanceDue`. All CollectionRecord entries from SAG are invisible to the receivable balance. Every open balance shown in the UI may be stale.

### RISK-PAY-03 (HIGH): CP/B1/B2 pending consignaciones counted as final cobros
`cobros-breakdown.ts` may include these if the comprobanteCode filter is incomplete. Confirms inflated cobro totals vs actual received funds.

### RISK-PAY-04 (HIGH): appliedFacts JSONB is a dead write
SAG writes invoice associations to `CollectionRecord.appliedFacts` but no service reads it. The data that would enable automated allocation is captured but ignored.

### RISK-PAY-05 (MEDIUM): PaymentRecord.customerId nullable
Payments can exist with no customer link. These are orphaned in reporting — invisible to Customer 360 and cartera KPIs.
