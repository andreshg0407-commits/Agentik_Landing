# RECONCILIATION_FLOW_ARCHITECTURE.md
## Sprint S2 — Phase D: Operational Reconciliation Flow Design
_Generated: 2026-05-05 | Status: DESIGN PROPOSAL — No implementation yet_

---

## 1. Purpose

This document defines the end-to-end reconciliation flow between SAG cobros (CollectionRecord) and Agentik receivables (CustomerReceivable), from initial SAG sync through to confirmed balance closure. It specifies which steps are automatable, which require human decision, and in what sequence implementation should proceed.

---

## 2. Reconciliation States (Lifecycle)

```
CollectionRecord (synced from SAG)
    │
    ├── [PENDING_CONSIGNACION]   comprobanteCode IN {CP,B1,B2,H1,H2}
    │         │
    │         └── Re-sync on next scheduled pull → may transition to CONFIRMED
    │
    └── [CONFIRMED_UNMATCHED]    comprobanteCode IN {R1,R2,RS,RC,RG,RA,SI,AN}
              │
              ├── Auto-match attempt (Sprint S3)
              │         │
              │         ├── HIGH confidence → [CONFIRMED_MATCHED] → PaymentAllocation created
              │         │
              │         └── LOW confidence → [NEEDS_REVIEW] → Sent to human queue
              │
              └── Manual match (human selects receivable from UI)
                        │
                        └── [CONFIRMED_MATCHED] → PaymentAllocation created
```

---

## 3. Full Reconciliation Flow

### Step 1: SAG Sync (Automated — Runs on schedule)

```
SAG PYA SOAP pull → parse v_pagosnew → upsert CollectionRecord
```

- Runs via connector sync engine on schedule (currently configured per-tenant)
- All cobros written regardless of comprobanteCode
- `appliedFacts` JSONB written from `documentos_aplicados` if present
- **No receivable update at this step**

**Trigger:** Scheduled connector sync (existing infrastructure)
**Sprint:** Already implemented (Sprint S0)

---

### Step 2: Finality Classification (Sprint S2.1 — Quick win, service layer)

After sync, classify each new CollectionRecord:

```typescript
const isConfirmed = FINAL_COBRO_CODES.has(record.comprobanteCode ?? "");
const isPending   = PENDING_COBRO_CODES.has(record.comprobanteCode ?? "");
```

- Pending → no further action, tagged for re-check on next sync
- Confirmed → enter match pipeline

**Files to modify (Sprint S2.1):**
- `lib/finance/cobros-breakdown.ts` — add `FINAL_COBRO_CODES` filter to exclude pending codes from UI totals
- `lib/connectors/adapters/sag-pya-soap/storage.ts` — tag records during upsert

**Sprint:** S2.1 (quick win — no schema change needed)

---

### Step 3: Customer Identity Resolution (Sprint S2.1 — prerequisite for matching)

Before matching to a receivable, resolve `CollectionRecord → CustomerProfile`:

```typescript
// Use sagTerceroId directly (most reliable)
const profile = await prisma.customerProfile.findFirst({
  where: { organizationId, sagTerceroId: record.sagTerceroId }
});

// Fallback: nitNormalized or nit (LEGACY_NIT_JOIN)
if (!profile && record.customerNit) {
  const nit = normalizeNit(record.customerNit);
  profile = await prisma.customerProfile.findFirst({
    where: { organizationId, OR: [{ nitNormalized: nit }, { nit: record.customerNit }] }
  });
}
```

**Prerequisite:** `linkCustomerSagTerceroIds()` must have run after each CollectionRecord sync (Sprint S1 deliverable).

---

### Step 4: Auto-Match to CustomerReceivable (Sprint S3 — Auto-reconcile engine)

Attempt to match each `CONFIRMED_UNMATCHED` CollectionRecord to a `CustomerReceivable`:

