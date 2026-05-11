# SPRINT S2 — Executive Summary
## Payment Model Contract + Reconciliation Foundation
_Generated: 2026-05-05 | Status: AUTHORITATIVE_

---

## What Was Done in This Sprint

Sprint S2 was a documentation-only sprint. No code was changed, no migrations were run, no UI was modified. Four architectural documents were produced from a full audit of all financial source files:

| Deliverable | Document | Status |
|------------|---------|--------|
| Phase A: Financial entity audit | `PAYMENT_ARCHITECTURE_AUDIT.md` | DONE |
| Phase B: Canonical payment contract | `PAYMENT_CONTRACT_V1.md` | DONE |
| Phase C: SAG relationship discovery | `SAG_RELATIONSHIP_DISCOVERY.md` | DONE |
| Phase D: Reconciliation flow architecture | `RECONCILIATION_FLOW_ARCHITECTURE.md` | DONE |

---

## What is BROKEN (Do Not Trust)

### 1. CustomerReceivable.balanceDue is stale
SAG cobros arrive via `CollectionRecord` sync. They NEVER update `CustomerReceivable.balanceDue`. Only the manual UI payment path (`PaymentRecord → PaymentAllocation`) updates receivable balances. For any customer where payments exist in SAG but have not been manually re-entered in Agentik, the displayed balance is wrong.

**Severity: CRITICAL** — Finance team is making collection decisions on stale data.

### 2. Finance UI cobros include pending consignaciones
`cobros-breakdown.ts` reads `SaleRecord.comprobanteCode` for cobro totals. Pending consignación codes (CP, B1, B2, H1, H2) are NOT filtered out. These represent funds that SAG has received notification of but NOT confirmed. The cobro total is inflated by unconfirmed consignaciones.

**Severity: HIGH** — Finance dashboard shows higher cobros than actually confirmed.

### 3. CollectionRecord.appliedFacts is written but never read
SAG provides invoice association data in `documentos_aplicados` which is synced to `CollectionRecord.appliedFacts` JSONB. This field is never parsed or used by any service. The highest-quality reconciliation signal in the system is completely dead.

**Severity: HIGH** — Blocking auto-reconciliation capability.

### 4. Double-counting risk: CollectionRecord + PaymentRecord
If a finance user manually registers a payment via the Agentik UI AND SAG simultaneously syncs the same payment event, both will exist in the system with no deduplication. No constraint prevents this.

**Severity: HIGH** — Invisible data integrity risk, undetectable without manual audit.

### 5. PaymentRecord.customerId is nullable — orphaned payments
Payments can be created without a customer link. These are invisible in Customer 360, cartera KPIs, and all customer-level reporting.

**Severity: MEDIUM** — Reporting gaps, not financial risk.

---

## What is TRUSTWORTHY

| Data | Trust Level | Reason |
|------|------------|--------|
| `CustomerReceivable.originalAmount` | HIGH | SAG invoice sync, no human mutation |
| `CollectionRecord` amounts (final codes only) | HIGH | SAG-authoritative for R1/R2/RS/RC/RG/RA/SI/AN |
| `SaleRecord` movement data (OFICIAL source) | HIGH | PYA SOAP direct sync |
| `PaymentRecord.amount` | MEDIUM | Manual entry, no SAG confirmation loop |
| `CustomerReceivable.balanceDue` | LOW | Only updated via manual payment UI path |
| Finance UI cobros totals | LOW | Includes pending consignaciones |

---

## What is AUTOMATABLE (Sprint S3)

| Operation | Automatable? | Condition |
|-----------|-------------|-----------|
| Classify cobro finality (FINAL vs PENDING) | YES — immediately | Filter by comprobanteCode |
| Resolve CollectionRecord → CustomerProfile | YES | Requires Sprint S1 `linkCustomerSagTerceroIds()` run |
| Match cobro → receivable via appliedFacts | YES — high confidence | Requires `applied-facts-parser.ts` (Sprint S2.2) |
| Match cobro → receivable via amount+date | YES — medium confidence | Single open receivable only |
| Create PaymentAllocation from CollectionRecord | YES | After match confirmed |
| Update CustomerReceivable.balanceDue | YES | After PaymentAllocation created |
| Dedup PaymentRecord vs CollectionRecord | YES | Via comprobante + date + amount lookup |

## What REQUIRES HUMAN DECISION

| Operation | Why human needed |
|-----------|-----------------|
| Multi-receivable cobro allocation | Ambiguous split — business knows priority |
| Low-confidence fuzzy match | Agentik cannot safely assume which invoice |
| Pending consignación confirmation | SAG must confirm first (comprobanteCode change) |
| PaymentRecord without SAG cobro match | Manual payment may be legitimate (advance, partial) |
| Balance discrepancy after reconciliation | SAG saldo vs Agentik calculation mismatch |

---

## Safest Implementation Order

### Sprint S2.1 — Immediate (no schema changes, ~2 hours)
**Goal: Stop the bleeding in finance UI**

1. Add `FINAL_COBRO_CODES` / `PENDING_COBRO_CODES` constants to `lib/finance/constants.ts`
2. Apply filter in `cobros-breakdown.ts` — cobro totals now exclude CP/B1/B2/H1/H2
3. Run `linkCustomerSagTerceroIds(orgId)` on Castillitos to populate `CustomerProfile.sagTerceroId` (Sprint S1 function, manual trigger)

**Risk:** Zero. Filter only removes records that should not be in totals. Customer profile bridge is additive-only.

---

### Sprint S2.2 — Next (no schema changes, ~4 hours)
**Goal: Enable reconciliation intelligence**

1. Create `lib/finance/applied-facts-parser.ts` — typed JSONB parser
2. Create `lib/finance/reconcile-match.ts` — match strategies A/B/C with confidence scoring
3. Create `scripts/_reconcile-audit.ts` — dry-run report: how many cobros auto-matchable vs needs-review

**Risk:** Low. All read-only analysis. No writes.

---

### Sprint S3 — Full auto-reconcile (schema migration required, ~1-2 days)
**Goal: Close the loop between SAG cobros and Agentik receivables**

1. Schema migration: add `reconcileStatus` to `CollectionRecord`
2. Create `lib/finance/reconcile-engine.ts` — orchestrator
3. Create trigger API + scheduled job
4. Human review UI in Conciliación Inteligente

**Risk:** Medium. Schema migration + automated writes to financial tables require full test coverage before production.

**Blocked by:** SAG team delivering `Documento_pagado` / direct invoice-cobro FK view (reduces reliance on fuzzy matching).

---

## Key Architectural Decisions Made

1. **CollectionRecord is authoritative** — not PaymentRecord. Manual UI payments are supplementary.
2. **comprobanteCode finality is the gate** — no allocation before SAG confirms payment type.
3. **appliedFacts is the highest-value reconciliation signal** — must be parsed in Sprint S2.2.
4. **All reconciliation writes are transactional** — PaymentRecord + PaymentAllocation + CustomerReceivable update in a single DB transaction.
5. **All auto-allocations are reversible** — via existing `reversePayment()` infrastructure.
6. **Human review queue is non-optional** — fuzzy matches always go to review, never auto-apply.