#### Match Strategy A: appliedFacts invoiceRef (highest priority)
```typescript
const refs = parseAppliedFacts(record.appliedFacts); // extract invoiceRef[]
if (refs.length > 0) {
  const receivables = await prisma.customerReceivable.findMany({
    where: {
      organizationId,
      customerId: resolvedProfile.id,
      sagDocumentId: { in: refs },
      status: { in: ["OPEN", "PARTIAL", "OVERDUE"] }
    }
  });
  // If exact refs found → VERY HIGH confidence auto-allocate
}
```

#### Match Strategy B: Exact amount + date proximity
```typescript
const candidates = await prisma.customerReceivable.findMany({
  where: {
    organizationId,
    customerId: resolvedProfile.id,
    balanceDue: { gte: record.amount * 0.98, lte: record.amount * 1.02 }, // ±2%
    status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
    // dueDate within ±30 days of paymentDate
  }
});
if (candidates.length === 1) {
  // Single match → HIGH confidence auto-allocate
} else {
  // Multiple matches → MEDIUM → queue for human review
}
```

#### Match Strategy C: Partial allocation (payment > single receivable)
```typescript
// Sort open receivables by dueDate ASC (oldest first)
// Allocate greedily: apply cobro amount across receivables until exhausted
// If remainder > 0 → create UNALLOCATED surplus entry for human review
```

**Confidence thresholds:**
- appliedFacts match → auto-allocate (no human needed)
- Strategy B single match → auto-allocate + add to audit log for review
- Strategy B multiple matches → send to human queue
- No match found → flag as UNMATCHED, alert to finance user

---

### Step 5: PaymentAllocation Creation (Sprint S3)

For each confirmed match:

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Create PaymentRecord (or reuse existing if bridge already exists)
  const payment = await tx.paymentRecord.create({
    data: {
      organizationId,
      customerId: resolvedProfile.id,
      amount: record.amount,
      allocatedAmount: allocationAmount,
      unallocatedAmount: record.amount - allocationAmount,
      status: "RECONCILED",
      documentType: "PAGO",
      documentRef: record.comprobante,
      paymentDate: record.paymentDate,
    }
  });

  // 2. Create PaymentAllocation
  await tx.paymentAllocation.create({
    data: {
      paymentId: payment.id,
      receivableId: receivable.id,
      allocatedAmount: allocationAmount,
      balanceBefore: receivable.balanceDue,
      balanceAfter: receivable.balanceDue - allocationAmount,
    }
  });

  // 3. Update CustomerReceivable
  const newPaid   = receivable.paidAmount + allocationAmount;
  const newBalance = receivable.originalAmount - newPaid;
  await tx.customerReceivable.update({
    where: { id: receivable.id },
    data: {
      paidAmount:  newPaid,
      balanceDue:  newBalance,
      status: newBalance <= 0 ? "PAID" : (newBalance < receivable.originalAmount ? "PARTIAL" : receivable.status),
    }
  });

  // 4. Link CollectionRecord to PaymentRecord
  await tx.collectionRecord.update({
    where: { id: record.id },
    data: { paymentRecordId: payment.id }
  });
});
```

**Invariant validation after write:**
```
CustomerReceivable.balanceDue === originalAmount − paidAmount       ✓ MUST HOLD
PaymentRecord.allocatedAmount === SUM(PaymentAllocation.amount)    ✓ MUST HOLD
```

---

### Step 6: Human Review Queue (Sprint S3 — UI component)

For `NEEDS_REVIEW` items, surface in "Conciliación Inteligente" UI:

| Column | Source |
|--------|--------|
| Customer | CollectionRecord → resolvedProfile.name |
| Amount | CollectionRecord.amount |
| Date | CollectionRecord.paymentDate |
| comprobanteCode | CollectionRecord.comprobanteCode |
| Candidate receivables | Top 3 by amount proximity + age |
| Confidence | Computed score |
| Action | "Confirmar" / "Rechazar" / "Omitir" |

---

## 4. Deduplication Guard

Before creating any `PaymentRecord` from a `CollectionRecord`, check:

```typescript
// Prevent duplicate PaymentRecord for same SAG cobro event
const existing = await prisma.paymentRecord.findFirst({
  where: {
    organizationId,
    customerId: resolvedProfile.id,
    amount: record.amount,
    paymentDate: {
      gte: subDays(record.paymentDate, 1),
      lte: addDays(record.paymentDate, 1),
    },
    documentRef: record.comprobante,
  }
});

if (existing) {
  // Link existing PaymentRecord instead of creating new one
  await prisma.collectionRecord.update({
    where: { id: record.id },
    data: { paymentRecordId: existing.id }
  });
  return { action: "LINKED_EXISTING", paymentId: existing.id };
}
```

---

## 5. Sprint Implementation Order

### Sprint S2.1 (Next — No schema changes)
**Estimated scope:** 2 files, ~50 lines

1. Add `FINAL_COBRO_CODES` / `PENDING_COBRO_CODES` constants to `lib/finance/constants.ts` (create if not exists)
2. Apply finality filter in `lib/finance/cobros-breakdown.ts` — exclude CP/B1/B2/H1/H2 from UI totals
3. Tag CollectionRecord with logical status at read-time in any service that reads CollectionRecord

**Validation:** Finance dashboard cobros total should decrease (pending consignaciones removed from count)

---

### Sprint S2.2 (Before S3 — No schema changes)
**Estimated scope:** 1 new lib file, ~80 lines

1. Create `lib/finance/applied-facts-parser.ts` — parse `CollectionRecord.appliedFacts` JSONB to `AppliedFact[]`
2. Add match attempt function: `matchCollectionToReceivables(orgId, collectionId)` — returns match result with confidence
3. Add diagnostic script: `scripts/_reconcile-audit.ts` — reports CONFIRMED_UNMATCHED count, appliedFacts coverage, match rates

**Validation:** Script output shows count of auto-matchable vs review-required cobros

---

### Sprint S3 (Full auto-reconcile engine — Schema migration needed)
**Estimated scope:** 3 new services, 1 UI component, 1 schema migration

Schema additions needed:
- `CollectionRecord.reconcileStatus` (enum: PENDING_CONSIGNACION / CONFIRMED_UNMATCHED / CONFIRMED_MATCHED / NEEDS_REVIEW)
- Unique index on CollectionRecord for deduplication

Files:
- `lib/finance/reconcile-engine.ts` — orchestrates Steps 3-5 above
- `lib/finance/reconcile-match.ts` — match strategies A/B/C
- `app/api/orgs/[orgSlug]/finance/reconcile/route.ts` — trigger endpoint
- UI: Conciliación Inteligente human review panel

---

## 6. Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Reconcile engine creates duplicate PaymentRecords | Deduplication guard in Step 4 before any create |
| SAG `saldo` desync from Agentik `balanceDue` | Log discrepancy after each allocation; surface in audit log |
| appliedFacts JSONB malformed | Try/catch in parser; fall back to Strategy B |
| Auto-allocate wrong receivable | All auto-allocations logged; human-reviewable; reversible via reversePayment |
| Pending consignación incorrectly classified as final | comprobanteCode is SAG-issued; trust SAG taxonomy |

---

## 7. Observability Requirements

Every reconciliation action MUST emit a structured log entry:

```typescript
interface ReconcileEvent {
  eventType: "AUTO_MATCHED" | "NEEDS_REVIEW" | "HUMAN_CONFIRMED" | "DEDUP_LINKED" | "UNMATCHED";
  organizationId: string;
  collectionRecordId: string;
  paymentRecordId?: string;
  receivableId?: string;
  confidence?: number;
  matchStrategy?: "APPLIED_FACTS" | "EXACT_AMOUNT" | "FUZZY_AMOUNT" | "MANUAL";
  allocatedAmount?: number;
  balanceBefore?: number;
  balanceAfter?: number;
  timestamp: string;
}
```

These events feed the "Conciliación Inteligente" audit trail and enable human override at any step.
